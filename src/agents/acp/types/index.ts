/**
 * ACP protocol type definitions
 */

export type {
  // Session types
  SessionId,
  SessionModeId,
  SessionNotification,
  SessionUpdate,
  SessionHistoryEntry,

  // Content types
  ContentBlock,

  // Tool types
  ToolCallId,
  ToolKind,
  ToolCallStatus,
  ToolLocation,
  ToolCallContent,
  ToolCall,
  ToolCallUpdate,

  // Plan types
  Plan,
  PlanEntry,
  AvailableCommand,

  // Permission types
  PermissionOption,
  RequestPermissionOutcome,
  RequestPermissionRequest,
  RequestPermissionResponse,

  // Capability types
  FileSystemCapability,
  ClientCapabilities,
  ProtocolVersion,

  // Request/Response types
  InitializeRequest,
  InitializeResponse,
  PromptRequest,
  PromptResponse,
  CancelRequest,

  // File system operation types
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,

  // Terminal operation types
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputNotification,
  ReleaseTerminalRequest,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  KillTerminalCommandRequest,
} from './protocol.js';

// Client interface
export type { Client } from './client.js';
