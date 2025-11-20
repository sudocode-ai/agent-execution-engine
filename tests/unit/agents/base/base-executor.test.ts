/**
 * Unit tests for BaseAgentExecutor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { BaseAgentExecutor } from '@/agents/base/base-executor';
import type {
  AgentCapabilities,
  OutputChunk,
  SpawnedChild,
  NormalizedEntry,
  IApprovalService,
  ApprovalRequest,
  ApprovalDecision,
} from '@/agents/types/agent-executor';
import type { ExecutionTask } from '@/engine/types';
import type { ManagedProcess } from '@/process/types';

// Concrete test implementation of BaseAgentExecutor
class TestExecutor extends BaseAgentExecutor {
  async executeTask(_task: ExecutionTask): Promise<SpawnedChild> {
    throw new Error('Not implemented for testing');
  }

  async resumeTask(_task: ExecutionTask, _sessionId: string): Promise<SpawnedChild> {
    throw new Error('Not implemented for testing');
  }

  async *normalizeOutput(
    _stream: AsyncIterable<OutputChunk>,
    _workDir: string,
  ): AsyncIterable<NormalizedEntry> {
    // Empty generator for testing
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsSessionResume: false,
      requiresSetup: false,
      supportsApprovals: false,
      supportsMcp: false,
      protocol: 'custom',
    };
  }
}

describe('BaseAgentExecutor', () => {
  let executor: TestExecutor;

  beforeEach(() => {
    executor = new TestExecutor();
  });

  describe('setApprovalService', () => {
    it('should set approval service', () => {
      const service: IApprovalService = {
        requestApproval: vi.fn(),
      };

      executor.setApprovalService(service);

      expect((executor as any).approvalService).toBe(service);
    });

    it('should replace existing approval service', () => {
      const service1: IApprovalService = {
        requestApproval: vi.fn(),
      };
      const service2: IApprovalService = {
        requestApproval: vi.fn(),
      };

      executor.setApprovalService(service1);
      executor.setApprovalService(service2);

      expect((executor as any).approvalService).toBe(service2);
    });
  });

  describe('checkAvailability', () => {
    it('should return true by default', async () => {
      const available = await executor.checkAvailability();
      expect(available).toBe(true);
    });

    it('should allow subclasses to override', async () => {
      class CustomExecutor extends TestExecutor {
        override async checkAvailability(): Promise<boolean> {
          return false;
        }
      }

      const customExecutor = new CustomExecutor();
      const available = await customExecutor.checkAvailability();
      expect(available).toBe(false);
    });
  });

  describe('requestApproval (protected)', () => {
    it('should auto-approve when no approval service is set', async () => {
      const request: ApprovalRequest = {
        requestId: 'test-1',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
      };

      const decision = await (executor as any).requestApproval(request);

      expect(decision.status).toBe('approved');
    });

    it('should delegate to approval service when set', async () => {
      const mockDecision: ApprovalDecision = { status: 'denied', reason: 'Not allowed' };
      const service: IApprovalService = {
        requestApproval: vi.fn().mockResolvedValue(mockDecision),
      };

      executor.setApprovalService(service);

      const request: ApprovalRequest = {
        requestId: 'test-1',
        toolName: 'Bash',
        toolInput: { command: 'rm -rf /' },
        context: 'Dangerous command',
      };

      const decision = await (executor as any).requestApproval(request);

      expect(service.requestApproval).toHaveBeenCalledWith(request);
      expect(decision).toEqual(mockDecision);
    });

    it('should pass through approved decision', async () => {
      const service: IApprovalService = {
        requestApproval: vi.fn().mockResolvedValue({ status: 'approved' }),
      };

      executor.setApprovalService(service);

      const request: ApprovalRequest = {
        requestId: 'test-2',
        toolName: 'Read',
        toolInput: { path: '/file.txt' },
      };

      const decision = await (executor as any).requestApproval(request);

      expect(decision.status).toBe('approved');
    });

    it('should pass through timeout decision', async () => {
      const service: IApprovalService = {
        requestApproval: vi.fn().mockResolvedValue({ status: 'timeout' }),
      };

      executor.setApprovalService(service);

      const request: ApprovalRequest = {
        requestId: 'test-3',
        toolName: 'Write',
        toolInput: { path: '/file.txt', content: 'test' },
      };

      const decision = await (executor as any).requestApproval(request);

      expect(decision.status).toBe('timeout');
    });
  });

  describe('wrapChildProcess (protected)', () => {
    it('should convert ChildProcess to ManagedProcess', () => {
      const child = spawn('echo', ['test']);

      const managed: ManagedProcess = (executor as any).wrapChildProcess(child);

      expect(managed).toHaveProperty('id');
      expect(managed.id).toMatch(/^proc-/);
      expect(managed.pid).toBe(child.pid);
      expect(managed.status).toBe('busy');
      expect(managed.spawnedAt).toBeInstanceOf(Date);
      expect(managed.lastActivity).toBeInstanceOf(Date);
      expect(managed.exitCode).toBeNull();
      expect(managed.signal).toBeNull();
      expect(managed.process).toBe(child);

      // Cleanup
      child.kill();
    });

    it('should include streams', () => {
      const child = spawn('echo', ['test']);

      const managed: ManagedProcess = (executor as any).wrapChildProcess(child);

      expect(managed.streams).toBeDefined();
      expect(managed.streams?.stdout).toBe(child.stdout);
      expect(managed.streams?.stderr).toBe(child.stderr);
      expect(managed.streams?.stdin).toBe(child.stdin);

      child.kill();
    });

    it('should initialize metrics', () => {
      const child = spawn('echo', ['test']);

      const managed: ManagedProcess = (executor as any).wrapChildProcess(child);

      expect(managed.metrics).toEqual({
        totalDuration: 0,
        tasksCompleted: 0,
        successRate: 1,
      });

      child.kill();
    });

    it('should generate unique IDs for different processes', () => {
      const child1 = spawn('echo', ['test1']);
      const child2 = spawn('echo', ['test2']);

      const managed1: ManagedProcess = (executor as any).wrapChildProcess(child1);
      const managed2: ManagedProcess = (executor as any).wrapChildProcess(child2);

      expect(managed1.id).not.toBe(managed2.id);

      child1.kill();
      child2.kill();
    });
  });

  describe('createOutputChunks (protected)', () => {
    it('should throw error if process has no streams', async () => {
      const process: ManagedProcess = {
        id: 'test',
        pid: 12345,
        status: 'busy',
        spawnedAt: new Date(),
        lastActivity: new Date(),
        exitCode: null,
        signal: null,
        metrics: {
          totalDuration: 0,
          tasksCompleted: 0,
          successRate: 1,
        },
      };

      const generator = (executor as any).createOutputChunks(process);

      await expect(generator.next()).rejects.toThrow('Process does not have streams available');
    });

    it('should create output chunks from stdout', async () => {
      const stdout = new Readable();
      stdout.push('hello\n');
      stdout.push('world\n');
      stdout.push(null); // End stream

      const stderr = new Readable();
      stderr.push(null);

      const process: ManagedProcess = {
        id: 'test',
        pid: 12345,
        status: 'busy',
        spawnedAt: new Date(),
        lastActivity: new Date(),
        exitCode: null,
        signal: null,
        streams: {
          stdout,
          stderr,
          stdin: null as any,
        },
        metrics: {
          totalDuration: 0,
          tasksCompleted: 0,
          successRate: 1,
        },
      };

      const chunks: OutputChunk[] = [];
      for await (const chunk of (executor as any).createOutputChunks(process)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every((c) => c.type === 'stdout' || c.type === 'stderr')).toBe(true);
      expect(chunks.every((c) => Buffer.isBuffer(c.data))).toBe(true);
      expect(chunks.every((c) => c.timestamp instanceof Date)).toBe(true);
    });

    it('should create output chunks from stderr', async () => {
      const stdout = new Readable();
      stdout.push(null);

      const stderr = new Readable();
      stderr.push('error\n');
      stderr.push(null);

      const process: ManagedProcess = {
        id: 'test',
        pid: 12345,
        status: 'busy',
        spawnedAt: new Date(),
        lastActivity: new Date(),
        exitCode: null,
        signal: null,
        streams: {
          stdout,
          stderr,
          stdin: null as any,
        },
        metrics: {
          totalDuration: 0,
          tasksCompleted: 0,
          successRate: 1,
        },
      };

      const chunks: OutputChunk[] = [];
      for await (const chunk of (executor as any).createOutputChunks(process)) {
        chunks.push(chunk);
      }

      const stderrChunks = chunks.filter((c) => c.type === 'stderr');
      expect(stderrChunks.length).toBeGreaterThan(0);
    });

    it('should handle both stdout and stderr', async () => {
      const stdout = new Readable();
      stdout.push('output\n');
      stdout.push(null);

      const stderr = new Readable();
      stderr.push('error\n');
      stderr.push(null);

      const process: ManagedProcess = {
        id: 'test',
        pid: 12345,
        status: 'busy',
        spawnedAt: new Date(),
        lastActivity: new Date(),
        exitCode: null,
        signal: null,
        streams: {
          stdout,
          stderr,
          stdin: null as any,
        },
        metrics: {
          totalDuration: 0,
          tasksCompleted: 0,
          successRate: 1,
        },
      };

      const chunks: OutputChunk[] = [];
      for await (const chunk of (executor as any).createOutputChunks(process)) {
        chunks.push(chunk);
      }

      const stdoutChunks = chunks.filter((c) => c.type === 'stdout');
      const stderrChunks = chunks.filter((c) => c.type === 'stderr');

      expect(stdoutChunks.length).toBeGreaterThan(0);
      expect(stderrChunks.length).toBeGreaterThan(0);
    });

    it('should convert non-Buffer chunks to Buffer', async () => {
      const stdout = new Readable();
      stdout.push('string data');
      stdout.push(null);

      const stderr = new Readable();
      stderr.push(null);

      const process: ManagedProcess = {
        id: 'test',
        pid: 12345,
        status: 'busy',
        spawnedAt: new Date(),
        lastActivity: new Date(),
        exitCode: null,
        signal: null,
        streams: {
          stdout,
          stderr,
          stdin: null as any,
        },
        metrics: {
          totalDuration: 0,
          tasksCompleted: 0,
          successRate: 1,
        },
      };

      const chunks: OutputChunk[] = [];
      for await (const chunk of (executor as any).createOutputChunks(process)) {
        chunks.push(chunk);
      }

      expect(chunks.every((c) => Buffer.isBuffer(c.data))).toBe(true);
    });
  });

  describe('abstract methods', () => {
    it('should require subclasses to implement executeTask', async () => {
      expect(TestExecutor.prototype.executeTask).toBeDefined();
      const task = {} as ExecutionTask;
      await expect(executor.executeTask(task)).rejects.toThrow('Not implemented for testing');
    });

    it('should require subclasses to implement resumeTask', async () => {
      expect(TestExecutor.prototype.resumeTask).toBeDefined();
      const task = {} as ExecutionTask;
      await expect(executor.resumeTask(task, 'session-123')).rejects.toThrow(
        'Not implemented for testing',
      );
    });

    it('should require subclasses to implement normalizeOutput', () => {
      expect(TestExecutor.prototype.normalizeOutput).toBeDefined();
    });

    it('should require subclasses to implement getCapabilities', () => {
      expect(TestExecutor.prototype.getCapabilities).toBeDefined();
      const caps = executor.getCapabilities();
      expect(caps).toHaveProperty('supportsSessionResume');
      expect(caps).toHaveProperty('requiresSetup');
      expect(caps).toHaveProperty('supportsApprovals');
      expect(caps).toHaveProperty('supportsMcp');
      expect(caps).toHaveProperty('protocol');
    });
  });

  describe('integration scenarios', () => {
    it('should support complete executor workflow', async () => {
      // 1. Create executor
      const testExecutor = new TestExecutor();

      // 2. Set approval service
      const approvalService: IApprovalService = {
        requestApproval: vi.fn().mockResolvedValue({ status: 'approved' }),
      };
      testExecutor.setApprovalService(approvalService);

      // 3. Check availability
      const available = await testExecutor.checkAvailability();
      expect(available).toBe(true);

      // 4. Get capabilities
      const caps = testExecutor.getCapabilities();
      expect(caps.protocol).toBe('custom');

      // 5. Request approval (protected method)
      const decision = await (testExecutor as any).requestApproval({
        requestId: 'test',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
      });
      expect(decision.status).toBe('approved');
    });

    it('should support executor without approval service', async () => {
      const testExecutor = new TestExecutor();

      // No approval service set
      const decision = await (testExecutor as any).requestApproval({
        requestId: 'test',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
      });

      // Should auto-approve
      expect(decision.status).toBe('approved');
    });
  });
});
