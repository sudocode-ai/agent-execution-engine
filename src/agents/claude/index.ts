/**
 * Claude Code Agent Module
 *
 * Complete integration for Claude Code with two executor implementations:
 *
 * ## Executors
 *
 * ### ClaudeCodeExecutor (CLI-based, recommended)
 * Uses the `claude` CLI via process spawning with bidirectional stream-json protocol.
 * Provides full feature parity with Claude Code CLI including custom hooks and
 * directory restrictions.
 *
 * ```typescript
 * const executor = new ClaudeCodeExecutor({
 *   workDir: '/path/to/project',
 *   print: true,
 *   outputFormat: 'stream-json',
 * });
 * ```
 *
 * ### ClaudeSDKExecutor (SDK-based)
 * Uses `@anthropic-ai/claude-agent-sdk` for a simpler, dependency-based approach.
 * Provides native streaming input via AsyncIterable and cleaner interrupt handling.
 *
 * ```typescript
 * const executor = new ClaudeSDKExecutor({
 *   workDir: '/path/to/project',
 *   model: 'claude-opus-4-5-20251101',
 * });
 * ```
 *
 * ## Feature Comparison
 *
 * | Feature | CLI Executor | SDK Executor |
 * |---------|--------------|--------------|
 * | Mid-execution messages | ✅ | ✅ |
 * | Session resume | ✅ | ✅ |
 * | Tool approvals | ✅ | ✅ |
 * | MCP servers | ✅ | ✅ |
 * | Custom hooks | ✅ | ❌ |
 * | Directory restriction | ✅ | ❌ |
 * | No external process | ❌ | ✅ |
 *
 * See `docs/sdk-research.md` for detailed comparison.
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

// Executors
export { ClaudeCodeExecutor } from "./executor.js";
export { ClaudeSDKExecutor, type ClaudeSDKConfig } from "./sdk-executor.js";

// Executor Factory (auto-selection with fallback)
export {
  createClaudeExecutor,
  getClaudeExecutor,
  type ClaudeExecutorConfig,
  type CreateClaudeExecutorOptions,
  type CreateClaudeExecutorResult,
  type ExecutorPreference,
} from "./executor-factory.js";

// Session wrapper
export { ClaudeSession, type SessionState } from "./session.js";

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
  ControlMessage,
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

// Utils
export { AsyncQueue } from "./utils/index.js";
