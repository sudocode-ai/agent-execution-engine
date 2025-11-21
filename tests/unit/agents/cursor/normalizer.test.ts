import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeOutput } from '@/agents/cursor/normalizer/normalizer';
import { CursorNormalizationState } from '@/agents/cursor/normalizer/state';
import type { OutputChunk } from '@/agents/types/agent-executor';
import type {
  CursorSystemMessage,
  CursorUserMessage,
  CursorAssistantMessage,
  CursorThinkingMessage,
  CursorResultMessage,
} from '@/agents/cursor/types/messages';

describe('CursorNormalizationState', () => {
  let state: CursorNormalizationState;

  beforeEach(() => {
    state = new CursorNormalizationState();
  });

  describe('nextIndex', () => {
    it('should return sequential indices starting from 0', () => {
      expect(state.nextIndex()).toBe(0);
      expect(state.nextIndex()).toBe(1);
      expect(state.nextIndex()).toBe(2);
    });
  });

  describe('handleSystemMessage', () => {
    it('should create entry with session ID on first system message', () => {
      const message: CursorSystemMessage = {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-abc123',
        model: 'GPT-5',
      };

      const entry = state.handleSystemMessage(message);

      expect(entry).toBeDefined();
      expect(entry?.type).toEqual({ kind: 'system_message' });
      expect(entry?.content).toContain('Session: sess-abc123');
      expect(entry?.content).toContain('Model: GPT-5');
      expect(entry?.index).toBe(0);
    });

    it('should not report session ID twice', () => {
      const message1: CursorSystemMessage = {
        type: 'system',
        session_id: 'sess-abc123',
      };

      const message2: CursorSystemMessage = {
        type: 'system',
        session_id: 'sess-abc123',
      };

      const entry1 = state.handleSystemMessage(message1);
      const entry2 = state.handleSystemMessage(message2);

      expect(entry1?.content).toContain('Session: sess-abc123');
      expect(entry2).toBeNull(); // Second message has nothing new to report
    });

    it('should not report model twice', () => {
      const message1: CursorSystemMessage = {
        type: 'system',
        model: 'GPT-5',
      };

      const message2: CursorSystemMessage = {
        type: 'system',
        model: 'GPT-5',
      };

      const entry1 = state.handleSystemMessage(message1);
      const entry2 = state.handleSystemMessage(message2);

      expect(entry1?.content).toContain('Model: GPT-5');
      expect(entry2).toBeNull();
    });

    it('should report permission mode', () => {
      const message: CursorSystemMessage = {
        type: 'system',
        permission_mode: 'force',
      };

      const entry = state.handleSystemMessage(message);

      expect(entry?.content).toContain('Mode: force');
    });

    it('should return null if nothing to report', () => {
      const message: CursorSystemMessage = {
        type: 'system',
      };

      const entry = state.handleSystemMessage(message);

      expect(entry).toBeNull();
    });
  });

  describe('handleUserMessage', () => {
    it('should create entry with user prompt content', () => {
      const message: CursorUserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Add login feature' }],
        },
      };

      const entry = state.handleUserMessage(message);

      expect(entry.type).toEqual({ kind: 'user_message' });
      expect(entry.content).toBe('Add login feature');
      expect(entry.index).toBe(0);
    });

    it('should concatenate multiple text blocks', () => {
      const message: CursorUserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'First ' },
            { type: 'text', text: 'Second' },
          ],
        },
      };

      const entry = state.handleUserMessage(message);

      expect(entry.content).toBe('First Second');
    });
  });

  describe('handleAssistantMessage', () => {
    it('should create new entry for first assistant message', () => {
      const message: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: "I'll help you" }],
        },
      };

      const entry = state.handleAssistantMessage(message);

      expect(entry.type).toEqual({ kind: 'assistant_message' });
      expect(entry.content).toBe("I'll help you");
      expect(entry.index).toBe(0);
    });

    it('should coalesce streaming assistant messages into single entry', () => {
      const message1: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello ' }],
        },
      };

      const message2: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'world!' }],
        },
      };

      const entry1 = state.handleAssistantMessage(message1);
      const entry2 = state.handleAssistantMessage(message2);

      // Both entries should have same index
      expect(entry1.index).toBe(0);
      expect(entry2.index).toBe(0);

      // Content should be accumulated
      expect(entry1.content).toBe('Hello ');
      expect(entry2.content).toBe('Hello world!');
    });

    it('should reset coalescing after non-assistant message', () => {
      const assistantMsg1: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'First message' }],
        },
      };

      const userMsg: CursorUserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'User input' }],
        },
      };

      const assistantMsg2: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Second message' }],
        },
      };

      const entry1 = state.handleAssistantMessage(assistantMsg1);
      state.handleUserMessage(userMsg); // This should reset
      const entry3 = state.handleAssistantMessage(assistantMsg2);

      // Should have different indices
      expect(entry1.index).toBe(0);
      expect(entry3.index).toBe(2); // index 1 was used for user message
    });
  });

  describe('handleThinkingMessage', () => {
    it('should create new entry for first thinking message', () => {
      const message: CursorThinkingMessage = {
        type: 'thinking',
        subtype: 'extended',
        text: 'Let me analyze...',
      };

      const entry = state.handleThinkingMessage(message);

      expect(entry).toBeDefined();
      expect(entry?.type).toEqual({ kind: 'thinking' });
      expect(entry?.content).toBe('Let me analyze...');
      expect(entry?.index).toBe(0);
    });

    it('should coalesce streaming thinking messages into single entry', () => {
      const message1: CursorThinkingMessage = {
        type: 'thinking',
        text: 'Thinking ',
      };

      const message2: CursorThinkingMessage = {
        type: 'thinking',
        text: 'more...',
      };

      const entry1 = state.handleThinkingMessage(message1);
      const entry2 = state.handleThinkingMessage(message2);

      // Both entries should have same index
      expect(entry1?.index).toBe(0);
      expect(entry2?.index).toBe(0);

      // Content should be accumulated
      expect(entry1?.content).toBe('Thinking ');
      expect(entry2?.content).toBe('Thinking more...');
    });

    it('should return null for empty thinking message', () => {
      const message: CursorThinkingMessage = {
        type: 'thinking',
      };

      const entry = state.handleThinkingMessage(message);

      expect(entry).toBeNull();
    });

    it('should reset coalescing after non-thinking message', () => {
      const thinkingMsg1: CursorThinkingMessage = {
        type: 'thinking',
        text: 'First thought',
      };

      const assistantMsg: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
        },
      };

      const thinkingMsg2: CursorThinkingMessage = {
        type: 'thinking',
        text: 'Second thought',
      };

      const entry1 = state.handleThinkingMessage(thinkingMsg1);
      state.handleAssistantMessage(assistantMsg);
      const entry3 = state.handleThinkingMessage(thinkingMsg2);

      // Should have different indices
      expect(entry1?.index).toBe(0);
      expect(entry3?.index).toBe(2);
    });
  });

  describe('handleResultMessage', () => {
    it('should return null for success result', () => {
      const message: CursorResultMessage = {
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 5432,
      };

      const entry = state.handleResultMessage(message);

      expect(entry).toBeNull();
    });

    it('should create error entry for failure result', () => {
      const message: CursorResultMessage = {
        type: 'result',
        subtype: 'error',
        is_error: true,
        result: { error: 'Authentication required' },
      };

      const entry = state.handleResultMessage(message);

      expect(entry).toBeDefined();
      expect(entry?.type.kind).toBe('error');
      expect(entry?.content).toContain('Authentication required');
    });

    it('should handle string result in error', () => {
      const message: CursorResultMessage = {
        type: 'result',
        is_error: true,
        result: 'Simple error message',
      };

      const entry = state.handleResultMessage(message);

      expect(entry?.type.kind).toBe('error');
      expect(entry?.content).toBe('Task failed: Simple error message');
    });
  });
});

describe('normalizeOutput', () => {
  async function createOutputStream(
    chunks: Array<{ type: 'stdout' | 'stderr'; data: string }>
  ): Promise<AsyncIterable<OutputChunk>> {
    const outputChunks: OutputChunk[] = chunks.map((chunk) => ({
      type: chunk.type,
      data: Buffer.from(chunk.data),
      timestamp: new Date(),
    }));

    return (async function* () {
      for (const chunk of outputChunks) {
        yield chunk;
      }
    })();
  }

  describe('JSONL parsing', () => {
    it('should parse single-line JSON messages', async () => {
      const systemMsg: CursorSystemMessage = {
        type: 'system',
        session_id: 'sess-123',
        model: 'GPT-5',
      };

      const stream = await createOutputStream([
        { type: 'stdout', data: JSON.stringify(systemMsg) + '\n' },
      ]);

      const entries = [];
      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toEqual({ kind: 'system_message' });
      expect(entries[0].content).toContain('Session: sess-123');
    });

    it('should handle multiple JSON messages in single chunk', async () => {
      const msg1: CursorSystemMessage = {
        type: 'system',
        session_id: 'sess-123',
      };
      const msg2: CursorUserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      };

      const stream = await createOutputStream([
        {
          type: 'stdout',
          data: JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n',
        },
      ]);

      const entries = [];
      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(2);
      expect(entries[0].type.kind).toBe('system_message');
      expect(entries[1].type.kind).toBe('user_message');
    });

    it('should handle split JSON across chunks', async () => {
      const msg: CursorUserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Test message' }],
        },
      };

      const fullJson = JSON.stringify(msg);
      const mid = Math.floor(fullJson.length / 2);

      const stream = await createOutputStream([
        { type: 'stdout', data: fullJson.slice(0, mid) },
        { type: 'stdout', data: fullJson.slice(mid) + '\n' },
      ]);

      const entries = [];
      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe('user_message');
      expect(entries[0].content).toBe('Test message');
    });

    it('should handle non-JSON lines as system messages', async () => {
      const stream = await createOutputStream([
        { type: 'stdout', data: 'Plain text line\n' },
      ]);

      const entries = [];
      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe('system_message');
      expect(entries[0].content).toBe('Plain text line');
    });

    it('should skip empty lines', async () => {
      const msg: CursorUserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Test' }],
        },
      };

      const stream = await createOutputStream([
        { type: 'stdout', data: '\n\n' + JSON.stringify(msg) + '\n\n' },
      ]);

      const entries = [];
      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe('user_message');
    });
  });

  describe('stderr handling', () => {
    it('should detect authentication errors', async () => {
      const stream = await createOutputStream([
        {
          type: 'stderr',
          data: 'Error: not authenticated. Please login or set CURSOR_API_KEY.\n',
        },
      ]);

      const entries = [];
      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe('error');
      if (entries[0].type.kind === 'error') {
        expect(entries[0].type.error.code).toBe('SETUP_REQUIRED');
        expect(entries[0].content).toContain('Authentication required');
      }
    });

    it('should treat non-auth stderr as system messages', async () => {
      const stream = await createOutputStream([
        { type: 'stderr', data: 'Warning: deprecated flag used\n' },
      ]);

      const entries = [];
      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe('system_message');
      expect(entries[0].content).toBe('Warning: deprecated flag used');
    });
  });

  describe('streaming coalescing', () => {
    it('should coalesce multiple assistant messages', async () => {
      const msg1: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello ' }],
        },
      };

      const msg2: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'world' }],
        },
      };

      const msg3: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '!' }],
        },
      };

      const stream = await createOutputStream([
        { type: 'stdout', data: JSON.stringify(msg1) + '\n' },
        { type: 'stdout', data: JSON.stringify(msg2) + '\n' },
        { type: 'stdout', data: JSON.stringify(msg3) + '\n' },
      ]);

      const entries = [];
      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      // Should get 3 entries, all with same index
      expect(entries).toHaveLength(3);
      expect(entries[0].index).toBe(0);
      expect(entries[1].index).toBe(0);
      expect(entries[2].index).toBe(0);

      // Content should accumulate
      expect(entries[0].content).toBe('Hello ');
      expect(entries[1].content).toBe('Hello world');
      expect(entries[2].content).toBe('Hello world!');
    });

    it('should coalesce multiple thinking messages', async () => {
      const msg1: CursorThinkingMessage = {
        type: 'thinking',
        text: 'Analyzing ',
      };

      const msg2: CursorThinkingMessage = {
        type: 'thinking',
        text: 'requirements...',
      };

      const stream = await createOutputStream([
        { type: 'stdout', data: JSON.stringify(msg1) + '\n' },
        { type: 'stdout', data: JSON.stringify(msg2) + '\n' },
      ]);

      const entries = [];
      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(2);
      expect(entries[0].index).toBe(0);
      expect(entries[1].index).toBe(0);
      expect(entries[1].content).toBe('Analyzing requirements...');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete task flow', async () => {
      const systemMsg: CursorSystemMessage = {
        type: 'system',
        session_id: 'sess-123',
        model: 'GPT-5',
        permission_mode: 'force',
      };

      const userMsg: CursorUserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Add login' }],
        },
      };

      const thinkingMsg: CursorThinkingMessage = {
        type: 'thinking',
        text: 'Planning implementation...',
      };

      const assistantMsg1: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: "I'll add " }],
        },
      };

      const assistantMsg2: CursorAssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'a login feature.' }],
        },
      };

      const resultMsg: CursorResultMessage = {
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 1234,
      };

      const stream = await createOutputStream([
        { type: 'stdout', data: JSON.stringify(systemMsg) + '\n' },
        { type: 'stdout', data: JSON.stringify(userMsg) + '\n' },
        { type: 'stdout', data: JSON.stringify(thinkingMsg) + '\n' },
        { type: 'stdout', data: JSON.stringify(assistantMsg1) + '\n' },
        { type: 'stdout', data: JSON.stringify(assistantMsg2) + '\n' },
        { type: 'stdout', data: JSON.stringify(resultMsg) + '\n' },
      ]);

      const entries = [];
      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      // System, user, thinking, assistant (2 coalesced), result (no entry)
      expect(entries.length).toBeGreaterThanOrEqual(4);

      expect(entries[0].type.kind).toBe('system_message');
      expect(entries[0].content).toContain('Session: sess-123');

      expect(entries[1].type.kind).toBe('user_message');
      expect(entries[1].content).toBe('Add login');

      expect(entries[2].type.kind).toBe('thinking');
      expect(entries[2].content).toBe('Planning implementation...');

      expect(entries[3].type.kind).toBe('assistant_message');
      expect(entries[4].type.kind).toBe('assistant_message');
      expect(entries[4].content).toBe("I'll add a login feature.");
    });
  });
});
