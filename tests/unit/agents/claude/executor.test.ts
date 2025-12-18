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
      // NOTE: --input-format stream-json is included for bidirectional protocol
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

    it('should add --settings with directory guard hook when restrictToWorkDir is enabled', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        restrictToWorkDir: true,
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/project/workspace',
      };

      await executor.executeTask(task);

      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('--settings');

      // Find the settings JSON
      const settingsIndex = args.indexOf('--settings');
      const settingsJson = args[settingsIndex + 1];
      const settings = JSON.parse(settingsJson);

      // Verify hook configuration
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PreToolUse).toBeDefined();
      expect(settings.hooks.PreToolUse).toHaveLength(1);
      expect(settings.hooks.PreToolUse[0].matcher).toBe('Read|Edit|Write|MultiEdit|Glob|Grep');
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain('CLAUDE_WORKDIR=');
    });

    it('should not add --settings when restrictToWorkDir is disabled', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        restrictToWorkDir: false,
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
      expect(args).not.toContain('--settings');
    });

    it('should use custom hook path when directoryGuardHookPath is specified', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        restrictToWorkDir: true,
        directoryGuardHookPath: '/custom/path/to/hook.js',
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/project/workspace',
      };

      await executor.executeTask(task);

      const [, args] = mockSpawn.mock.calls[0];
      const settingsIndex = args.indexOf('--settings');
      const settingsJson = args[settingsIndex + 1];
      const settings = JSON.parse(settingsJson);

      expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain('/custom/path/to/hook.js');
    });

    it('should use npx tsx for TypeScript hook paths', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        restrictToWorkDir: true,
        directoryGuardHookPath: '/path/to/hook.ts',
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/project/workspace',
      };

      await executor.executeTask(task);

      const [, args] = mockSpawn.mock.calls[0];
      const settingsIndex = args.indexOf('--settings');
      const settingsJson = args[settingsIndex + 1];
      const settings = JSON.parse(settingsJson);

      expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain('npx tsx');
    });

    it('should use node for JavaScript hook paths', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        restrictToWorkDir: true,
        directoryGuardHookPath: '/path/to/hook.js',
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'Test',
        workDir: '/project/workspace',
      };

      await executor.executeTask(task);

      const [, args] = mockSpawn.mock.calls[0];
      const settingsIndex = args.indexOf('--settings');
      const settingsJson = args[settingsIndex + 1];
      const settings = JSON.parse(settingsJson);

      expect(settings.hooks.PreToolUse[0].hooks[0].command).toMatch(/CLAUDE_WORKDIR=.*node /);
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
      expect(args).toContain('--resume');
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
      expect(capabilities.supportsMidExecutionMessages).toBe(true);
    });
  });

  describe('Mid-Execution Messaging', () => {
    it('should send message via peer when sendMessage is called', async () => {
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

      // Send a mid-execution message
      await executor.sendMessage(result.process, 'Additional instruction');

      // Verify stdin.write was called with user message JSON
      const writeCall = (mockChildProcess.stdin!.write as ReturnType<typeof vi.fn>).mock.calls;
      // Find the call that contains the additional instruction
      const hasAdditionalMessage = writeCall.some((call: unknown[]) =>
        String(call[0]).includes('Additional instruction')
      );
      expect(hasAdditionalMessage).toBe(true);
    });

    it('should throw error when sendMessage is called without peer', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
      };

      executor = new ClaudeCodeExecutor(config);

      // Create a mock process without peer
      const processWithoutPeer = {
        id: 'test-process',
        pid: 12345,
        status: 'busy' as const,
        spawnedAt: new Date(),
        lastActivity: new Date(),
        exitCode: null,
        signal: null,
        process: mockChildProcess,
        streams: {
          stdin: mockChildProcess.stdin!,
          stdout: mockChildProcess.stdout!,
          stderr: mockChildProcess.stderr!,
        },
        metrics: { totalDuration: 0, tasksCompleted: 0, successRate: 0 },
        // No peer attached!
      };

      await expect(
        executor.sendMessage(processWithoutPeer, 'test')
      ).rejects.toThrow('Process does not have protocol peer attached');
    });

    it('should send interrupt via peer when interrupt is called', async () => {
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

      // Send interrupt
      await executor.interrupt(result.process);

      // Verify stdin.write was called with interrupt control message
      const writeCall = (mockChildProcess.stdin!.write as ReturnType<typeof vi.fn>).mock.calls;
      const hasInterrupt = writeCall.some((call: unknown[]) =>
        String(call[0]).includes('"type":"control"') &&
        String(call[0]).includes('"interrupt"')
      );
      expect(hasInterrupt).toBe(true);
    });

    it('should fallback to SIGINT when interrupt is called without peer', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
      };

      executor = new ClaudeCodeExecutor(config);

      // Create a mock process without peer but with process handle
      const processWithoutPeer = {
        id: 'test-process',
        pid: 12345,
        status: 'busy' as const,
        spawnedAt: new Date(),
        lastActivity: new Date(),
        exitCode: null,
        signal: null,
        process: mockChildProcess,
        streams: {
          stdin: mockChildProcess.stdin!,
          stdout: mockChildProcess.stdout!,
          stderr: mockChildProcess.stderr!,
        },
        metrics: { totalDuration: 0, tasksCompleted: 0, successRate: 0 },
        // No peer attached!
      };

      await executor.interrupt(processWithoutPeer);

      // Verify kill was called with SIGINT
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGINT');
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

  describe('Disallowed Tools', () => {
    it('should add --disallowed-tools flag with tool names', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        disallowedTools: ['EnterPlanMode', 'Bash', 'SlashCommand'],
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
      expect(args).toContain('--disallowed-tools');

      // Find the index of --disallowed-tools
      const disallowedIndex = args.indexOf('--disallowed-tools');
      expect(disallowedIndex).toBeGreaterThan(-1);

      // Verify the tool names follow the flag
      expect(args[disallowedIndex + 1]).toBe('EnterPlanMode');
      expect(args[disallowedIndex + 2]).toBe('Bash');
      expect(args[disallowedIndex + 3]).toBe('SlashCommand');
    });

    it('should not add --disallowed-tools flag when empty array', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        disallowedTools: [],
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
      expect(args).not.toContain('--disallowed-tools');
    });

    it('should not add --disallowed-tools flag when undefined', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        // No disallowedTools field
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
      expect(args).not.toContain('--disallowed-tools');
    });

    it('should work with single disallowed tool', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test',
        disallowedTools: ['Bash'],
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
      expect(args).toContain('--disallowed-tools');

      const disallowedIndex = args.indexOf('--disallowed-tools');
      expect(args[disallowedIndex + 1]).toBe('Bash');
    });
  });
});
