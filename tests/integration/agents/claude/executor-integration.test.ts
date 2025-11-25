/**
 * ClaudeCodeExecutor Integration Tests
 *
 * End-to-end tests for Claude Code executor functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeExecutor } from '@/agents/claude/executor';
import type { ClaudeCodeConfig } from '@/agents/claude/types/config';
import type { ExecutionTask } from '@/engine/types';
import type { IApprovalService } from '@/agents/types/agent-executor';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('ClaudeCodeExecutor Integration', () => {
  let executor: ClaudeCodeExecutor;
  let mockChildProcess: Partial<ChildProcess>;
  let mockSpawn: ReturnType<typeof vi.fn>;
  let stdinEmitter: EventEmitter;
  let stdoutEmitter: EventEmitter;

  beforeEach(async () => {
    const childProcess = await import('child_process');
    mockSpawn = vi.mocked(childProcess.spawn);

    // Create event emitters for stdin/stdout
    stdinEmitter = new EventEmitter();
    stdoutEmitter = new EventEmitter();

    // Create mock process with event emitters
    mockChildProcess = {
      pid: 12345,
      stdin: Object.assign(stdinEmitter, {
        write: vi.fn((data, callback) => {
          if (typeof callback === 'function') {
            callback();
          }
          return true;
        }),
        end: vi.fn(),
      }) as unknown as NodeJS.WritableStream,
      stdout: stdoutEmitter as unknown as NodeJS.ReadableStream,
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

  describe('End-to-End Task Execution', () => {
    it('should execute a simple task and receive response', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
        dangerouslySkipPermissions: true,
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-1',
        type: 'claude-code',
        prompt: 'List files in current directory',
        workDir: '/test/project',
      };

      const result = await executor.executeTask(task);

      // Verify process was spawned
      expect(result.process).toBeDefined();
      expect(result.process.pid).toBe(12345);
      expect(result.process.status).toBe('busy');

      // Verify stdin received messages
      const stdinWrite = vi.mocked(mockChildProcess.stdin!.write);
      expect(stdinWrite).toHaveBeenCalled();

      // Simulate Claude response
      setTimeout(() => {
        const systemMsg = JSON.stringify({
          type: 'system',
          sessionId: 'sess-123',
          model: 'claude-sonnet-4',
        });
        stdoutEmitter.emit('data', Buffer.from(systemMsg + '\n'));

        const assistantMsg = JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'I will list the files for you.' }],
          },
        });
        stdoutEmitter.emit('data', Buffer.from(assistantMsg + '\n'));
      }, 10);

      // Wait for messages
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should handle tool execution flow', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
        dangerouslySkipPermissions: true,
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-2',
        type: 'claude-code',
        prompt: 'Run ls command',
        workDir: '/test/project',
      };

      const result = await executor.executeTask(task);

      // Simulate tool use message
      setTimeout(() => {
        const toolUseMsg = JSON.stringify({
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
        });
        stdoutEmitter.emit('data', Buffer.from(toolUseMsg + '\n'));
      }, 10);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(result.process).toBeDefined();
    });
  });

  describe('Approval Flow Integration', () => {
    it('should integrate with approval service', async () => {
      const mockApprovalService: IApprovalService = {
        requestApproval: vi.fn().mockResolvedValue({ status: 'approved' }),
      };

      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
      };

      executor = new ClaudeCodeExecutor(config);
      executor.setApprovalService(mockApprovalService);

      const task: ExecutionTask = {
        id: 'task-3',
        type: 'claude-code',
        prompt: 'Test approval flow',
        workDir: '/test/project',
      };

      const result = await executor.executeTask(task);

      // Simulate control request
      setTimeout(() => {
        const controlRequest = JSON.stringify({
          type: 'control_request',
          requestId: 'req-123',
          request: {
            type: 'can_use_tool',
            toolName: 'Bash',
            input: { command: 'ls' },
          },
        });
        stdoutEmitter.emit('data', Buffer.from(controlRequest + '\n'));
      }, 10);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(result.process).toBeDefined();
    });

    it('should handle approval denial', async () => {
      const mockApprovalService: IApprovalService = {
        requestApproval: vi.fn().mockResolvedValue({
          status: 'denied',
          reason: 'Dangerous command',
        }),
      };

      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
      };

      executor = new ClaudeCodeExecutor(config);
      executor.setApprovalService(mockApprovalService);

      const task: ExecutionTask = {
        id: 'task-4',
        type: 'claude-code',
        prompt: 'Test denial',
        workDir: '/test/project',
      };

      const result = await executor.executeTask(task);

      // Simulate control request
      setTimeout(() => {
        const controlRequest = JSON.stringify({
          type: 'control_request',
          requestId: 'req-456',
          request: {
            type: 'can_use_tool',
            toolName: 'Bash',
            input: { command: 'rm -rf /' },
          },
        });
        stdoutEmitter.emit('data', Buffer.from(controlRequest + '\n'));
      }, 10);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(result.process).toBeDefined();
    });
  });

  describe('Session Resumption', () => {
    it('should resume previous session with session ID', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
      };

      executor = new ClaudeCodeExecutor(config);

      const task: ExecutionTask = {
        id: 'task-5',
        type: 'claude-code',
        prompt: 'Continue task',
        workDir: '/test/project',
      };

      const result = await executor.resumeTask(task, 'sess-abc123');

      // Verify spawn was called with resume flag
      expect(mockSpawn).toHaveBeenCalled();
      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('--resume');
      expect(args).toContain('sess-abc123');

      expect(result.process).toBeDefined();
    });
  });

  describe('Output Normalization Pipeline', () => {
    it('should normalize streaming output', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
      };

      executor = new ClaudeCodeExecutor(config);

      // Create mock output stream
      const outputChunks = [
        {
          data: Buffer.from(
            JSON.stringify({
              type: 'system',
              sessionId: 'sess-123',
            }) + '\n'
          ),
          type: 'stdout' as const,
        },
        {
          data: Buffer.from(
            JSON.stringify({
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello ' }],
              },
            }) + '\n'
          ),
          type: 'stdout' as const,
        },
        {
          data: Buffer.from(
            JSON.stringify({
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'world' }],
              },
            }) + '\n'
          ),
          type: 'stdout' as const,
        },
      ];

      async function* mockOutputStream() {
        for (const chunk of outputChunks) {
          yield chunk;
        }
      }

      const normalizedEntries = [];
      for await (const entry of executor.normalizeOutput(
        mockOutputStream(),
        '/test/project'
      )) {
        normalizedEntries.push(entry);
      }

      // Verify normalization
      expect(normalizedEntries.length).toBeGreaterThan(0);
      expect(normalizedEntries[0].type).toEqual({ kind: 'system_message' });

      // Verify message coalescing (both assistant chunks should have same index)
      const assistantEntries = normalizedEntries.filter(
        (e) => e.type.kind === 'assistant_message'
      );
      if (assistantEntries.length > 1) {
        expect(assistantEntries[0].index).toBe(assistantEntries[1].index);
        expect(assistantEntries[1].content).toBe('Hello world');
      }
    });

    it('should normalize tool use messages', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
      };

      executor = new ClaudeCodeExecutor(config);

      const outputChunks = [
        {
          data: Buffer.from(
            JSON.stringify({
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
            }) + '\n'
          ),
          type: 'stdout' as const,
        },
      ];

      async function* mockOutputStream() {
        for (const chunk of outputChunks) {
          yield chunk;
        }
      }

      const normalizedEntries = [];
      for await (const entry of executor.normalizeOutput(
        mockOutputStream(),
        '/test/project'
      )) {
        normalizedEntries.push(entry);
      }

      // Verify tool use normalization
      expect(normalizedEntries.length).toBe(1);
      expect(normalizedEntries[0].type.kind).toBe('tool_use');
      if (normalizedEntries[0].type.kind === 'tool_use') {
        expect(normalizedEntries[0].type.tool.toolName).toBe('Bash');
        expect(normalizedEntries[0].type.tool.action.kind).toBe('command_run');
      }
    });
  });

  describe('Error Scenarios', () => {
    it('should handle malformed JSON gracefully', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
      };

      executor = new ClaudeCodeExecutor(config);

      const outputChunks = [
        {
          data: Buffer.from('not valid json\n'),
          type: 'stdout' as const,
        },
        {
          data: Buffer.from(
            JSON.stringify({
              type: 'system',
              sessionId: 'sess-123',
            }) + '\n'
          ),
          type: 'stdout' as const,
        },
      ];

      async function* mockOutputStream() {
        for (const chunk of outputChunks) {
          yield chunk;
        }
      }

      const normalizedEntries = [];
      for await (const entry of executor.normalizeOutput(
        mockOutputStream(),
        '/test/project'
      )) {
        normalizedEntries.push(entry);
      }

      // Should skip malformed JSON and process valid message
      expect(normalizedEntries.length).toBe(1);
      expect(normalizedEntries[0].type).toEqual({ kind: 'system_message' });
    });

    it('should handle empty lines', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
      };

      executor = new ClaudeCodeExecutor(config);

      const outputChunks = [
        {
          data: Buffer.from('\n\n'),
          type: 'stdout' as const,
        },
        {
          data: Buffer.from(
            JSON.stringify({
              type: 'user',
              message: {
                role: 'user',
                content: 'Test',
              },
            }) + '\n'
          ),
          type: 'stdout' as const,
        },
      ];

      async function* mockOutputStream() {
        for (const chunk of outputChunks) {
          yield chunk;
        }
      }

      const normalizedEntries = [];
      for await (const entry of executor.normalizeOutput(
        mockOutputStream(),
        '/test/project'
      )) {
        normalizedEntries.push(entry);
      }

      // Should skip empty lines
      expect(normalizedEntries.length).toBe(1);
      expect(normalizedEntries[0].type).toEqual({ kind: 'user_message' });
    });

    it('should handle partial JSON across chunks', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
      };

      executor = new ClaudeCodeExecutor(config);

      const message = JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Long message' }],
        },
      });

      // Split message across chunks
      const mid = Math.floor(message.length / 2);
      const outputChunks = [
        {
          data: Buffer.from(message.slice(0, mid)),
          type: 'stdout' as const,
        },
        {
          data: Buffer.from(message.slice(mid) + '\n'),
          type: 'stdout' as const,
        },
      ];

      async function* mockOutputStream() {
        for (const chunk of outputChunks) {
          yield chunk;
        }
      }

      const normalizedEntries = [];
      for await (const entry of executor.normalizeOutput(
        mockOutputStream(),
        '/test/project'
      )) {
        normalizedEntries.push(entry);
      }

      // Should handle partial JSON and reassemble
      expect(normalizedEntries.length).toBe(1);
      expect(normalizedEntries[0].type).toEqual({ kind: 'assistant_message' });
      expect(normalizedEntries[0].content).toBe('Long message');
    });
  });

  describe('Capabilities', () => {
    it('should report correct capabilities', () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
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
    it('should check availability', async () => {
      const config: ClaudeCodeConfig = {
        workDir: '/test/project',
      };

      executor = new ClaudeCodeExecutor(config);

      const available = await executor.checkAvailability();
      expect(available).toBe(true);
    });
  });
});
