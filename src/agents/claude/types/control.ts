/**
 * Claude Code Control Protocol Types
 *
 * Type definitions for the bidirectional control protocol used for
 * tool approvals and hook callbacks between the SDK and Claude CLI.
 *
 * @module agents/claude/types/control
 */

/**
 * Permission mode for tool usage
 */
export type PermissionMode = 'ask' | 'bypass_permissions';

/**
 * Permission update operation
 *
 * Used to modify permission settings during execution.
 */
export interface PermissionUpdate {
  updateType: 'set_mode' | 'add_permission' | 'remove_permission';
  mode?: PermissionMode;
  destination: 'session' | 'global';
}

/**
 * Can use tool request
 *
 * Sent by Claude CLI when it needs approval to use a tool.
 * The SDK responds with a PermissionResult.
 *
 * @example
 * ```json
 * {
 *   "type": "can_use_tool",
 *   "toolName": "Bash",
 *   "input": {"command": "rm -rf /"},
 *   "permissionSuggestions": [{"updateType": "set_mode", "mode": "ask", "destination": "session"}]
 * }
 * ```
 */
export interface CanUseToolRequest {
  type: 'can_use_tool';
  toolName: string;
  input: unknown;
  permissionSuggestions?: PermissionUpdate[];
}

/**
 * Hook callback request
 *
 * Sent by Claude CLI when a registered hook is triggered.
 * For PreToolUse hooks, includes the tool_use_id.
 *
 * @example PreToolUse hook
 * ```json
 * {
 *   "type": "hook_callback",
 *   "callbackId": "cb-123",
 *   "input": {},
 *   "toolUseId": "tool-456"
 * }
 * ```
 */
export interface HookCallbackRequest {
  type: 'hook_callback';
  callbackId: string;
  input: unknown;
  toolUseId?: string; // Present for PreToolUse hook
}

/**
 * Control request discriminated union
 *
 * Represents all types of control requests that Claude CLI can send.
 */
export type ControlRequest = CanUseToolRequest | HookCallbackRequest;

/**
 * Allow permission result
 *
 * Indicates that the tool use is approved.
 */
export interface AllowResult {
  result: 'allow';
  updatedInput?: unknown; // Optional: modify tool input
  updatedPermissions?: PermissionUpdate[]; // Optional: update permission mode
}

/**
 * Deny permission result
 *
 * Indicates that the tool use is denied.
 */
export interface DenyResult {
  result: 'deny';
  message?: string; // Reason for denial
  interrupt?: boolean; // Should agent stop execution entirely?
}

/**
 * Permission result discriminated union
 *
 * Response to a can_use_tool request.
 *
 * @example Allow
 * ```typescript
 * const result: PermissionResult = {
 *   result: 'allow',
 *   updatedInput: { command: 'ls' }
 * };
 * ```
 *
 * @example Deny
 * ```typescript
 * const result: PermissionResult = {
 *   result: 'deny',
 *   message: 'Dangerous command not allowed',
 *   interrupt: false
 * };
 * ```
 */
export type PermissionResult = AllowResult | DenyResult;

/**
 * Hook output
 *
 * Response to a hook_callback request.
 */
export interface HookOutput {
  hookSpecificOutput: {
    hookEventName?: string;
    permissionDecision?: 'ask' | 'allow' | 'deny';
    permissionDecisionReason?: string;
    [key: string]: unknown; // Allow hook-specific fields
  };
}

/**
 * Success control response
 *
 * Indicates successful handling of a control request.
 */
export interface SuccessResponse {
  type: 'success';
  requestId: string;
  response?: unknown; // HookOutput for hooks, PermissionResult for can_use_tool
}

/**
 * Error control response
 *
 * Indicates an error occurred while handling a control request.
 */
export interface ErrorResponse {
  type: 'error';
  requestId: string;
  error?: string;
}

/**
 * Control response discriminated union
 *
 * Response sent by SDK to Claude CLI in response to control requests.
 */
export type ControlResponse = SuccessResponse | ErrorResponse;

/**
 * Hook configuration
 *
 * Sent during initialization to register hooks.
 *
 * @example
 * ```typescript
 * const hooks: HookConfig = {
 *   preToolUse: {
 *     enabled: true
 *   }
 * };
 * ```
 */
export interface HookConfig {
  preToolUse?: {
    enabled: boolean;
  };
  [key: string]: unknown; // Allow other hook types
}

/**
 * SDK control request
 *
 * Requests sent from SDK to Claude CLI (opposite direction of ControlRequest).
 */
export interface SdkControlRequest {
  type: 'sdk_control_request';
  request: {
    type: 'initialize' | 'set_permission_mode';
    hooks?: HookConfig;
    mode?: PermissionMode;
  };
}

/**
 * Control message for interrupting execution
 *
 * Sent to Claude CLI to request stopping the current operation.
 * Claude handles the interrupt gracefully - it may finish the current
 * tool operation before stopping.
 *
 * @example
 * ```json
 * {
 *   "type": "control",
 *   "control": { "type": "interrupt" }
 * }
 * ```
 */
export interface ControlMessage {
  type: 'control';
  control: {
    type: 'interrupt';
  };
}
