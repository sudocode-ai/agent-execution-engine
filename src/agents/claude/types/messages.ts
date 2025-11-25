/**
 * Claude Code Stream-JSON Message Types
 *
 * Type definitions for Claude Code's stream-json output format.
 * These types represent the messages that Claude CLI writes to stdout.
 *
 * @module agents/claude/types/messages
 */

/**
 * Base message fields present on all Claude stream-json messages
 */
export interface BaseMessage {
  type: string;
  sessionId?: string;
}

/**
 * Content block types that can appear in messages
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

/**
 * Text content block
 */
export interface TextBlock {
  type: "text";
  text: string;
}

/**
 * Tool use content block
 *
 * Appears in assistant messages when Claude wants to use a tool.
 */
export interface ToolUseBlock {
  type: "tool_use";
  id: string; // tool_use_id for matching with hook callbacks
  name: string; // Tool name: 'Bash', 'Edit', 'Read', 'Write', MCP tools, etc.
  input: unknown; // Tool-specific input parameters
}

/**
 * Tool result content block
 *
 * Appears in user messages after a tool has been executed.
 * Contains the result of the tool execution.
 */
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string; // Links back to the original tool_use block
  content: Array<TextBlock>; // Result content (usually text)
  is_error?: boolean; // Whether the tool execution failed
}

/**
 * System message
 *
 * Sent at the start of execution to provide session metadata.
 *
 * @example
 * ```json
 * {
 *   "type": "system",
 *   "subtype": "init",
 *   "sessionId": "sess-abc123",
 *   "model": "claude-sonnet-4",
 *   "mcpServers": [{"name": "filesystem", "status": "connected"}]
 * }
 * ```
 */
export interface SystemMessage extends BaseMessage {
  type: "system";
  subtype?: "init" | "session_start";
  sessionId: string;
  model?: string;
  mcpServers?: Array<{
    name: string;
    status: string;
  }>;
}

/**
 * Message content structure
 */
export interface MessageContent {
  role: "user" | "assistant";
  content: Array<ContentBlock> | string;
}

/**
 * User message
 *
 * Represents user input (prompts) sent to Claude.
 *
 * @example
 * ```json
 * {
 *   "type": "user",
 *   "message": {
 *     "role": "user",
 *     "content": "List files in the current directory"
 *   },
 *   "sessionId": "sess-abc123"
 * }
 * ```
 */
export interface UserMessage extends BaseMessage {
  type: "user";
  message: {
    role: "user";
    content: Array<ContentBlock> | string;
  };
  sessionId?: string;
}

/**
 * Assistant message
 *
 * Represents Claude's response. Can contain text, tool uses, or both.
 * These messages may be streamed (multiple messages with partial content).
 *
 * @example Text response
 * ```json
 * {
 *   "type": "assistant",
 *   "message": {
 *     "role": "assistant",
 *     "content": [{"type": "text", "text": "I'll list the files..."}]
 *   },
 *   "sessionId": "sess-abc123"
 * }
 * ```
 *
 * @example Tool use
 * ```json
 * {
 *   "type": "assistant",
 *   "message": {
 *     "role": "assistant",
 *     "content": [{
 *       "type": "tool_use",
 *       "id": "tool-123",
 *       "name": "Bash",
 *       "input": {"command": "ls -la"}
 *     }]
 *   },
 *   "sessionId": "sess-abc123"
 * }
 * ```
 */
export interface AssistantMessage extends BaseMessage {
  type: "assistant";
  message: {
    role: "assistant";
    content: Array<ContentBlock>;
  };
  sessionId?: string;
}

/**
 * Tool use lifecycle message
 *
 * Sent when a tool starts or completes execution.
 *
 * @example Started
 * ```json
 * {
 *   "type": "tool_use",
 *   "subtype": "started",
 *   "toolUseId": "tool-123",
 *   "toolName": "Bash",
 *   "sessionId": "sess-abc123"
 * }
 * ```
 *
 * @example Completed
 * ```json
 * {
 *   "type": "tool_use",
 *   "subtype": "completed",
 *   "toolUseId": "tool-123",
 *   "toolResult": {"stdout": "file1.txt\nfile2.txt", "exitCode": 0},
 *   "sessionId": "sess-abc123"
 * }
 * ```
 */
export interface ToolUseMessage extends BaseMessage {
  type: "tool_use";
  subtype?: "started" | "completed";
  toolUseId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  sessionId?: string;
}

/**
 * Result message
 *
 * Sent at the end of task execution to indicate completion or failure.
 *
 * @example Success
 * ```json
 * {
 *   "type": "result",
 *   "isError": false,
 *   "durationMs": 1234,
 *   "sessionId": "sess-abc123"
 * }
 * ```
 *
 * @example Error
 * ```json
 * {
 *   "type": "result",
 *   "isError": true,
 *   "result": {"error": "Command failed"},
 *   "sessionId": "sess-abc123"
 * }
 * ```
 */
export interface ResultMessage extends BaseMessage {
  type: "result";
  isError: boolean;
  durationMs?: number;
  result?: unknown;
  sessionId?: string;
}

/**
 * Control request message
 *
 * Sent by Claude CLI when it needs approval or hook callback response.
 * See control.ts for ControlRequest types.
 */
export interface ControlRequestMessage extends BaseMessage {
  type: "control_request";
  requestId: string;
  request: unknown; // Actual type defined in control.ts to avoid circular dependency
}

/**
 * Control response message
 *
 * Sent by SDK to Claude CLI in response to control requests.
 * See control.ts for ControlResponse types.
 */
export interface ControlResponseMessage {
  type: "control_response";
  response: unknown; // Actual type defined in control.ts to avoid circular dependency
}

/**
 * Discriminated union of all Claude stream-json message types
 *
 * Use this type for type-safe message parsing with discriminated union pattern.
 *
 * @example Type narrowing
 * ```typescript
 * function handleMessage(msg: ClaudeStreamMessage) {
 *   if (msg.type === 'assistant') {
 *     // TypeScript knows msg is AssistantMessage here
 *     console.log(msg.message.content);
 *   } else if (msg.type === 'tool_use') {
 *     // TypeScript knows msg is ToolUseMessage here
 *     console.log(msg.toolUseId);
 *   }
 * }
 * ```
 */
export type ClaudeStreamMessage =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolUseMessage
  | ResultMessage
  | ControlRequestMessage
  | ControlResponseMessage;
