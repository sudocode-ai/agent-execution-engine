/**
 * ACP (Agent Client Protocol) Module
 *
 * Provides integration with the Agent Client Protocol for communication
 * with ACP-compatible agents (e.g., Gemini, Claude Code with ACP mode).
 *
 * @module execution-engine/agents/acp
 */

// Types - re-exports from SDK and custom types
export {
  // SDK core classes
  AgentSideConnection,
  ClientSideConnection,
  TerminalHandle,
  RequestError,
  ndJsonStream,

  // SDK interfaces
  type Agent,
  type Client,
  type Stream,
  type AnyMessage,

  // Protocol constants
  AGENT_METHODS,
  CLIENT_METHODS,
  PROTOCOL_VERSION,

  // Core types
  type AgentCapabilities as AcpAgentCapabilities,
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
  type PromptRequest,
  type PromptResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,

  // Tool types
  type ToolCall,
  type ToolCallUpdate,
  type ToolCallStatus,
  type ToolKind,

  // Permission types
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type RequestPermissionOutcome,

  // Content types
  type ContentBlock,
  type StopReason,

  // Custom types
  type IAcpClient,
  type AcpClientOptions,
  type AcpExecutorConfig,
  type AcpSessionState,
  type AcpSessionInfo,
  type AcpPromptResult,
  type AcpSessionMeta,
} from './types.js';

// Connection utilities
export {
  AcpConnection,
  spawnAcpAgent,
  createConnectionFromStream,
  createStreamFromStdio,
  nodeReadableToWebReadable,
  nodeWritableToWebWritable,
  type SpawnAcpAgentOptions,
  type SpawnedAcpAgent,
} from './connection.js';

// Client implementation
export {
  DefaultAcpClient,
  createAutoApproveClient,
  createPermissionClient,
  createReadOnlyClient,
} from './client.js';

// Session management
export {
  AcpSession,
  AcpSessionManager,
  type AcpSessionOptions,
} from './session.js';

// Output normalization
export {
  AcpNormalizer,
  normalizeAcpStream,
  type AcpNormalizerOptions,
} from './normalizer.js';

// Executor
export {
  AcpExecutor,
  type AcpExecutorConfig as AcpExecutorConfiguration,
} from './executor.js';

// Adapter interface
export {
  type IAcpAgentAdapter,
  type AcpAgentConfig,
  type AcpCapabilities,
  type AcpAvailabilityResult,
  isAcpCapableAdapter,
  wrapAsAcpAdapter,
} from './adapter.js';
