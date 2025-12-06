/**
 * Cursor CLI executor using simple JSONL stream protocol.
 *
 * The simplest agent protocol - unidirectional output with auto-approval
 * via --force flag. Supports 11 built-in tools and MCP server integration.
 *
 * @module agents/cursor/executor
 */

import { spawn } from "child_process";
import { promisify } from "util";
import { exec as execCallback } from "child_process";
import { BaseAgentExecutor } from "../base/base-executor.js";
import type { ExecutionTask } from "../../engine/types.js";
import type {
  SpawnedChild,
  OutputChunk,
  NormalizedEntry,
  AgentCapabilities,
} from "../types/agent-executor.js";
import type { CursorConfig } from "./types/config.js";
import { normalizeOutput as cursorNormalizeOutput } from "./normalizer/index.js";
import { CursorExecutorError } from "./errors.js";
import { ensureMcpServerTrust } from "./mcp/index.js";

const exec = promisify(execCallback);

/**
 * Cursor CLI executor using simple JSONL stream protocol.
 *
 * This is the simplest agent executor - unidirectional output with no
 * bidirectional communication. The --force flag enables auto-approval
 * of all tool executions, making it ideal for automated workflows.
 *
 * @example Basic usage
 * ```typescript
 * const executor = new CursorExecutor({
 *   force: true,        // Auto-approve all tools
 *   model: 'auto'       // Use default model selection
 * });
 *
 * const spawned = await executor.executeTask({
 *   id: 'task-1',
 *   type: 'custom',
 *   prompt: 'Add login feature',
 *   workDir: '/path/to/project',
 *   config: {},
 * });
 *
 * // Process normalized output
 * const outputStream = executor.createOutputChunks(spawned.process);
 * for await (const entry of executor.normalizeOutput(outputStream, '/path/to/project')) {
 *   console.log(entry.type.kind, entry.content);
 * }
 * ```
 *
 * @example Session resumption
 * ```typescript
 * // Execute initial task
 * const spawned1 = await executor.executeTask({
 *   id: 'task-1',
 *   prompt: 'Start implementing login',
 *   workDir: '/project',
 *   config: {},
 * });
 *
 * // ... extract session ID from output ...
 * const sessionId = 'sess-abc123';
 *
 * // Resume with new prompt
 * const spawned2 = await executor.resumeTask({
 *   id: 'task-2',
 *   prompt: 'Continue with logout feature',
 *   workDir: '/project',
 *   config: {},
 * }, sessionId);
 * ```
 *
 * @example Custom model selection
 * ```typescript
 * const executor = new CursorExecutor({
 *   force: true,
 *   model: 'sonnet-4.5',      // Use Claude Sonnet 4.5
 *   appendPrompt: '\n\nPlease include unit tests.'
 * });
 * ```
 */
export class CursorExecutor extends BaseAgentExecutor {
  /**
   * Create a new Cursor executor.
   *
   * @param config - Configuration options
   */
  constructor(private config: CursorConfig = {}) {
    super();
  }

  /**
   * Execute a new task with Cursor CLI.
   *
   * Spawns cursor-agent process with the specified configuration,
   * sends the prompt to stdin, and immediately closes stdin
   * (unidirectional protocol).
   *
   * @param task - Task to execute
   * @returns Spawned child process
   * @throws {Error} If cursor-agent is not available or spawn fails
   *
   * @example
   * ```typescript
   * const spawned = await executor.executeTask({
   *   id: 'task-1',
   *   type: 'custom',
   *   prompt: 'Implement user authentication',
   *   workDir: '/path/to/project',
   *   config: {},
   * });
   *
   * console.log('Process PID:', spawned.process.pid);
   * ```
   */
  async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
    // Check availability first
    const available = await this.checkAvailability();
    if (!available) {
      throw CursorExecutorError.notAvailable();
    }

    // Validate task configuration
    if (!task.workDir) {
      throw CursorExecutorError.invalidConfig("workDir is required");
    }

    // Ensure MCP servers are trusted (non-blocking warning)
    await ensureMcpServerTrust(task.workDir);

    // Build command arguments
    const args = this.buildArgs();

    // Get executable path
    const executablePath = this.config.executablePath || "cursor-agent";

    // Spawn process with error handling
    let child;
    try {
      child = spawn(executablePath, args, {
        cwd: task.workDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      throw CursorExecutorError.spawnFailed(err as Error);
    }

    // Handle spawn errors
    child.on("error", (err) => {
      throw CursorExecutorError.spawnFailed(err);
    });

    // Build full prompt
    const prompt = this.buildPrompt(task.prompt);

    // Send prompt to stdin and close immediately (unidirectional protocol)
    if (child.stdin) {
      child.stdin.write(prompt + "\n");
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
   * Spawns cursor-agent with --resume flag to continue from a
   * previous session, allowing multi-turn interactions.
   *
   * @param task - Task with new prompt
   * @param sessionId - Session ID to resume (e.g., 'sess-abc123')
   * @returns Spawned child process
   * @throws {Error} If cursor-agent is not available or spawn fails
   *
   * @example
   * ```typescript
   * // Resume from previous session
   * const spawned = await executor.resumeTask({
   *   id: 'task-2',
   *   type: 'custom',
   *   prompt: 'Now add logout functionality',
   *   workDir: '/path/to/project',
   *   config: {},
   * }, 'sess-abc123');
   * ```
   */
  async resumeTask(
    task: ExecutionTask,
    sessionId: string
  ): Promise<SpawnedChild> {
    // Check availability first
    const available = await this.checkAvailability();
    if (!available) {
      throw CursorExecutorError.notAvailable();
    }

    // Validate task configuration
    if (!task.workDir) {
      throw CursorExecutorError.invalidConfig("workDir is required");
    }

    // Validate session ID
    if (!sessionId || !sessionId.trim()) {
      throw CursorExecutorError.invalidConfig(
        "sessionId is required for resume"
      );
    }

    // Ensure MCP servers are trusted (non-blocking warning)
    await ensureMcpServerTrust(task.workDir);

    // Build command arguments with --resume flag
    const args = this.buildArgs(sessionId);

    // Get executable path
    const executablePath = this.config.executablePath || "cursor-agent";

    // Spawn process with error handling
    let child;
    try {
      child = spawn(executablePath, args, {
        cwd: task.workDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      throw CursorExecutorError.spawnFailed(err as Error);
    }

    // Handle spawn errors
    child.on("error", (err) => {
      throw CursorExecutorError.spawnFailed(err);
    });

    // Build full prompt
    const prompt = this.buildPrompt(task.prompt);

    // Send prompt to stdin and close immediately
    if (child.stdin) {
      child.stdin.write(prompt + "\n");
      child.stdin.end();
    }

    // Wrap child process to ManagedProcess
    return {
      process: this.wrapChildProcess(child),
    };
  }

  /**
   * Normalize Cursor JSONL output to unified format.
   *
   * Parses line-delimited JSON from Cursor CLI and converts to
   * normalized entries. Handles streaming message coalescing,
   * session metadata extraction, and authentication error detection.
   *
   * @param outputStream - Stream of output chunks
   * @param workDir - Working directory for path resolution
   * @returns Async iterable of normalized entries
   *
   * @example
   * ```typescript
   * const spawned = await executor.executeTask(task);
   * const outputStream = executor.createOutputChunks(spawned.process);
   *
   * for await (const entry of executor.normalizeOutput(outputStream, task.workDir)) {
   *   console.log(entry.type.kind, entry.content);
   * }
   * ```
   */
  async *normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>,
    workDir: string
  ): AsyncIterable<NormalizedEntry> {
    yield* cursorNormalizeOutput(outputStream, workDir);
  }

  /**
   * Get Cursor executor capabilities.
   *
   * @returns Agent capabilities descriptor
   *
   * @example
   * ```typescript
   * const caps = executor.getCapabilities();
   * console.log('Supports resume:', caps.supportsSessionResume); // true
   * console.log('Protocol:', caps.protocol); // 'jsonl'
   * console.log('Approvals:', caps.supportsApprovals); // false (uses --force)
   * ```
   */
  getCapabilities(): AgentCapabilities {
    return {
      supportsSessionResume: true, // Supports --resume flag
      requiresSetup: true, // Needs cursor-agent login or CURSOR_API_KEY
      supportsApprovals: false, // Uses --force flag, no interactive approvals
      supportsMcp: true, // Supports MCP server integration
      protocol: "jsonl", // Line-delimited JSON output
      supportsMidExecutionMessages: false, // Not supported yet
    };
  }

  /**
   * Check if Cursor CLI is available.
   *
   * Checks if cursor-agent executable exists in PATH.
   *
   * @returns True if cursor-agent is available, false otherwise
   *
   * @example
   * ```typescript
   * const available = await executor.checkAvailability();
   * if (!available) {
   *   console.error('Please install Cursor CLI: https://cursor.sh');
   * }
   * ```
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const executablePath = this.config.executablePath || "cursor-agent";
      const command =
        process.platform === "win32"
          ? `where ${executablePath}`
          : `which ${executablePath}`;

      const result = await exec(command);
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Build command-line arguments for cursor-agent.
   *
   * @param sessionId - Optional session ID for resumption
   * @returns Array of command-line arguments
   * @private
   */
  private buildArgs(sessionId?: string): string[] {
    const args = ["-p", "--output-format=stream-json"];

    // Add --force for auto-approval
    if (this.config.force) {
      args.push("--force");
    }

    // Add --model if specified
    if (this.config.model) {
      args.push("--model", this.config.model);
    }

    // Add --approve-mcps for auto-approval of MCP servers
    if (this.config.approveMcps) {
      args.push("--approve-mcps");
    }

    // Add --browser for browser automation support
    if (this.config.browser) {
      args.push("--browser");
    }

    // Add --workspace if specified
    if (this.config.workspace) {
      args.push("--workspace", this.config.workspace);
    }

    // Add --resume if session ID provided
    if (sessionId) {
      args.push("--resume", sessionId);
    }

    return args;
  }

  /**
   * Build full prompt with optional appendPrompt.
   *
   * @param userPrompt - User's original prompt
   * @returns Full prompt with optional suffix
   * @private
   */
  private buildPrompt(userPrompt: string): string {
    if (this.config.appendPrompt) {
      return userPrompt + this.config.appendPrompt;
    }
    return userPrompt;
  }
}
