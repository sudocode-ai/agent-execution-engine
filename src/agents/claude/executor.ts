/**
 * Claude Code Executor
 *
 * Agent executor for Claude Code CLI integration.
 *
 * @module agents/claude/executor
 */

import { spawn } from 'child_process';
import { Readable } from 'stream';
import { BaseAgentExecutor } from '../base/base-executor.js';
import { ProtocolPeer } from './protocol/protocol-peer.js';
import { ClaudeAgentClient } from './protocol/client.js';
import {
  normalizeMessage,
  createNormalizerState,
} from './normalizer.js';
import { parseStreamJsonLine } from './protocol/utils.js';
import type { ClaudeCodeConfig } from './types/config.js';
import type { HookConfig } from './types/control.js';
import type {
  AgentCapabilities,
  SpawnedChild,
  OutputChunk,
  NormalizedEntry,
} from '../types/agent-executor.js';
import type { ExecutionTask } from '../../engine/types.js';

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
   * @returns Spawned process
   */
  async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
    const args = this.buildArgs(false);
    const hooks = this.buildHooks();

    // Spawn claude process
    const childProcess = spawn(
      this.config.executablePath || 'claude',
      args,
      {
        cwd: task.workDir,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
      }
    );

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

    // Initialize protocol with hooks
    await peer.initialize(hooks);

    // Send user message
    await peer.sendUserMessage(task.prompt);

    // Return spawned child
    const now = new Date();
    return {
      process: {
        id: `claude-${Date.now()}`,
        pid: childProcess.pid!,
        status: 'busy',
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
      },
    };
  }

  /**
   * Resume a previous Claude Code session
   *
   * Spawns Claude with --resume-session flag and sends new prompt.
   *
   * @param task - Task to execute
   * @param sessionId - Previous session ID
   * @returns Spawned process
   */
  async resumeTask(
    task: ExecutionTask,
    sessionId: string
  ): Promise<SpawnedChild> {
    const args = this.buildArgs(true, sessionId);
    const hooks = this.buildHooks();

    // Spawn claude process with resume flag
    const childProcess = spawn(
      this.config.executablePath || 'claude',
      args,
      {
        cwd: task.workDir,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

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

    // Initialize protocol with hooks
    await peer.initialize(hooks);

    // Send user message
    await peer.sendUserMessage(task.prompt, sessionId);

    // Return spawned child
    const now = new Date();
    return {
      process: {
        id: `claude-${Date.now()}-resume`,
        pid: childProcess.pid!,
        status: 'busy',
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
      },
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
    let buffer = '';

    for await (const chunk of outputStream) {
      // Accumulate chunks into buffer
      buffer += chunk.data.toString();

      // Split on newlines (stream-json is newline-delimited)
      const lines = buffer.split('\n');

      // Keep last incomplete line in buffer
      buffer = lines.pop() || '';

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
      protocol: 'stream-json',
    };
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
   * @returns Array of CLI arguments
   */
  private buildArgs(resume: boolean, sessionId?: string): string[] {
    const args: string[] = [];

    // Print mode (required for stream-json)
    if (this.config.print !== false) {
      args.push('--print');
    }

    // Output format
    const outputFormat = this.config.outputFormat || 'stream-json';
    args.push('--output-format', outputFormat);

    // NOTE: We do NOT specify --input-format because we use the SDK control protocol
    // via ProtocolPeer, which sends sdk_control_request messages. Specifying
    // --input-format=stream-json would cause a protocol mismatch.

    // Permission prompts via stdio (required for approval protocol)
    args.push('--permission-prompt-tool', 'stdio');

    // Verbose mode
    if (this.config.verbose) {
      args.push('--verbose');
    }

    // Dangerously skip permissions
    if (this.config.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    // Resume session
    if (resume && sessionId) {
      args.push('--resume-session', sessionId);
    }

    return args;
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
