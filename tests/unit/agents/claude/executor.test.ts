/**
 * ClaudeCodeExecutor Tests
 *
 * Tests for Claude Code executor functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeExecutor } from '@/agents/claude/executor';
import type { ClaudeCodeConfig } from '@/agents/claude/types/config';
import type { ExecutionTask } from '@/agents/types/agent-executor';
import type { ChildProcess } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('ClaudeCodeExecutor', () => {
  let executor: ClaudeCodeExecutor;
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
          // Call callback immediately to resolve the promise
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

  describe('Configuration', () => {
    it('should create executor with minimal config', () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
      };

      executor = new ClaudeCodeExecutor(config);
      expect(executor).toBeDefined();
    });

    it('should create executor with full config', () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        executablePath: '/usr/local/bin/claude',
        print: true,
        outputFormat: 'stream-json',
        inputFormat: 'stream-json',
        verbose: true,
        dangerouslySkipPermissions: false,
      };

      executor = new ClaudeCodeExecutor(config);
      expect(executor).toBeDefined();
    });
  });

  describe('Argument Building', () => {
    it('should build default args', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test prompt',
        workDir: '/test',
      };

      await executor.executeTask(task);

      // Verify spawn was called
      expect(mockSpawn).toHaveBeenCalled();
      const [executable, args] = mockSpawn.mock.calls[0];

      expect(executable).toBe('claude');
      expect(args).toContain('--print');
      expect(args).toContain('--output-format');
      expect(args).toContain('stream-json');
      expect(args).toContain('--input-format');
      expect(args).toContain('--permission-prompt-tool');
      expect(args).toContain('stdio');
    });

    it('should use custom executable path', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        executablePath: '/custom/path/claude',
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/test',
      };

      await executor.executeTask(task);

      const [executable] = mockSpawn.mock.calls[0];
      expect(executable).toBe('/custom/path/claude');
    });

    it('should add verbose flag when enabled', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        verbose: true,
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/test',
      };

      await executor.executeTask(task);

      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('--verbose');
    });

    it('should add dangerously-skip-permissions flag when enabled', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        dangerouslySkipPermissions: true,
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/test',
      };

      await executor.executeTask(task);

      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('--dangerously-skip-permissions');
    });

    it('should use json output format when specified', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        outputFormat: 'json',
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/test',
      };

      await executor.executeTask(task);

      const [, args] = mockSpawn.mock.calls[0];
      const formatIndex = args.indexOf('--output-format');
      expect(args[formatIndex + 1]).toBe('json');
    });
  });

  describe('Resume Session', () => {
    it('should add resume-session flag with session ID', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Continue task',
        workDir: '/test',
      };

      await executor.resumeTask(task, 'sess-abc123');

      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('--resume-session');
      expect(args).toContain('sess-abc123');
    });
  });

  describe('Capabilities', () => {
    it('should return correct capabilities', () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
      };

      executor = new ClaudeCodeExecutor(config);

      const capabilities = executor.getCapabilities();

      expect(capabilities.supportsSessionResume).toBe(true);
      expect(capabilities.requiresSetup).toBe(false);
      expect(capabilities.supportsApprovals).toBe(true);
      expect(capabilities.supportsMcp).toBe(true);
      expect(capabilities.protocol).toBe('stream-json');
    });
  });

  describe('Availability Check', () => {
    it('should return true for availability', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
      };

      executor = new ClaudeCodeExecutor(config);

      const available = await executor.checkAvailability();
      expect(available).toBe(true);
    });
  });

  describe('Process Spawning', () => {
    it('should spawn process with correct working directory', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/custom/workdir',
      };

      await executor.executeTask(task);

      const [, , options] = mockSpawn.mock.calls[0];
      expect(options.cwd).toBe('/custom/workdir');
    });

    it('should return spawned child with process info', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/test',
      };

      const result = await executor.executeTask(task);

      expect(result.process).toBeDefined();
      expect(result.process.id).toContain('claude-');
      expect(result.process.status).toBe('busy');
      expect(result.process.pid).toBe(12345);
      expect(result.process.process).toBe(mockChildProcess);
      expect(result.process.streams).toBeDefined();
      expect(result.process.streams!.stdin).toBe(mockChildProcess.stdin);
      expect(result.process.streams!.stdout).toBe(mockChildProcess.stdout);
      expect(result.process.streams!.stderr).toBe(mockChildProcess.stderr);
    });
  });

  describe('Approval Service Integration', () => {
    it('should pass approval service to client', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
      };

      executor = new ClaudeCodeExecutor(config);

      const mockApprovalService = {
        requestApproval: vi.fn().mockResolvedValue({ status: 'approved' }),
      };

      executor.setApprovalService(mockApprovalService);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/test',
      };

      await executor.executeTask(task);

      // Verify spawn was called (client creation is internal)
      expect(mockSpawn).toHaveBeenCalled();
    });
  });
});
