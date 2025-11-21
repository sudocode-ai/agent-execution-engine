/**
 * TypeScript implementation of Agent Client Protocol (ACP) types.
 *
 * Based on the Rust agent-client-protocol crate used by Gemini CLI, Qwen Code, etc.
 * Types are designed to match Rust enum structures using TypeScript discriminated unions.
 */

/**
 * Session identifier
 */
export interface SessionId {
  id: string;
}

/**
 * Session mode identifier (e.g., "code", "chat", "plan")
 */
export interface SessionModeId {
  id: string;
}

/**
 * Content block - can be text, image, or audio
 */
export type ContentBlock =
  | { Text: { text: string } }
  | { Image: { url: string; mimeType?: string } }
  | { Audio: { url: string; mimeType?: string } };

/**
 * Tool call identifier
 */
export type ToolCallId = string | number | { [key: string]: string | number };

/**
 * Types of tools available in ACP
 */
export type ToolKind =
  | 'Read'
  | 'Edit'
  | 'Execute'
  | 'Delete'
  | 'Search'
  | 'Fetch'
  | 'Think'
  | 'SwitchMode'
  | 'Move'
  | 'Other';

/**
 * Tool execution status
 */
export type ToolCallStatus =
  | 'Pending'
  | 'InProgress'
  | 'Completed'
  | 'Failed';

/**
 * File or resource location
 */
export interface ToolLocation {
  path: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Tool call content - can contain diffs, text, structured data
 */
export type ToolCallContent =
  | { Diff: { oldText: string; newText: string; path?: string } }
  | { Content: { content: ContentBlock } }
  | { Structured: { data: unknown } };

/**
 * Tool call representing an action the agent wants to perform
 */
export interface ToolCall {
  id: ToolCallId;
  kind: ToolKind;
  title: string;
  status: ToolCallStatus;
  locations?: ToolLocation[];
  content?: ToolCallContent[];
  rawInput?: unknown;
  rawOutput?: unknown;
}

/**
 * Partial update to an existing tool call
 */
export interface ToolCallUpdate {
  id: ToolCallId;
  fields: Partial<ToolCall>;
}

/**
 * Plan entry representing a step in a multi-step plan
 */
export interface PlanEntry {
  content: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Multi-step plan
 */
export interface Plan {
  entries: PlanEntry[];
  meta?: unknown;
}

/**
 * Available command in the current context
 */
export interface AvailableCommand {
  name: string;
  description?: string;
  parameters?: unknown;
}

/**
 * Session update - different types of events the agent can emit
 */
export type SessionUpdate =
  | { AgentMessageChunk: { content: ContentBlock } }
  | { AgentThoughtChunk: { content: ContentBlock } }
  | { ToolCall: ToolCall }
  | { ToolCallUpdate: ToolCallUpdate }
  | { Plan: Plan }
  | { AvailableCommandsUpdate: { available_commands: AvailableCommand[] } }
  | { CurrentModeUpdate: { current_mode_id: SessionModeId } };

/**
 * Session notification from agent containing session ID and update
 */
export interface SessionNotification {
  sessionId: SessionId;
  update: SessionUpdate;
  meta?: unknown;
}

/**
 * Session history entry for resumption
 */
export interface SessionHistoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

/**
 * Permission option presented to user
 */
export interface PermissionOption {
  id: string;
  kind: 'AllowAlways' | 'AllowOnce' | 'DenyAlways' | 'DenyOnce';
  label: string;
  description?: string;
}

/**
 * Outcome of a permission request
 */
export type RequestPermissionOutcome =
  | { Selected: { optionId: string } }
  | 'Cancelled';

/**
 * Request from agent asking for permission to use a tool
 */
export interface RequestPermissionRequest {
  toolCall: ToolCall;
  options: PermissionOption[];
  message?: string;
}

/**
 * Response to permission request
 */
export interface RequestPermissionResponse {
  outcome: RequestPermissionOutcome;
  meta?: unknown;
}

/**
 * File system capability configuration
 */
export interface FileSystemCapability {
  read_text_file: boolean;
  write_text_file: boolean;
  meta?: unknown;
}

/**
 * Client capabilities declared during initialization
 */
export interface ClientCapabilities {
  fs?: FileSystemCapability;
  terminal?: boolean;
  meta?: unknown;
}

/**
 * Protocol version
 */
export type ProtocolVersion = 'V1';

/**
 * Initialize request to start ACP session
 */
export interface InitializeRequest {
  protocolVersion: ProtocolVersion;
  clientCapabilities: ClientCapabilities;
}

/**
 * Initialize response from agent
 */
export interface InitializeResponse {
  protocolVersion: ProtocolVersion;
  serverCapabilities?: {
    supportedTools?: ToolKind[];
    supportedModes?: SessionModeId[];
    meta?: unknown;
  };
}

/**
 * Prompt request to start a conversation
 */
export interface PromptRequest {
  prompt: string;
  sessionId?: string;
  history?: SessionHistoryEntry[];
  meta?: unknown;
}

/**
 * Prompt response (typically contains session ID)
 */
export interface PromptResponse {
  sessionId: SessionId;
  status?: 'started' | 'error';
  meta?: unknown;
}

/**
 * Cancel request to stop ongoing session
 */
export interface CancelRequest {
  sessionId: SessionId;
  meta?: unknown;
}

/**
 * File read request (optional client capability)
 */
export interface ReadTextFileRequest {
  path: string;
  encoding?: string;
}

/**
 * File read response
 */
export interface ReadTextFileResponse {
  content: string;
  encoding?: string;
}

/**
 * File write request (optional client capability)
 */
export interface WriteTextFileRequest {
  path: string;
  content: string;
  encoding?: string;
}

/**
 * File write response
 */
export interface WriteTextFileResponse {
  success: boolean;
  bytesWritten?: number;
}

/**
 * Terminal creation request (optional client capability)
 */
export interface CreateTerminalRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Terminal creation response
 */
export interface CreateTerminalResponse {
  terminalId: string;
}

/**
 * Terminal output notification
 */
export interface TerminalOutputNotification {
  terminalId: string;
  output: string;
  stream: 'stdout' | 'stderr';
}

/**
 * Terminal release request
 */
export interface ReleaseTerminalRequest {
  terminalId: string;
}

/**
 * Wait for terminal exit request
 */
export interface WaitForTerminalExitRequest {
  terminalId: string;
  timeout?: number;
}

/**
 * Wait for terminal exit response
 */
export interface WaitForTerminalExitResponse {
  exitCode?: number;
  signal?: string;
  timedOut?: boolean;
}

/**
 * Kill terminal command request
 */
export interface KillTerminalCommandRequest {
  terminalId: string;
  signal?: string;
}
