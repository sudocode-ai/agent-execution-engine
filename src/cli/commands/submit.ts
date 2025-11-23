/**
 * Submit Command
 *
 * Implements the submit command that spawns an agent, streams output, and follows until completion.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { ClaudeCodeExecutor } from '../../agents/claude/executor.js';
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

  // Only claude is supported in Phase 1
  if (options.agent !== 'claude') {
    throw new Error(
      `Agent "${options.agent}" is not supported. Phase 1 MVP only supports: claude`,
    );
  }
}

/**
 * Create agent executor for the specified agent
 */
function createExecutor(agent: string, workDir: string) {
  if (agent === 'claude') {
    return new ClaudeCodeExecutor({
      workDir,
      print: true,
      outputFormat: 'stream-json',
      dangerouslySkipPermissions: true, // MVP: auto-approve
    });
  }

  throw new Error(`Unsupported agent: ${agent}`);
}

/**
 * Stream output from agent and render to console
 */
async function streamOutput(
  executor: ClaudeCodeExecutor,
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
  const executor = createExecutor(options.agent, workDir);

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

    // 9. Follow mode: stream output
    const outputStream = spawned.process.streams?.stdout;
    if (!outputStream) {
      throw new Error('No output stream available from spawned process');
    }

    await streamOutput(executor, outputStream, workDir, tracker, {
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
    .requiredOption('--agent <name>', 'Agent to use (e.g., claude)')
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
