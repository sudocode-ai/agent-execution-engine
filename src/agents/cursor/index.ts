/**
 * Cursor CLI agent integration.
 *
 * @module agents/cursor
 */

// Executor
export { CursorExecutor } from './executor.js';

// Normalizer
export { CursorNormalizationState, normalizeOutput } from './normalizer/index.js';

// Types
export type {
  CursorConfig,
  CursorMessage,
  CursorSystemMessage,
  CursorUserMessage,
  CursorAssistantMessage,
  CursorThinkingMessage,
  CursorToolCallMessage,
  CursorResultMessage,
  CursorToolCall,
  CursorShellTool,
  CursorReadTool,
  CursorWriteTool,
  CursorEditTool,
  CursorDeleteTool,
  CursorLsTool,
  CursorGlobTool,
  CursorGrepTool,
  CursorSemSearchTool,
  CursorTodoTool,
  CursorMcpTool,
  CursorUnknownTool,
} from './types/index.js';

// Helpers
export { extractSessionId, concatText, getToolName } from './types/index.js';
