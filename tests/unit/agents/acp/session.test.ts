/**
 * Unit Tests: ACP Session
 *
 * Tests the AcpSession class and AcpSessionManager with focus on _meta support.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { AcpSession, AcpSessionManager, type AcpSessionOptions } from '@/agents/acp/session';
import type { ClientSideConnection, SessionNotification, McpServer } from '@/agents/acp/types';

// Mock ClientSideConnection
function createMockConnection(): ClientSideConnection & {
  newSession: Mock;
  loadSession: Mock;
  prompt: Mock;
  cancel: Mock;
  setSessionMode: Mock;
  setSessionModel: Mock;
} {
  return {
    newSession: vi.fn().mockResolvedValue({
      sessionId: 'test-session-id',
      modes: {
        availableModes: [{ id: 'default', name: 'Default' }],
        currentModeId: 'default',
      },
      models: {
        availableModels: [{ id: 'claude-3', name: 'Claude 3' }],
        currentModelId: 'claude-3',
      },
    }),
    loadSession: vi.fn().mockResolvedValue({
      modes: {
        availableModes: [{ id: 'default', name: 'Default' }],
        currentModeId: 'default',
      },
      models: {
        availableModels: [{ id: 'claude-3', name: 'Claude 3' }],
        currentModelId: 'claude-3',
      },
    }),
    prompt: vi.fn().mockResolvedValue({
      stopReason: 'end_turn',
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    setSessionMode: vi.fn().mockResolvedValue(undefined),
    setSessionModel: vi.fn().mockResolvedValue(undefined),
    // Additional methods that may be needed
    initialize: vi.fn(),
    close: vi.fn(),
  } as unknown as ClientSideConnection & {
    newSession: Mock;
    loadSession: Mock;
    prompt: Mock;
    cancel: Mock;
    setSessionMode: Mock;
    setSessionModel: Mock;
  };
}

describe('AcpSession', () => {
  let mockConnection: ReturnType<typeof createMockConnection>;

  beforeEach(() => {
    mockConnection = createMockConnection();
  });

  describe('create', () => {
    it('should create a new session with minimal options', async () => {
      const options: AcpSessionOptions = {
        cwd: '/test/project',
      };

      const session = await AcpSession.create(mockConnection, options);

      expect(session).toBeInstanceOf(AcpSession);
      expect(session.sessionId).toBe('test-session-id');
      expect(session.cwd).toBe('/test/project');
      expect(session.state).toBe('ready');
      expect(mockConnection.newSession).toHaveBeenCalledWith({
        cwd: '/test/project',
        mcpServers: [],
      });
    });

    it('should create a new session with MCP servers', async () => {
      const mcpServers: McpServer[] = [
        {
          name: 'filesystem',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
        },
      ];

      const options: AcpSessionOptions = {
        cwd: '/test/project',
        mcpServers,
      };

      const session = await AcpSession.create(mockConnection, options);

      expect(session.sessionId).toBe('test-session-id');
      expect(mockConnection.newSession).toHaveBeenCalledWith({
        cwd: '/test/project',
        mcpServers,
      });
    });

    it('should create a new session with _meta', async () => {
      const options: AcpSessionOptions = {
        cwd: '/test/project',
        _meta: {
          systemPrompt: 'You are a helpful assistant',
          disableBuiltInTools: false,
        },
      };

      const session = await AcpSession.create(mockConnection, options);

      expect(session.sessionId).toBe('test-session-id');
      expect(mockConnection.newSession).toHaveBeenCalledWith({
        cwd: '/test/project',
        mcpServers: [],
        _meta: {
          systemPrompt: 'You are a helpful assistant',
          disableBuiltInTools: false,
        },
      });
    });

    it('should create a new session with Claude-specific _meta', async () => {
      // Simulating ClaudeAcpSessionMeta structure
      const options: AcpSessionOptions = {
        cwd: '/test/project',
        _meta: {
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: 'Be concise',
          },
          claudeCode: {
            options: {
              allowedTools: ['Read', 'Grep'],
              disallowedTools: ['Bash(rm:*)'],
              mcpServers: {
                test: { type: 'stdio', command: 'test-server' },
              },
            },
          },
        },
      };

      const session = await AcpSession.create(mockConnection, options);

      expect(session.sessionId).toBe('test-session-id');
      expect(mockConnection.newSession).toHaveBeenCalledWith({
        cwd: '/test/project',
        mcpServers: [],
        _meta: options._meta,
      });
    });

    it('should not include _meta if not provided', async () => {
      const options: AcpSessionOptions = {
        cwd: '/test/project',
      };

      await AcpSession.create(mockConnection, options);

      const calledWith = mockConnection.newSession.mock.calls[0][0];
      expect(calledWith).not.toHaveProperty('_meta');
    });

    it('should load an existing session when isLoad is true', async () => {
      const options: AcpSessionOptions = {
        cwd: '/test/project',
        isLoad: true,
        sessionIdToLoad: 'existing-session-id',
      };

      const session = await AcpSession.create(mockConnection, options);

      expect(session.sessionId).toBe('existing-session-id');
      expect(mockConnection.loadSession).toHaveBeenCalledWith({
        cwd: '/test/project',
        mcpServers: [],
        sessionId: 'existing-session-id',
      });
      expect(mockConnection.newSession).not.toHaveBeenCalled();
    });

    it('should call onUpdate callback when provided', async () => {
      const onUpdate = vi.fn();
      const options: AcpSessionOptions = {
        cwd: '/test/project',
        onUpdate,
      };

      const session = await AcpSession.create(mockConnection, options);

      // Simulate a notification
      const notification: SessionNotification = {
        sessionId: 'test-session-id',
        update: {
          sessionUpdate: 'message',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
          },
        },
      };

      session.recordUpdate(notification);

      // Wait for async callback
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onUpdate).toHaveBeenCalledWith(notification);
    });
  });

  describe('session properties', () => {
    it('should expose modes from response', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      expect(session.modes).toEqual({
        availableModes: [{ id: 'default', name: 'Default' }],
        currentModeId: 'default',
      });
    });

    it('should expose models from response', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      expect(session.models).toEqual({
        availableModels: [{ id: 'claude-3', name: 'Claude 3' }],
        currentModelId: 'claude-3',
      });
    });

    it('should track creation time', async () => {
      const before = new Date();
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });
      const after = new Date();

      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should track last activity time', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      const initialActivity = session.lastActivityAt;

      // Wait a bit and record an update
      await new Promise((resolve) => setTimeout(resolve, 10));
      session.recordUpdate({
        sessionId: 'test-session-id',
        update: {
          sessionUpdate: 'message',
          message: { role: 'assistant', content: [] },
        },
      });

      expect(session.lastActivityAt.getTime()).toBeGreaterThan(initialActivity.getTime());
    });
  });

  describe('getInfo', () => {
    it('should return session info', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      const info = session.getInfo();

      expect(info.sessionId).toBe('test-session-id');
      expect(info.state).toBe('ready');
      expect(info.cwd).toBe('/test/project');
      expect(info.createdAt).toBeInstanceOf(Date);
      expect(info.lastActivityAt).toBeInstanceOf(Date);
    });
  });

  describe('prompt', () => {
    it('should send a text prompt', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      const result = await session.prompt('Hello, Claude!');

      expect(result.stopReason).toBe('end_turn');
      expect(mockConnection.prompt).toHaveBeenCalledWith({
        sessionId: 'test-session-id',
        prompt: [{ type: 'text', text: 'Hello, Claude!' }],
      });
    });

    it('should send content blocks', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      const contentBlocks = [
        { type: 'text' as const, text: 'Look at this image:' },
        { type: 'image' as const, source: { type: 'base64' as const, mediaType: 'image/png' as const, data: 'abc123' } },
      ];

      await session.prompt(contentBlocks);

      expect(mockConnection.prompt).toHaveBeenCalledWith({
        sessionId: 'test-session-id',
        prompt: contentBlocks,
      });
    });

    it('should throw if session is not ready', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      // Manually set state to prompting
      // @ts-expect-error - accessing private field for testing
      session['#state'] = 'prompting';

      // Since we can't directly set the private state, simulate by starting a prompt
      // and then trying to prompt again
      mockConnection.prompt.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      // Start first prompt (will be pending)
      const firstPrompt = session.prompt('First');

      // Try second prompt - should fail
      await expect(session.prompt('Second')).rejects.toThrow('Cannot prompt in state');

      // Clean up
      session.close();
    });
  });

  describe('cancel', () => {
    it('should cancel ongoing operations', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      // Start a prompt that never resolves
      mockConnection.prompt.mockImplementation(
        () => new Promise(() => {})
      );

      // Start prompt
      session.prompt('Hello');

      // Cancel
      await session.cancel();

      expect(mockConnection.cancel).toHaveBeenCalledWith({
        sessionId: 'test-session-id',
      });
    });

    it('should do nothing if session is not prompting', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      await session.cancel();

      expect(mockConnection.cancel).not.toHaveBeenCalled();
    });
  });

  describe('setMode', () => {
    it('should set session mode', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      await session.setMode('plan');

      expect(mockConnection.setSessionMode).toHaveBeenCalledWith({
        sessionId: 'test-session-id',
        modeId: 'plan',
      });
    });

    it('should update local modes state', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      await session.setMode('plan');

      expect(session.modes?.currentModeId).toBe('plan');
    });
  });

  describe('setModel', () => {
    it('should set session model', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      await session.setModel('claude-opus-4-5');

      expect(mockConnection.setSessionModel).toHaveBeenCalledWith({
        sessionId: 'test-session-id',
        modelId: 'claude-opus-4-5',
      });
    });

    it('should update local models state', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      await session.setModel('claude-opus-4-5');

      expect(session.models?.currentModelId).toBe('claude-opus-4-5');
    });
  });

  describe('recordUpdate', () => {
    it('should record session updates', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      const notification: SessionNotification = {
        sessionId: 'test-session-id',
        update: {
          sessionUpdate: 'message',
          message: { role: 'assistant', content: [] },
        },
      };

      session.recordUpdate(notification);

      expect(session.updates).toHaveLength(1);
      expect(session.updates[0]).toEqual(notification);
    });

    it('should handle mode updates', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      const notification: SessionNotification = {
        sessionId: 'test-session-id',
        update: {
          sessionUpdate: 'current_mode_update',
          currentModeId: 'plan',
        },
      };

      session.recordUpdate(notification);

      expect(session.modes?.currentModeId).toBe('plan');
    });
  });

  describe('close', () => {
    it('should close the session', async () => {
      const session = await AcpSession.create(mockConnection, {
        cwd: '/test/project',
      });

      session.close();

      expect(session.state).toBe('closed');
    });
  });
});

describe('AcpSessionManager', () => {
  let mockConnection: ReturnType<typeof createMockConnection>;
  let manager: AcpSessionManager;

  beforeEach(() => {
    mockConnection = createMockConnection();
    manager = new AcpSessionManager(mockConnection);
  });

  describe('createSession', () => {
    it('should create and track a new session', async () => {
      const session = await manager.createSession({
        cwd: '/test/project',
      });

      expect(session.sessionId).toBe('test-session-id');
      expect(manager.getSession('test-session-id')).toBe(session);
    });

    it('should create session with _meta', async () => {
      const session = await manager.createSession({
        cwd: '/test/project',
        _meta: {
          systemPrompt: 'Be helpful',
          claudeCode: {
            options: {
              allowedTools: ['Read'],
            },
          },
        },
      });

      expect(session.sessionId).toBe('test-session-id');
      expect(mockConnection.newSession).toHaveBeenCalledWith({
        cwd: '/test/project',
        mcpServers: [],
        _meta: {
          systemPrompt: 'Be helpful',
          claudeCode: {
            options: {
              allowedTools: ['Read'],
            },
          },
        },
      });
    });
  });

  describe('loadSession', () => {
    it('should load and track an existing session', async () => {
      const session = await manager.loadSession('existing-id', {
        cwd: '/test/project',
      });

      expect(session.sessionId).toBe('existing-id');
      expect(manager.getSession('existing-id')).toBe(session);
    });
  });

  describe('getAllSessions', () => {
    it('should return all sessions', async () => {
      mockConnection.newSession
        .mockResolvedValueOnce({ sessionId: 'session-1', modes: null, models: null })
        .mockResolvedValueOnce({ sessionId: 'session-2', modes: null, models: null });

      await manager.createSession({ cwd: '/project1' });
      await manager.createSession({ cwd: '/project2' });

      const sessions = manager.getAllSessions();

      expect(sessions).toHaveLength(2);
    });
  });

  describe('handleNotification', () => {
    it('should route notifications to correct session', async () => {
      const session = await manager.createSession({
        cwd: '/test/project',
      });

      const notification: SessionNotification = {
        sessionId: 'test-session-id',
        update: {
          sessionUpdate: 'message',
          message: { role: 'assistant', content: [] },
        },
      };

      manager.handleNotification(notification);

      expect(session.updates).toHaveLength(1);
    });

    it('should ignore notifications for unknown sessions', () => {
      const notification: SessionNotification = {
        sessionId: 'unknown-session',
        update: {
          sessionUpdate: 'message',
          message: { role: 'assistant', content: [] },
        },
      };

      // Should not throw
      expect(() => manager.handleNotification(notification)).not.toThrow();
    });
  });

  describe('closeSession', () => {
    it('should close and remove session', async () => {
      const session = await manager.createSession({
        cwd: '/test/project',
      });

      manager.closeSession('test-session-id');

      expect(session.state).toBe('closed');
      expect(manager.getSession('test-session-id')).toBeUndefined();
    });
  });

  describe('closeAllSessions', () => {
    it('should close all sessions', async () => {
      mockConnection.newSession
        .mockResolvedValueOnce({ sessionId: 'session-1', modes: null, models: null })
        .mockResolvedValueOnce({ sessionId: 'session-2', modes: null, models: null });

      const session1 = await manager.createSession({ cwd: '/project1' });
      const session2 = await manager.createSession({ cwd: '/project2' });

      manager.closeAllSessions();

      expect(session1.state).toBe('closed');
      expect(session2.state).toBe('closed');
      expect(manager.getAllSessions()).toHaveLength(0);
    });
  });
});
