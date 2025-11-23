/**
 * Codex CLI executor using JSONL protocol.
 *
 * Executor for OpenAI Codex CLI that runs in non-interactive mode (codex exec)
 * with JSON output for structured parsing.
 *
 * @module agents/codex/executor
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { BaseAgentExecutor } from '../base/base-executor.js';
import type { ExecutionTask } from '../../engine/types.js';
import type {
  SpawnedChild,
  OutputChunk,
  NormalizedEntry,
  AgentCapabilities,
} from '../types/agent-executor.js';
import type { CodexConfig } from './types/config.js';

const exec = promisify(execCallback);

/**
 * Codex CLI executor using JSONL protocol.
 *
 * Runs codex in non-interactive mode (`codex exec`) with JSON output
 * for automated task execution.
 *
 * @example Basic usage
 * ```typescript
 * const executor = new CodexExecutor({
 *   workDir: '/path/to/project',
 *   autoApprove: true,
 *   model: 'gpt-5-codex'
 * });
 *
 * const spawned = await executor.executeTask({
 *   id: 'task-1',
 *   type: 'custom',
 *   prompt: 'Implement user authentication',
 *   workDir: '/path/to/project',
 *   config: {},
 * });
 *
 * // Process output
 * const outputStream = executor.createOutputChunks(spawned.process);
 * for await (const entry of executor.normalizeOutput(outputStream, '/path/to/project')) {
 *   console.log(entry.type.kind, entry.content);
 * }
 * ```
 */
export class CodexExecutor extends BaseAgentExecutor {
  /**
   * Create a new Codex executor.
   *
   * @param config - Configuration options
   */
  constructor(private config: CodexConfig) {
    super();
  }

  /**
   * Execute a new task with Codex CLI.
   *
   * Spawns codex process in non-interactive mode (codex exec),
   * sends the prompt to stdin, and immediately closes stdin.
   *
   * @param task - Task to execute
   * @returns Spawned child process
   * @throws {Error} If codex is not available or spawn fails
   */
  async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
    // Check availability first
    const available = await this.checkAvailability();
    if (!available) {
      throw new Error(
        'Codex CLI is not available. Please install from https://openai.com/codex'
      );
    }

    // Validate task configuration
    if (!task.workDir) {
      throw new Error('workDir is required for Codex executor');
    }

    // Build command arguments
    const args = this.buildArgs();

    // Get executable path
    const executablePath = this.config.executablePath || 'codex';

    // Spawn process
    let child;
    try {
      child = spawn(executablePath, args, {
        cwd: task.workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      throw new Error(
        `Failed to spawn codex process: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Handle spawn errors
    child.on('error', (err) => {
      throw new Error(`Codex process error: ${err.message}`);
    });

    // Send prompt to stdin and close immediately
    if (child.stdin) {
      child.stdin.write(task.prompt + '\n');
      child.stdin.end();
    }

    // Wrap child process to ManagedProcess
    return {
      process: this.wrapChildProcess(child),
    };
  }

  /**
   * Resume a previous task session.
   *
   * Note: Codex does not currently support session resumption.
   * This method throws an error.
   *
   * @param task - Task with new prompt
   * @param sessionId - Session ID to resume
   * @throws {Error} Always throws - Codex doesn't support resume
   */
  async resumeTask(
    task: ExecutionTask,
    sessionId: string
  ): Promise<SpawnedChild> {
    throw new Error('Codex does not support session resumption');
  }

  /**
   * Normalize Codex JSONL output to unified format.
   *
   * Parses line-delimited JSON from Codex CLI and converts to
   * normalized entries.
   *
   * @param outputStream - Stream of output chunks
   * @param workDir - Working directory for path resolution
   * @returns Async iterable of normalized entries
   */
  async *normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>,
    workDir: string
  ): AsyncIterable<NormalizedEntry> {
    let buffer = '';
    let index = 0;

    for await (const chunk of outputStream) {
      if (chunk.type !== 'stdout') {
        continue;
      }

      buffer += chunk.data.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const parsed = JSON.parse(line);

          // Convert Codex JSON events to normalized entries
          // For now, just emit as assistant message
          // TODO: Implement proper Codex event parsing
          yield {
            index: index++,
            timestamp: chunk.timestamp,
            type: {
              kind: 'assistant_message',
            },
            content: typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2),
          };
        } catch {
          // If not JSON, emit as assistant message
          yield {
            index: index++,
            timestamp: chunk.timestamp,
            type: {
              kind: 'assistant_message',
            },
            content: line,
          };
        }
      }
    }

    // Emit any remaining buffer
    if (buffer.trim()) {
      yield {
        index: index++,
        timestamp: new Date(),
        type: {
          kind: 'assistant_message',
        },
        content: buffer,
      };
    }
  }

  /**
   * Get Codex executor capabilities.
   *
   * @returns Agent capabilities descriptor
   */
  getCapabilities(): AgentCapabilities {
    return {
      supportsSessionResume: false, // TODO: Implement resume support
      requiresSetup: true, // Needs codex login or API key
      supportsApprovals: true, // Supports --dangerously-bypass-approvals-and-sandbox
      supportsMcp: true, // Codex has MCP support
      protocol: 'jsonl', // Line-delimited JSON output
    };
  }

  /**
   * Check if Codex CLI is available.
   *
   * Checks if codex executable exists in PATH.
   *
   * @returns True if codex is available, false otherwise
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const executablePath = this.config.executablePath || 'codex';
      const command =
        process.platform === 'win32'
          ? `where ${executablePath}`
          : `which ${executablePath}`;

      const result = await exec(command);
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Build command-line arguments for codex.
   *
   * @returns Array of command-line arguments
   * @private
   */
  private buildArgs(): string[] {
    const args = ['exec'];

    // Add '-' to read prompt from stdin (prevents blocking message)
    args.push('-');

    // Add --json flag for structured output (default: true)
    if (this.config.json !== false) {
      args.push('--json');
    }

    // Add --model if specified
    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    // Add approval bypass flag
    if (this.config.autoApprove !== false) {
      // Default to full auto-approval bypass
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else {
      // Use safer automation mode
      args.push('--full-auto');
    }

    return args;
  }
}
