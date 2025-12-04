/**
 * Claude Code Agent Module
 *
 * Complete integration for Claude Code CLI.
 *
 * @module agents/claude
 */

// Legacy adapter (will be deprecated)
export { buildClaudeConfig } from "./config-builder.js";
export type {
  McpServerConfig as ClaudeMcpServerConfig,
  McpConfig as ClaudeMcpConfig,
} from "./config-builder.js";
export * from "./adapter.js";

// Executor
export { ClaudeCodeExecutor } from "./executor.js";

// Types
export type {
  ClaudeCodeConfig,
  ClaudeStreamMessage,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolUseMessage,
  ResultMessage,
  ControlRequestMessage,
  ControlResponseMessage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ControlRequest,
  CanUseToolRequest,
  HookCallbackRequest,
  PermissionResult,
  AllowResult,
  DenyResult,
  ControlResponse,
  SuccessResponse,
  ErrorResponse,
  HookConfig,
  HookOutput,
  PermissionMode,
  PermissionUpdate,
  SdkControlRequest,
} from "./types/index.js";

// Protocol
export {
  ProtocolPeer,
  ClaudeAgentClient,
  parseStreamJsonLine,
  readStreamJson,
  serializeStreamJson,
  type IProtocolClient,
  type MessageHandler,
  type ErrorHandler as ProtocolErrorHandler,
} from "./protocol/index.js";

// Normalizer
export { normalizeMessage, createNormalizerState } from "./normalizer.js";

// Hooks
export { getDirectoryGuardHookPath } from "./hooks/index.js";
