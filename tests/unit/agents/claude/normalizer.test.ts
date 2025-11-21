/**
 * Simplified Normalizer Tests
 *
 * Tests for core Claude stream-json output normalization functionality.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeMessage,
  createNormalizerState,
} from '@/agents/claude/normalizer';
import type {
  SystemMessage,
  UserMessage,
  AssistantMessage,
} from '@/agents/claude/types/messages';

describe('ClaudeOutputNormalizer - Core Functionality', () => {
  const workDir = '/test/project';

  describe('Message Normalization', () => {
    it('should normalize system messages', () => {
      const state = createNormalizerState();
      const message: SystemMessage = {
        type: 'system',
        sessionId: 'sess-123',
        model: 'claude-sonnet-4',
      };

      const entry = normalizeMessage(message, workDir, state);

      expect(entry).toBeDefined();
      expect(entry!.type).toEqual({ kind: 'system_message' });
      expect(entry!.content).toContain('sess-123');
    });

    it('should normalize user messages', () => {
      const state = createNormalizerState();
      const message: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: 'Hello Claude',
        },
      };

      const entry = normalizeMessage(message, workDir, state);

      expect(entry).toBeDefined();
      expect(entry!.type).toEqual({ kind: 'user_message' });
      expect(entry!.content).toBe('Hello Claude');
    });

    it('should normalize assistant messages', () => {
      const state = createNormalizerState();
      const message: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      };

      const entry = normalizeMessage(message, workDir, state);

      expect(entry).toBeDefined();
      expect(entry!.type).toEqual({ kind: 'assistant_message' });
      expect(entry!.content).toBe('Hello world');
    });
  });

  describe('Message Coalescing', () => {
    it('should coalesce streaming assistant messages', () => {
      const state = createNormalizerState();

      const chunk1: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello ' }],
        },
      };
      const chunk2: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'world' }],
        },
      };

      const entry1 = normalizeMessage(chunk1, workDir, state);
      const entry2 = normalizeMessage(chunk2, workDir, state);

      // Both entries should have the same index (coalesced)
      expect(entry1!.index).toBe(entry2!.index);
      expect(entry2!.content).toBe('Hello world');
    });
  });

  describe('Tool Use', () => {
    it('should normalize Bash tool from assistant message', () => {
      const state = createNormalizerState();

      const message: AssistantMessage = {
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
      };

      const entry = normalizeMessage(message, workDir, state);

      expect(entry).toBeDefined();
      expect(entry!.type.kind).toBe('tool_use');
      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.toolName).toBe('Bash');
        expect(entry!.type.tool.status).toBe('running');
        expect(entry!.type.tool.action.kind).toBe('command_run');
      }
    });

    it('should store tool_use_id in state map', () => {
      const state = createNormalizerState();

      const message: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-123',
              name: 'Read',
              input: { file_path: '/test/file.ts' },
            },
          ],
        },
      };

      normalizeMessage(message, workDir, state);

      expect(state.toolUseMap.has('tool-123')).toBe(true);
    });
  });

  describe('State Management', () => {
    it('should increment index for each message', () => {
      const state = createNormalizerState();

      const msg1: UserMessage = {
        type: 'user',
        message: { role: 'user', content: 'First' },
      };
      const msg2: UserMessage = {
        type: 'user',
        message: { role: 'user', content: 'Second' },
      };

      const entry1 = normalizeMessage(msg1, workDir, state);
      const entry2 = normalizeMessage(msg2, workDir, state);

      expect(entry1!.index).toBe(0);
      expect(entry2!.index).toBe(1);
    });

    it('should close active message on user input', () => {
      const state = createNormalizerState();

      const assistantMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Thinking...' }],
        },
      };
      normalizeMessage(assistantMsg, workDir, state);

      const userMsg: UserMessage = {
        type: 'user',
        message: { role: 'user', content: 'Continue' },
      };
      normalizeMessage(userMsg, workDir, state);

      expect(state.activeMessage).toBeNull();
    });
  });

  describe('Control Messages', () => {
    it('should skip control request messages', () => {
      const state = createNormalizerState();

      const message = {
        type: 'control_request',
        requestId: 'req-123',
        request: { type: 'can_use_tool', toolName: 'Bash', input: {} },
      } as any;

      const entry = normalizeMessage(message, workDir, state);

      expect(entry).toBeNull();
    });

    it('should skip control response messages', () => {
      const state = createNormalizerState();

      const message = {
        type: 'control_response',
        response: { result: 'allow' },
      } as any;

      const entry = normalizeMessage(message, workDir, state);

      expect(entry).toBeNull();
    });
  });
});
