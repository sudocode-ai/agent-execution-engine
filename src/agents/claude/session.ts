/**
 * Claude Session
 *
 * High-level wrapper for interactive Claude Code sessions with mid-execution messaging.
 *
 * @module agents/claude/session
 */

import { ClaudeCodeExecutor } from './executor.js';
import type { ClaudeCodeConfig } from './types/config.js';
import type { ManagedProcess } from '../../process/types.js';
import type { ExecutionTask } from '../../engine/types.js';
import type { OutputChunk, NormalizedEntry } from '../types/agent-executor.js';

/**
 * Session state
 */
export type SessionState = 'idle' | 'running' | 'interrupted' | 'closed';

/**
 * Claude Session
 *
 * Provides a high-level API for interactive Claude Code sessions that support
 * mid-execution messaging. This wrapper simplifies the common pattern of:
 * 1. Starting a task
 * 2. Sending additional messages during execution
 * 3. Interrupting if needed
 * 4. Cleaning up
 *
 * @example Basic usage
 * ```typescript
 * const session = new ClaudeSession({
 *   workDir: '/path/to/project',
 *   print: true,
 *   outputFormat: 'stream-json',
 * });
 *
 * // Start a task
 * await session.start('Build a login feature');
 *
 * // Send additional guidance mid-execution
 * await session.sendMessage('Also add password validation');
 * await session.sendMessage('Use bcrypt for hashing');
 *
 * // Clean up when done
 * await session.close();
 * ```
 *
 * @example With output handling
 * ```typescript
 * const session = new ClaudeSession(config);
 * await session.start('Refactor the auth module');
 *
 * // Get normalized output stream
 * const outputStream = session.getOutputChunks();
 * if (outputStream) {
 *   for await (const entry of session.normalizeOutput(outputStream)) {
 *     console.log(entry.type.kind, entry.content);
 *   }
 * }
 * ```
 */
export class ClaudeSession {
  private readonly executor: ClaudeCodeExecutor;
  private readonly config: ClaudeCodeConfig;
  private process: ManagedProcess | null = null;
  private state: SessionState = 'idle';

  /**
   * Create a new Claude session
   *
   * @param config - Claude Code configuration
   */
  constructor(config: ClaudeCodeConfig) {
    this.config = config;
    this.executor = new ClaudeCodeExecutor(config);
  }

  /**
   * Get current session state
   *
   * @returns Current session state
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Check if session is running
   *
   * @returns True if session is in running state
   */
  isRunning(): boolean {
    return this.state === 'running';
  }

  /**
   * Start a new session with an initial prompt
   *
   * @param prompt - Initial prompt to send to Claude
   * @param workDir - Working directory (defaults to config.workDir)
   * @throws Error if session is already started
   *
   * @example
   * ```typescript
   * const session = new ClaudeSession(config);
   * await session.start('Add a new API endpoint for user profiles');
   * ```
   */
  async start(prompt: string, workDir?: string): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start session in state: ${this.state}`);
    }

    const task = this.createTask(prompt, workDir || this.config.workDir);
    const spawned = await this.executor.executeTask(task);
    this.process = spawned.process;
    this.state = 'running';
  }

  /**
   * Send an additional message to the running session
   *
   * Use this to provide mid-execution guidance, additional context,
   * or corrections while Claude is working on the task.
   *
   * @param message - Message content to send
   * @throws Error if session is not running
   *
   * @example
   * ```typescript
   * await session.start('Build a user dashboard');
   *
   * // Provide additional guidance during execution
   * await session.sendMessage('Use Chart.js for the graphs');
   * await session.sendMessage('Add dark mode support');
   * ```
   */
  async sendMessage(message: string): Promise<void> {
    if (this.state !== 'running') {
      throw new Error(`Cannot send message in state: ${this.state}`);
    }
    if (!this.process) {
      throw new Error('Session has no active process');
    }

    await this.executor.sendMessage(this.process, message);
  }

  /**
   * Interrupt the current operation
   *
   * Sends an interrupt signal to Claude. Claude handles this gracefully,
   * typically finishing the current tool operation before stopping.
   *
   * @throws Error if session is not running
   *
   * @example
   * ```typescript
   * // User wants to stop the current task
   * await session.interrupt();
   * ```
   */
  async interrupt(): Promise<void> {
    if (this.state !== 'running') {
      throw new Error(`Cannot interrupt in state: ${this.state}`);
    }
    if (!this.process) {
      throw new Error('Session has no active process');
    }

    await this.executor.interrupt(this.process);
    this.state = 'interrupted';
  }

  /**
   * Get the underlying managed process
   *
   * Use this for advanced operations not covered by the session API.
   *
   * @returns The managed process or null if not started
   */
  getProcess(): ManagedProcess | null {
    return this.process;
  }

  /**
   * Get output chunks from the process
   *
   * Creates an async iterable of raw output chunks from the process streams.
   * Use with `normalizeOutput()` to get structured entries.
   *
   * @returns Async iterable of output chunks, or null if not running
   */
  getOutputChunks(): AsyncIterable<OutputChunk> | null {
    if (!this.process?.streams) {
      return null;
    }

    const streams = this.process.streams;

    // Create async generator that yields chunks from both stdout and stderr
    async function* outputGenerator(): AsyncIterable<OutputChunk> {
      const stdout = streams.stdout;
      const stderr = streams.stderr;

      // Track if streams have ended
      let stdoutEnded = false;
      let stderrEnded = false;

      // Queue for chunks
      const chunks: OutputChunk[] = [];
      let resolveWait: (() => void) | null = null;

      const pushChunk = (chunk: OutputChunk) => {
        chunks.push(chunk);
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      };

      stdout.on('data', (data: Buffer) => {
        pushChunk({ type: 'stdout', data, timestamp: new Date() });
      });

      stderr.on('data', (data: Buffer) => {
        pushChunk({ type: 'stderr', data, timestamp: new Date() });
      });

      stdout.on('end', () => {
        stdoutEnded = true;
        if (resolveWait && stderrEnded) {
          resolveWait();
          resolveWait = null;
        }
      });

      stderr.on('end', () => {
        stderrEnded = true;
        if (resolveWait && stdoutEnded) {
          resolveWait();
          resolveWait = null;
        }
      });

      // Yield chunks as they arrive
      while (true) {
        if (chunks.length > 0) {
          yield chunks.shift()!;
        } else if (stdoutEnded && stderrEnded) {
          break;
        } else {
          // Wait for more data
          await new Promise<void>((resolve) => {
            resolveWait = resolve;
          });
        }
      }
    }

    return outputGenerator();
  }

  /**
   * Normalize output chunks to structured entries
   *
   * Converts raw output chunks into normalized entries that can be
   * rendered consistently.
   *
   * @param outputStream - Raw output chunks from getOutputChunks()
   * @returns Async iterable of normalized entries
   */
  normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>
  ): AsyncIterable<NormalizedEntry> {
    return this.executor.normalizeOutput(
      outputStream,
      this.config.workDir
    );
  }

  /**
   * Close the session
   *
   * Interrupts any running task and cleans up resources.
   * The session cannot be reused after closing.
   *
   * @example
   * ```typescript
   * try {
   *   await session.start('Build feature');
   *   // ... work with session ...
   * } finally {
   *   await session.close();
   * }
   * ```
   */
  async close(): Promise<void> {
    if (this.state === 'closed') {
      return; // Already closed
    }

    if (this.process && this.state === 'running') {
      try {
        await this.executor.interrupt(this.process);
      } catch {
        // Ignore interrupt errors during close
      }
    }

    this.process = null;
    this.state = 'closed';
  }

  /**
   * Create an execution task from prompt and workDir
   */
  private createTask(prompt: string, workDir: string): ExecutionTask {
    return {
      id: `session-${Date.now()}`,
      type: 'custom',
      prompt,
      workDir,
      priority: 0,
      dependencies: [],
      createdAt: new Date(),
      config: {},
    };
  }
}
