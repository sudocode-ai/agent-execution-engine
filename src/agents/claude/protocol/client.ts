/**
 * Claude Agent Client
 *
 * Handles business logic for tool approvals and hook callbacks.
 *
 * @module agents/claude/protocol/client
 */

import type { IProtocolClient } from './protocol-peer.js';
import type {
  ControlRequest,
  ControlResponse,
  CanUseToolRequest,
  HookCallbackRequest,
  PermissionResult,
  HookOutput,
} from '../types/control.js';
import type {
  IApprovalService,
  ApprovalRequest,
  ApprovalDecision,
} from '../../types/agent-executor.js';

/**
 * Claude Agent Client
 *
 * Implements the approval logic for Claude Code tool usage.
 * Integrates with IApprovalService for approval decisions and handles
 * hook callbacks for tracking tool usage IDs.
 *
 * @example Without approval service (auto-approve)
 * ```typescript
 * const client = new ClaudeAgentClient();
 * // All tools will be auto-approved
 * ```
 *
 * @example With approval service
 * ```typescript
 * const approvalService: IApprovalService = {
 *   async requestApproval(request) {
 *     // Show UI or apply rules
 *     return { status: 'approved' };
 *   }
 * };
 *
 * const client = new ClaudeAgentClient(approvalService);
 * ```
 */
export class ClaudeAgentClient implements IProtocolClient {
  private approvalService?: IApprovalService;
  private toolUseIdMap = new Map<string, string>(); // requestId -> tool_use_id

  /**
   * Create a new ClaudeAgentClient
   *
   * @param approvalService - Optional approval service for tool approvals.
   *   If not provided, all tools will be auto-approved.
   */
  constructor(approvalService?: IApprovalService) {
    this.approvalService = approvalService;
  }

  /**
   * Set the approval service
   *
   * @param service - Approval service to use for tool approvals
   */
  setApprovalService(service: IApprovalService | undefined): void {
    this.approvalService = service;
  }

  /**
   * Handle a control request from Claude CLI
   *
   * Routes to appropriate handler based on request type.
   *
   * @param request - Control request (can_use_tool or hook_callback)
   * @param requestId - Request ID for response matching
   * @returns Control response (success or error)
   */
  async handleControlRequest(
    request: ControlRequest,
    requestId: string
  ): Promise<ControlResponse> {
    try {
      let response: unknown;

      if (request.type === 'hook_callback') {
        response = await this.handleHookCallback(request, requestId);
      } else if (request.type === 'can_use_tool') {
        response = await this.handleCanUseTool(request, requestId);
      } else {
        // Unknown request type
        return {
          type: 'error',
          requestId,
          error: `Unknown control request type: ${(request as { type: string }).type}`,
        };
      }

      return {
        type: 'success',
        requestId,
        response,
      };
    } catch (error) {
      return {
        type: 'error',
        requestId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle hook callback request
   *
   * For PreToolUse hooks, stores the tool_use_id for later matching
   * with can_use_tool requests.
   *
   * @param request - Hook callback request
   * @param requestId - Request ID
   * @returns Hook output with 'ask' permission decision
   */
  private async handleHookCallback(
    request: HookCallbackRequest,
    requestId: string
  ): Promise<HookOutput> {
    // Store tool_use_id if present (PreToolUse hook)
    if (request.toolUseId) {
      this.toolUseIdMap.set(requestId, request.toolUseId);
    }

    // Always return 'ask' - actual approval happens in can_use_tool
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: 'Approval required',
      },
    };
  }

  /**
   * Handle can_use_tool request
   *
   * Delegates approval decision to IApprovalService if set, otherwise auto-approves.
   * Handles ExitPlanMode special case by switching to bypass permissions.
   *
   * @param request - Can use tool request
   * @param requestId - Request ID
   * @returns Permission result (allow or deny)
   */
  private async handleCanUseTool(
    request: CanUseToolRequest,
    requestId: string
  ): Promise<PermissionResult> {
    const { toolName, input } = request;

    // Special case: ExitPlanMode should switch to bypass permissions
    if (toolName === 'ExitPlanMode') {
      return {
        result: 'allow',
        updatedPermissions: [
          {
            updateType: 'set_mode',
            mode: 'bypass_permissions',
            destination: 'session',
          },
        ],
      };
    }

    // Auto-approve if no approval service
    if (!this.approvalService) {
      return { result: 'allow' };
    }

    // Get tool_use_id from stored mapping (if available from hook callback)
    const toolUseId = this.toolUseIdMap.get(requestId);

    // Build approval request
    const approvalRequest: ApprovalRequest = {
      requestId: toolUseId || requestId, // Prefer tool_use_id for tracking
      toolName,
      toolInput: input,
    };

    // Request approval from service
    const decision: ApprovalDecision =
      await this.approvalService.requestApproval(approvalRequest);

    // Clean up stored tool_use_id
    if (toolUseId) {
      this.toolUseIdMap.delete(requestId);
    }

    // Convert ApprovalDecision to PermissionResult
    return this.convertApprovalDecision(decision);
  }

  /**
   * Convert ApprovalDecision to PermissionResult
   *
   * Maps the generic approval decision to Claude-specific permission result.
   *
   * @param decision - Approval decision from service
   * @returns Permission result for Claude CLI
   */
  private convertApprovalDecision(
    decision: ApprovalDecision
  ): PermissionResult {
    switch (decision.status) {
      case 'approved':
        return { result: 'allow' };

      case 'denied':
        return {
          result: 'deny',
          message: decision.reason || 'Tool use denied',
          interrupt: false,
        };

      case 'timeout':
        return {
          result: 'deny',
          message: 'Approval request timed out',
          interrupt: false,
        };

      default: {
        // Exhaustiveness check
        const _exhaustive: never = decision;
        return {
          result: 'deny',
          message: `Unknown approval status: ${_exhaustive}`,
          interrupt: false,
        };
      }
    }
  }
}
