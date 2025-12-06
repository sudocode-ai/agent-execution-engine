/**
 * Protocol Peer
 *
 * Manages bidirectional JSON communication with Claude CLI process.
 *
 * @module agents/claude/protocol/protocol-peer
 */

import type { Readable, Writable } from 'stream';
import type {
  ClaudeStreamMessage,
  ControlRequestMessage,
  ControlResponseMessage,
  UserMessage,
  ContentBlock,
} from '../types/messages.js';
import type {
  ControlRequest,
  ControlResponse,
  HookConfig,
  PermissionMode,
  SdkControlRequest,
} from '../types/control.js';
import { readStreamJson, serializeStreamJson } from './utils.js';

/**
 * Client interface for handling control requests
 *
 * Implemented by ClaudeAgentClient to provide approval logic.
 */
export interface IProtocolClient {
  /**
   * Handle a control request from Claude CLI
   *
   * @param request - Control request (can_use_tool or hook_callback)
   * @returns Control response (success or error)
   */
  handleControlRequest(
    request: ControlRequest,
    requestId: string
  ): Promise<ControlResponse>;
}

/**
 * Message handler callback
 *
 * Called for each non-control message received from Claude CLI.
 */
export type MessageHandler = (message: ClaudeStreamMessage) => void;

/**
 * Error handler callback
 *
 * Called when an error occurs during message processing.
 */
export type ErrorHandler = (error: Error) => void;

/**
 * Protocol Peer
 *
 * Manages bidirectional stream-json communication with Claude CLI.
 * Handles:
 * - Reading and parsing stream-json messages from stdout
 * - Routing control requests to the client
 * - Sending control responses to stdin
 * - Sending user messages and SDK control requests
 *
 * @example
 * ```typescript
 * const peer = new ProtocolPeer(stdin, stdout, client);
 *
 * // Handle non-control messages
 * peer.onMessage((msg) => {
 *   if (msg.type === 'assistant') {
 *     console.log('Assistant:', msg.message.content);
 *   }
 * });
 *
 * // Start the background read loop
 * peer.start();
 *
 * // Initialize hooks
 * await peer.initialize({ preToolUse: { enabled: true } });
 *
 * // Send user message
 * await peer.sendUserMessage('List files in the current directory');
 *
 * // Clean up
 * await peer.stop();
 * ```
 */
export class ProtocolPeer {
  private readonly stdin: Writable;
  private readonly stdout: Readable;
  private readonly client: IProtocolClient;

  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];

  private readLoopPromise: Promise<void> | null = null;
  private stopRequested = false;

  /**
   * Create a new ProtocolPeer
   *
   * @param stdin - Writable stream to send messages to Claude CLI
   * @param stdout - Readable stream to receive messages from Claude CLI
   * @param client - Client to handle control requests
   */
  constructor(stdin: Writable, stdout: Readable, client: IProtocolClient) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.client = client;
  }

  /**
   * Register a message handler
   *
   * Called for each non-control message (system, user, assistant, tool_use, result).
   *
   * @param handler - Message handler callback
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Register an error handler
   *
   * Called when an error occurs during message processing.
   *
   * @param handler - Error handler callback
   */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Start the background read loop
   *
   * Begins reading messages from stdout and routing them appropriately.
   * Call this before sending any messages to Claude CLI.
   */
  start(): void {
    if (this.readLoopPromise) {
      // Already started
      return;
    }

    this.stopRequested = false;
    this.readLoopPromise = this.runReadLoop();
  }

  /**
   * Stop the background read loop
   *
   * Waits for the read loop to finish processing current message.
   */
  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.readLoopPromise) {
      await this.readLoopPromise;
      this.readLoopPromise = null;
    }
  }

  /**
   * Initialize the protocol
   *
   * Sends initialization request with hook configuration.
   * Call this after starting the read loop.
   *
   * @param hooks - Hook configuration
   *
   * @example
   * ```typescript
   * await peer.initialize({
   *   preToolUse: { enabled: true }
   * });
   * ```
   */
  async initialize(hooks: HookConfig): Promise<void> {
    const request: SdkControlRequest = {
      type: 'sdk_control_request',
      request: {
        type: 'initialize',
        hooks,
      },
    };

    await this.writeMessage(request);
  }

  /**
   * Set permission mode
   *
   * Updates the permission mode for tool approvals.
   *
   * @param mode - Permission mode ('ask' or 'bypass_permissions')
   * @param destination - Where to store the permission ('session' or 'global')
   *
   * @example
   * ```typescript
   * // Bypass permissions for this session
   * await peer.setPermissionMode('bypass_permissions', 'session');
   * ```
   */
  async setPermissionMode(
    mode: PermissionMode,
    destination: 'session' | 'global' = 'session'
  ): Promise<void> {
    const request: SdkControlRequest = {
      type: 'sdk_control_request',
      request: {
        type: 'set_permission_mode',
        mode,
      },
    };

    // Note: Claude CLI doesn't currently use the destination field from SDK,
    // but we include it for future compatibility
    await this.writeMessage(request);
  }

  /**
   * Send a user message to Claude CLI
   *
   * @param content - Message content (string or content blocks)
   * @param sessionId - Optional session ID
   *
   * @example
   * ```typescript
   * await peer.sendUserMessage('List files');
   * ```
   */
  async sendUserMessage(
    content: string | Array<{ type: string; [key: string]: unknown }>,
    sessionId?: string
  ): Promise<void> {
    const message: UserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: content as string | Array<ContentBlock>,
      },
      sessionId,
    };

    await this.writeMessage(message);
  }

  /**
   * Send interrupt signal to Claude CLI
   *
   * Sends a control message requesting Claude to stop the current operation.
   * The interrupt is "graceful" - Claude decides how to handle it, typically
   * finishing the current tool operation before stopping.
   *
   * @example
   * ```typescript
   * // User wants to cancel the current task
   * await peer.sendInterrupt();
   * ```
   */
  async sendInterrupt(): Promise<void> {
    const message = {
      type: 'control',
      control: { type: 'interrupt' },
    };

    await this.writeMessage(message);
  }

  /**
   * Send a control response to Claude CLI
   *
   * Internal method used by the read loop to send responses.
   *
   * @param requestId - Request ID from control request
   * @param response - Control response (success or error)
   */
  private async sendControlResponse(
    requestId: string,
    response: ControlResponse
  ): Promise<void> {
    const message: ControlResponseMessage = {
      type: 'control_response',
      response: {
        ...response,
        requestId,
      },
    };

    await this.writeMessage(message);
  }

  /**
   * Write a message to stdin
   *
   * @param message - Message to write
   */
  private async writeMessage(message: unknown): Promise<void> {
    const json = serializeStreamJson(message);

    return new Promise((resolve, reject) => {
      this.stdin.write(json, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Background read loop
   *
   * Reads messages from stdout and routes them appropriately.
   */
  private async runReadLoop(): Promise<void> {
    try {
      for await (const message of readStreamJson(this.stdout)) {
        if (this.stopRequested) {
          break;
        }

        await this.handleMessage(message);
      }
    } catch (error) {
      // Emit error to handlers
      const err =
        error instanceof Error ? error : new Error(String(error));
      this.emitError(err);
    }
  }

  /**
   * Handle a received message
   *
   * Routes control requests to client, emits other messages to handlers.
   *
   * @param message - Received message
   */
  private async handleMessage(message: ClaudeStreamMessage): Promise<void> {
    if (message.type === 'control_request') {
      await this.handleControlRequestMessage(message);
    } else {
      // Emit non-control messages to handlers
      this.emitMessage(message);
    }
  }

  /**
   * Handle a control request message
   *
   * Routes the request to the client and sends the response.
   *
   * @param message - Control request message
   */
  private async handleControlRequestMessage(
    message: ControlRequestMessage
  ): Promise<void> {
    const { requestId, request } = message;

    try {
      // Route to client
      const response = await this.client.handleControlRequest(
        request as ControlRequest,
        requestId
      );

      // Send response
      await this.sendControlResponse(requestId, response);
    } catch (error) {
      // Send error response
      const errorResponse: ControlResponse = {
        type: 'error',
        requestId,
        error: error instanceof Error ? error.message : String(error),
      };

      await this.sendControlResponse(requestId, errorResponse);

      // Also emit to error handlers
      const err =
        error instanceof Error ? error : new Error(String(error));
      this.emitError(err);
    }
  }

  /**
   * Emit a message to all registered handlers
   *
   * @param message - Message to emit
   */
  private emitMessage(message: ClaudeStreamMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        // Don't let handler errors break the read loop
        const err =
          error instanceof Error ? error : new Error(String(error));
        this.emitError(err);
      }
    }
  }

  /**
   * Emit an error to all registered handlers
   *
   * @param error - Error to emit
   */
  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        // Ignore errors in error handlers
      }
    }
  }
}
