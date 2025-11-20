import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CursorExecutor } from '@/agents/cursor/executor';
import type { ExecutionTask } from '@/agents/types/agent-executor';
import type { ChildProcess } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}));

describe('CursorExecutor', () => {
  let executor: CursorExecutor;
  let mockChildProcess: Partial<ChildProcess>;
  let mockSpawn: ReturnType<typeof vi.fn>;
  let mockExec: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const childProcess = await import('child_process');
    mockSpawn = vi.mocked(childProcess.spawn);
    mockExec = vi.mocked(childProcess.exec);

    // Create mock process
    mockChildProcess = {
      pid: 12345,
      stdin: {
        write: vi.fn(),
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

  describe('constructor', () => {
    it('should create executor with default config', () => {
      executor = new CursorExecutor();
      expect(executor).toBeInstanceOf(CursorExecutor);
    });

    it('should create executor with custom config', () => {
      executor = new CursorExecutor({
        force: true,
        model: 'sonnet-4.5',
        appendPrompt: '\n\nInclude tests.',
      });
      expect(executor).toBeInstanceOf(CursorExecutor);
    });
  });

  describe('executeTask', () => {
    const task: ExecutionTask = {
      id: 'test-1',
      type: 'custom',
      prompt: 'Add login feature',
      workDir: '/tmp/test',
      config: {},
    };

    beforeEach(() => {
      executor = new CursorExecutor();
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(true);
    });

    it('should spawn cursor-agent with correct default args', async () => {
      await executor.executeTask(task);

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        ['-p', '--output-format=stream-json'],
        {
          cwd: '/tmp/test',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
    });

    it('should add --force flag when force config is true', async () => {
      executor = new CursorExecutor({ force: true });
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(true);

      await executor.executeTask(task);

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        ['-p', '--output-format=stream-json', '--force'],
        expect.any(Object)
      );
    });

    it('should add --model flag when model config is set', async () => {
      executor = new CursorExecutor({ model: 'sonnet-4.5' });
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(true);

      await executor.executeTask(task);

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        ['-p', '--output-format=stream-json', '--model', 'sonnet-4.5'],
        expect.any(Object)
      );
    });

    it('should combine force and model flags', async () => {
      executor = new CursorExecutor({ force: true, model: 'gpt-5' });
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(true);

      await executor.executeTask(task);

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        ['-p', '--output-format=stream-json', '--force', '--model', 'gpt-5'],
        expect.any(Object)
      );
    });

    it('should use custom executable path if provided', async () => {
      executor = new CursorExecutor({
        executablePath: '/custom/path/cursor-agent',
      });
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(true);

      await executor.executeTask(task);

      expect(mockSpawn).toHaveBeenCalledWith(
        '/custom/path/cursor-agent',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should write prompt to stdin and close it', async () => {
      await executor.executeTask(task);

      expect(mockChildProcess.stdin?.write).toHaveBeenCalledWith(
        'Add login feature\n'
      );
      expect(mockChildProcess.stdin?.end).toHaveBeenCalled();
    });

    it('should append prompt suffix if configured', async () => {
      executor = new CursorExecutor({
        appendPrompt: '\n\nInclude unit tests.',
      });
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(true);

      await executor.executeTask(task);

      expect(mockChildProcess.stdin?.write).toHaveBeenCalledWith(
        'Add login feature\n\nInclude unit tests.\n'
      );
    });

    it('should return SpawnedChild with wrapped process', async () => {
      const spawned = await executor.executeTask(task);

      expect(spawned.process).toBeDefined();
      expect(spawned.process.pid).toBe(12345);
      expect(spawned.process.status).toBe('busy');
    });

    it('should throw error if cursor-agent not available', async () => {
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(false);

      await expect(executor.executeTask(task)).rejects.toThrow(
        'Cursor CLI not available'
      );
    });

    it('should handle missing stdin gracefully', async () => {
      mockChildProcess.stdin = null as any;

      await expect(executor.executeTask(task)).resolves.toBeDefined();
      // Should not throw, just skip stdin operations
    });
  });

  describe('resumeTask', () => {
    const task: ExecutionTask = {
      id: 'test-2',
      type: 'custom',
      prompt: 'Continue work',
      workDir: '/tmp/test',
      config: {},
    };

    beforeEach(() => {
      executor = new CursorExecutor();
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(true);
    });

    it('should add --resume flag with session ID', async () => {
      await executor.resumeTask(task, 'sess-abc123');

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        ['-p', '--output-format=stream-json', '--resume', 'sess-abc123'],
        expect.any(Object)
      );
    });

    it('should combine --resume with --force', async () => {
      executor = new CursorExecutor({ force: true });
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(true);

      await executor.resumeTask(task, 'sess-xyz789');

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        [
          '-p',
          '--output-format=stream-json',
          '--force',
          '--resume',
          'sess-xyz789',
        ],
        expect.any(Object)
      );
    });

    it('should combine --resume with --model', async () => {
      executor = new CursorExecutor({ model: 'opus-4.1' });
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(true);

      await executor.resumeTask(task, 'sess-test');

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        [
          '-p',
          '--output-format=stream-json',
          '--model',
          'opus-4.1',
          '--resume',
          'sess-test',
        ],
        expect.any(Object)
      );
    });

    it('should write new prompt to stdin', async () => {
      await executor.resumeTask(task, 'sess-abc123');

      expect(mockChildProcess.stdin?.write).toHaveBeenCalledWith(
        'Continue work\n'
      );
      expect(mockChildProcess.stdin?.end).toHaveBeenCalled();
    });

    it('should throw error if cursor-agent not available', async () => {
      vi.spyOn(executor, 'checkAvailability').mockResolvedValue(false);

      await expect(executor.resumeTask(task, 'sess-abc123')).rejects.toThrow(
        'Cursor CLI not available'
      );
    });
  });

  describe('normalizeOutput', () => {
    beforeEach(() => {
      executor = new CursorExecutor();
    });

    it('should parse JSONL messages and yield normalized entries', async () => {
      const systemMessage = JSON.stringify({
        type: 'system',
        session_id: 'sess-test',
        model: 'GPT-5',
      });

      const userMessage = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Test prompt' }],
        },
      });

      const outputStream = (async function* () {
        yield {
          type: 'stdout' as const,
          data: Buffer.from(systemMessage + '\n' + userMessage + '\n'),
          timestamp: new Date(),
        };
      })();

      const entries = [];
      for await (const entry of executor.normalizeOutput(
        outputStream,
        '/tmp'
      )) {
        entries.push(entry);
      }

      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries[0].type.kind).toBe('system_message');
      expect(entries[1].type.kind).toBe('user_message');
    });

    it('should handle non-JSON lines as system messages', async () => {
      const outputStream = (async function* () {
        yield {
          type: 'stdout' as const,
          data: Buffer.from('Plain text output\n'),
          timestamp: new Date(),
        };
      })();

      const entries = [];
      for await (const entry of executor.normalizeOutput(
        outputStream,
        '/tmp'
      )) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe('system_message');
      expect(entries[0].content).toBe('Plain text output');
    });
  });

  describe('getCapabilities', () => {
    beforeEach(() => {
      executor = new CursorExecutor();
    });

    it('should return correct capabilities', () => {
      const caps = executor.getCapabilities();

      expect(caps).toEqual({
        supportsSessionResume: true,
        requiresSetup: true,
        supportsApprovals: false,
        supportsMcp: true,
        protocol: 'jsonl',
      });
    });
  });

  describe('checkAvailability', () => {
    beforeEach(() => {
      executor = new CursorExecutor();
    });

    it('should return true if cursor-agent is in PATH', async () => {
      mockExec.mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: '/usr/local/bin/cursor-agent\n', stderr: '' });
        return {} as any;
      });

      const available = await executor.checkAvailability();
      expect(available).toBe(true);
    });

    it('should return false if cursor-agent not found', async () => {
      mockExec.mockImplementation((cmd, callback: any) => {
        callback(new Error('not found'), { stdout: '', stderr: '' });
        return {} as any;
      });

      const available = await executor.checkAvailability();
      expect(available).toBe(false);
    });
  });
});
