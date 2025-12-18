/**
 * Claude Code Executor
 *
 * Agent executor for Claude Code CLI integration.
 *
 * @module agents/claude/executor
 */

import { spawn } from "child_process";
import { Readable } from "stream";
import * as path from "path";
import { fileURLToPath } from "url";
import { BaseAgentExecutor } from "../base/base-executor.js";
import { ProtocolPeer } from "./protocol/protocol-peer.js";
import { ClaudeAgentClient } from "./protocol/client.js";
import { normalizeMessage, createNormalizerState } from "./normalizer.js";
import { parseStreamJsonLine } from "./protocol/utils.js";
import type { ClaudeCodeConfig } from "./types/config.js";
import type { HookConfig } from "./types/control.js";
import type {
  AgentCapabilities,
  SpawnedChild,
  OutputChunk,
  NormalizedEntry,
} from "../types/agent-executor.js";
import type { ExecutionTask } from "../../engine/types.js";
import type { ManagedProcess } from "../../process/types.js";

// Get directory of this module for finding hook scripts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extended ManagedProcess with Claude-specific peer property
 */
interface ClaudeManagedProcess extends ManagedProcess {
  peer?: ProtocolPeer;
}

/**
 * Claude Code Executor
 *
 * Integrates with Claude Code CLI for agentic task execution.
 * Supports bidirectional protocol, tool approvals, session resume, and MCP servers.
 *
 * @example Basic usage
 * ```typescript
 * const executor = new ClaudeCodeExecutor({
 *   workDir: '/path/to/project',
 *   print: true,
 *   outputFormat: 'stream-json',
 * });
 *
 * const result = await executor.executeTask({
 *   id: 'task-1',
 *   type: 'claude-code',
 *   prompt: 'List all TypeScript files',
 *   workDir: '/path/to/project',
 * });
 * ```
 *
 * @example With approval service
 * ```typescript
 * const executor = new ClaudeCodeExecutor(config);
 * executor.setApprovalService(new CustomApprovalService());
 *
 * const result = await executor.executeTask(task);
 * ```
 */
export class ClaudeCodeExecutor extends BaseAgentExecutor {
  private readonly config: ClaudeCodeConfig;

  /**
   * Create a new ClaudeCodeExecutor
   *
   * @param config - Claude Code configuration
   */
  constructor(config: ClaudeCodeConfig) {
    super();
    this.config = config;
  }

  /**
   * Execute a new task with Claude Code
   *
   * Spawns a Claude CLI process, sets up bidirectional protocol,
   * and sends the initial prompt.
   *
   * @param task - Task to execute
   * @returns Spawned process with protocol peer
   */
  async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
    const args = this.buildArgs(false, undefined, task.workDir);
    const hooks = this.buildHooks();

    // Debug: log the arguments being passed to Claude
    if (process.env.DEBUG_CLAUDE_ARGS) {
      console.error("[DEBUG] Claude args:", JSON.stringify(args, null, 2));
    }

    // Spawn claude process
    const childProcess = spawn(this.config.executablePath || "claude", args, {
      cwd: task.workDir,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"], // stdin, stdout, stderr
    });

    // Create client with approval service
    const client = new ClaudeAgentClient(this.approvalService);

    // Create protocol peer
    const peer = new ProtocolPeer(
      childProcess.stdin!,
      childProcess.stdout!,
      client
    );

    // Start reading messages
    peer.start();

    // NOTE: When using --input-format=stream-json, Claude CLI expects only
    // 'user' and 'control' messages, NOT 'sdk_control_request' messages.
    // So we skip the initialize step and just send the user message directly.
    // The SDK control protocol (with initialize) is only used when NOT specifying --input-format.

    // Send user message (no initialization needed for stream-json input)
    await peer.sendUserMessage(task.prompt);

    // Return spawned child with peer attached
    const now = new Date();
    const claudeProcess: ClaudeManagedProcess = {
      id: `claude-${Date.now()}`,
      pid: childProcess.pid!,
      status: "busy",
      spawnedAt: now,
      lastActivity: now,
      exitCode: null,
      signal: null,
      process: childProcess,
      streams: {
        stdin: childProcess.stdin!,
        stdout: childProcess.stdout!,
        stderr: childProcess.stderr!,
      },
      metrics: {
        totalDuration: 0,
        tasksCompleted: 0,
        successRate: 0,
      },
      // Attach peer for message handling
      peer,
    };

    return {
      process: claudeProcess,
    };
  }

  /**
   * Resume a previous Claude Code session
   *
   * Spawns Claude with --resume flag and sends new prompt.
   *
   * @param task - Task to execute
   * @param sessionId - Previous session ID
   * @returns Spawned process with protocol peer
   */
  async resumeTask(
    task: ExecutionTask,
    sessionId: string
  ): Promise<SpawnedChild> {
    const args = this.buildArgs(true, sessionId, task.workDir);
    const hooks = this.buildHooks();

    // Spawn claude process with resume flag
    const childProcess = spawn(this.config.executablePath || "claude", args, {
      cwd: task.workDir,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Create client with approval service
    const client = new ClaudeAgentClient(this.approvalService);

    // Create protocol peer
    const peer = new ProtocolPeer(
      childProcess.stdin!,
      childProcess.stdout!,
      client
    );

    // Start reading messages
    peer.start();

    // NOTE: When using --input-format=stream-json, Claude CLI expects only
    // 'user' and 'control' messages, NOT 'sdk_control_request' messages.
    // So we skip the initialize step and just send the user message directly.

    // Send user message (no initialization needed for stream-json input)
    await peer.sendUserMessage(task.prompt, sessionId);

    // Return spawned child with peer attached
    const now = new Date();
    const claudeProcess: ClaudeManagedProcess = {
      id: `claude-${Date.now()}-resume`,
      pid: childProcess.pid!,
      status: "busy",
      spawnedAt: now,
      lastActivity: now,
      exitCode: null,
      signal: null,
      process: childProcess,
      streams: {
        stdin: childProcess.stdin!,
        stdout: childProcess.stdout!,
        stderr: childProcess.stderr!,
      },
      metrics: {
        totalDuration: 0,
        tasksCompleted: 0,
        successRate: 0,
      },
      // Attach peer for message handling
      peer,
    };

    return {
      process: claudeProcess,
    };
  }

  /**
   * Normalize Claude Code output to unified format
   *
   * Converts stream-json messages to normalized entries for UI rendering.
   *
   * @param outputStream - Raw output chunks
   * @param workDir - Working directory
   * @returns Normalized entries
   */
  async *normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>,
    workDir: string
  ): AsyncIterable<NormalizedEntry> {
    const state = createNormalizerState();
    let buffer = "";

    for await (const chunk of outputStream) {
      // Accumulate chunks into buffer
      buffer += chunk.data.toString();

      // Split on newlines (stream-json is newline-delimited)
      const lines = buffer.split("\n");

      // Keep last incomplete line in buffer
      buffer = lines.pop() || "";

      // Process complete lines
      for (const line of lines) {
        const message = parseStreamJsonLine(line);
        if (!message) continue;

        const entry = normalizeMessage(message, workDir, state);
        if (entry) {
          yield entry;
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const message = parseStreamJsonLine(buffer);
      if (message) {
        const entry = normalizeMessage(message, workDir, state);
        if (entry) {
          yield entry;
        }
      }
    }
  }

  /**
   * Get Claude Code capabilities
   *
   * @returns Capabilities object
   */
  getCapabilities(): AgentCapabilities {
    return {
      supportsSessionResume: true,
      requiresSetup: false,
      supportsApprovals: true,
      supportsMcp: true,
      protocol: "stream-json",
      supportsMidExecutionMessages: true,
    };
  }

  /**
   * Send an additional message to a running Claude process
   *
   * Allows sending mid-execution guidance while Claude is actively working on a task.
   * The message is sent via the protocol peer's bidirectional stream-json protocol.
   *
   * @param process - The managed process from executeTask() or resumeTask()
   * @param message - Message content to send
   * @throws Error if process doesn't have a protocol peer attached
   *
   * @example
   * ```typescript
   * const spawned = await executor.executeTask(task);
   *
   * // Later, while task is running:
   * await executor.sendMessage(spawned.process, 'Also add unit tests');
   * ```
   */
  async sendMessage(process: ManagedProcess, message: string): Promise<void> {
    const claudeProcess = process as ClaudeManagedProcess;
    if (!claudeProcess.peer) {
      throw new Error("Process does not have protocol peer attached");
    }

    await claudeProcess.peer.sendUserMessage(message);
  }

  /**
   * Interrupt a running Claude process
   *
   * Sends an interrupt signal to stop the current operation. Claude handles
   * the interrupt gracefully - it may finish the current tool operation
   * before stopping.
   *
   * Falls back to SIGINT if no protocol peer is attached.
   *
   * @param process - The managed process to interrupt
   *
   * @example
   * ```typescript
   * const spawned = await executor.executeTask(task);
   *
   * // User wants to cancel:
   * await executor.interrupt(spawned.process);
   * ```
   */
  async interrupt(process: ManagedProcess): Promise<void> {
    const claudeProcess = process as ClaudeManagedProcess;

    if (claudeProcess.peer) {
      // Use protocol peer for graceful interrupt
      await claudeProcess.peer.sendInterrupt();
    } else if (claudeProcess.process) {
      // Fallback to SIGINT if no peer
      claudeProcess.process.kill("SIGINT");
    }
  }

  /**
   * Check if Claude Code is available
   *
   * Verifies that the claude executable exists in PATH.
   *
   * @returns True if claude is available
   */
  async checkAvailability(): Promise<boolean> {
    // For now, assume it's available
    // Can be enhanced to actually check for executable
    return true;
  }

  /**
   * Build command-line arguments for Claude CLI
   *
   * @param resume - Whether this is a resume operation
   * @param sessionId - Session ID for resume
   * @param workDir - Working directory for directory restriction
   * @returns Array of CLI arguments
   */
  private buildArgs(
    resume: boolean,
    sessionId?: string,
    workDir?: string
  ): string[] {
    const args: string[] = [];

    // Print mode (required for stream-json)
    if (this.config.print !== false) {
      args.push("--print");
    }

    // Output format
    const outputFormat = this.config.outputFormat || "stream-json";
    args.push("--output-format", outputFormat);

    // Input format (stream-json for bidirectional protocol)
    if (outputFormat === "stream-json") {
      args.push("--input-format", "stream-json");
    }

    // Permission prompts via stdio (required for approval protocol)
    args.push("--permission-prompt-tool", "stdio");

    // Verbose mode (required when using --print with --output-format=stream-json)
    if (
      this.config.verbose ||
      (this.config.print !== false && outputFormat === "stream-json")
    ) {
      args.push("--verbose");
    }

    // Dangerously skip permissions
    if (this.config.dangerouslySkipPermissions) {
      args.push("--dangerously-skip-permissions");
    }

    // Directory restriction via PreToolUse hook
    if (this.config.restrictToWorkDir && workDir) {
      const settings = this.buildDirectoryGuardSettings(workDir);
      args.push("--settings", JSON.stringify(settings));
    }

    // MCP servers configuration
    if (
      this.config.mcpServers &&
      Object.keys(this.config.mcpServers).length > 0
    ) {
      const mcpConfig = JSON.stringify({ mcpServers: this.config.mcpServers });
      args.push("--mcp-config", mcpConfig);
    }

    // Disallowed tools
    if (this.config.disallowedTools && this.config.disallowedTools.length > 0) {
      args.push("--disallowed-tools", ...this.config.disallowedTools);
    }

    // Resume session
    if (resume && sessionId) {
      args.push("--resume", sessionId);
    }

    return args;
  }

  /**
   * Build settings JSON with directory guard hook
   *
   * Creates a settings object that configures a PreToolUse hook to restrict
   * file operations to the specified working directory.
   *
   * @param workDir - Working directory to restrict to
   * @returns Settings object for --settings flag
   */
  private buildDirectoryGuardSettings(
    workDir: string
  ): Record<string, unknown> {
    // Get path to the directory guard hook script
    const hookPath =
      this.config.directoryGuardHookPath ||
      path.join(__dirname, "hooks", "directory-guard.js");

    // Build the hook command with CLAUDE_WORKDIR environment variable
    // Wrap in sh -c to ensure environment variable is set correctly
    // (Claude Code may run hooks without shell interpretation)
    const isTypeScript = hookPath.endsWith(".ts");

    // Escape special characters for shell safety
    const escapeForShell = (str: string) =>
      str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    const escapedWorkDir = escapeForShell(workDir);
    const escapedHookPath = escapeForShell(hookPath);

    const innerCommand = isTypeScript
      ? `npx tsx "${escapedHookPath}"`
      : `node "${escapedHookPath}"`;

    const hookCommand = `sh -c "CLAUDE_WORKDIR=\\"${escapedWorkDir}\\" ${innerCommand}"`;

    return {
      hooks: {
        PreToolUse: [
          {
            matcher: "Read|Edit|Write|MultiEdit|Glob|Grep",
            hooks: [
              {
                type: "command",
                command: hookCommand,
              },
            ],
          },
        ],
      },
    };
  }

  /**
   * Build hook configuration
   *
   * Enables PreToolUse hook for approval flow.
   *
   * @returns Hook configuration
   */
  private buildHooks(): HookConfig {
    return {
      preToolUse: {
        enabled: true,
      },
    };
  }
}
