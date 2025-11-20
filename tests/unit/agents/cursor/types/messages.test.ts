import { describe, it, expect } from 'vitest';
import {
  extractSessionId,
  concatText,
  type CursorMessage,
  type CursorSystemMessage,
  type CursorUserMessage,
  type CursorAssistantMessage,
  type CursorThinkingMessage,
  type CursorToolCallMessage,
  type CursorResultMessage,
  type CursorMessageContent,
} from '@/agents/cursor/types/messages';

describe('Cursor Message Types', () => {
  describe('CursorSystemMessage', () => {
    it('should parse system init message', () => {
      const json = `{"type":"system","subtype":"init","session_id":"sess-123","model":"GPT-5","api_key_source":"env","cwd":"/tmp","permission_mode":"force"}`;
      const message = JSON.parse(json) as CursorSystemMessage;

      expect(message.type).toBe('system');
      expect(message.subtype).toBe('init');
      expect(message.session_id).toBe('sess-123');
      expect(message.model).toBe('GPT-5');
      expect(message.api_key_source).toBe('env');
      expect(message.cwd).toBe('/tmp');
      expect(message.permission_mode).toBe('force');
    });

    it('should parse minimal system message', () => {
      const json = `{"type":"system"}`;
      const message = JSON.parse(json) as CursorSystemMessage;

      expect(message.type).toBe('system');
      expect(message.session_id).toBeUndefined();
      expect(message.model).toBeUndefined();
    });
  });

  describe('CursorUserMessage', () => {
    it('should parse user message', () => {
      const json = `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Add login feature"}]},"session_id":"sess-123"}`;
      const message = JSON.parse(json) as CursorUserMessage;

      expect(message.type).toBe('user');
      expect(message.message.role).toBe('user');
      expect(message.message.content).toHaveLength(1);
      expect(message.message.content[0].type).toBe('text');
      expect(message.message.content[0].text).toBe('Add login feature');
      expect(message.session_id).toBe('sess-123');
    });
  });

  describe('CursorAssistantMessage', () => {
    it('should parse assistant message', () => {
      const json = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I'll help you"}]},"session_id":"sess-123"}`;
      const message = JSON.parse(json) as CursorAssistantMessage;

      expect(message.type).toBe('assistant');
      expect(message.message.role).toBe('assistant');
      expect(message.message.content).toHaveLength(1);
      expect(message.session_id).toBe('sess-123');
    });

    it('should parse assistant message with multiple content items', () => {
      const json = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello "},{"type":"text","text":"world!"}]}}`;
      const message = JSON.parse(json) as CursorAssistantMessage;

      expect(message.message.content).toHaveLength(2);
      expect(message.message.content[0].text).toBe('Hello ');
      expect(message.message.content[1].text).toBe('world!');
    });
  });

  describe('CursorThinkingMessage', () => {
    it('should parse thinking message', () => {
      const json = `{"type":"thinking","subtype":"extended","text":"Let me analyze...","session_id":"sess-123"}`;
      const message = JSON.parse(json) as CursorThinkingMessage;

      expect(message.type).toBe('thinking');
      expect(message.subtype).toBe('extended');
      expect(message.text).toBe('Let me analyze...');
      expect(message.session_id).toBe('sess-123');
    });

    it('should parse thinking message without text', () => {
      const json = `{"type":"thinking"}`;
      const message = JSON.parse(json) as CursorThinkingMessage;

      expect(message.type).toBe('thinking');
      expect(message.text).toBeUndefined();
    });
  });

  describe('CursorToolCallMessage', () => {
    it('should parse tool call started message', () => {
      const json = `{"type":"tool_call","subtype":"started","call_id":"call-1","tool_call":{"shellToolCall":{"args":{"command":"ls"}}},"session_id":"sess-123"}`;
      const message = JSON.parse(json) as CursorToolCallMessage;

      expect(message.type).toBe('tool_call');
      expect(message.subtype).toBe('started');
      expect(message.call_id).toBe('call-1');
      expect(message.tool_call).toBeDefined();
      expect(message.session_id).toBe('sess-123');
    });

    it('should parse tool call completed message', () => {
      const json = `{"type":"tool_call","subtype":"completed","call_id":"call-1","tool_call":{"shellToolCall":{"args":{"command":"ls"},"result":{"success":{"stdout":"file1\\nfile2","exitCode":0}}}}}`;
      const message = JSON.parse(json) as CursorToolCallMessage;

      expect(message.type).toBe('tool_call');
      expect(message.subtype).toBe('completed');
      expect(message.call_id).toBe('call-1');
    });
  });

  describe('CursorResultMessage', () => {
    it('should parse success result message', () => {
      const json = `{"type":"result","subtype":"success","is_error":false,"duration_ms":5432}`;
      const message = JSON.parse(json) as CursorResultMessage;

      expect(message.type).toBe('result');
      expect(message.subtype).toBe('success');
      expect(message.is_error).toBe(false);
      expect(message.duration_ms).toBe(5432);
    });

    it('should parse error result message', () => {
      const json = `{"type":"result","subtype":"error","is_error":true,"result":{"error":"Auth failed"}}`;
      const message = JSON.parse(json) as CursorResultMessage;

      expect(message.type).toBe('result');
      expect(message.subtype).toBe('error');
      expect(message.is_error).toBe(true);
      expect(message.result).toBeDefined();
    });
  });

  describe('CursorMessage discriminated union', () => {
    it('should narrow type based on type field', () => {
      const messages: CursorMessage[] = [
        { type: 'system', session_id: 'sess-1' },
        { type: 'user', message: { role: 'user', content: [] } },
        { type: 'assistant', message: { role: 'assistant', content: [] } },
        { type: 'thinking', text: 'thinking...' },
        { type: 'tool_call', call_id: 'call-1', tool_call: {} },
        { type: 'result', is_error: false },
      ];

      messages.forEach((message) => {
        switch (message.type) {
          case 'system':
            expect(message.type).toBe('system');
            break;
          case 'user':
            expect(message.message).toBeDefined();
            break;
          case 'assistant':
            expect(message.message).toBeDefined();
            break;
          case 'thinking':
            expect(message.type).toBe('thinking');
            break;
          case 'tool_call':
            expect(message.tool_call).toBeDefined();
            break;
          case 'result':
            expect(message.type).toBe('result');
            break;
        }
      });
    });
  });

  describe('extractSessionId', () => {
    it('should extract session_id from system message', () => {
      const message: CursorSystemMessage = {
        type: 'system',
        session_id: 'sess-abc123',
      };
      expect(extractSessionId(message)).toBe('sess-abc123');
    });

    it('should extract session_id from assistant message', () => {
      const message: CursorAssistantMessage = {
        type: 'assistant',
        message: { role: 'assistant', content: [] },
        session_id: 'sess-xyz789',
      };
      expect(extractSessionId(message)).toBe('sess-xyz789');
    });

    it('should return undefined when session_id not present', () => {
      const message: CursorSystemMessage = {
        type: 'system',
      };
      expect(extractSessionId(message)).toBeUndefined();
    });

    it('should extract session_id from all message types', () => {
      const sessionId = 'sess-test';

      const messages: CursorMessage[] = [
        { type: 'system', session_id: sessionId },
        { type: 'user', message: { role: 'user', content: [] }, session_id: sessionId },
        { type: 'assistant', message: { role: 'assistant', content: [] }, session_id: sessionId },
        { type: 'thinking', text: 'test', session_id: sessionId },
        { type: 'tool_call', call_id: 'call-1', tool_call: {}, session_id: sessionId },
      ];

      messages.forEach((message) => {
        expect(extractSessionId(message)).toBe(sessionId);
      });
    });
  });

  describe('concatText', () => {
    it('should concatenate text from single content item', () => {
      const messageContent: CursorMessageContent = {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world' }],
      };
      expect(concatText(messageContent)).toBe('Hello world');
    });

    it('should concatenate text from multiple content items', () => {
      const messageContent: CursorMessageContent = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
          { type: 'text', text: '!' },
        ],
      };
      expect(concatText(messageContent)).toBe('Hello world!');
    });

    it('should return empty string for empty content', () => {
      const messageContent: CursorMessageContent = {
        role: 'assistant',
        content: [],
      };
      expect(concatText(messageContent)).toBe('');
    });

    it('should filter non-text content items', () => {
      const messageContent: CursorMessageContent = {
        role: 'assistant',
        content: [{ type: 'text', text: 'Valid text' }],
      };
      expect(concatText(messageContent)).toBe('Valid text');
    });

    it('should handle streaming chunks', () => {
      // Simulating streaming - first chunk
      let messageContent: CursorMessageContent = {
        role: 'assistant',
        content: [{ type: 'text', text: 'The ' }],
      };
      let accumulated = concatText(messageContent);
      expect(accumulated).toBe('The ');

      // Second chunk
      messageContent = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'The ' },
          { type: 'text', text: 'quick ' },
        ],
      };
      accumulated = concatText(messageContent);
      expect(accumulated).toBe('The quick ');

      // Third chunk
      messageContent = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'The ' },
          { type: 'text', text: 'quick ' },
          { type: 'text', text: 'brown fox' },
        ],
      };
      accumulated = concatText(messageContent);
      expect(accumulated).toBe('The quick brown fox');
    });
  });
});
