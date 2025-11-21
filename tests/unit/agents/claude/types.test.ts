/**
 * Type Tests for Claude Code Types
 *
 * Tests discriminated unions, type narrowing, and exhaustiveness checking.
 */

import { describe, it, expect } from 'vitest';
import type {
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
  ClaudeCodeConfig,
} from '@/agents/claude/types';

describe('Claude Types', () => {
  describe('Message Types', () => {
    it('should handle SystemMessage', () => {
      const msg: SystemMessage = {
        type: 'system',
        subtype: 'init',
        sessionId: 'sess-123',
        model: 'claude-sonnet-4',
        mcpServers: [{ name: 'filesystem', status: 'connected' }],
      };

      expect(msg.type).toBe('system');
      expect(msg.sessionId).toBe('sess-123');
    });

    it('should handle UserMessage with string content', () => {
      const msg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: 'List files',
        },
        sessionId: 'sess-123',
      };

      expect(msg.type).toBe('user');
      expect(msg.message.role).toBe('user');
      expect(msg.message.content).toBe('List files');
    });

    it('should handle UserMessage with array content', () => {
      const msg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'List files' }],
        },
        sessionId: 'sess-123',
      };

      expect(msg.type).toBe('user');
      expect(Array.isArray(msg.message.content)).toBe(true);
    });

    it('should handle AssistantMessage with text', () => {
      const msg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: "I'll list the files..." }],
        },
        sessionId: 'sess-123',
      };

      expect(msg.type).toBe('assistant');
      expect(msg.message.role).toBe('assistant');
      expect(msg.message.content[0].type).toBe('text');
    });

    it('should handle AssistantMessage with tool use', () => {
      const msg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-123',
              name: 'Bash',
              input: { command: 'ls -la' },
            },
          ],
        },
        sessionId: 'sess-123',
      };

      expect(msg.type).toBe('assistant');
      const toolUse = msg.message.content[0] as ToolUseBlock;
      expect(toolUse.type).toBe('tool_use');
      expect(toolUse.name).toBe('Bash');
    });

    it('should handle ToolUseMessage started', () => {
      const msg: ToolUseMessage = {
        type: 'tool_use',
        subtype: 'started',
        toolUseId: 'tool-123',
        toolName: 'Bash',
        sessionId: 'sess-123',
      };

      expect(msg.type).toBe('tool_use');
      expect(msg.subtype).toBe('started');
      expect(msg.toolUseId).toBe('tool-123');
    });

    it('should handle ToolUseMessage completed', () => {
      const msg: ToolUseMessage = {
        type: 'tool_use',
        subtype: 'completed',
        toolUseId: 'tool-123',
        toolResult: { stdout: 'file1.txt\nfile2.txt', exitCode: 0 },
        sessionId: 'sess-123',
      };

      expect(msg.type).toBe('tool_use');
      expect(msg.subtype).toBe('completed');
      expect(msg.toolResult).toBeDefined();
    });

    it('should handle ResultMessage success', () => {
      const msg: ResultMessage = {
        type: 'result',
        isError: false,
        durationMs: 1234,
        sessionId: 'sess-123',
      };

      expect(msg.type).toBe('result');
      expect(msg.isError).toBe(false);
    });

    it('should handle ResultMessage error', () => {
      const msg: ResultMessage = {
        type: 'result',
        isError: true,
        result: { error: 'Command failed' },
        sessionId: 'sess-123',
      };

      expect(msg.type).toBe('result');
      expect(msg.isError).toBe(true);
      expect(msg.result).toBeDefined();
    });

    it('should handle ControlRequestMessage', () => {
      const msg: ControlRequestMessage = {
        type: 'control_request',
        requestId: 'req-123',
        request: {
          type: 'can_use_tool',
          toolName: 'Bash',
          input: { command: 'ls' },
        },
      };

      expect(msg.type).toBe('control_request');
      expect(msg.requestId).toBe('req-123');
    });

    it('should handle ControlResponseMessage', () => {
      const msg: ControlResponseMessage = {
        type: 'control_response',
        response: {
          type: 'success',
          requestId: 'req-123',
          response: { result: 'allow' },
        },
      };

      expect(msg.type).toBe('control_response');
    });
  });

  describe('Content Blocks', () => {
    it('should handle TextBlock', () => {
      const block: TextBlock = {
        type: 'text',
        text: 'Hello world',
      };

      expect(block.type).toBe('text');
      expect(block.text).toBe('Hello world');
    });

    it('should handle ToolUseBlock', () => {
      const block: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-123',
        name: 'Bash',
        input: { command: 'echo test' },
      };

      expect(block.type).toBe('tool_use');
      expect(block.id).toBe('tool-123');
      expect(block.name).toBe('Bash');
    });

    it('should narrow ContentBlock union', () => {
      const block: ContentBlock = {
        type: 'text',
        text: 'Hello',
      };

      if (block.type === 'text') {
        // TypeScript should know this is TextBlock
        expect(block.text).toBe('Hello');
      } else {
        // TypeScript should know this is ToolUseBlock
        expect(block.name).toBeDefined();
      }
    });
  });

  describe('Control Protocol Types', () => {
    it('should handle CanUseToolRequest', () => {
      const request: CanUseToolRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'rm -rf /' },
        permissionSuggestions: [
          {
            updateType: 'set_mode',
            mode: 'ask',
            destination: 'session',
          },
        ],
      };

      expect(request.type).toBe('can_use_tool');
      expect(request.toolName).toBe('Bash');
    });

    it('should handle HookCallbackRequest without toolUseId', () => {
      const request: HookCallbackRequest = {
        type: 'hook_callback',
        callbackId: 'cb-123',
        input: {},
      };

      expect(request.type).toBe('hook_callback');
      expect(request.callbackId).toBe('cb-123');
      expect(request.toolUseId).toBeUndefined();
    });

    it('should handle HookCallbackRequest with toolUseId', () => {
      const request: HookCallbackRequest = {
        type: 'hook_callback',
        callbackId: 'cb-123',
        input: {},
        toolUseId: 'tool-456',
      };

      expect(request.type).toBe('hook_callback');
      expect(request.toolUseId).toBe('tool-456');
    });

    it('should narrow ControlRequest union', () => {
      const request: ControlRequest = {
        type: 'can_use_tool',
        toolName: 'Bash',
        input: { command: 'ls' },
      };

      if (request.type === 'can_use_tool') {
        // TypeScript knows this is CanUseToolRequest
        expect(request.toolName).toBe('Bash');
      } else {
        // TypeScript knows this is HookCallbackRequest
        expect(request.callbackId).toBeDefined();
      }
    });

    it('should handle AllowResult', () => {
      const result: AllowResult = {
        result: 'allow',
        updatedInput: { command: 'ls' },
        updatedPermissions: [
          {
            updateType: 'set_mode',
            mode: 'bypass_permissions',
            destination: 'session',
          },
        ],
      };

      expect(result.result).toBe('allow');
    });

    it('should handle DenyResult', () => {
      const result: DenyResult = {
        result: 'deny',
        message: 'Dangerous command not allowed',
        interrupt: false,
      };

      expect(result.result).toBe('deny');
      expect(result.message).toBeDefined();
    });

    it('should narrow PermissionResult union', () => {
      const result: PermissionResult = {
        result: 'allow',
        updatedInput: { command: 'ls' },
      };

      if (result.result === 'allow') {
        // TypeScript knows this is AllowResult
        expect(result.updatedInput).toBeDefined();
      } else {
        // TypeScript knows this is DenyResult
        expect(result.message).toBeDefined();
      }
    });

    it('should handle SuccessResponse', () => {
      const response: SuccessResponse = {
        type: 'success',
        requestId: 'req-123',
        response: { result: 'allow' },
      };

      expect(response.type).toBe('success');
      expect(response.requestId).toBe('req-123');
    });

    it('should handle ErrorResponse', () => {
      const response: ErrorResponse = {
        type: 'error',
        requestId: 'req-123',
        error: 'Invalid request',
      };

      expect(response.type).toBe('error');
      expect(response.error).toBeDefined();
    });

    it('should narrow ControlResponse union', () => {
      const response: ControlResponse = {
        type: 'success',
        requestId: 'req-123',
        response: {},
      };

      if (response.type === 'success') {
        // TypeScript knows this is SuccessResponse
        expect(response.requestId).toBe('req-123');
      } else {
        // TypeScript knows this is ErrorResponse
        expect(response.error).toBeDefined();
      }
    });
  });

  describe('Configuration Types', () => {
    it('should handle minimal ClaudeCodeConfig', () => {
      const config: ClaudeCodeConfig = {
        workDir: '/path/to/project',
      };

      expect(config.workDir).toBe('/path/to/project');
    });

    it('should handle full ClaudeCodeConfig', () => {
      const config: ClaudeCodeConfig = {
        workDir: '/path/to/project',
        executablePath: '/usr/local/bin/claude',
        print: true,
        outputFormat: 'stream-json',
        inputFormat: 'stream-json',
        verbose: true,
        dangerouslySkipPermissions: false,
      };

      expect(config.workDir).toBe('/path/to/project');
      expect(config.executablePath).toBe('/usr/local/bin/claude');
      expect(config.print).toBe(true);
      expect(config.outputFormat).toBe('stream-json');
    });
  });

  describe('Type Narrowing', () => {
    it('should narrow ClaudeStreamMessage discriminated union', () => {
      const messages: ClaudeStreamMessage[] = [
        {
          type: 'system',
          sessionId: 'sess-123',
          model: 'claude-sonnet-4',
        },
        {
          type: 'user',
          message: { role: 'user', content: 'Test' },
          sessionId: 'sess-123',
        },
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Response' }],
          },
          sessionId: 'sess-123',
        },
        {
          type: 'tool_use',
          subtype: 'started',
          toolUseId: 'tool-123',
          toolName: 'Bash',
          sessionId: 'sess-123',
        },
        {
          type: 'result',
          isError: false,
          sessionId: 'sess-123',
        },
        {
          type: 'control_request',
          requestId: 'req-123',
          request: {},
        },
        {
          type: 'control_response',
          response: {},
        },
      ];

      for (const msg of messages) {
        switch (msg.type) {
          case 'system':
            expect(msg.sessionId).toBeDefined();
            break;
          case 'user':
            expect(msg.message.role).toBe('user');
            break;
          case 'assistant':
            expect(msg.message.role).toBe('assistant');
            break;
          case 'tool_use':
            expect(msg.subtype).toBeDefined();
            break;
          case 'result':
            expect(typeof msg.isError).toBe('boolean');
            break;
          case 'control_request':
            expect(msg.requestId).toBeDefined();
            break;
          case 'control_response':
            expect(msg.response).toBeDefined();
            break;
          default: {
            // Exhaustiveness check - should never reach here
            const _exhaustive: never = msg;
            throw new Error(`Unhandled message type: ${_exhaustive}`);
          }
        }
      }
    });
  });

  describe('Type Exports', () => {
    it('should export all message types', () => {
      // Type-only test - if this compiles, exports work
      const _system: SystemMessage = {} as SystemMessage;
      const _user: UserMessage = {} as UserMessage;
      const _assistant: AssistantMessage = {} as AssistantMessage;
      const _toolUse: ToolUseMessage = {} as ToolUseMessage;
      const _result: ResultMessage = {} as ResultMessage;
      const _controlReq: ControlRequestMessage = {} as ControlRequestMessage;
      const _controlRes: ControlResponseMessage =
        {} as ControlResponseMessage;

      expect(true).toBe(true);
    });

    it('should export all control types', () => {
      // Type-only test - if this compiles, exports work
      const _canUse: CanUseToolRequest = {} as CanUseToolRequest;
      const _hook: HookCallbackRequest = {} as HookCallbackRequest;
      const _allow: AllowResult = {} as AllowResult;
      const _deny: DenyResult = {} as DenyResult;
      const _success: SuccessResponse = {} as SuccessResponse;
      const _error: ErrorResponse = {} as ErrorResponse;

      expect(true).toBe(true);
    });

    it('should export config types', () => {
      // Type-only test - if this compiles, exports work
      const _config: ClaudeCodeConfig = {} as ClaudeCodeConfig;

      expect(true).toBe(true);
    });
  });
});
