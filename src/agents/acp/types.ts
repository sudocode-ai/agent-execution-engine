/**
 * ACP Types Module
 *
 * Re-exports types from the @agentclientprotocol/sdk and defines
 * custom interfaces for the execution engine's ACP integration.
 *
 * @module execution-engine/agents/acp/types
 */

// Re-export core classes and types from SDK
export {
  AgentSideConnection,
  ClientSideConnection,
  TerminalHandle,
  RequestError,
  ndJsonStream,
  type Agent,
  type Client,
  type Stream,
  type AnyMessage,
} from '@agentclientprotocol/sdk';

// Re-export schema types
export {
  // Protocol constants
  AGENT_METHODS,
  CLIENT_METHODS,
  PROTOCOL_VERSION,

  // Core types
  type AgentCapabilities,
  type ClientCapabilities,
  type Implementation,
  type ProtocolVersion,

  // Session types
  type SessionId,
  type SessionInfo,
  type SessionNotification,
  type SessionUpdate,
  type SessionMode,
  type SessionModeId,
  type SessionModeState,
  type SessionModelState,
  type SessionCapabilities,

  // Request/Response types
  type InitializeRequest,
  type InitializeResponse,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type PromptRequest,
  type PromptResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
  type SetSessionModelRequest,
  type SetSessionModelResponse,
  type CancelNotification,

  // File system types
  type FileSystemCapability,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,

  // Terminal types
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type ReleaseTerminalRequest,
  type ReleaseTerminalResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type KillTerminalCommandRequest,
  type KillTerminalCommandResponse,
  type TerminalExitStatus,
  type Terminal,

  // Permission types
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type RequestPermissionOutcome,
  type PermissionOption,
  type PermissionOptionId,
  type PermissionOptionKind,

  // Content types
  type ContentBlock,
  type ContentChunk,
  type Content,
  type TextContent,
  type ImageContent,
  type AudioContent,
  type EmbeddedResource,
  type ResourceLink,
  type TextResourceContents,
  type BlobResourceContents,
  type Annotations,
  type Role,

  // Tool types
  type ToolCall,
  type ToolCallUpdate,
  type ToolCallId,
  type ToolCallStatus,
  type ToolCallContent,
  type ToolCallLocation,
  type ToolKind,
  type Diff,

  // Plan types
  type Plan,
  type PlanEntry,
  type PlanEntryPriority,
  type PlanEntryStatus,

  // Stop reason
  type StopReason,

  // MCP types
  type McpServer,
  type McpCapabilities,

  // Model types
  type ModelId,
  type ModelInfo,

  // Available commands
  type AvailableCommand,
  type AvailableCommandsUpdate,
  type CurrentModeUpdate,
} from '@agentclientprotocol/sdk';

import type {
  Client,
  SessionNotification,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  KillTerminalCommandRequest,
  KillTerminalCommandResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ClientCapabilities,
} from '@agentclientprotocol/sdk';

import type { BaseAgentConfig } from '../types/agent-adapter.js';

/**
 * Configuration for ACP-based execution
 */
export interface AcpExecutorConfig extends BaseAgentConfig {
  /**
   * Client capabilities to advertise during initialization
   */
  clientCapabilities?: ClientCapabilities;

  /**
   * Whether to auto-approve all permission requests
   * @default false
   */
  autoApprove?: boolean;

  /**
   * Custom permission handler for tool calls
   * If not provided and autoApprove is false, permissions will be rejected
   */
  onPermissionRequest?: (
    request: RequestPermissionRequest,
  ) => Promise<RequestPermissionResponse>;

  /**
   * Handler for session update notifications
   */
  onSessionUpdate?: (notification: SessionNotification) => void | Promise<void>;
}

/**
 * IAcpClient interface
 *
 * Defines what the execution engine implements as an ACP Client.
 * This is the interface that agents can call back into for file system
 * operations, terminal operations, and permission requests.
 *
 * Extends the base Client interface from the SDK with execution-engine
 * specific additions.
 */
export interface IAcpClient extends Client {
  /**
   * The capabilities this client supports
   */
  readonly capabilities: ClientCapabilities;

  /**
   * Whether the client is in auto-approve mode
   */
  readonly autoApprove: boolean;
}

/**
 * Options for creating an ACP client
 */
export interface AcpClientOptions {
  /**
   * Client capabilities to advertise
   */
  capabilities?: ClientCapabilities;

  /**
   * Whether to auto-approve all permission requests
   * @default false
   */
  autoApprove?: boolean;

  /**
   * Custom permission handler
   */
  onPermissionRequest?: (
    request: RequestPermissionRequest,
  ) => Promise<RequestPermissionResponse>;

  /**
   * Handler for session update notifications
   */
  onSessionUpdate?: (notification: SessionNotification) => void | Promise<void>;

  /**
   * File system read handler
   * Required if capabilities.fs.readTextFile is true
   */
  onReadTextFile?: (
    request: ReadTextFileRequest,
  ) => Promise<ReadTextFileResponse>;

  /**
   * File system write handler
   * Required if capabilities.fs.writeTextFile is true
   */
  onWriteTextFile?: (
    request: WriteTextFileRequest,
  ) => Promise<WriteTextFileResponse>;

  /**
   * Terminal create handler
   * Required if capabilities.terminal is true
   */
  onCreateTerminal?: (
    request: CreateTerminalRequest,
  ) => Promise<CreateTerminalResponse>;

  /**
   * Terminal output handler
   * Required if capabilities.terminal is true
   */
  onTerminalOutput?: (
    request: TerminalOutputRequest,
  ) => Promise<TerminalOutputResponse>;

  /**
   * Terminal release handler
   * Required if capabilities.terminal is true
   */
  onReleaseTerminal?: (
    request: ReleaseTerminalRequest,
  ) => Promise<ReleaseTerminalResponse>;

  /**
   * Terminal wait for exit handler
   * Required if capabilities.terminal is true
   */
  onWaitForTerminalExit?: (
    request: WaitForTerminalExitRequest,
  ) => Promise<WaitForTerminalExitResponse>;

  /**
   * Terminal kill handler
   * Required if capabilities.terminal is true
   */
  onKillTerminal?: (
    request: KillTerminalCommandRequest,
  ) => Promise<KillTerminalCommandResponse>;
}

/**
 * State of an ACP session
 */
export type AcpSessionState =
  | 'initializing'
  | 'ready'
  | 'prompting'
  | 'cancelled'
  | 'closed';

/**
 * ACP session information
 */
export interface AcpSessionInfo {
  /**
   * Session ID
   */
  sessionId: string;

  /**
   * Current session state
   */
  state: AcpSessionState;

  /**
   * Working directory for the session
   */
  cwd: string;

  /**
   * Session creation time
   */
  createdAt: Date;

  /**
   * Last activity time
   */
  lastActivityAt: Date;
}

/**
 * Result of an ACP prompt operation
 */
export interface AcpPromptResult {
  /**
   * Why the agent stopped processing
   */
  stopReason: 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

  /**
   * Session notifications received during the prompt
   */
  updates: SessionNotification[];

  /**
   * Duration of the prompt in milliseconds
   */
  durationMs: number;
}

/**
 * Generic session metadata type
 *
 * Agent-specific metadata can be passed via _meta in newSession.
 * This is a generic type that allows any key-value pairs.
 * For Claude-specific types, see src/agents/claude/acp-types.ts
 */
export type AcpSessionMeta = Record<string, unknown>;
