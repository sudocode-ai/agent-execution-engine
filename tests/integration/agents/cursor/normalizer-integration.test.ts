/**
 * Integration tests for Cursor normalizer
 *
 * Tests normalizer with realistic JSONL message sequences.
 */

import { describe, it, expect } from 'vitest';
import { normalizeOutput } from '@/agents/cursor/normalizer';
import { extractSessionId } from '@/agents/cursor/types/messages';
import type { OutputChunk } from '@/agents/types/agent-executor';

/**
 * Helper to create async iterable from JSONL strings
 */
async function* createJsonlStream(
  ...messages: string[]
): AsyncIterable<OutputChunk> {
  for (const message of messages) {
    yield {
      type: 'stdout',
      data: Buffer.from(message + '\n'),
      timestamp: new Date(),
    };
  }
}

describe('Cursor Normalizer Integration', () => {
  describe('Complete message sequences', () => {
    it('should handle system → user → assistant sequence', async () => {
      const systemMsg = JSON.stringify({
        type: 'system',
        session_id: 'sess-test-123',
        model: 'GPT-5',
        permission_mode: 'force',
      });

      const userMsg = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      });

      const assistantMsg = JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello! How can I help?' }],
        },
      });

      const stream = createJsonlStream(systemMsg, userMsg, assistantMsg);
      const entries = [];

      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(3);
      expect(entries[0].type.kind).toBe('system_message');
      expect(entries[0].content).toContain('sess-test-123');
      expect(entries[1].type.kind).toBe('user_message');
      expect(entries[1].content).toContain('Hello world');
      expect(entries[2].type.kind).toBe('assistant_message');
      expect(entries[2].content).toContain('How can I help');
    });

    it('should coalesce streaming assistant messages', async () => {
      const chunk1 = JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
        },
      });

      const chunk2 = JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: ' there' }],
        },
      });

      const chunk3 = JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '!' }],
        },
      });

      const stream = createJsonlStream(chunk1, chunk2, chunk3);
      const entries = [];

      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      // All chunks should be coalesced into one entry (same index)
      expect(entries).toHaveLength(3);
      expect(entries[0].index).toBe(entries[1].index);
      expect(entries[1].index).toBe(entries[2].index);

      // Final content should be concatenated
      expect(entries[2].content).toBe('Hello there!');
    });

    it('should handle tool call lifecycle', async () => {
      const toolStarted = JSON.stringify({
        type: 'tool_call',
        subtype: 'started',
        call_id: 'call-123',
        tool_call: {
          shellToolCall: {
            args: {
              command: 'ls -la',
            },
          },
        },
      });

      const toolCompleted = JSON.stringify({
        type: 'tool_call',
        subtype: 'completed',
        call_id: 'call-123',
        tool_call: {
          shellToolCall: {
            args: {
              command: 'ls -la',
            },
            result: {
              success: {
                stdout: 'file1.txt\nfile2.txt',
                stderr: '',
                exitCode: 0,
              },
            },
          },
        },
      });

      const stream = createJsonlStream(toolStarted, toolCompleted);
      const entries = [];

      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(2);

      // First entry: started (running status)
      expect(entries[0].type.kind).toBe('tool_use');
      if (entries[0].type.kind === 'tool_use') {
        expect(entries[0].type.tool.status).toBe('running');
        expect(entries[0].type.tool.toolName).toBe('shell');
      }

      // Second entry: completed (success status, SAME index)
      expect(entries[1].type.kind).toBe('tool_use');
      if (entries[1].type.kind === 'tool_use') {
        expect(entries[1].type.tool.status).toBe('success');
        expect(entries[1].index).toBe(entries[0].index); // Same index!
        expect(entries[1].content).toContain('file1.txt');
      }
    });

    it('should handle thinking messages', async () => {
      const thinking1 = JSON.stringify({
        type: 'thinking',
        text: 'Let me think...',
      });

      const thinking2 = JSON.stringify({
        type: 'thinking',
        text: ' about this problem.',
      });

      const stream = createJsonlStream(thinking1, thinking2);
      const entries = [];

      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(2);
      expect(entries[0].type.kind).toBe('thinking');
      expect(entries[1].type.kind).toBe('thinking');

      // Should coalesce (same index)
      expect(entries[0].index).toBe(entries[1].index);
      expect(entries[1].content).toBe('Let me think... about this problem.');
    });

    it('should handle result messages', async () => {
      const successResult = JSON.stringify({
        type: 'result',
        is_error: false,
        result: 'Task completed successfully',
      });

      const stream = createJsonlStream(successResult);
      const entries = [];

      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      // Success results don't create entries (implicit)
      expect(entries).toHaveLength(0);
    });

    it('should handle error results', async () => {
      const errorResult = JSON.stringify({
        type: 'result',
        is_error: true,
        subtype: 'EXECUTION_ERROR',
        result: 'Command failed',
      });

      const stream = createJsonlStream(errorResult);
      const entries = [];

      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe('error');
      if (entries[0].type.kind === 'error') {
        expect(entries[0].type.error.code).toBe('EXECUTION_ERROR');
        expect(entries[0].content).toContain('Command failed');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle split JSON across chunks', async () => {
      const partialJson =
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]}}';

      // Split JSON in the middle
      const chunk1 = partialJson.slice(0, 50);
      const chunk2 = partialJson.slice(50);

      async function* createSplitStream(): AsyncIterable<OutputChunk> {
        yield {
          type: 'stdout',
          data: Buffer.from(chunk1),
          timestamp: new Date(),
        };
        yield {
          type: 'stdout',
          data: Buffer.from(chunk2 + '\n'),
          timestamp: new Date(),
        };
      }

      const entries = [];
      for await (const entry of normalizeOutput(createSplitStream(), '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe('assistant_message');
      expect(entries[0].content).toBe('Hello');
    });

    it('should handle non-JSON lines as system messages', async () => {
      const nonJson = 'This is plain text output';

      const stream = createJsonlStream(nonJson);
      const entries = [];

      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe('system_message');
      expect(entries[0].content).toBe(nonJson);
    });

    it('should handle authentication error in stderr', async () => {
      async function* createStderrStream(): AsyncIterable<OutputChunk> {
        yield {
          type: 'stderr',
          data: Buffer.from(
            "Authentication required. Please run 'cursor-agent login' first, or set CURSOR_API_KEY environment variable."
          ),
          timestamp: new Date(),
        };
      }

      const entries = [];
      for await (const entry of normalizeOutput(
        createStderrStream(),
        '/tmp'
      )) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe('error');
      if (entries[0].type.kind === 'error') {
        expect(entries[0].type.error.code).toBe('SETUP_REQUIRED');
        expect(entries[0].content).toContain('Authentication required');
      }
    });
  });

  describe('Session ID extraction', () => {
    it('should extract session ID from system message', () => {
      const systemMessage = {
        type: 'system' as const,
        session_id: 'sess-abc123',
        model: 'GPT-5',
      };

      const sessionId = extractSessionId(systemMessage);
      expect(sessionId).toBe('sess-abc123');
    });

    it('should return null for messages without session ID', () => {
      const userMessage = {
        type: 'user' as const,
        message: {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: 'Hello' }],
        },
      };

      const sessionId = extractSessionId(userMessage);
      expect(sessionId).toBeUndefined();
    });
  });

  describe('Real-world scenario', () => {
    it('should handle complete task execution sequence', async () => {
      const messages = [
        // System message
        JSON.stringify({
          type: 'system',
          session_id: 'sess-real-test',
          model: 'GPT-5',
          permission_mode: 'force',
        }),
        // User message
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'List files' }],
          },
        }),
        // Thinking
        JSON.stringify({
          type: 'thinking',
          text: 'I will use the shell command to list files.',
        }),
        // Tool started
        JSON.stringify({
          type: 'tool_call',
          subtype: 'started',
          call_id: 'call-1',
          tool_call: {
            shellToolCall: {
              args: { command: 'ls' },
            },
          },
        }),
        // Tool completed
        JSON.stringify({
          type: 'tool_call',
          subtype: 'completed',
          call_id: 'call-1',
          tool_call: {
            shellToolCall: {
              args: { command: 'ls' },
              result: {
                success: {
                  stdout: 'file1.txt\nfile2.txt',
                  stderr: '',
                  exitCode: 0,
                },
              },
            },
          },
        }),
        // Assistant response
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'I found 2 files: file1.txt and file2.txt' },
            ],
          },
        }),
        // Success result
        JSON.stringify({
          type: 'result',
          is_error: false,
          result: 'Task completed',
        }),
      ];

      const stream = createJsonlStream(...messages);
      const entries = [];

      for await (const entry of normalizeOutput(stream, '/tmp')) {
        entries.push(entry);
      }

      // Should have: system, user, thinking, tool_started, tool_completed, assistant
      // (result success is implicit, no entry)
      expect(entries.length).toBeGreaterThanOrEqual(5);

      // Verify sequence
      const kinds = entries.map((e) => e.type.kind);
      expect(kinds).toContain('system_message');
      expect(kinds).toContain('user_message');
      expect(kinds).toContain('thinking');
      expect(kinds).toContain('tool_use');
      expect(kinds).toContain('assistant_message');
    });
  });
});
