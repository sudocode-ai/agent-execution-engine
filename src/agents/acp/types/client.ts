/**
 * Client interface for handling ACP protocol requests from agents.
 *
 * Agents (Gemini CLI, Qwen Code, etc.) send JSONRPC requests to the client.
 * Implementations of this interface handle those requests and return responses.
 *
 * **Note**: This interface matches the official `@agentclientprotocol/sdk` Client interface
 * for compatibility with the SDK's `ClientSideConnection`.
 *
 * @example
 * ```typescript
 * // Basic client implementation with auto-approval
 * const client: Client = {
 *   async sessionUpdate(args) {
 *     console.log('Agent event:', args.update);
 *     // Process events (messages, tool calls, etc.)
 *   },
 *
 *   async requestPermission(args) {
 *     // Auto-approve all requests
 *     return {
 *       outcome: {
 *         outcome: 'selected',
 *         optionId: args.options[0].optionId
 *       }
 *     };
 *   }
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Client with file system support
 * const client: Client = {
 *   async sessionUpdate(args) {
 *     // Handle events
 *   },
 *
 *   async requestPermission(args) {
 *     // Approval logic
 *   },
 *
 *   async readTextFile(args) {
 *     const content = await fs.readFile(args.path, 'utf-8');
 *     return { content };
 *   },
 *
 *   async writeTextFile(args) {
 *     await fs.writeFile(args.path, args.content, 'utf-8');
 *     return {};
 *   }
 * };
 * ```
 */

import type {
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputNotification,
  ReleaseTerminalRequest,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  KillTerminalCommandRequest,
} from './protocol.js';

/**
 * Client-side handler for ACP protocol requests.
 *
 * The agent sends JSONRPC requests to the client via this interface.
 * Only `sessionUpdate` and `requestPermission` are required;
 * all other methods are optional and can throw `MethodNotFound` errors.
 *
 * **Note**: This interface matches `@agentclientprotocol/sdk` Client interface.
 */
export interface Client {
  /**
   * Handle session update notifications from the agent.
   *
   * Called when the agent emits events like:
   * - AgentMessageChunk - Streaming response text
   * - AgentThoughtChunk - Internal reasoning/thinking
   * - ToolCall - Tool invocation (Read, Edit, Execute, etc.)
   * - ToolCallUpdate - Updates to tool execution
   * - Plan - Multi-step plan
   * - AvailableCommandsUpdate - Available commands changed
   * - CurrentModeUpdate - Agent mode changed
   *
   * @param args - Session notification containing sessionId and update
   * @returns Promise that resolves when notification is handled
   *
   * @example
   * ```typescript
   * async sessionUpdate(args) {
   *   if ('AgentMessageChunk' in args.update) {
   *     const text = args.update.AgentMessageChunk.content;
   *     console.log('Agent says:', text);
   *   } else if ('ToolCall' in args.update) {
   *     const tool = args.update.ToolCall;
   *     console.log('Tool:', tool.kind, tool.title);
   *   }
   * }
   * ```
   */
  sessionUpdate(args: SessionNotification): Promise<void>;

  /**
   * Handle permission requests from the agent.
   *
   * Called when the agent wants to execute a tool and needs approval.
   * The client must choose one of the provided options or cancel.
   *
   * Options are typically:
   * - AllowAlways - Approve this and all future requests
   * - AllowOnce - Approve only this request
   * - DenyAlways - Deny this and all future requests
   * - DenyOnce - Deny only this request
   *
   * @param args - Permission request with toolCall and options
   * @returns Promise with selected option or cancellation
   *
   * @example
   * ```typescript
   * async requestPermission(args) {
   *   // Auto-approve with best available option
   *   const chosen = args.options.find(o => o.kind === 'AllowAlways')
   *     || args.options.find(o => o.kind === 'AllowOnce')
   *     || args.options[0];
   *
   *   return {
   *     outcome: { Selected: { optionId: chosen.id } }
   *   };
   * }
   * ```
   */
  requestPermission(
    args: RequestPermissionRequest
  ): Promise<RequestPermissionResponse>;

  /**
   * Read a text file (optional capability).
   *
   * If not implemented, should throw AcpError with MethodNotFound code.
   * Only called if client declares `fs.read_text_file: true` in capabilities.
   *
   * @param args - File path and optional encoding
   * @returns Promise with file content
   * @throws {AcpError} MethodNotFound if not supported
   *
   * @example
   * ```typescript
   * async readTextFile(args) {
   *   const content = await fs.readFile(args.path, args.encoding || 'utf-8');
   *   return { content, encoding: args.encoding };
   * }
   * ```
   */
  readTextFile?(args: ReadTextFileRequest): Promise<ReadTextFileResponse>;

  /**
   * Write a text file (optional capability).
   *
   * If not implemented, should throw AcpError with MethodNotFound code.
   * Only called if client declares `fs.write_text_file: true` in capabilities.
   *
   * @param args - File path, content, and optional encoding
   * @returns Promise with success status
   * @throws {AcpError} MethodNotFound if not supported
   *
   * @example
   * ```typescript
   * async writeTextFile(args) {
   *   await fs.writeFile(args.path, args.content, args.encoding || 'utf-8');
   *   return { success: true, bytesWritten: args.content.length };
   * }
   * ```
   */
  writeTextFile?(args: WriteTextFileRequest): Promise<WriteTextFileResponse>;

  /**
   * Create a terminal session (optional capability).
   *
   * If not implemented, should throw AcpError with MethodNotFound code.
   * Only called if client declares `terminal: true` in capabilities.
   *
   * @param args - Command, args, cwd, and environment
   * @returns Promise with terminal ID
   * @throws {AcpError} MethodNotFound if not supported
   *
   * @example
   * ```typescript
   * async createTerminal(args) {
   *   const pty = spawn(args.command, args.args || [], {
   *     cwd: args.cwd,
   *     env: args.env
   *   });
   *   const terminalId = generateId();
   *   this.terminals.set(terminalId, pty);
   *   return { terminalId };
   * }
   * ```
   */
  createTerminal?(args: CreateTerminalRequest): Promise<CreateTerminalResponse>;

  /**
   * Receive terminal output (optional capability).
   *
   * Called when the terminal produces output. This is a notification,
   * not a request, so no response is expected.
   *
   * @param args - Terminal ID, output, and stream (stdout/stderr)
   * @returns Promise that resolves when handled
   * @throws {AcpError} MethodNotFound if not supported
   *
   * @example
   * ```typescript
   * async terminalOutput(args) {
   *   const output = args.stream === 'stdout'
   *     ? this.terminals.get(args.terminalId).stdout
   *     : this.terminals.get(args.terminalId).stderr;
   *   output.write(args.output);
   * }
   * ```
   */
  terminalOutput?(args: TerminalOutputNotification): Promise<void>;

  /**
   * Release a terminal session (optional capability).
   *
   * Clean up resources associated with the terminal.
   *
   * @param args - Terminal ID to release
   * @returns Promise that resolves when released
   * @throws {AcpError} MethodNotFound if not supported
   *
   * @example
   * ```typescript
   * async releaseTerminal(args) {
   *   const pty = this.terminals.get(args.terminalId);
   *   if (pty) {
   *     pty.kill();
   *     this.terminals.delete(args.terminalId);
   *   }
   * }
   * ```
   */
  releaseTerminal?(args: ReleaseTerminalRequest): Promise<void>;

  /**
   * Wait for terminal to exit (optional capability).
   *
   * Blocks until the terminal process exits or timeout is reached.
   *
   * @param args - Terminal ID and optional timeout
   * @returns Promise with exit code, signal, or timeout flag
   * @throws {AcpError} MethodNotFound if not supported
   *
   * @example
   * ```typescript
   * async waitForTerminalExit(args) {
   *   const pty = this.terminals.get(args.terminalId);
   *   return new Promise((resolve) => {
   *     const timeout = args.timeout
   *       ? setTimeout(() => resolve({ timedOut: true }), args.timeout)
   *       : null;
   *
   *     pty.on('exit', (exitCode, signal) => {
   *       if (timeout) clearTimeout(timeout);
   *       resolve({ exitCode, signal });
   *     });
   *   });
   * }
   * ```
   */
  waitForTerminalExit?(
    args: WaitForTerminalExitRequest
  ): Promise<WaitForTerminalExitResponse>;

  /**
   * Kill a terminal command (optional capability).
   *
   * Send a signal to the terminal process to terminate it.
   *
   * @param args - Terminal ID and optional signal
   * @returns Promise that resolves when signal is sent
   * @throws {AcpError} MethodNotFound if not supported
   *
   * @example
   * ```typescript
   * async killTerminalCommand(args) {
   *   const pty = this.terminals.get(args.terminalId);
   *   if (pty) {
   *     pty.kill(args.signal || 'SIGTERM');
   *   }
   * }
   * ```
   */
  killTerminalCommand?(args: KillTerminalCommandRequest): Promise<void>;

  /**
   * Extension method for custom agent-specific features.
   *
   * Reserved for future protocol extensions.
   *
   * @param args - Extension-specific arguments
   * @returns Promise with extension-specific result
   * @throws {AcpError} MethodNotFound if not supported
   */
  extMethod?(args: unknown): Promise<unknown>;

  /**
   * Extension notification for custom agent-specific events.
   *
   * Reserved for future protocol extensions.
   *
   * @param args - Extension-specific arguments
   * @returns Promise that resolves when handled
   * @throws {AcpError} MethodNotFound if not supported
   */
  extNotification?(args: unknown): Promise<void>;
}
