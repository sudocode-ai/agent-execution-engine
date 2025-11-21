/**
 * ClaudeAgentClient Tests
 *
 * Tests for approval handling and hook callback logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeAgentClient } from '@/agents/claude/protocol/client';
import type {
  CanUseToolRequest,
  HookCallbackRequest,
  PermissionResult,
  HookOutput,
} from '@/agents/claude/types/control';
import type {
  IApprovalService,
  ApprovalRequest,
  ApprovalDecision,
} from '@/agents/types/agent-executor';

describe('ClaudeAgentClient', () => {
  describe('Auto-approve (no service)', () => {
    it('should auto-approve when no service set', async () => {
      const client = new ClaudeAgentClient();

      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      const response = await client.handleControlRequest(request, 'req-123');

      expect(response.type).toBe('success');
      expect(response.requestId).toBe('req-123');

      const permissionResult = response.response as PermissionResult;
      expect(permissionResult.result).toBe('allow');
    });

    it('should auto-approve all tools', async () => {
      const client = new ClaudeAgentClient();

      const tools = ['Bash', 'Edit', 'Read', 'Write', 'mcp:fs:read_file'];

      for (const toolName of tools) {
        const request: CanUseToolRequest = {
          type: 'can_use_tool',
          toolName,
          input: {},
        };

        const response = await client.handleControlRequest(
          request,
          `req-${toolName}`
        );
        const permissionResult = response.response as PermissionResult;
        expect(permissionResult.result).toBe('allow');
      }
    });
  });

  describe('With approval service', () => {
    let mockService: IApprovalService;
    let client: ClaudeAgentClient;

    beforeEach(() => {
      mockService = {
        requestApproval: vi.fn(),
      };
      client = new ClaudeAgentClient(mockService);
    });

    it('should delegate to approval service', async () => {
      vi.mocked(mockService.requestApproval).mockResolvedValue({
        status: 'approved',
      });

      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      const response = await client.handleControlRequest(request, 'req-123');

      expect(mockService.requestApproval).toHaveBeenCalledWith({
        requestId: 'req-123',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
      });

      const permissionResult = response.response as PermissionResult;
      expect(permissionResult.result).toBe('allow');
    });

    it('should handle approval', async () => {
      vi.mocked(mockService.requestApproval).mockResolvedValue({
        status: 'approved',
      });

      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Edit',
        input: { file_path: '/test.ts', old_string: 'a', new_string: 'b' },
      };

      const response = await client.handleControlRequest(request, 'req-456');

      const permissionResult = response.response as PermissionResult;
      expect(permissionResult.result).toBe('allow');
    });

    it('should handle denial with reason', async () => {
      vi.mocked(mockService.requestApproval).mockResolvedValue({
        status: 'denied',
        reason: 'Dangerous command',
      });

      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'rm -rf /' },
      };

      const response = await client.handleControlRequest(request, 'req-789');

      const permissionResult = response.response as PermissionResult;
      expect(permissionResult.result).toBe('deny');
      if (permissionResult.result === 'deny') {
        expect(permissionResult.message).toBe('Dangerous command');
        expect(permissionResult.interrupt).toBe(false);
      }
    });

    it('should handle denial without reason', async () => {
      vi.mocked(mockService.requestApproval).mockResolvedValue({
        status: 'denied',
      });

      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      const response = await client.handleControlRequest(request, 'req-abc');

      const permissionResult = response.response as PermissionResult;
      expect(permissionResult.result).toBe('deny');
      if (permissionResult.result === 'deny') {
        expect(permissionResult.message).toBe('Tool use denied');
      }
    });

    it('should handle timeout', async () => {
      vi.mocked(mockService.requestApproval).mockResolvedValue({
        status: 'timeout',
      });

      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      const response = await client.handleControlRequest(request, 'req-def');

      const permissionResult = response.response as PermissionResult;
      expect(permissionResult.result).toBe('deny');
      if (permissionResult.result === 'deny') {
        expect(permissionResult.message).toBe('Approval request timed out');
      }
    });

    it('should handle service errors', async () => {
      vi.mocked(mockService.requestApproval).mockRejectedValue(
        new Error('Service error')
      );

      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      const response = await client.handleControlRequest(request, 'req-err');

      expect(response.type).toBe('error');
      expect(response.requestId).toBe('req-err');
      expect(response.error).toBe('Service error');
    });
  });

  describe('Hook callbacks', () => {
    it('should handle hook callback without tool_use_id', async () => {
      const client = new ClaudeAgentClient();

      const request: HookCallbackRequest = {
        type: 'hook_callback',
        callbackId: 'cb-123',
        input: {},
      };

      const response = await client.handleControlRequest(request, 'req-123');

      expect(response.type).toBe('success');
      const hookOutput = response.response as HookOutput;
      expect(hookOutput.hookSpecificOutput.permissionDecision).toBe('ask');
    });

    it('should store tool_use_id from hook callback', async () => {
      const mockService: IApprovalService = {
        requestApproval: vi.fn().mockResolvedValue({ status: 'approved' }),
      };
      const client = new ClaudeAgentClient(mockService);

      // Simulate PreToolUse hook callback
      const hookRequest: HookCallbackRequest = {
        type: 'hook_callback',
        callbackId: 'cb-123',
        input: {},
        toolUseId: 'tool-456', // PreToolUse hook includes tool_use_id
      };

      await client.handleControlRequest(hookRequest, 'req-hook');

      // Now simulate can_use_tool request with same requestId
      const toolRequest: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      await client.handleControlRequest(toolRequest, 'req-hook');

      // Verify approval service was called with tool_use_id
      expect(mockService.requestApproval).toHaveBeenCalledWith({
        requestId: 'tool-456', // Should use tool_use_id from hook
        toolName: 'Bash',
        toolInput: { command: 'ls' },
      });
    });

    it('should clean up tool_use_id after use', async () => {
      const mockService: IApprovalService = {
        requestApproval: vi.fn().mockResolvedValue({ status: 'approved' }),
      };
      const client = new ClaudeAgentClient(mockService);

      // Store tool_use_id
      const hookRequest: HookCallbackRequest = {
        type: 'hook_callback',
        callbackId: 'cb-123',
        input: {},
        toolUseId: 'tool-456',
      };

      await client.handleControlRequest(hookRequest, 'req-hook');

      // Use tool_use_id
      const toolRequest: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      await client.handleControlRequest(toolRequest, 'req-hook');

      // Verify first call used tool_use_id
      expect(mockService.requestApproval).toHaveBeenCalledWith({
        requestId: 'tool-456',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
      });

      // Second call with same requestId should not have tool_use_id
      vi.mocked(mockService.requestApproval).mockClear();
      await client.handleControlRequest(toolRequest, 'req-hook');

      expect(mockService.requestApproval).toHaveBeenCalledWith({
        requestId: 'req-hook', // No tool_use_id anymore
        toolName: 'Bash',
        toolInput: { command: 'ls' },
      });
    });
  });

  describe('ExitPlanMode special case', () => {
    it('should switch to bypass permissions for ExitPlanMode', async () => {
      const client = new ClaudeAgentClient();

      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'ExitPlanMode',
        input: {},
      };

      const response = await client.handleControlRequest(request, 'req-123');

      const permissionResult = response.response as PermissionResult;
      expect(permissionResult.result).toBe('allow');
      if (permissionResult.result === 'allow') {
        expect(permissionResult.updatedPermissions).toBeDefined();
        expect(permissionResult.updatedPermissions).toHaveLength(1);
        expect(permissionResult.updatedPermissions![0]).toEqual({
          updateType: 'set_mode',
          mode: 'bypass_permissions',
          destination: 'session',
        });
      }
    });

    it('should switch to bypass even with approval service set', async () => {
      const mockService: IApprovalService = {
        requestApproval: vi.fn(),
      };
      const client = new ClaudeAgentClient(mockService);

      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'ExitPlanMode',
        input: {},
      };

      await client.handleControlRequest(request, 'req-123');

      // Should NOT call approval service for ExitPlanMode
      expect(mockService.requestApproval).not.toHaveBeenCalled();
    });
  });

  describe('setApprovalService', () => {
    it('should allow setting approval service after construction', async () => {
      const client = new ClaudeAgentClient();

      // Initially auto-approves
      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      let response = await client.handleControlRequest(request, 'req-1');
      let permissionResult = response.response as PermissionResult;
      expect(permissionResult.result).toBe('allow');

      // Set approval service
      const mockService: IApprovalService = {
        requestApproval: vi.fn().mockResolvedValue({ status: 'denied' }),
      };
      client.setApprovalService(mockService);

      // Now uses service
      response = await client.handleControlRequest(request, 'req-2');
      expect(mockService.requestApproval).toHaveBeenCalled();
      permissionResult = response.response as PermissionResult;
      expect(permissionResult.result).toBe('deny');
    });

    it('should allow unsetting approval service', async () => {
      const mockService: IApprovalService = {
        requestApproval: vi.fn().mockResolvedValue({ status: 'denied' }),
      };
      const client = new ClaudeAgentClient(mockService);

      // Initially uses service
      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      let response = await client.handleControlRequest(request, 'req-1');
      expect(mockService.requestApproval).toHaveBeenCalled();

      // Unset service
      client.setApprovalService(undefined);

      // Now auto-approves
      response = await client.handleControlRequest(request, 'req-2');
      const permissionResult = response.response as PermissionResult;
      expect(permissionResult.result).toBe('allow');
    });
  });

  describe('Error handling', () => {
    it('should handle unknown request type', async () => {
      const client = new ClaudeAgentClient();

      const request = {
        type: 'unknown_type',
      } as unknown as CanUseToolRequest;

      const response = await client.handleControlRequest(request, 'req-123');

      expect(response.type).toBe('error');
      expect(response.error).toContain('Unknown control request type');
    });
  });
});
