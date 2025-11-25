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
  ToolUseMessage,
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

  describe('Tool Completion', () => {
    it('should update tool status to success on completion', () => {
      const state = createNormalizerState();

      // First, create the tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-456',
              name: 'Bash',
              input: { command: 'echo hello' },
            },
          ],
        },
      };

      const startEntry = normalizeMessage(toolUseMsg, workDir, state);
      expect(startEntry!.type.kind).toBe('tool_use');
      if (startEntry!.type.kind === 'tool_use') {
        expect(startEntry!.type.tool.status).toBe('running');
      }

      // Now send the completion message
      const completionMsg: ToolUseMessage = {
        type: 'tool_use',
        subtype: 'completed',
        toolUseId: 'tool-456',
        toolName: 'Bash',
        toolResult: { stdout: 'hello\n', exitCode: 0 },
      };

      const completedEntry = normalizeMessage(completionMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.index).toBe(startEntry!.index); // Same index
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('success');
        expect(completedEntry!.type.tool.result).toBeDefined();
        expect(completedEntry!.type.tool.result!.success).toBe(true);
      }
    });

    it('should update tool status to failed on non-zero exit code', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-789',
              name: 'Bash',
              input: { command: 'exit 1' },
            },
          ],
        },
      };

      normalizeMessage(toolUseMsg, workDir, state);

      // Send completion with non-zero exit code
      const completionMsg: ToolUseMessage = {
        type: 'tool_use',
        subtype: 'completed',
        toolUseId: 'tool-789',
        toolName: 'Bash',
        toolResult: { stderr: 'error', exitCode: 1 },
      };

      const completedEntry = normalizeMessage(completionMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('failed');
        expect(completedEntry!.type.tool.result!.success).toBe(false);
        expect(completedEntry!.type.tool.result!.error).toContain('exit');
      }
    });

    it('should update tool status to failed on error result', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-error',
              name: 'Read',
              input: { file_path: '/nonexistent' },
            },
          ],
        },
      };

      normalizeMessage(toolUseMsg, workDir, state);

      // Send completion with error
      const completionMsg: ToolUseMessage = {
        type: 'tool_use',
        subtype: 'completed',
        toolUseId: 'tool-error',
        toolName: 'Read',
        toolResult: { error: 'File not found' },
      };

      const completedEntry = normalizeMessage(completionMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('failed');
        expect(completedEntry!.type.tool.result!.success).toBe(false);
        expect(completedEntry!.type.tool.result!.error).toBe('File not found');
      }
    });

    it('should skip started subtype events', () => {
      const state = createNormalizerState();

      const startedMsg: ToolUseMessage = {
        type: 'tool_use',
        subtype: 'started',
        toolUseId: 'tool-started',
        toolName: 'Bash',
      };

      const entry = normalizeMessage(startedMsg, workDir, state);

      expect(entry).toBeNull();
    });

    it('should skip completion if no matching tool_use_id found', () => {
      const state = createNormalizerState();

      // Send completion without prior tool use
      const completionMsg: ToolUseMessage = {
        type: 'tool_use',
        subtype: 'completed',
        toolUseId: 'unknown-tool',
        toolName: 'Bash',
        toolResult: { stdout: 'output' },
      };

      const entry = normalizeMessage(completionMsg, workDir, state);

      expect(entry).toBeNull();
    });

    it('should format result content with stdout/stderr', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-output',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
        },
      };

      normalizeMessage(toolUseMsg, workDir, state);

      // Send completion with stdout
      const completionMsg: ToolUseMessage = {
        type: 'tool_use',
        subtype: 'completed',
        toolUseId: 'tool-output',
        toolName: 'Bash',
        toolResult: { stdout: 'file1.txt\nfile2.txt', exitCode: 0 },
      };

      const completedEntry = normalizeMessage(completionMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.content).toContain('Bash');
      expect(completedEntry!.content).toContain('file1.txt');
      expect(completedEntry!.content).toContain('Exit code: 0');
    });

    it('should handle null/undefined tool result as success', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-null',
              name: 'Edit',
              input: { file_path: '/test/file.ts' },
            },
          ],
        },
      };

      normalizeMessage(toolUseMsg, workDir, state);

      // Send completion with no result
      const completionMsg: ToolUseMessage = {
        type: 'tool_use',
        subtype: 'completed',
        toolUseId: 'tool-null',
        toolName: 'Edit',
        toolResult: undefined,
      };

      const completedEntry = normalizeMessage(completionMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('success');
        expect(completedEntry!.type.tool.result!.success).toBe(true);
      }
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
