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

  describe('Tool Completion via UserMessage', () => {
    it('should parse tool_result block from user message and update tool status to success', () => {
      const state = createNormalizerState();

      // First, create the tool use entry via assistant message
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-user-456',
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

      // Now send the tool result via user message with tool_result block
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-user-456',
              content: [{ type: 'text', text: 'hello\n' }],
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.index).toBe(startEntry!.index); // Same index
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('success');
        expect(completedEntry!.type.tool.toolName).toBe('Bash');
        expect(completedEntry!.type.tool.result).toBeDefined();
        expect(completedEntry!.type.tool.result!.success).toBe(true);
      }
    });

    it('should parse tool_result with is_error flag and set status to failed', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-error-789',
              name: 'Read',
              input: { file_path: '/nonexistent' },
            },
          ],
        },
      };

      normalizeMessage(toolUseMsg, workDir, state);

      // Send tool result with is_error flag
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-error-789',
              content: [{ type: 'text', text: 'File not found: /nonexistent' }],
              is_error: true,
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('failed');
        expect(completedEntry!.type.tool.result!.success).toBe(false);
        expect(completedEntry!.type.tool.result!.error).toContain('File not found');
      }
    });

    it('should parse JSON result content and detect exitCode failure', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-exit-code',
              name: 'Bash',
              input: { command: 'exit 1' },
            },
          ],
        },
      };

      normalizeMessage(toolUseMsg, workDir, state);

      // Send tool result with JSON containing non-zero exitCode
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-exit-code',
              content: [{ type: 'text', text: '{"exitCode": 1, "stderr": "command failed"}' }],
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('failed');
        expect(completedEntry!.type.tool.result!.success).toBe(false);
        expect(completedEntry!.type.tool.result!.error).toContain('exit');
      }
    });

    it('should parse JSON result content and detect error field', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-json-error',
              name: 'Read',
              input: { file_path: '/secret' },
            },
          ],
        },
      };

      normalizeMessage(toolUseMsg, workDir, state);

      // Send tool result with JSON containing error field
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-json-error',
              content: [{ type: 'text', text: '{"error": "Permission denied"}' }],
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('failed');
        expect(completedEntry!.type.tool.result!.success).toBe(false);
        expect(completedEntry!.type.tool.result!.error).toBe('Permission denied');
      }
    });

    it('should skip tool_result if no matching tool_use_id found', () => {
      const state = createNormalizerState();

      // Send tool result without prior tool use
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'unknown-tool-id',
              content: [{ type: 'text', text: 'some result' }],
            },
          ],
        },
      };

      const entry = normalizeMessage(toolResultMsg, workDir, state);

      expect(entry).toBeNull();
    });

    it('should handle plain text (non-JSON) result as success', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-plain-text',
              name: 'Read',
              input: { file_path: '/test/file.txt' },
            },
          ],
        },
      };

      normalizeMessage(toolUseMsg, workDir, state);

      // Send plain text result (not JSON)
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-plain-text',
              content: [{ type: 'text', text: 'File contents here...' }],
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('success');
        expect(completedEntry!.type.tool.result!.success).toBe(true);
        expect(completedEntry!.type.tool.result!.data).toBe('File contents here...');
      }
    });

    it('should handle empty tool_result content as success', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-empty-result',
              name: 'Write',
              input: { file_path: '/test/file.txt', content: 'hello' },
            },
          ],
        },
      };

      normalizeMessage(toolUseMsg, workDir, state);

      // Send empty result content
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-empty-result',
              content: [],
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('success');
        expect(completedEntry!.type.tool.result!.success).toBe(true);
      }
    });

    it('should include metadata in tool result entries', () => {
      const state = createNormalizerState();

      // Setup session
      const systemMsg: SystemMessage = {
        type: 'system',
        sessionId: 'sess-tool-result-123',
        model: 'claude-sonnet-4',
      };
      normalizeMessage(systemMsg, workDir, state);

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-metadata',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
        },
      };
      normalizeMessage(toolUseMsg, workDir, state);

      // Send tool result
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-metadata',
              content: [{ type: 'text', text: 'file1.txt' }],
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.metadata?.sessionId).toBe('sess-tool-result-123');
      expect(completedEntry!.metadata?.model).toBe('claude-sonnet-4');
    });

    it('should handle user message with mixed text and tool_result blocks', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-mixed',
              name: 'Bash',
              input: { command: 'echo test' },
            },
          ],
        },
      };
      normalizeMessage(toolUseMsg, workDir, state);

      // Send user message with tool_result (tool_result takes precedence)
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-mixed',
              content: [{ type: 'text', text: 'test output' }],
            },
          ],
        },
      };

      const entry = normalizeMessage(toolResultMsg, workDir, state);

      // Should be parsed as tool completion, not user message
      expect(entry).toBeDefined();
      expect(entry!.type.kind).toBe('tool_use');
    });

    it('should format tool result content for display', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-format',
              name: 'Bash',
              input: { command: 'ls -la' },
            },
          ],
        },
      };
      normalizeMessage(toolUseMsg, workDir, state);

      // Send tool result
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-format',
              content: [{ type: 'text', text: 'drwxr-xr-x  5 user  staff  160 Nov 25 12:00 .\ndrwxr-xr-x 10 user  staff  320 Nov 25 11:00 ..' }],
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.content).toContain('Bash');
      expect(completedEntry!.content).toContain('drwxr-xr-x');
    });

    it('should handle tool_result content as plain string (not array)', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-string-content',
              name: 'Bash',
              input: { command: 'echo hello' },
            },
          ],
        },
      };
      normalizeMessage(toolUseMsg, workDir, state);

      // Send tool result with string content (not array)
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-string-content',
              content: 'hello\n' as any, // Claude CLI sometimes sends content as plain string
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('success');
        expect(completedEntry!.type.tool.result!.success).toBe(true);
        expect(completedEntry!.type.tool.result!.data).toBe('hello\n');
      }
    });

    it('should handle tool_result with string content as error when is_error flag is set', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-string-error',
              name: 'Read',
              input: { file_path: '/nonexistent' },
            },
          ],
        },
      };
      normalizeMessage(toolUseMsg, workDir, state);

      // Send tool result with string content and is_error flag
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-string-error',
              content: 'File not found: /nonexistent' as any, // String content
              is_error: true,
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('failed');
        expect(completedEntry!.type.tool.result!.success).toBe(false);
        expect(completedEntry!.type.tool.result!.error).toBe('File not found: /nonexistent');
      }
    });

    it('should handle tool_result with JSON string content', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-json-string',
              name: 'Bash',
              input: { command: 'echo \'{"status":"ok"}\'' },
            },
          ],
        },
      };
      normalizeMessage(toolUseMsg, workDir, state);

      // Send tool result with JSON string content
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-json-string',
              content: '{"status":"ok","exitCode":0}' as any, // JSON string
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('success');
        expect(completedEntry!.type.tool.result!.success).toBe(true);
        expect(completedEntry!.type.tool.result!.data).toEqual({ status: 'ok', exitCode: 0 });
      }
    });

    it('should handle tool_result with empty string content', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-empty-string',
              name: 'Write',
              input: { file_path: '/test/file.txt', content: 'hello' },
            },
          ],
        },
      };
      normalizeMessage(toolUseMsg, workDir, state);

      // Send tool result with empty string content
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-empty-string',
              content: '' as any, // Empty string
            },
          ],
        },
      };

      const completedEntry = normalizeMessage(toolResultMsg, workDir, state);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.type.kind).toBe('tool_use');
      if (completedEntry!.type.kind === 'tool_use') {
        expect(completedEntry!.type.tool.status).toBe('success');
        expect(completedEntry!.type.tool.result!.success).toBe(true);
        expect(completedEntry!.type.tool.result!.data).toBe('');
      }
    });
  });

  describe('Tool Completion via ToolUseMessage (Legacy)', () => {
    it('should skip tool_use messages (Claude uses user messages for results)', () => {
      const state = createNormalizerState();

      // Create tool use entry
      const toolUseMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-legacy',
              name: 'Bash',
              input: { command: 'echo hello' },
            },
          ],
        },
      };
      normalizeMessage(toolUseMsg, workDir, state);

      // ToolUseMessage should be skipped (Claude doesn't use these for results)
      const toolUseCompleteMsg: ToolUseMessage = {
        type: 'tool_use',
        subtype: 'completed',
        toolUseId: 'tool-legacy',
        toolName: 'Bash',
        toolResult: { stdout: 'hello\n', exitCode: 0 },
      };

      const entry = normalizeMessage(toolUseCompleteMsg, workDir, state);

      // Should return null as Claude CLI uses user messages for tool results
      expect(entry).toBeNull();
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

  describe('Standardized Metadata', () => {
    it('should include sessionId and model in system message metadata (camelCase)', () => {
      const state = createNormalizerState();
      const message: SystemMessage = {
        type: 'system',
        sessionId: 'sess-abc-123',
        model: 'claude-sonnet-4',
      };

      const entry = normalizeMessage(message, workDir, state);

      expect(entry).toBeDefined();
      expect(entry!.metadata).toBeDefined();
      expect(entry!.metadata!.sessionId).toBe('sess-abc-123');
      expect(entry!.metadata!.model).toBe('claude-sonnet-4');
    });

    it('should include sessionId from snake_case session_id (CLI format)', () => {
      const state = createNormalizerState();
      // This is how Claude CLI actually sends the message
      const message: SystemMessage = {
        type: 'system',
        session_id: '9f9632ea-b27e-4897-85c8-5389565478ca',
        model: 'claude-sonnet-4-5-20250929',
      };

      const entry = normalizeMessage(message, workDir, state);

      expect(entry).toBeDefined();
      expect(entry!.metadata).toBeDefined();
      expect(entry!.metadata!.sessionId).toBe('9f9632ea-b27e-4897-85c8-5389565478ca');
      expect(entry!.metadata!.model).toBe('claude-sonnet-4-5-20250929');
      expect(entry!.content).toContain('9f9632ea-b27e-4897-85c8-5389565478ca');
    });

    it('should prefer session_id over sessionId when both present', () => {
      const state = createNormalizerState();
      const message: SystemMessage = {
        type: 'system',
        session_id: 'snake-case-id',
        sessionId: 'camel-case-id',
        model: 'claude-sonnet-4',
      };

      const entry = normalizeMessage(message, workDir, state);

      expect(entry).toBeDefined();
      expect(entry!.metadata!.sessionId).toBe('snake-case-id');
    });

    it('should include metadata in all message types after system message', () => {
      const state = createNormalizerState();

      // First, process system message to capture session ID
      const systemMsg: SystemMessage = {
        type: 'system',
        sessionId: 'sess-xyz-789',
        model: 'claude-sonnet-4',
      };
      normalizeMessage(systemMsg, workDir, state);

      // User message should have metadata
      const userMsg: UserMessage = {
        type: 'user',
        message: { role: 'user', content: 'Test prompt' },
      };
      const userEntry = normalizeMessage(userMsg, workDir, state);
      expect(userEntry!.metadata?.sessionId).toBe('sess-xyz-789');
      expect(userEntry!.metadata?.model).toBe('claude-sonnet-4');

      // Assistant message should have metadata
      const assistantMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
        },
      };
      const assistantEntry = normalizeMessage(assistantMsg, workDir, state);
      expect(assistantEntry!.metadata?.sessionId).toBe('sess-xyz-789');
      expect(assistantEntry!.metadata?.model).toBe('claude-sonnet-4');

      // Tool use should have metadata
      const toolMsg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
        },
      };
      const toolEntry = normalizeMessage(toolMsg, workDir, state);
      expect(toolEntry!.metadata?.sessionId).toBe('sess-xyz-789');
      expect(toolEntry!.metadata?.model).toBe('claude-sonnet-4');
    });

    it('should include metadata in streaming assistant messages', () => {
      const state = createNormalizerState();

      // Setup session
      const systemMsg: SystemMessage = {
        type: 'system',
        sessionId: 'sess-stream-123',
        model: 'claude-sonnet-4',
      };
      normalizeMessage(systemMsg, workDir, state);

      // First chunk
      const chunk1: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello ' }],
        },
      };
      const entry1 = normalizeMessage(chunk1, workDir, state);
      expect(entry1!.metadata?.sessionId).toBe('sess-stream-123');

      // Second chunk (coalesced)
      const chunk2: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'world' }],
        },
      };
      const entry2 = normalizeMessage(chunk2, workDir, state);
      expect(entry2!.metadata?.sessionId).toBe('sess-stream-123');
    });

    it('should include metadata in tool completion messages', () => {
      const state = createNormalizerState();

      // Setup session
      const systemMsg: SystemMessage = {
        type: 'system',
        sessionId: 'sess-tool-123',
        model: 'claude-sonnet-4',
      };
      normalizeMessage(systemMsg, workDir, state);

      // Tool use started
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
      expect(startEntry!.metadata?.sessionId).toBe('sess-tool-123');

      // Tool completed via user message with tool_result block
      const completionMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-456',
              content: [{ type: 'text', text: 'hello\n' }],
            },
          ],
        },
      };
      const completedEntry = normalizeMessage(completionMsg, workDir, state);
      expect(completedEntry!.metadata?.sessionId).toBe('sess-tool-123');
      expect(completedEntry!.metadata?.model).toBe('claude-sonnet-4');
    });

    it('should not include metadata if no system message received', () => {
      const state = createNormalizerState();

      const userMsg: UserMessage = {
        type: 'user',
        message: { role: 'user', content: 'Test without system msg' },
      };

      const entry = normalizeMessage(userMsg, workDir, state);

      expect(entry).toBeDefined();
      expect(entry!.metadata).toBeUndefined();
    });

    it('should handle system message with only sessionId (no model)', () => {
      const state = createNormalizerState();
      const message: SystemMessage = {
        type: 'system',
        sessionId: 'sess-no-model',
      };

      const entry = normalizeMessage(message, workDir, state);

      expect(entry).toBeDefined();
      expect(entry!.metadata).toBeDefined();
      expect(entry!.metadata!.sessionId).toBe('sess-no-model');
      expect(entry!.metadata!.model).toBeUndefined();
    });
  });
});
