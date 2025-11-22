import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '@/agents/gemini/session/session-manager';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SessionManager', () => {
  let manager: SessionManager;
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    testDir = path.join(os.tmpdir(), `gemini-test-${Date.now()}`);
    manager = new SessionManager({
      namespace: 'gemini-sessions',
      baseDir: testDir,
    });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('directory creation', () => {
    it('should create session directory on first append', async () => {
      await manager.appendRawLine('session-123', '{"user":"Hello"}');

      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not error if directory already exists', async () => {
      await manager.appendRawLine('session-123', '{"user":"First"}');
      await manager.appendRawLine('session-123', '{"user":"Second"}');

      const content = await manager.readSessionRaw('session-123');
      expect(content.trim().split('\n')).toHaveLength(2);
    });
  });

  describe('appendRawLine', () => {
    it('should append user event', async () => {
      await manager.appendRawLine('session-123', '{"user":"Hello"}');

      const content = await manager.readSessionRaw('session-123');
      expect(content.trim()).toBe('{"user":"Hello"}');
    });

    it('should append assistant event', async () => {
      await manager.appendRawLine('session-123', '{"assistant":"Hi there"}');

      const content = await manager.readSessionRaw('session-123');
      expect(content.trim()).toBe('{"assistant":"Hi there"}');
    });

    it('should normalize AgentMessageChunk from SDK', async () => {
      const sdkNotification = JSON.stringify({
        notification: {
          sessionId: 'session-123',
          update: {
            AgentMessageChunk: {
              content: {
                Text: { text: 'Hello from agent' },
              },
            },
          },
        },
      });

      await manager.appendRawLine('session-123', sdkNotification);

      const content = await manager.readSessionRaw('session-123');
      expect(content.trim()).toBe('{"assistant":"Hello from agent"}');
    });

    it('should normalize AgentThoughtChunk to thinking', async () => {
      const sdkNotification = JSON.stringify({
        notification: {
          sessionId: 'session-123',
          update: {
            AgentThoughtChunk: {
              content: {
                Text: { text: 'Let me think...' },
              },
            },
          },
        },
      });

      await manager.appendRawLine('session-123', sdkNotification);

      const content = await manager.readSessionRaw('session-123');
      expect(content.trim()).toBe('{"thinking":"Let me think..."}');
    });

    it('should store ToolCall events', async () => {
      const sdkNotification = JSON.stringify({
        notification: {
          sessionId: 'session-123',
          update: {
            ToolCall: {
              id: 'tool-1',
              kind: 'Read',
              title: 'config.json',
              status: 'Running',
            },
          },
        },
      });

      await manager.appendRawLine('session-123', sdkNotification);

      const content = await manager.readSessionRaw('session-123');
      const parsed = JSON.parse(content.trim());
      expect(parsed.type).toBe('ToolCall');
      expect(parsed.toolCall.kind).toBe('Read');
    });

    it('should store Plan events', async () => {
      const sdkNotification = JSON.stringify({
        notification: {
          sessionId: 'session-123',
          update: {
            Plan: {
              entries: [{ content: 'Step 1' }, { content: 'Step 2' }],
            },
          },
        },
      });

      await manager.appendRawLine('session-123', sdkNotification);

      const content = await manager.readSessionRaw('session-123');
      const parsed = JSON.parse(content.trim());
      expect(parsed.type).toBe('Plan');
      expect(parsed.plan.entries).toHaveLength(2);
    });

    it('should skip non-text content (images, audio)', async () => {
      const sdkNotification = JSON.stringify({
        notification: {
          sessionId: 'session-123',
          update: {
            AgentMessageChunk: {
              content: {
                Image: { url: 'https://example.com/image.png' },
              },
            },
          },
        },
      });

      await manager.appendRawLine('session-123', sdkNotification);

      // File shouldn't be created for skipped events
      const exists = await manager.sessionExists('session-123');
      expect(exists).toBe(false);
    });

    it('should append multiple events to same session', async () => {
      await manager.appendRawLine('session-123', '{"user":"Hello"}');
      await manager.appendRawLine('session-123', '{"assistant":"Hi"}');
      await manager.appendRawLine('session-123', '{"thinking":"Hmm"}');

      const content = await manager.readSessionRaw('session-123');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });
  });

  describe('readSessionRaw', () => {
    it('should read session file content', async () => {
      await manager.appendRawLine('session-123', '{"user":"Test"}');

      const content = await manager.readSessionRaw('session-123');
      expect(content).toContain('{"user":"Test"}');
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        manager.readSessionRaw('non-existent')
      ).rejects.toThrow('Session not found: non-existent');
    });

    it('should return empty string for empty session', async () => {
      // Create empty file
      const sessionPath = path.join(testDir, 'session-empty.jsonl');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(sessionPath, '', 'utf-8');

      const content = await manager.readSessionRaw('session-empty');
      expect(content).toBe('');
    });
  });

  describe('readSession', () => {
    it('should parse session into array of events', async () => {
      await manager.appendRawLine('session-123', '{"user":"First"}');
      await manager.appendRawLine('session-123', '{"assistant":"Second"}');
      await manager.appendRawLine('session-123', '{"thinking":"Third"}');

      const events = await manager.readSession('session-123');

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ user: 'First' });
      expect(events[1]).toEqual({ assistant: 'Second' });
      expect(events[2]).toEqual({ thinking: 'Third' });
    });

    it('should handle empty lines gracefully', async () => {
      const sessionPath = path.join(testDir, 'session-123.jsonl');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(
        sessionPath,
        '{"user":"First"}\n\n{"user":"Second"}\n',
        'utf-8'
      );

      const events = await manager.readSession('session-123');
      expect(events).toHaveLength(2);
    });
  });

  describe('forkSession', () => {
    it('should copy session to new session ID', async () => {
      await manager.appendRawLine('session-123', '{"user":"Original"}');
      await manager.appendRawLine('session-123', '{"assistant":"Response"}');

      await manager.forkSession('session-123', 'session-456');

      const original = await manager.readSessionRaw('session-123');
      const forked = await manager.readSessionRaw('session-456');

      expect(forked).toBe(original);
    });

    it('should throw error when forking non-existent session', async () => {
      await expect(
        manager.forkSession('non-existent', 'session-456')
      ).rejects.toThrow();
    });

    it('should allow independent modifications after fork', async () => {
      await manager.appendRawLine('session-123', '{"user":"Original"}');
      await manager.forkSession('session-123', 'session-456');

      // Modify forked session
      await manager.appendRawLine('session-456', '{"user":"Forked"}');

      const original = await manager.readSession('session-123');
      const forked = await manager.readSession('session-456');

      expect(original).toHaveLength(1);
      expect(forked).toHaveLength(2);
    });
  });

  describe('deleteSession', () => {
    it('should delete session file', async () => {
      await manager.appendRawLine('session-123', '{"user":"Test"}');

      expect(await manager.sessionExists('session-123')).toBe(true);

      await manager.deleteSession('session-123');

      expect(await manager.sessionExists('session-123')).toBe(false);
    });

    it('should not error when deleting non-existent session', async () => {
      await expect(manager.deleteSession('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('sessionExists', () => {
    it('should return true for existing session', async () => {
      await manager.appendRawLine('session-123', '{"user":"Test"}');

      expect(await manager.sessionExists('session-123')).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      expect(await manager.sessionExists('non-existent')).toBe(false);
    });
  });

  describe('generateResumePrompt', () => {
    it('should generate prompt with session history', async () => {
      await manager.appendRawLine('session-123', '{"user":"Add login"}');
      await manager.appendRawLine('session-123', '{"assistant":"Created login component"}');
      await manager.appendRawLine('session-123', '{"thinking":"Need to add auth"}');

      const prompt = await manager.generateResumePrompt(
        'session-123',
        'Add logout button'
      );

      expect(prompt).toContain('Resuming Previous Session');
      expect(prompt).toContain('User: Add login');
      expect(prompt).toContain('Assistant: Created login component');
      expect(prompt).toContain('[Thinking: Need to add auth]');
      expect(prompt).toContain('New request: Add logout button');
    });

    it('should limit history to maxHistoryLines', async () => {
      // Add 30 events
      for (let i = 0; i < 30; i++) {
        await manager.appendRawLine('session-123', `{"user":"Message ${i}"}`);
      }

      const prompt = await manager.generateResumePrompt(
        'session-123',
        'New prompt',
        10
      );

      // Should only include last 10 messages (20-29)
      expect(prompt).toContain('Message 29');
      expect(prompt).toContain('Message 20');
      expect(prompt).not.toContain('Message 19');
    });

    it('should include tool calls in context', async () => {
      const toolCallNotification = JSON.stringify({
        notification: {
          sessionId: 'session-123',
          update: {
            ToolCall: {
              id: 'tool-1',
              kind: 'Read',
              title: 'config.json',
              status: 'Success',
            },
          },
        },
      });

      await manager.appendRawLine('session-123', '{"user":"Read config"}');
      await manager.appendRawLine('session-123', toolCallNotification);

      const prompt = await manager.generateResumePrompt(
        'session-123',
        'Update config'
      );

      expect(prompt).toContain('[Tool: Read config.json]');
    });

    it('should return original prompt if session does not exist', async () => {
      const prompt = await manager.generateResumePrompt(
        'non-existent',
        'Hello'
      );

      expect(prompt).toBe('Hello');
    });
  });

  describe('default directory resolution', () => {
    it('should use development directory when NODE_ENV=development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const devManager = new SessionManager({ namespace: 'gemini-sessions' });
      const baseDirPrivate = (devManager as any).baseDir;

      expect(baseDirPrivate).toContain('dev');
      expect(baseDirPrivate).toContain('gemini-sessions');

      process.env.NODE_ENV = originalEnv;
    });

    it('should use production directory when NODE_ENV is not development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodManager = new SessionManager({ namespace: 'gemini-sessions' });
      const baseDirPrivate = (prodManager as any).baseDir;

      expect(baseDirPrivate).not.toContain('/dev/');
      expect(baseDirPrivate).toContain('gemini-sessions');

      process.env.NODE_ENV = originalEnv;
    });
  });
});
