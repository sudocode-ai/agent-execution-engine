/**
 * Claude Code Types
 *
 * Type definitions for Claude Code CLI integration.
 *
 * @module agents/claude/types
 */

// Stream-JSON message types
export type {
  ClaudeStreamMessage,
  BaseMessage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  SystemMessage,
  MessageContent,
  UserMessage,
  AssistantMessage,
  ToolUseMessage,
  ResultMessage,
  ControlRequestMessage,
  ControlResponseMessage,
} from './messages.js';

// Control protocol types
export type {
  PermissionMode,
  PermissionUpdate,
  CanUseToolRequest,
  HookCallbackRequest,
  ControlRequest,
  AllowResult,
  DenyResult,
  PermissionResult,
  HookOutput,
  SuccessResponse,
  ErrorResponse,
  ControlResponse,
  HookConfig,
  SdkControlRequest,
} from './control.js';

// Configuration types
export type { ClaudeCodeConfig } from './config.js';
