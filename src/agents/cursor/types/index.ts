/**
 * Cursor type definitions.
 *
 * @module agents/cursor/types
 */

// Message types
export type {
  CursorContentItem,
  CursorMessageContent,
  CursorSystemMessage,
  CursorUserMessage,
  CursorAssistantMessage,
  CursorThinkingMessage,
  CursorToolCallMessage,
  CursorResultMessage,
  CursorMessage,
} from './messages.js';

export { extractSessionId, concatText } from './messages.js';

// Tool types
export type {
  CursorShellTool,
  CursorReadTool,
  CursorWriteTool,
  CursorEditTool,
  CursorEditResultSuccess,
  CursorDeleteTool,
  CursorLsTool,
  CursorGlobTool,
  CursorGrepTool,
  CursorSemSearchTool,
  CursorTodoTool,
  CursorTodoItem,
  CursorMcpTool,
  CursorMcpContentItem,
  CursorUnknownTool,
  CursorToolCall,
} from './tools.js';

export { getToolName } from './tools.js';

// Configuration types
export type { CursorConfig } from './config.js';
