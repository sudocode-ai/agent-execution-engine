/**
 * Cursor JSONL message type definitions.
 *
 * Cursor CLI outputs line-delimited JSON (JSONL) with 6 message types.
 * All messages may contain an optional session_id field for session tracking.
 *
 * @module agents/cursor/types/messages
 */

/**
 * Content item in a Cursor message.
 * Currently only supports text type.
 */
export interface CursorContentItem {
  type: 'text';
  text: string;
}

/**
 * Message content structure containing role and content items.
 */
export interface CursorMessageContent {
  role: 'user' | 'assistant';
  content: CursorContentItem[];
}

/**
 * System message - emitted at session initialization.
 * Contains configuration and session metadata.
 *
 * @example
 * ```json
 * {
 *   "type": "system",
 *   "subtype": "init",
 *   "session_id": "sess-abc123",
 *   "model": "GPT-5",
 *   "api_key_source": "env",
 *   "cwd": "/path/to/project",
 *   "permission_mode": "force"
 * }
 * ```
 */
export interface CursorSystemMessage {
  type: 'system';
  subtype?: string;
  api_key_source?: string;
  cwd?: string;
  session_id?: string;
  model?: string;
  permission_mode?: string;
}

/**
 * User message - echo of user prompt.
 *
 * @example
 * ```json
 * {
 *   "type": "user",
 *   "message": {
 *     "role": "user",
 *     "content": [{ "type": "text", "text": "Add login feature" }]
 *   },
 *   "session_id": "sess-abc123"
 * }
 * ```
 */
export interface CursorUserMessage {
  type: 'user';
  message: CursorMessageContent;
  session_id?: string;
}

/**
 * Assistant message - agent response (may stream in chunks).
 * Multiple messages with same session_id should be coalesced.
 *
 * @example
 * ```json
 * {
 *   "type": "assistant",
 *   "message": {
 *     "role": "assistant",
 *     "content": [{ "type": "text", "text": "I'll help you add a login feature..." }]
 *   },
 *   "session_id": "sess-abc123"
 * }
 * ```
 */
export interface CursorAssistantMessage {
  type: 'assistant';
  message: CursorMessageContent;
  session_id?: string;
}

/**
 * Thinking message - extended reasoning (streams in chunks).
 * Multiple messages should be coalesced into single thinking block.
 *
 * @example
 * ```json
 * {
 *   "type": "thinking",
 *   "subtype": "extended",
 *   "text": "Let me analyze the authentication requirements...",
 *   "session_id": "sess-abc123"
 * }
 * ```
 */
export interface CursorThinkingMessage {
  type: 'thinking';
  subtype?: string;
  text?: string;
  session_id?: string;
}

/**
 * Tool call message - tool execution lifecycle event.
 *
 * Lifecycle:
 * - subtype: "started" - Tool execution begins
 * - subtype: "completed" - Tool execution finishes with result
 *
 * @example Started
 * ```json
 * {
 *   "type": "tool_call",
 *   "subtype": "started",
 *   "call_id": "call-1",
 *   "tool_call": { "shellToolCall": { "args": { "command": "ls -la" } } },
 *   "session_id": "sess-abc123"
 * }
 * ```
 *
 * @example Completed
 * ```json
 * {
 *   "type": "tool_call",
 *   "subtype": "completed",
 *   "call_id": "call-1",
 *   "tool_call": {
 *     "shellToolCall": {
 *       "args": { "command": "ls -la" },
 *       "result": { "success": { "stdout": "file1\nfile2", "exitCode": 0 } }
 *     }
 *   },
 *   "session_id": "sess-abc123"
 * }
 * ```
 */
export interface CursorToolCallMessage {
  type: 'tool_call';
  subtype?: 'started' | 'completed';
  call_id?: string;
  tool_call: unknown; // CursorToolCall from tools.ts (avoid circular dependency)
  session_id?: string;
}

/**
 * Result message - task completion metadata.
 * Emitted when task finishes (success or error).
 *
 * @example Success
 * ```json
 * {
 *   "type": "result",
 *   "subtype": "success",
 *   "is_error": false,
 *   "duration_ms": 5432
 * }
 * ```
 *
 * @example Error
 * ```json
 * {
 *   "type": "result",
 *   "subtype": "error",
 *   "is_error": true,
 *   "result": { "error": "Authentication required" }
 * }
 * ```
 */
export interface CursorResultMessage {
  type: 'result';
  subtype?: string;
  is_error?: boolean;
  duration_ms?: number;
  result?: unknown;
}

/**
 * Discriminated union of all Cursor message types.
 * Use the `type` field to narrow the type.
 *
 * @example Type narrowing
 * ```typescript
 * function handleMessage(message: CursorMessage) {
 *   switch (message.type) {
 *     case 'system':
 *       console.log('Model:', message.model);
 *       break;
 *     case 'assistant':
 *       console.log('Response:', concatText(message.message));
 *       break;
 *     case 'tool_call':
 *       console.log('Call ID:', message.call_id);
 *       break;
 *     // ... etc
 *   }
 * }
 * ```
 */
export type CursorMessage =
  | CursorSystemMessage
  | CursorUserMessage
  | CursorAssistantMessage
  | CursorThinkingMessage
  | CursorToolCallMessage
  | CursorResultMessage;

/**
 * Extract session ID from any Cursor message.
 * Most message types may contain an optional session_id field.
 *
 * @param message - Any Cursor message
 * @returns Session ID if present, undefined otherwise
 *
 * @example
 * ```typescript
 * const message: CursorMessage = JSON.parse(line);
 * const sessionId = extractSessionId(message);
 * if (sessionId) {
 *   console.log('Session:', sessionId);
 * }
 * ```
 */
export function extractSessionId(message: CursorMessage): string | undefined {
  if ('session_id' in message) {
    return message.session_id;
  }
  return undefined;
}

/**
 * Concatenate text content from a message.
 * Filters content items to text type and joins text fields.
 *
 * @param message - Message content to concatenate
 * @returns Concatenated text string
 *
 * @example
 * ```typescript
 * const assistantMsg: CursorAssistantMessage = {
 *   type: 'assistant',
 *   message: {
 *     role: 'assistant',
 *     content: [
 *       { type: 'text', text: 'Hello ' },
 *       { type: 'text', text: 'world!' }
 *     ]
 *   }
 * };
 *
 * const text = concatText(assistantMsg.message);
 * console.log(text); // "Hello world!"
 * ```
 */
export function concatText(message: CursorMessageContent): string {
  return message.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('');
}
