import { describe, it, expect } from 'vitest';
import {
  type SessionUpdate,
  type ContentBlock,
  type ToolKind,
  type ToolCallStatus,
  type ToolCall,
  type RequestPermissionOutcome,
  AcpError,
  AcpErrorCode,
} from '@/agents/acp/index.js';

describe('ACP Protocol Types', () => {
  describe('SessionUpdate discriminated union', () => {
    it('should handle AgentMessageChunk variant', () => {
      const update: SessionUpdate = {
        AgentMessageChunk: {
          content: { Text: { text: 'Hello, world!' } },
        },
      };

      if ('AgentMessageChunk' in update) {
        expect(update.AgentMessageChunk.content).toBeDefined();
      }
    });

    it('should handle ToolCall variant', () => {
      const toolCall: ToolCall = {
        id: 'tool-123',
        kind: 'Read',
        title: 'Read main.ts',
        status: 'Pending',
      };

      const update: SessionUpdate = {
        ToolCall: toolCall,
      };

      if ('ToolCall' in update) {
        expect(update.ToolCall.kind).toBe('Read');
      }
    });
  });

  describe('ContentBlock types', () => {
    it('should handle Text content', () => {
      const content: ContentBlock = {
        Text: { text: 'Sample text' },
      };

      if ('Text' in content) {
        expect(content.Text.text).toBe('Sample text');
      }
    });

    it('should handle Image content', () => {
      const content: ContentBlock = {
        Image: { url: 'https://example.com/image.png', mimeType: 'image/png' },
      };

      if ('Image' in content) {
        expect(content.Image.url).toBe('https://example.com/image.png');
      }
    });
  });

  describe('ToolKind enum', () => {
    it('should include all tool types', () => {
      const toolKinds: ToolKind[] = [
        'Read',
        'Edit',
        'Execute',
        'Delete',
        'Search',
        'Fetch',
        'Think',
        'SwitchMode',
        'Move',
        'Other',
      ];

      toolKinds.forEach((kind) => {
        const toolCall: ToolCall = {
          id: 'test',
          kind,
          title: `Test ${kind}`,
          status: 'Pending',
        };

        expect(toolCall.kind).toBe(kind);
      });
    });
  });

  describe('ToolCallStatus enum', () => {
    it('should support all status values', () => {
      const statuses: ToolCallStatus[] = [
        'Pending',
        'InProgress',
        'Completed',
        'Failed',
      ];

      statuses.forEach((status) => {
        const toolCall: ToolCall = {
          id: 'test',
          kind: 'Read',
          title: 'Test',
          status,
        };

        expect(toolCall.status).toBe(status);
      });
    });
  });

  describe('RequestPermissionOutcome discriminated union', () => {
    it('should handle Selected outcome', () => {
      const outcome: RequestPermissionOutcome = {
        Selected: { optionId: 'allow-once-123' },
      };

      if (typeof outcome !== 'string') {
        expect(outcome.Selected.optionId).toBe('allow-once-123');
      }
    });

    it('should handle Cancelled outcome', () => {
      const outcome: RequestPermissionOutcome = 'Cancelled';

      expect(outcome).toBe('Cancelled');
    });
  });

  describe('AcpError', () => {
    it('should create error with code and message', () => {
      const error = new AcpError(
        AcpErrorCode.MethodNotFound,
        'readTextFile not supported'
      );

      expect(error.code).toBe(AcpErrorCode.MethodNotFound);
      expect(error.message).toBe('readTextFile not supported');
      expect(error.name).toBe('AcpError');
    });

    it('should convert to JSON-RPC format', () => {
      const error = new AcpError(
        AcpErrorCode.InvalidParams,
        'Missing required parameter',
        { param: 'sessionId' }
      );

      const jsonRpc = error.toJsonRpc();

      expect(jsonRpc.code).toBe(-32602);
      expect(jsonRpc.message).toBe('Missing required parameter');
      expect(jsonRpc.data).toEqual({ param: 'sessionId' });
    });

    it('should create from JSON-RPC error object', () => {
      const jsonRpcError = {
        code: -32601,
        message: 'Method not found',
        data: { method: 'unknownMethod' },
      };

      const error = AcpError.fromJsonRpc(jsonRpcError);

      expect(error.code).toBe(AcpErrorCode.MethodNotFound);
      expect(error.message).toBe('Method not found');
      expect(error.data).toEqual({ method: 'unknownMethod' });
    });

    it('should handle unknown error codes', () => {
      const jsonRpcError = {
        code: -99999,
        message: 'Unknown error',
      };

      const error = AcpError.fromJsonRpc(jsonRpcError);

      expect(error.code).toBe(AcpErrorCode.InternalError);
    });
  });

  describe('Type exhaustiveness checking', () => {
    it('should require handling all SessionUpdate variants', () => {
      const update: SessionUpdate = {
        AgentMessageChunk: { content: { Text: { text: 'test' } } },
      };

      // This function should force us to handle all variants
      const getUpdateType = (u: SessionUpdate): string => {
        if ('AgentMessageChunk' in u) return 'message';
        if ('AgentThoughtChunk' in u) return 'thought';
        if ('ToolCall' in u) return 'tool-call';
        if ('ToolCallUpdate' in u) return 'tool-update';
        if ('Plan' in u) return 'plan';
        if ('AvailableCommandsUpdate' in u) return 'commands';
        if ('CurrentModeUpdate' in u) return 'mode';
        // TypeScript should error if we miss a variant
        const _exhaustive: never = u;
        return _exhaustive;
      };

      expect(getUpdateType(update)).toBe('message');
    });
  });
});
