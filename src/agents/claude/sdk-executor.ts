/**
 * Claude SDK Executor
 *
 * Alternative executor that uses @anthropic-ai/claude-agent-sdk instead of
 * spawning CLI processes. Provides native streaming input and interrupt support.
 *
 * @module agents/claude/sdk-executor
 */

import { Readable, Writable } from "stream";
import { BaseAgentExecutor } from "../base/base-executor.js";
import { AsyncQueue } from "./utils/async-queue.js";
import {
  normalizeMessage,
  createNormalizerState,
} from "./normalizer.js";
import type { ClaudeCodeConfig } from "./types/config.js";
import type { ClaudeStreamMessage } from "./types/messages.js";
import type {
  AgentCapabilities,
  SpawnedChild,
  OutputChunk,
  NormalizedEntry,
} from "../types/agent-executor.js";
import type { ExecutionTask } from "../../engine/types.js";
import type { ManagedProcess } from "../../process/types.js";

/**
 * Extended config for SDK executor that adds model support
 */
export interface ClaudeSDKConfig extends ClaudeCodeConfig {
  /**
   * Model to use for queries
   */
  model?: string;
}

/**
 * SDK user message format
 *
 * This matches the SDKUserMessage type from @anthropic-ai/claude-agent-sdk
 */
interface SDKUserMessage {
  type: "user";
  uuid?: string;
  session_id: string;
  message: {
    role: "user";
    content: string | Array<{ type: string; text?: string }>;
  };
  parent_tool_use_id: string | null;
}

/**
 * SDK message base (output)
 */
interface SDKMessage {
  type: string;
  session_id?: string;
  subtype?: string;
  message?: unknown;
  [key: string]: unknown;
}

/**
 * SDK Query interface (subset of what the real SDK provides)
 */
interface SDKQuery extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  setPermissionMode?(mode: string): Promise<void>;
}

/**
 * SDK query function type
 */
type QueryFunction = (options: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: {
    workDir?: string;
    resume?: string;
    model?: string;
    permissionMode?: string;
    [key: string]: unknown;
  };
}) => SDKQuery;

/**
 * Extended ManagedProcess with SDK-specific properties
 */
interface SDKManagedProcess extends ManagedProcess {
  /** The SDK query object for interrupt */
  query: SDKQuery;
  /** Message queue for streaming input */
  messageQueue: AsyncQueue<SDKUserMessage>;
  /** Current session ID */
  sessionId: string;
  /** Output buffer for normalization */
  outputBuffer: SDKMessage[];
}

/**
 * Claude SDK Executor
 *
 * Uses @anthropic-ai/claude-agent-sdk for execution instead of CLI spawning.
 * Provides native streaming input and interrupt support.
 *
 * **Advantages over CLI executor:**
 * - No process spawning overhead
 * - Native AsyncIterable streaming input
 * - Cleaner interrupt handling
 * - Type-safe SDK messages
 *
 * **When to use:**
 * - When you need simpler integration
 * - When programmatic permission handling is preferred
 * - When you want typed message interfaces
 *
 * @example
 * ```typescript
 * const executor = new ClaudeSDKExecutor({
 *   workDir: '/path/to/project',
 * });
 *
 * const spawned = await executor.executeTask({
 *   id: 'task-1',
 *   type: 'custom',
 *   prompt: 'Build a feature',
 *   workDir: '/path/to/project',
 *   config: {},
 * });
 *
 * // Send mid-execution message
 * await executor.sendMessage(spawned.process, 'Also add tests');
 *
 * // Interrupt if needed
 * await executor.interrupt(spawned.process);
 * ```
 */
export class ClaudeSDKExecutor extends BaseAgentExecutor {
  private readonly config: ClaudeSDKConfig;
  private queryFn: QueryFunction | null = null;
  private sdkAvailable: boolean | null = null;

  /**
   * Create a new ClaudeSDKExecutor
   *
   * @param config - Claude SDK configuration
   */
  constructor(config: ClaudeSDKConfig) {
    super();
    this.config = config;
  }

  /**
   * Execute a new task with Claude SDK
   *
   * Starts an SDK query with streaming input support.
   *
   * @param task - Task to execute
   * @returns Spawned process wrapper
   */
  async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
    // Ensure SDK is available
    const queryFn = await this.getQueryFunction();

    // Create message queue for streaming input
    const messageQueue = new AsyncQueue<SDKUserMessage>();

    // Generate initial session ID (will be updated from system message)
    let sessionId = `sdk-${Date.now()}`;

    // Push initial prompt to queue
    messageQueue.push(this.createUserMessage(task.prompt, sessionId));

    // Start SDK query with streaming input
    const query = queryFn({
      prompt: messageQueue,
      options: {
        workDir: task.workDir,
        model: this.config.model,
        permissionMode: this.config.dangerouslySkipPermissions
          ? "bypassPermissions"
          : "default",
      },
    });

    // Create virtual process wrapper
    const process = this.createSDKProcess(query, messageQueue, sessionId);

    // Start background processing of query output
    this.processQueryOutput(process, query);

    return { process };
  }

  /**
   * Resume a previous Claude SDK session
   *
   * @param task - Task to execute
   * @param sessionId - Previous session ID
   * @returns Spawned process wrapper
   */
  async resumeTask(
    task: ExecutionTask,
    sessionId: string
  ): Promise<SpawnedChild> {
    const queryFn = await this.getQueryFunction();

    const messageQueue = new AsyncQueue<SDKUserMessage>();

    // Push resume message
    messageQueue.push(this.createUserMessage(task.prompt, sessionId));

    // Start SDK query with resume option
    const query = queryFn({
      prompt: messageQueue,
      options: {
        workDir: task.workDir,
        resume: sessionId,
        model: this.config.model,
      },
    });

    const process = this.createSDKProcess(query, messageQueue, sessionId);

    this.processQueryOutput(process, query);

    return { process };
  }

  /**
   * Send an additional message to a running SDK query
   *
   * Pushes the message to the async queue which streams to the SDK.
   *
   * @param process - The managed process from executeTask()
   * @param message - Message content to send
   */
  async sendMessage(process: ManagedProcess, message: string): Promise<void> {
    const sdkProcess = process as SDKManagedProcess;

    if (!sdkProcess.messageQueue) {
      throw new Error("Process does not have message queue");
    }

    if (sdkProcess.messageQueue.isClosed()) {
      throw new Error("Message queue is closed");
    }

    sdkProcess.messageQueue.push(
      this.createUserMessage(message, sdkProcess.sessionId)
    );
  }

  /**
   * Interrupt a running SDK query
   *
   * Calls the SDK's interrupt() method for graceful cancellation.
   *
   * @param process - The managed process to interrupt
   */
  async interrupt(process: ManagedProcess): Promise<void> {
    const sdkProcess = process as SDKManagedProcess;

    if (sdkProcess.query) {
      await sdkProcess.query.interrupt();
    }

    // Also close the message queue
    if (sdkProcess.messageQueue && !sdkProcess.messageQueue.isClosed()) {
      sdkProcess.messageQueue.close();
    }

    // Update status
    sdkProcess.status = "idle";
  }

  /**
   * Normalize SDK output to unified format
   *
   * Converts SDK messages to normalized entries for UI rendering.
   *
   * @param outputStream - Raw output chunks (from virtual stdout)
   * @param workDir - Working directory
   * @returns Normalized entries
   */
  async *normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>,
    workDir: string
  ): AsyncIterable<NormalizedEntry> {
    const state = createNormalizerState();

    for await (const chunk of outputStream) {
      // Parse SDK messages from the chunk
      const text = chunk.data.toString();
      const lines = text.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const message = JSON.parse(line);

          // Convert SDK message to stream-json format for normalizer
          const streamMessage = this.convertToStreamJson(message);
          if (streamMessage) {
            const entry = normalizeMessage(streamMessage, workDir, state);
            if (entry) {
              yield entry;
            }
          }
        } catch {
          // Non-JSON output, treat as system message
          const systemMessage: ClaudeStreamMessage = {
            type: "system",
            session_id: "",
            subtype: "init",
          };
          const entry = normalizeMessage(systemMessage, workDir, state);
          if (entry) {
            // Override content with the raw line
            entry.content = line;
            yield entry;
          }
        }
      }
    }
  }

  /**
   * Get Claude SDK capabilities
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
   * Check if Claude SDK is available
   *
   * Attempts to dynamically import the SDK.
   *
   * @returns True if SDK is available
   */
  async checkAvailability(): Promise<boolean> {
    if (this.sdkAvailable !== null) {
      return this.sdkAvailable;
    }

    try {
      await this.getQueryFunction();
      this.sdkAvailable = true;
      return true;
    } catch {
      this.sdkAvailable = false;
      return false;
    }
  }

  /**
   * Get the SDK query function (dynamic import)
   *
   * @private
   */
  private async getQueryFunction(): Promise<QueryFunction> {
    if (this.queryFn) {
      return this.queryFn;
    }

    try {
      // Dynamic import to handle optional dependency
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sdkModule = "@anthropic-ai/claude-agent-sdk";
      const sdk = await import(/* webpackIgnore: true */ sdkModule);
      this.queryFn = sdk.query as QueryFunction;
      return this.queryFn;
    } catch (error) {
      throw new Error(
        "Claude Agent SDK not available. Install with: npm install @anthropic-ai/claude-agent-sdk"
      );
    }
  }

  /**
   * Create a user message for the SDK
   *
   * @private
   */
  private createUserMessage(content: string, sessionId: string): SDKUserMessage {
    return {
      type: "user",
      session_id: sessionId,
      message: {
        role: "user",
        content,
      },
      parent_tool_use_id: null,
    };
  }

  /**
   * Create a virtual ManagedProcess from SDK query
   *
   * @private
   */
  private createSDKProcess(
    query: SDKQuery,
    messageQueue: AsyncQueue<SDKUserMessage>,
    sessionId: string
  ): SDKManagedProcess {
    const now = new Date();

    // Create virtual streams for compatibility
    const stdout = new Readable({
      read() {},
    });
    const stderr = new Readable({
      read() {},
    });
    const stdin = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    return {
      id: `sdk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pid: process.pid, // Use current process PID as placeholder
      status: "busy",
      spawnedAt: now,
      lastActivity: now,
      exitCode: null,
      signal: null,
      process: null as any, // No actual child process
      streams: {
        stdout,
        stderr,
        stdin,
      },
      metrics: {
        totalDuration: 0,
        tasksCompleted: 0,
        successRate: 0,
      },
      // SDK-specific properties
      query,
      messageQueue,
      sessionId,
      outputBuffer: [],
    };
  }

  /**
   * Process SDK query output in background
   *
   * Reads messages from query and writes to virtual stdout.
   *
   * @private
   */
  private async processQueryOutput(
    sdkProcess: SDKManagedProcess,
    query: SDKQuery
  ): Promise<void> {
    try {
      for await (const message of query) {
        // Update session ID from system message
        if (
          message.type === "system" &&
          message.subtype === "init" &&
          message.session_id
        ) {
          sdkProcess.sessionId = message.session_id;
        }

        // Update last activity
        sdkProcess.lastActivity = new Date();

        // Write to virtual stdout as JSON line
        const line = JSON.stringify(message) + "\n";
        sdkProcess.streams?.stdout.push(line);

        // Buffer for potential later access
        sdkProcess.outputBuffer.push(message);
      }

      // Query complete
      sdkProcess.status = "idle";
      sdkProcess.exitCode = 0;

      // Close streams
      sdkProcess.streams?.stdout.push(null);
      sdkProcess.messageQueue.close();
    } catch (error) {
      // Query failed
      sdkProcess.status = "idle";
      sdkProcess.exitCode = 1;

      // Write error to stderr
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      sdkProcess.streams?.stderr.push(
        JSON.stringify({ type: "error", message: errorMessage }) + "\n"
      );
      sdkProcess.streams?.stderr.push(null);
      sdkProcess.streams?.stdout.push(null);

      sdkProcess.messageQueue.closeWithError(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Convert SDK message to stream-json format
   *
   * @private
   */
  private convertToStreamJson(sdkMessage: SDKMessage): ClaudeStreamMessage | null {
    // SDK messages are already similar to stream-json format
    // Just need minor adjustments for the normalizer

    switch (sdkMessage.type) {
      case "system":
        return {
          type: "system",
          session_id: sdkMessage.session_id as string,
          subtype: sdkMessage.subtype as string,
        } as ClaudeStreamMessage;

      case "assistant":
        return {
          type: "assistant",
          message: sdkMessage.message as {
            role: "assistant";
            content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
          },
        } as ClaudeStreamMessage;

      case "partialAssistant":
        // Convert partial to assistant for normalizer
        return {
          type: "assistant",
          message: sdkMessage.partial_message as {
            role: "assistant";
            content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
          },
        } as ClaudeStreamMessage;

      case "user":
        return {
          type: "user",
          message: sdkMessage.message as {
            role: "user";
            content: string | Array<{ type: string; text?: string }>;
          },
        } as ClaudeStreamMessage;

      case "result":
        return {
          type: "result",
          result: sdkMessage.result,
          isError: (sdkMessage.is_error ?? sdkMessage.isError ?? false) as boolean,
        } as ClaudeStreamMessage;

      default:
        // Pass through other message types
        return sdkMessage as ClaudeStreamMessage;
    }
  }
}
