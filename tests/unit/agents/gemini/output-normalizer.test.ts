import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiOutputNormalizer } from '@/agents/gemini/normalizer/output-normalizer';
import type * as acp from '@agentclientprotocol/sdk';

describe('GeminiOutputNormalizer', () => {
  let normalizer: GeminiOutputNormalizer;
  const workDir = '/test/project';

  beforeEach(() => {
    normalizer = new GeminiOutputNormalizer();
  });

  describe('AgentMessageChunk normalization', () => {
    it('should normalize text message to assistant_message', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          AgentMessageChunk: {
            content: {
              Text: { text: 'Hello from agent' },
            },
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).not.toBeNull();
      expect(entry!.type.kind).toBe('assistant_message');
      expect(entry!.content).toBe('Hello from agent');
      expect(entry!.index).toBe(0);
      expect(entry!.timestamp).toBeInstanceOf(Date);
    });

    it('should skip non-text content (images)', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          AgentMessageChunk: {
            content: {
              Image: { url: 'https://example.com/image.png' },
            },
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).toBeNull();
    });

    it('should increment index for multiple messages', () => {
      const notification1: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          AgentMessageChunk: {
            content: { Text: { text: 'First message' } },
          },
        },
      };

      const notification2: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          AgentMessageChunk: {
            content: { Text: { text: 'Second message' } },
          },
        },
      };

      const entry1 = normalizer.normalize(notification1, workDir);
      const entry2 = normalizer.normalize(notification2, workDir);

      expect(entry1!.index).toBe(0);
      expect(entry2!.index).toBe(1);
    });
  });

  describe('AgentThoughtChunk normalization', () => {
    it('should normalize text thought to thinking', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          AgentThoughtChunk: {
            content: {
              Text: { text: 'Let me think about this' },
            },
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).not.toBeNull();
      expect(entry!.type.kind).toBe('thinking');
      if (entry!.type.kind === 'thinking') {
        expect(entry!.type.reasoning).toBe('Let me think about this');
      }
      expect(entry!.content).toBe('Let me think about this');
    });

    it('should skip non-text thought content', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          AgentThoughtChunk: {
            content: {
              Image: { url: 'https://example.com/diagram.png' },
            },
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).toBeNull();
    });
  });

  describe('ToolCall normalization', () => {
    it('should normalize Read tool', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          ToolCall: {
            id: 'tool-1',
            kind: 'Read',
            title: 'src/config.ts',
            status: 'Running',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).not.toBeNull();
      expect(entry!.type.kind).toBe('tool_use');
      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.toolName).toBe('Read');
        expect(entry!.type.tool.action.kind).toBe('file_read');
        if (entry!.type.tool.action.kind === 'file_read') {
          expect(entry!.type.tool.action.path).toBe('src/config.ts');
        }
        expect(entry!.type.tool.status).toBe('running');
      }
      expect(entry!.content).toContain('Read');
      expect(entry!.content).toContain('src/config.ts');
    });

    it('should normalize Edit tool', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          ToolCall: {
            id: 'tool-2',
            kind: 'Edit',
            title: 'src/main.ts',
            status: 'Success',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).not.toBeNull();
      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.action.kind).toBe('file_edit');
        if (entry!.type.tool.action.kind === 'file_edit') {
          expect(entry!.type.tool.action.path).toBe('src/main.ts');
        }
        expect(entry!.type.tool.status).toBe('success');
      }
    });

    it('should normalize Execute tool', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          ToolCall: {
            id: 'tool-3',
            kind: 'Execute',
            title: 'npm test',
            status: 'Pending',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).not.toBeNull();
      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.action.kind).toBe('command_run');
        if (entry!.type.tool.action.kind === 'command_run') {
          expect(entry!.type.tool.action.command).toBe('npm test');
        }
        expect(entry!.type.tool.status).toBe('created');
      }
    });

    it('should normalize Search tool', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          ToolCall: {
            id: 'tool-4',
            kind: 'Search',
            title: 'function login',
            status: 'Running',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).not.toBeNull();
      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.action.kind).toBe('search');
        if (entry!.type.tool.action.kind === 'search') {
          expect(entry!.type.tool.action.query).toBe('function login');
        }
      }
    });

    it('should normalize Fetch tool as generic tool', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          ToolCall: {
            id: 'tool-5',
            kind: 'Fetch',
            title: 'https://api.example.com/data',
            status: 'Success',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).not.toBeNull();
      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.action.kind).toBe('tool');
        if (entry!.type.tool.action.kind === 'tool') {
          expect(entry!.type.tool.action.toolName).toBe('Fetch');
        }
      }
    });

    it('should fallback to generic tool for unknown kind', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          ToolCall: {
            id: 'tool-6',
            kind: 'CustomTool',
            title: 'some operation',
            status: 'Running',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).not.toBeNull();
      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.action.kind).toBe('tool');
        if (entry!.type.tool.action.kind === 'tool') {
          expect(entry!.type.tool.action.toolName).toBe('CustomTool');
        }
      }
    });

    it('should include metadata with tool call', () => {
      const toolCall = {
        id: 'tool-1',
        kind: 'Read',
        title: 'file.ts',
        status: 'Success',
      };

      const notification: acp.SessionNotification = {
        sessionId: 'test',
        update: { ToolCall: toolCall },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry!.metadata).toBeDefined();
      expect(entry!.metadata!.toolCall).toEqual(toolCall);
    });
  });

  describe('ToolCallUpdate normalization', () => {
    it('should normalize tool update', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          ToolCallUpdate: {
            toolCallId: 'tool-1',
            status: 'Success',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).not.toBeNull();
      expect(entry!.type.kind).toBe('tool_use');
      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.status).toBe('success');
      }
      expect(entry!.content).toContain('tool-1');
      expect(entry!.content).toContain('Success');
    });
  });

  describe('Plan normalization', () => {
    it('should normalize plan to thinking with formatted content', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test-session',
        update: {
          Plan: {
            entries: [
              { content: 'Read configuration file' },
              { content: 'Update settings' },
              { content: 'Save changes' },
            ],
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).not.toBeNull();
      expect(entry!.type.kind).toBe('thinking');
      expect(entry!.content).toContain('## Plan');
      expect(entry!.content).toContain('1. Read configuration file');
      expect(entry!.content).toContain('2. Update settings');
      expect(entry!.content).toContain('3. Save changes');
    });

    it('should include plan metadata', () => {
      const plan = {
        entries: [{ content: 'Step 1' }],
      };

      const notification: acp.SessionNotification = {
        sessionId: 'test',
        update: { Plan: plan },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry!.metadata).toBeDefined();
      expect(entry!.metadata!.plan).toEqual(plan);
    });
  });

  describe('status mapping', () => {
    it('should map Pending to created', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          ToolCall: {
            id: 'tool-1',
            kind: 'Read',
            title: 'file.ts',
            status: 'Pending',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.status).toBe('created');
      }
    });

    it('should map Running to running', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          ToolCall: {
            id: 'tool-1',
            kind: 'Read',
            title: 'file.ts',
            status: 'Running',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.status).toBe('running');
      }
    });

    it('should map Success to success', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          ToolCall: {
            id: 'tool-1',
            kind: 'Read',
            title: 'file.ts',
            status: 'Success',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.status).toBe('success');
      }
    });

    it('should map Error to failed', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          ToolCall: {
            id: 'tool-1',
            kind: 'Read',
            title: 'file.ts',
            status: 'Error',
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      if (entry!.type.kind === 'tool_use') {
        expect(entry!.type.tool.status).toBe('failed');
      }
    });
  });

  describe('skipped events', () => {
    it('should skip AvailableCommandsUpdate', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          AvailableCommandsUpdate: {
            available_commands: [
              { id: 'cmd-1', name: 'help', description: 'Show help' },
            ],
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).toBeNull();
    });

    it('should skip CurrentModeUpdate', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          CurrentModeUpdate: {
            current_mode_id: { id: 'mode-code' },
          },
        },
      };

      const entry = normalizer.normalize(notification, workDir);

      expect(entry).toBeNull();
    });
  });

  describe('state management', () => {
    it('should maintain sequential index across different event types', () => {
      const message: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          AgentMessageChunk: {
            content: { Text: { text: 'Message' } },
          },
        },
      };

      const thought: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          AgentThoughtChunk: {
            content: { Text: { text: 'Thought' } },
          },
        },
      };

      const tool: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          ToolCall: {
            id: 'tool-1',
            kind: 'Read',
            title: 'file.ts',
            status: 'Running',
          },
        },
      };

      const entry1 = normalizer.normalize(message, workDir);
      const entry2 = normalizer.normalize(thought, workDir);
      const entry3 = normalizer.normalize(tool, workDir);

      expect(entry1!.index).toBe(0);
      expect(entry2!.index).toBe(1);
      expect(entry3!.index).toBe(2);
    });

    it('should reset index on reset()', () => {
      const notification: acp.SessionNotification = {
        sessionId: 'test',
        update: {
          AgentMessageChunk: {
            content: { Text: { text: 'Message' } },
          },
        },
      };

      normalizer.normalize(notification, workDir);
      normalizer.normalize(notification, workDir);

      expect(normalizer.getCurrentIndex()).toBe(2);

      normalizer.reset();

      expect(normalizer.getCurrentIndex()).toBe(0);

      const entry = normalizer.normalize(notification, workDir);
      expect(entry!.index).toBe(0);
    });
  });
});
