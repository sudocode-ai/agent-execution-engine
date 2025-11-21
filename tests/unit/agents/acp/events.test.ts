import { describe, it, expect } from 'vitest';
import type {
  SessionNotification,
  ContentBlock,
  ToolCall,
} from '@/agents/acp/types/protocol.js';
import {
  sessionUpdateToEvent,
  extractTextContent,
  isMessageEvent,
  isToolEvent,
  isTerminalStatus,
  toNormalizedEntry,
  type AcpEvent,
} from '@/agents/acp/events/index.js';

describe('ACP Event Helpers', () => {
  describe('sessionUpdateToEvent', () => {
    it('should convert AgentMessageChunk to Message event', () => {
      const notification: SessionNotification = {
        sessionId: { id: 'test-session' },
        update: {
          AgentMessageChunk: {
            content: { Text: { text: 'Hello, world!' } },
          },
        },
      };

      const event = sessionUpdateToEvent(notification);

      expect(event.type).toBe('Message');
      if (event.type === 'Message') {
        expect('Text' in event.content).toBe(true);
        if ('Text' in event.content) {
          expect(event.content.Text.text).toBe('Hello, world!');
        }
      }
    });

    it('should convert AgentThoughtChunk to Thought event', () => {
      const notification: SessionNotification = {
        sessionId: { id: 'test-session' },
        update: {
          AgentThoughtChunk: {
            content: { Text: { text: 'Thinking...' } },
          },
        },
      };

      const event = sessionUpdateToEvent(notification);

      expect(event.type).toBe('Thought');
      if (event.type === 'Thought') {
        const text = extractTextContent(event.content);
        expect(text).toBe('Thinking...');
      }
    });

    it('should convert ToolCall to ToolCall event', () => {
      const notification: SessionNotification = {
        sessionId: { id: 'test-session' },
        update: {
          ToolCall: {
            id: 'tool-1',
            kind: 'Read',
            title: 'Read file.txt',
            status: 'Pending',
          },
        },
      };

      const event = sessionUpdateToEvent(notification);

      expect(event.type).toBe('ToolCall');
      if (event.type === 'ToolCall') {
        expect(event.toolCall.id).toBe('tool-1');
        expect(event.toolCall.kind).toBe('Read');
        expect(event.toolCall.title).toBe('Read file.txt');
      }
    });

    it('should convert ToolCallUpdate to ToolUpdate event', () => {
      const notification: SessionNotification = {
        sessionId: { id: 'test-session' },
        update: {
          ToolCallUpdate: {
            toolCallId: 'tool-1',
            status: 'Success',
          },
        },
      };

      const event = sessionUpdateToEvent(notification);

      expect(event.type).toBe('ToolUpdate');
      if (event.type === 'ToolUpdate') {
        expect(event.update.toolCallId).toBe('tool-1');
        expect(event.update.status).toBe('Success');
      }
    });

    it('should convert Plan to Plan event', () => {
      const notification: SessionNotification = {
        sessionId: { id: 'test-session' },
        update: {
          Plan: {
            entries: [
              { content: 'Step 1: Read file' },
              { content: 'Step 2: Edit file' },
            ],
          },
        },
      };

      const event = sessionUpdateToEvent(notification);

      expect(event.type).toBe('Plan');
      if (event.type === 'Plan') {
        expect(event.plan.entries).toHaveLength(2);
        expect(event.plan.entries[0].content).toBe('Step 1: Read file');
      }
    });

    it('should convert AvailableCommandsUpdate to AvailableCommands event', () => {
      const notification: SessionNotification = {
        sessionId: { id: 'test-session' },
        update: {
          AvailableCommandsUpdate: {
            available_commands: [
              { id: 'cmd-1', name: 'help', description: 'Show help' },
            ],
          },
        },
      };

      const event = sessionUpdateToEvent(notification);

      expect(event.type).toBe('AvailableCommands');
      if (event.type === 'AvailableCommands') {
        expect(event.commands).toHaveLength(1);
        expect(event.commands[0].name).toBe('help');
      }
    });

    it('should convert CurrentModeUpdate to CurrentMode event', () => {
      const notification: SessionNotification = {
        sessionId: { id: 'test-session' },
        update: {
          CurrentModeUpdate: {
            current_mode_id: { id: 'mode-code' },
          },
        },
      };

      const event = sessionUpdateToEvent(notification);

      expect(event.type).toBe('CurrentMode');
      if (event.type === 'CurrentMode') {
        expect(event.modeId.id).toBe('mode-code');
      }
    });
  });

  describe('extractTextContent', () => {
    it('should extract text from Text content block', () => {
      const content: ContentBlock = {
        Text: { text: 'Hello from agent' },
      };

      const text = extractTextContent(content);

      expect(text).toBe('Hello from agent');
    });

    it('should return null for Image content block', () => {
      const content: ContentBlock = {
        Image: { url: 'https://example.com/image.png' },
      };

      const text = extractTextContent(content);

      expect(text).toBeNull();
    });

    it('should return null for Audio content block', () => {
      const content: ContentBlock = {
        Audio: { url: 'https://example.com/audio.mp3' },
      };

      const text = extractTextContent(content);

      expect(text).toBeNull();
    });
  });

  describe('Type guards', () => {
    it('should identify Message events with isMessageEvent', () => {
      const messageEvent: AcpEvent = {
        type: 'Message',
        content: { Text: { text: 'Hello' } },
      };

      expect(isMessageEvent(messageEvent)).toBe(true);

      const toolEvent: AcpEvent = {
        type: 'ToolCall',
        toolCall: {
          id: 'tool-1',
          kind: 'Read',
          title: 'Read',
          status: 'Pending',
        },
      };

      expect(isMessageEvent(toolEvent)).toBe(false);
    });

    it('should identify Thought events with isMessageEvent', () => {
      const thoughtEvent: AcpEvent = {
        type: 'Thought',
        content: { Text: { text: 'Thinking' } },
      };

      expect(isMessageEvent(thoughtEvent)).toBe(true);
    });

    it('should identify ToolCall events with isToolEvent', () => {
      const toolEvent: AcpEvent = {
        type: 'ToolCall',
        toolCall: {
          id: 'tool-1',
          kind: 'Execute',
          title: 'Run command',
          status: 'Running',
        },
      };

      expect(isToolEvent(toolEvent)).toBe(true);
    });

    it('should identify ToolUpdate events with isToolEvent', () => {
      const updateEvent: AcpEvent = {
        type: 'ToolUpdate',
        update: {
          toolCallId: 'tool-1',
          status: 'Success',
        },
      };

      expect(isToolEvent(updateEvent)).toBe(true);
    });

    it('should identify terminal statuses', () => {
      expect(isTerminalStatus('Success')).toBe(true);
      expect(isTerminalStatus('Error')).toBe(true);
      expect(isTerminalStatus('Pending')).toBe(false);
      expect(isTerminalStatus('Running')).toBe(false);
    });
  });

  describe('toNormalizedEntry', () => {
    const timestamp = new Date('2025-01-01T12:00:00Z');

    it('should convert Message event to assistant_message', () => {
      const event: AcpEvent = {
        type: 'Message',
        content: { Text: { text: 'Agent response' } },
      };

      const entry = toNormalizedEntry(event, 0, timestamp);

      expect(entry.index).toBe(0);
      expect(entry.timestamp).toEqual(timestamp);
      expect(entry.type.kind).toBe('assistant_message');
      expect(entry.content).toBe('Agent response');
    });

    it('should convert Thought event to thinking', () => {
      const event: AcpEvent = {
        type: 'Thought',
        content: { Text: { text: 'Analyzing request' } },
      };

      const entry = toNormalizedEntry(event, 1, timestamp);

      expect(entry.type.kind).toBe('thinking');
      if (entry.type.kind === 'thinking') {
        expect(entry.type.reasoning).toBe('Analyzing request');
      }
      expect(entry.content).toBe('Analyzing request');
    });

    it('should convert ToolCall event to tool_use', () => {
      const event: AcpEvent = {
        type: 'ToolCall',
        toolCall: {
          id: 'tool-1',
          kind: 'Read',
          title: 'main.ts',
          status: 'Success',
        },
      };

      const entry = toNormalizedEntry(event, 2, timestamp);

      expect(entry.type.kind).toBe('tool_use');
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('Read');
        expect(entry.type.tool.status).toBe('success');
        expect(entry.type.tool.action.kind).toBe('file_read');
        if (entry.type.tool.action.kind === 'file_read') {
          expect(entry.type.tool.action.path).toBe('main.ts');
        }
      }
    });

    it('should convert Plan event to thinking with plan content', () => {
      const event: AcpEvent = {
        type: 'Plan',
        plan: {
          entries: [
            { content: 'Read configuration file' },
            { content: 'Update settings' },
            { content: 'Save changes' },
          ],
        },
      };

      const entry = toNormalizedEntry(event, 3, timestamp);

      expect(entry.type.kind).toBe('thinking');
      expect(entry.content).toContain('## Plan');
      expect(entry.content).toContain('1. Read configuration file');
      expect(entry.content).toContain('2. Update settings');
      expect(entry.content).toContain('3. Save changes');
    });

    it('should convert Error event to error entry', () => {
      const event: AcpEvent = {
        type: 'Error',
        message: 'File not found',
      };

      const entry = toNormalizedEntry(event, 4, timestamp);

      expect(entry.type.kind).toBe('error');
      if (entry.type.kind === 'error') {
        expect(entry.type.error.message).toBe('File not found');
      }
      expect(entry.content).toBe('Error: File not found');
    });

    it('should convert Done event to system_message', () => {
      const event: AcpEvent = {
        type: 'Done',
        sessionId: 'session-123',
      };

      const entry = toNormalizedEntry(event, 5, timestamp);

      expect(entry.type.kind).toBe('system_message');
      expect(entry.content).toBe('Session completed');
      expect(entry.metadata?.sessionId).toBe('session-123');
    });

    it('should handle non-text content in Message events', () => {
      const event: AcpEvent = {
        type: 'Message',
        content: { Image: { url: 'https://example.com/img.png' } },
      };

      const entry = toNormalizedEntry(event, 6, timestamp);

      expect(entry.type.kind).toBe('assistant_message');
      expect(entry.content).toBe('[Non-text content]');
      expect(entry.metadata?.contentBlock).toBeDefined();
    });

    it('should map tool statuses correctly', () => {
      const pendingEvent: AcpEvent = {
        type: 'ToolCall',
        toolCall: {
          id: 'tool-1',
          kind: 'Execute',
          title: 'npm test',
          status: 'Pending',
        },
      };

      const pendingEntry = toNormalizedEntry(pendingEvent, 7, timestamp);
      if (pendingEntry.type.kind === 'tool_use') {
        expect(pendingEntry.type.tool.status).toBe('created');
      }

      const runningEvent: AcpEvent = {
        type: 'ToolCall',
        toolCall: {
          id: 'tool-1',
          kind: 'Execute',
          title: 'npm test',
          status: 'Running',
        },
      };

      const runningEntry = toNormalizedEntry(runningEvent, 8, timestamp);
      if (runningEntry.type.kind === 'tool_use') {
        expect(runningEntry.type.tool.status).toBe('running');
      }
    });
  });
});
