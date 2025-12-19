/**
 * GitHub Copilot CLI Executor
 *
 * Executor implementation for GitHub Copilot CLI (@github/copilot).
 * Uses plain text streaming protocol with session ID discovery via log files.
 *
 * @module execution-engine/agents/copilot
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ExecutionTask } from '../../engine/types.js';
import type {
  AgentCapabilities,
  SpawnedChild,
  NormalizedEntry,
  OutputChunk,
} from '../types/agent-executor.js';
import { BaseAgentExecutor } from '../base/base-executor.js';
import type { CopilotConfig } from './config.js';
import {
  PlainTextLogProcessor,
  CounterIndexProvider,
} from './plain-text-processor.js';
import {
  createTempLogDir,
  watchSessionId,
  formatSessionLine,
  parseSessionLine,
} from './session.js';

/**
 * GitHub Copilot CLI Executor
 *
 * Implements IAgentExecutor for GitHub Copilot CLI integration.
 *
 * **Features**:
 * - Plain text output with ANSI escape stripping
 * - Session ID discovery via log file polling
 * - Session resumption support via `--resume`
 * - Native MCP support
 * - Fine-grained tool permissions
 * - Multiple model support (GPT-4, Claude, etc.)
 *
 * **Limitations**:
 * - No structured output (no tool call tracking, no diffs)
 * - Session discovery adds ~200ms latency
 * - Requires authentication setup (`npx @github/copilot` then `/login`)
 *
 * @example
 * ```typescript
 * const executor = new CopilotExecutor({
 *   workDir: '/path/to/project',
 *   model: 'gpt-4o',
 *   allowAllTools: true,
 * });
 *
 * const spawned = await executor.executeTask({
 *   id: 'task-1',
 *   type: 'issue',
 *   prompt: 'Add user authentication',
 *   workDir: '/path/to/project',
 *   config: {},
 * });
 * ```
 */
export class CopilotExecutor extends BaseAgentExecutor {
  private config: CopilotConfig;

  /**
   * Create a new Copilot executor
   *
   * @param config - Copilot-specific configuration
   */
  constructor(config: CopilotConfig) {
    super();
    this.config = config;
  }

  /**
   * Execute a new task with Copilot CLI
   *
   * Spawns Copilot process with --prompt flag for non-interactive execution.
   *
   * @param task - Task to execute
   * @returns Spawned child process
   */
  async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
    // Create temp log directory for session tracking
    const logDir = await createTempLogDir(task.workDir);

    // Combine prompts (system + user)
    const combinedPrompt = this.combinePrompt(task.prompt);

    // Build command arguments (interactive mode)
    // Default to 'copilot' (uses locally installed version from PATH)
    const executable = this.config.executablePath || 'copilot';
    const args = this.buildArgs(logDir, undefined);

    // Spawn process in interactive mode
    const child = spawn(executable, args, {
      cwd: task.workDir,
      env: {
        ...(typeof process !== 'undefined' ? process.env : {}),
        NODE_NO_WARNINGS: '1',
        ...this.config.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write prompt to stdin and close
    if (child.stdin) {
      child.stdin.write(combinedPrompt);
      child.stdin.end();
    }

    // Start session ID discovery (async)
    this.startSessionDiscovery(logDir, child);

    // Wrap as ManagedProcess
    const managedProcess = this.wrapChildProcess(child);

    return { process: managedProcess };
  }

  /**
   * Resume a previous session
   *
   * @param task - Task with prompt for follow-up
   * @param sessionId - Session ID from previous execution
   * @returns Spawned child process
   */
  async resumeTask(
    task: ExecutionTask,
    sessionId: string
  ): Promise<SpawnedChild> {
    // Create temp log directory
    const logDir = await createTempLogDir(task.workDir);

    // Combine prompts (system + user)
    const combinedPrompt = this.combinePrompt(task.prompt);

    // Build command arguments with --resume (interactive mode)
    // Default to 'copilot' (uses locally installed version from PATH)
    const executable = this.config.executablePath || 'copilot';
    const args = this.buildArgs(logDir, sessionId);

    // Spawn process in interactive mode
    const child = spawn(executable, args, {
      cwd: task.workDir,
      env: {
        ...(typeof process !== 'undefined' ? process.env : {}),
        NODE_NO_WARNINGS: '1',
        ...this.config.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write prompt to stdin and close
    if (child.stdin) {
      child.stdin.write(combinedPrompt);
      child.stdin.end();
    }

    // Start session ID discovery (should find same session)
    this.startSessionDiscovery(logDir, child);

    // Wrap as ManagedProcess
    const managedProcess = this.wrapChildProcess(child);

    return { process: managedProcess };
  }

  /**
   * Normalize Copilot output stream
   *
   * Processes plain text output, strips ANSI escapes, batches into paragraphs.
   *
   * @param outputStream - Raw output chunks from process
   * @param _workDir - Working directory (unused for Copilot)
   * @returns Async iterable of normalized entries
   */
  async *normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>,
    _workDir: string
  ): AsyncIterable<NormalizedEntry> {
    const processor = this.createOutputNormalizer();
    const decoder = new TextDecoder();

    let buffer = '';

    for await (const chunk of outputStream) {
      if (chunk.type !== 'stdout') {
        continue; // Only process stdout
      }

      // Decode chunk
      buffer += decoder.decode(chunk.data, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        // Check for session ID marker
        const sessionId = parseSessionLine(line);
        if (sessionId) {
          // Emit as system message
          yield {
            index: 0,
            timestamp: chunk.timestamp,
            type: { kind: 'system_message' },
            content: `Session ID: ${sessionId}`,
            metadata: { sessionId },
          };
          continue;
        }

        // Process as plain text
        const patches = processor.process(line + '\n');
        for (const patch of patches) {
          yield patch.entry;
        }
      }
    }

    // Process remaining buffer
    if (buffer) {
      const patches = processor.process(buffer);
      for (const patch of patches) {
        yield patch.entry;
      }
    }

    // Flush any pending content
    const finalPatch = processor.flush();
    if (finalPatch) {
      yield finalPatch.entry;
    }
  }

  /**
   * Get Copilot executor capabilities
   *
   * @returns Capabilities object
   */
  getCapabilities(): AgentCapabilities {
    return {
      supportsSessionResume: true,
      requiresSetup: true, // Requires ~/.copilot/mcp-config.json
      supportsApprovals: false, // Copilot has built-in prompts
      supportsMcp: true,
      protocol: 'custom', // Plain text protocol
      supportsMidExecutionMessages: false, // Not supported yet
    };
  }

  /**
   * Check if Copilot CLI is available and authenticated
   *
   * Checks for either:
   * - ~/.copilot/config.json (main config with logged_in_users)
   * - ~/.copilot/mcp-config.json (MCP configuration)
   *
   * @returns True if Copilot is set up
   */
  async checkAvailability(): Promise<boolean> {
    const home = homedir();
    if (!home) {
      return false;
    }

    // Check main config file (contains authentication info)
    try {
      const configPath = join(home, '.copilot', 'config.json');
      await fs.access(configPath);
      return true;
    } catch {
      // Fallback to MCP config
      const mcpConfigPath = this.getDefaultMcpConfigPath();
      if (!mcpConfigPath) {
        return false;
      }

      try {
        await fs.access(mcpConfigPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Get default MCP config path
   *
   * @returns Path to ~/.copilot/mcp-config.json or null if home dir not found
   */
  getDefaultMcpConfigPath(): string | null {
    const home = homedir();
    if (!home) {
      return null;
    }

    return join(home, '.copilot', 'mcp-config.json');
  }

  /**
   * Build command arguments for Copilot CLI
   *
   * @param logDir - Temporary log directory path
   * @param sessionId - Optional session ID for resumption
   * @returns Array of command arguments
   */
  private buildArgs(logDir: string, sessionId?: string): string[] {
    const args: string[] = [];

    // Only add npx args if explicitly using npx (not the default)
    // Default behavior: use 'copilot' from PATH (locally installed version)
    if (this.config.executablePath === 'npx') {
      // If version specified in config, use it; otherwise use latest
      const version = this.config.copilotVersion || 'latest';
      args.push('-y', `@github/copilot@${version}`);
    }

    // Required args for logging
    args.push('--no-color');
    args.push('--log-level', 'debug');
    args.push('--log-dir', logDir);

    // Session resumption
    if (sessionId) {
      args.push('--resume', sessionId);
    }

    // Model selection
    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    // Tool permissions
    if (this.config.allowAllTools) {
      args.push('--allow-all-tools');
    }

    if (this.config.allowTool) {
      args.push('--allow-tool', this.config.allowTool);
    }

    if (this.config.denyTool) {
      args.push('--deny-tool', this.config.denyTool);
    }

    // Additional directories
    if (this.config.addDir) {
      for (const dir of this.config.addDir) {
        args.push('--add-dir', dir);
      }
    }

    // MCP server configuration - inline servers
    if (this.config.mcpServers && Object.keys(this.config.mcpServers).length > 0) {
      // Build JSON object with all MCP servers, applying defaults
      // Format: {"mcpServers": {"server-name": {"type": "local", "command": "...", "args": [...], "env": {...}, "tools": ["*"]}}}
      const mcpServers: Record<string, any> = {};

      for (const [serverName, serverConfig] of Object.entries(this.config.mcpServers)) {
        mcpServers[serverName] = {
          type: serverConfig.type ?? 'local',  // Default to 'local'
          command: serverConfig.command,
          args: serverConfig.args ?? [],       // Default to empty array
          tools: serverConfig.tools ?? ['*'],  // Default to all tools
          ...(serverConfig.env ? { env: serverConfig.env } : {}),
        };
      }

      const mcpConfig = { mcpServers };
      const mcpConfigJson = JSON.stringify(mcpConfig);
      args.push('--additional-mcp-config', mcpConfigJson);
    }

    // MCP server configuration - disable servers
    if (this.config.disableMcpServer) {
      for (const server of this.config.disableMcpServer) {
        args.push('--disable-mcp-server', server);
      }
    }

    return args;
  }

  /**
   * Combine system prompt with user prompt
   *
   * @param userPrompt - User's prompt
   * @returns Combined prompt
   */
  private combinePrompt(userPrompt: string): string {
    if (this.config.systemPrompt) {
      return `${this.config.systemPrompt}\n\n${userPrompt}`;
    }
    return userPrompt;
  }

  /**
   * Create output normalizer processor
   *
   * @returns Configured PlainTextLogProcessor
   */
  private createOutputNormalizer(): PlainTextLogProcessor {
    const indexProvider = new CounterIndexProvider(0);

    return PlainTextLogProcessor.builder()
      .normalizedEntryProducer((content: string) => ({
        index: 0, // Will be overwritten by patch index
        timestamp: new Date(),
        type: { kind: 'assistant_message' },
        content,
        metadata: undefined,
      }))
      .setIndexProvider(indexProvider)
      .build();
  }

  /**
   * Start session ID discovery in background
   *
   * Polls log directory for session file and injects session ID into stdout.
   *
   * @param logDir - Log directory to watch
   * @param child - Child process to inject session ID into
   */
  private startSessionDiscovery(
    logDir: string,
    child: ReturnType<typeof spawn>
  ): void {
    watchSessionId(logDir)
      .then((sessionId) => {
        // Inject session ID into stdout stream
        const sessionLine = formatSessionLine(sessionId);
        child.stdout?.emit('data', Buffer.from(sessionLine));
      })
      .catch((err) => {
        // Session discovery failed - log but don't crash
        console.error('Failed to discover Copilot session ID:', err.message);
      });
  }
}
