/**
 * Submit Command
 *
 * Implements the submit command that spawns an agent, streams output, and follows until completion.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  createAgentExecutor,
  isAgentAvailable,
  type AgentName,
} from '../../agents/factory.js';
import type { IAgentExecutor } from '../../agents/types/agent-executor.js';
import { ShutdownManager } from '../lifecycle/shutdown.js';
import { setupSignalHandlers } from '../lifecycle/signals.js';
import { StateTracker } from '../state/tracker.js';
import { renderEntry, renderHeader, renderSummary } from '../renderer/output.js';
import { generateId } from '../../process/utils.js';
import type { SubmitOptions, SubmitResult } from '../state/types.js';
import type { ExecutionTask } from '../../engine/types.js';
import type { TaskHeader, ExecutionResult } from '../renderer/types.js';

/**
 * Validate submit options
 */
function validateSubmitOptions(options: SubmitOptions): void {
  // Validate agent
  if (!options.agent) {
    throw new Error('Agent is required. Use --agent <name>');
  }

  // Validate prompt
  if (!options.prompt) {
    throw new Error('Prompt is required. Use --prompt "<task description>"');
  }

  // Validate workDir
  if (!options.workDir) {
    throw new Error('Working directory is required. Use --workDir <path>');
  }

  const workDir = resolve(options.workDir);
  if (!existsSync(workDir)) {
    throw new Error(`Working directory does not exist: ${workDir}`);
  }

  // Validate agent is available
  if (!isAgentAvailable(options.agent)) {
    throw new Error(
      `Agent "${options.agent}" is not available. Currently supported: claude, cursor, copilot`,
    );
  }
}

/**
 * Create agent executor for the specified agent
 */
function createExecutor(agent: string, workDir: string, options: SubmitOptions): IAgentExecutor {
  // Use factory to create executor based on agent name
  switch (agent) {
    case 'claude':
      return createAgentExecutor('claude', {
        workDir,
        print: true,
        outputFormat: 'stream-json',
        dangerouslySkipPermissions: options.force ?? true, // MVP: auto-approve by default
        // Note: Claude Code doesn't support model selection via CLI
      });

    case 'cursor':
      return createAgentExecutor('cursor', {
        force: options.force ?? true, // Auto-approve all tools
        model: options.model || 'auto',
      });

    case 'copilot':
      return createAgentExecutor('copilot', {
        workDir,
        allowAllTools: options.force ?? true, // Auto-approve all tools
      });

    case 'codex':
      return createAgentExecutor('codex', {
        workDir,
        model: options.model,
        autoApprove: options.force ?? true, // Auto-approve all tools
      });

    default:
      throw new Error(`Unsupported agent: ${agent}`);
  }
}

/**
 * Stream agent output with automatic protocol detection
 *
 * Detects the agent's protocol type and uses the appropriate streaming strategy:
 * - ProtocolPeer (Claude stream-json): Use peer message handler
 * - ACP Harness (Gemini): Use harness stream (future)
 * - Raw stdout: Use standard stream processing
 */
async function streamAgentOutput(
  executor: IAgentExecutor,
  process: any, // ManagedProcess with possible extensions
  workDir: string,
  tracker: StateTracker,
  options: SubmitOptions,
): Promise<void> {
  // Protocol detection: Check for special protocol handlers
  const peer = process.peer; // Claude ProtocolPeer
  const harness = process.harness; // Gemini ACP Harness (future)

  if (peer) {
    // Claude-specific: use peer messages instead of raw stdout
    await streamOutputFromPeer(executor, peer, workDir, tracker, options);
  } else if (harness) {
    // Gemini-specific: use ACP harness (future implementation)
    throw new Error('ACP Harness protocol not yet implemented');
  } else {
    // Standard: use raw stdout stream
    const outputStream = process.streams?.stdout;
    if (!outputStream) {
      throw new Error('No output stream available from spawned process');
    }
    await streamOutput(executor, outputStream, workDir, tracker, options);
  }
}

/**
 * Stream output from agent and render to console
 */
async function streamOutput(
  executor: IAgentExecutor,
  outputStream: AsyncIterable<Buffer>,
  workDir: string,
  tracker: StateTracker,
  options: SubmitOptions,
): Promise<void> {
  const isPretty = options.outputFormat !== 'json';
  const showThinking = options.showThinking ?? true;
  const showTimestamps = options.showTimestamps ?? false;

  try {
    // Convert raw Buffer stream to OutputChunk format
    async function* convertToOutputChunks(
      stream: AsyncIterable<Buffer>,
    ): AsyncIterable<{ type: 'stdout' | 'stderr'; data: Buffer; timestamp: Date }> {
      for await (const buffer of stream) {
        yield {
          type: 'stdout',
          data: buffer,
          timestamp: new Date(),
        };
      }
    }

    for await (const entry of executor.normalizeOutput(
      convertToOutputChunks(outputStream),
      workDir,
    )) {
      // Add entry to tracker
      tracker.addEntry(entry);

      // Render entry (pretty mode only)
      if (isPretty) {
        const rendered = renderEntry(entry, {
          showThinking,
          showTimestamps,
          useColors: true,
        });
        if (rendered) {
          console.log(rendered);
        }
      }
    }
  } catch (error) {
    // Output stream error - this is expected when process exits
    if (error instanceof Error && !error.message.includes('closed')) {
      throw error;
    }
  }
}

/**
 * Stream output from Claude protocol peer and render to console
 */
async function streamOutputFromPeer(
  executor: IAgentExecutor,
  peer: any, // ProtocolPeer type
  workDir: string,
  tracker: StateTracker,
  options: SubmitOptions,
): Promise<void> {
  const isPretty = options.outputFormat !== 'json';
  const showThinking = options.showThinking ?? true;
  const showTimestamps = options.showTimestamps ?? false;

  // Create a queue to buffer messages from the peer
  const messageQueue: any[] = [];
  let streamEnded = false;
  let exitDetected = false;

  // Register message handler to capture messages from peer
  peer.onMessage((message: any) => {
    messageQueue.push(message);

    // Detect result/success or result/failure messages (completion)
    if (message.type === 'result' && (message.subtype === 'success' || message.subtype === 'failure')) {
      exitDetected = true;
    }
  });

  try {
    // Convert peer messages to OutputChunk format
    async function* convertPeerMessagesToOutputChunks(): AsyncIterable<{
      type: 'stdout' | 'stderr';
      data: Buffer;
      timestamp: Date;
    }> {
      // Keep processing until we've seen the exit message AND processed all queued messages
      while (!streamEnded || messageQueue.length > 0) {
        // Wait for messages to arrive
        if (messageQueue.length === 0) {
          if (exitDetected) {
            // No more messages and we've seen the exit - we're done
            streamEnded = true;
            break;
          }
          // Wait a bit for more messages
          await new Promise((resolve) => setTimeout(resolve, 10));
          continue;
        }

        // Process next message
        const message = messageQueue.shift();

        // Convert message to stream-json line format (what Claude outputs)
        const line = JSON.stringify(message) + '\n';

        yield {
          type: 'stdout',
          data: Buffer.from(line, 'utf-8'),
          timestamp: new Date(),
        };
      }
    }

    for await (const entry of executor.normalizeOutput(
      convertPeerMessagesToOutputChunks(),
      workDir,
    )) {
      // Add entry to tracker
      tracker.addEntry(entry);

      // Render entry (pretty mode only)
      if (isPretty) {
        const rendered = renderEntry(entry, {
          showThinking,
          showTimestamps,
          useColors: true,
        });
        if (rendered) {
          console.log(rendered);
        }
      }
    }
  } catch (error) {
    // Output stream error - this is expected when process exits
    if (error instanceof Error && !error.message.includes('closed')) {
      throw error;
    }
  } finally {
    streamEnded = true;
  }
}

/**
 * Wait for process to exit
 */
async function waitForExit(
  processId: string,
  exitSignal?: Promise<void>,
): Promise<{ exitCode: number; success: boolean }> {
  // Wait for exit signal if available (ACP protocols)
  if (exitSignal) {
    try {
      await exitSignal;
    } catch {
      // Ignore exit signal errors
    }
  }

  // For now, we'll assume success if no error was thrown
  // TODO: Get actual exit code from process
  return { exitCode: 0, success: true };
}

/**
 * Submit command implementation
 */
export async function submitCommand(options: SubmitOptions): Promise<SubmitResult> {
  // 1. Validate options
  validateSubmitOptions(options);

  // Resolve work directory
  const workDir = resolve(options.workDir);

  // Default options
  const follow = options.follow ?? !options.detach;
  const detach = options.detach ?? false;
  const outputFormat = options.outputFormat ?? 'pretty';

  // 2. Initialize executor
  const executor = createExecutor(options.agent, workDir, options);

  // 3. Create task
  const taskId = generateId('task');
  const task: ExecutionTask = {
    id: taskId,
    type: 'custom',
    prompt: options.prompt,
    workDir,
    priority: 5,
    dependencies: [],
    createdAt: new Date(),
    config: {},
  };

  // 4. Initialize state tracker
  const tracker = new StateTracker();

  try {
    // 5. Display header (pretty mode only)
    if (outputFormat === 'pretty') {
      const header: TaskHeader = {
        taskId,
        processId: '(spawning...)',
        agentName: options.agent,
      };
      console.log(renderHeader(header));
      console.log(''); // Blank line
    }

    // 6. Execute task
    const spawned = await executor.executeTask(task);
    const processId = spawned.process.id;

    // Initialize tracker
    tracker.initialize(taskId, processId, options.agent, workDir);

    // 7. Setup shutdown manager and signal handlers
    const shutdownManager = new ShutdownManager({
      gracefulTimeoutMs: 5000,
      verbose: outputFormat === 'pretty',
    });

    // Note: We can't easily get the process manager from the executor in current architecture
    // For Phase 1 MVP, we'll rely on the process exiting normally
    // TODO: Refactor executor to expose process manager for shutdown integration
    setupSignalHandlers(shutdownManager);

    // 8. Detached mode: return immediately
    if (detach) {
      console.log(
        JSON.stringify({
          taskId,
          processId,
        }),
      );

      return {
        taskId,
        processId,
        success: true,
        exitCode: 0,
        durationMs: 0,
        toolsUsed: 0,
        filesChanged: 0,
      };
    }

    // 9. Follow mode: stream output using unified function
    await streamAgentOutput(executor, spawned.process, workDir, tracker, {
      ...options,
      outputFormat,
    });

    // 10. Wait for completion
    const { exitCode, success } = await waitForExit(processId, spawned.exitSignal);

    // 11. Build result
    const result: SubmitResult = {
      taskId,
      processId,
      success,
      exitCode,
      durationMs: tracker.getDuration(),
      toolsUsed: tracker.countToolsUsed(),
      filesChanged: tracker.countFilesChanged(),
      entries: outputFormat === 'json' ? tracker.getEntries() : undefined,
    };

    // 12. Display summary (pretty mode only)
    if (outputFormat === 'pretty') {
      console.log(''); // Blank line
      const executionResult: ExecutionResult = {
        taskId,
        success,
        exitCode,
        durationMs: result.durationMs,
        toolsUsed: result.toolsUsed,
        filesChanged: result.filesChanged,
      };
      console.log(renderSummary(executionResult));
    }

    // 13. Output JSON (json mode only)
    if (outputFormat === 'json') {
      console.log(JSON.stringify(result, null, 2));
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Build error result
    const result: SubmitResult = {
      taskId,
      processId: tracker.getProcessId() ?? '(unknown)',
      success: false,
      exitCode: 1,
      durationMs: tracker.getDuration(),
      toolsUsed: tracker.countToolsUsed(),
      filesChanged: tracker.countFilesChanged(),
      error: errorMessage,
      entries: outputFormat === 'json' ? tracker.getEntries() : undefined,
    };

    // Display error
    if (outputFormat === 'pretty') {
      console.error(`\n[ERR] ${errorMessage}`);
      console.log(''); // Blank line
      const executionResult: ExecutionResult = {
        taskId,
        success: false,
        exitCode: 1,
        durationMs: result.durationMs,
        toolsUsed: result.toolsUsed,
        filesChanged: result.filesChanged,
        error: errorMessage,
      };
      console.log(renderSummary(executionResult));
    } else if (outputFormat === 'json') {
      console.log(JSON.stringify(result, null, 2));
    }

    return result;
  } finally {
    // Cleanup
    tracker.clear();
  }
}

/**
 * Register submit command with Commander program
 */
export function registerSubmitCommand(program: any): void {
  program
    .command('submit')
    .description('Submit a task to an agent and stream output')
    .requiredOption('--agent <name>', 'Agent to use (claude, cursor, copilot, codex)')
    .requiredOption('--prompt <text>', 'Task prompt to submit')
    .requiredOption('--workDir <path>', 'Working directory for the agent')
    .option('--detach', 'Detach mode: return task/process IDs immediately', false)
    .option(
      '--output-format <format>',
      'Output format: pretty, json, or markdown',
      'pretty',
    )
    .option('--show-thinking', 'Show thinking entries', true)
    .option('--show-timestamps', 'Show timestamps', false)
    .option('--model <model>', 'Model to use (e.g., claude-3-opus, cursor-small)')
    .option('--force', 'Auto-approve all tool executions (default: true)', true)
    .option('--mcp-servers <servers>', 'Comma-separated list of MCP servers to enable')
    .action(async (options: SubmitOptions) => {
      try {
        const result = await submitCommand(options);
        // Exit with agent's exit code
        process.exit(result.exitCode);
      } catch (error) {
        console.error('[ERR] ' + (error instanceof Error ? error.message : error));
        process.exit(1);
      }
    });
}
