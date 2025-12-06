/**
 * ClaudeSession Tests
 *
 * Tests for high-level session wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeSession, type SessionState } from '@/agents/claude/session';
import type { ClaudeCodeConfig } from '@/agents/claude/types/config';
import type { ChildProcess } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('ClaudeSession', () => {
  let session: ClaudeSession;
  let mockChildProcess: Partial<ChildProcess>;
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const childProcess = await import('child_process');
    mockSpawn = vi.mocked(childProcess.spawn);

    // Create mock process with proper async stdin.write
    mockChildProcess = {
      pid: 12345,
      stdin: {
        write: vi.fn((data, callback) => {
          if (typeof callback === 'function') {
            callback();
          }
          return true;
        }),
        end: vi.fn(),
      } as unknown as NodeJS.WritableStream,
      stdout: {
        on: vi.fn(),
        pipe: vi.fn(),
      } as unknown as NodeJS.ReadableStream,
      stderr: {
        on: vi.fn(),
        pipe: vi.fn(),
      } as unknown as NodeJS.ReadableStream,
      on: vi.fn(),
      kill: vi.fn(),
    };

    mockSpawn.mockReturnValue(mockChildProcess as ChildProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session State', () => {
    it('should start in idle state', () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      expect(session.getState()).toBe('idle');
      expect(session.isRunning()).toBe(false);
    });

    it('should transition to running state after start', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');

      expect(session.getState()).toBe('running');
      expect(session.isRunning()).toBe(true);
    });

    it('should transition to interrupted state after interrupt', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');
      await session.interrupt();

      expect(session.getState()).toBe('interrupted');
      expect(session.isRunning()).toBe(false);
    });

    it('should transition to closed state after close', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');
      await session.close();

      expect(session.getState()).toBe('closed');
      expect(session.isRunning()).toBe(false);
    });
  });

  describe('start()', () => {
    it('should start session with prompt', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Build a feature');

      expect(mockSpawn).toHaveBeenCalled();
      expect(session.getProcess()).not.toBeNull();
    });

    it('should use workDir from config if not provided', async () => {
      const config: ClaudeCodeConfig = { workDir: '/default/path' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');

      const [, , options] = mockSpawn.mock.calls[0];
      expect(options.cwd).toBe('/default/path');
    });

    it('should use provided workDir over config', async () => {
      const config: ClaudeCodeConfig = { workDir: '/default/path' };
      session = new ClaudeSession(config);

      await session.start('Test prompt', '/custom/path');

      const [, , options] = mockSpawn.mock.calls[0];
      expect(options.cwd).toBe('/custom/path');
    });

    it('should throw if session already started', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');

      await expect(session.start('Another prompt')).rejects.toThrow(
        'Cannot start session in state: running'
      );
    });

    it('should throw if session is closed', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');
      await session.close();

      await expect(session.start('Another prompt')).rejects.toThrow(
        'Cannot start session in state: closed'
      );
    });
  });

  describe('sendMessage()', () => {
    it('should send message when session is running', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Initial prompt');
      await session.sendMessage('Additional guidance');

      // Verify message was written to stdin
      const writeCall = (mockChildProcess.stdin!.write as ReturnType<typeof vi.fn>).mock.calls;
      const hasMessage = writeCall.some((call: unknown[]) =>
        String(call[0]).includes('Additional guidance')
      );
      expect(hasMessage).toBe(true);
    });

    it('should throw if session not started', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await expect(session.sendMessage('Test')).rejects.toThrow(
        'Cannot send message in state: idle'
      );
    });

    it('should throw if session is interrupted', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');
      await session.interrupt();

      await expect(session.sendMessage('Test')).rejects.toThrow(
        'Cannot send message in state: interrupted'
      );
    });

    it('should throw if session is closed', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');
      await session.close();

      await expect(session.sendMessage('Test')).rejects.toThrow(
        'Cannot send message in state: closed'
      );
    });

    it('should support multiple messages', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Initial prompt');
      await session.sendMessage('First message');
      await session.sendMessage('Second message');
      await session.sendMessage('Third message');

      // Verify all messages were written
      const writeCall = (mockChildProcess.stdin!.write as ReturnType<typeof vi.fn>).mock.calls;
      const hasFirst = writeCall.some((call: unknown[]) =>
        String(call[0]).includes('First message')
      );
      const hasSecond = writeCall.some((call: unknown[]) =>
        String(call[0]).includes('Second message')
      );
      const hasThird = writeCall.some((call: unknown[]) =>
        String(call[0]).includes('Third message')
      );
      expect(hasFirst).toBe(true);
      expect(hasSecond).toBe(true);
      expect(hasThird).toBe(true);
    });
  });

  describe('interrupt()', () => {
    it('should send interrupt when session is running', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');
      await session.interrupt();

      // Verify interrupt was written to stdin
      const writeCall = (mockChildProcess.stdin!.write as ReturnType<typeof vi.fn>).mock.calls;
      const hasInterrupt = writeCall.some((call: unknown[]) =>
        String(call[0]).includes('"type":"control"') &&
        String(call[0]).includes('"interrupt"')
      );
      expect(hasInterrupt).toBe(true);
    });

    it('should throw if session not started', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await expect(session.interrupt()).rejects.toThrow(
        'Cannot interrupt in state: idle'
      );
    });

    it('should throw if session already interrupted', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');
      await session.interrupt();

      await expect(session.interrupt()).rejects.toThrow(
        'Cannot interrupt in state: interrupted'
      );
    });
  });

  describe('close()', () => {
    it('should close running session', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');
      await session.close();

      expect(session.getState()).toBe('closed');
      expect(session.getProcess()).toBeNull();
    });

    it('should be idempotent', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');
      await session.close();
      await session.close(); // Should not throw

      expect(session.getState()).toBe('closed');
    });

    it('should close idle session', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.close();

      expect(session.getState()).toBe('closed');
    });
  });

  describe('getProcess()', () => {
    it('should return null before start', () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      expect(session.getProcess()).toBeNull();
    });

    it('should return process after start', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');

      const process = session.getProcess();
      expect(process).not.toBeNull();
      expect(process!.pid).toBe(12345);
    });

    it('should return null after close', async () => {
      const config: ClaudeCodeConfig = { workDir: '/test' };
      session = new ClaudeSession(config);

      await session.start('Test prompt');
      await session.close();

      expect(session.getProcess()).toBeNull();
    });
  });
});
