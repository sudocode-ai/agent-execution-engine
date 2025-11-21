/**
 * Unit tests for IAgentExecutor interface and related types
 *
 * Tests type exports, discriminated unions, and interface contracts.
 */

import { describe, it, expect } from 'vitest';
import type {
  IAgentExecutor,
  AgentCapabilities,
  OutputChunk,
  SpawnedChild,
  NormalizedEntry,
  NormalizedEntryType,
  ToolUseEntry,
  ActionType,
  IApprovalService,
  ApprovalRequest,
  ApprovalDecision,
  ProtocolType,
} from '@/agents/types/agent-executor';
import type { ManagedProcess } from '@/process/types';
import type { ExecutionTask } from '@/engine/types';

describe('IAgentExecutor Interface', () => {
  it('should export IAgentExecutor interface', () => {
    // This test verifies that the interface is properly exported
    // and can be used in type annotations
    const _executor: IAgentExecutor = {
      executeTask: async (_task: ExecutionTask): Promise<SpawnedChild> => {
        throw new Error('Not implemented');
      },
      resumeTask: async (_task: ExecutionTask, _sessionId: string): Promise<SpawnedChild> => {
        throw new Error('Not implemented');
      },
      normalizeOutput: async function* (
        _stream: AsyncIterable<OutputChunk>,
        _workDir: string,
      ): AsyncIterable<NormalizedEntry> {
        // Empty generator
      },
      getCapabilities: (): AgentCapabilities => ({
        supportsSessionResume: false,
        requiresSetup: false,
        supportsApprovals: false,
        supportsMcp: false,
        protocol: 'custom',
      }),
      checkAvailability: async (): Promise<boolean> => true,
    };

    expect(_executor).toBeDefined();
  });

  it('should allow optional setApprovalService method', () => {
    const executorWithApprovals: IAgentExecutor = {
      executeTask: async (_task: ExecutionTask): Promise<SpawnedChild> => {
        throw new Error('Not implemented');
      },
      resumeTask: async (_task: ExecutionTask, _sessionId: string): Promise<SpawnedChild> => {
        throw new Error('Not implemented');
      },
      normalizeOutput: async function* (): AsyncIterable<NormalizedEntry> {
        // Empty
      },
      getCapabilities: (): AgentCapabilities => ({
        supportsSessionResume: false,
        requiresSetup: false,
        supportsApprovals: true,
        supportsMcp: false,
        protocol: 'custom',
      }),
      checkAvailability: async (): Promise<boolean> => true,
      setApprovalService: (_service: IApprovalService): void => {
        // Implementation
      },
    };

    expect(executorWithApprovals.setApprovalService).toBeDefined();
  });
});

describe('AgentCapabilities', () => {
  it('should support all protocol types', () => {
    const protocols: ProtocolType[] = ['acp', 'jsonrpc', 'stream-json', 'jsonl', 'custom'];

    protocols.forEach((protocol) => {
      const caps: AgentCapabilities = {
        supportsSessionResume: true,
        requiresSetup: false,
        supportsApprovals: true,
        supportsMcp: true,
        protocol,
      };

      expect(caps.protocol).toBe(protocol);
    });
  });

  it('should correctly declare capabilities', () => {
    const claudeCaps: AgentCapabilities = {
      supportsSessionResume: true,
      requiresSetup: false,
      supportsApprovals: true,
      supportsMcp: true,
      protocol: 'stream-json',
    };

    expect(claudeCaps.supportsSessionResume).toBe(true);
    expect(claudeCaps.supportsApprovals).toBe(true);

    const cursorCaps: AgentCapabilities = {
      supportsSessionResume: true,
      requiresSetup: true,
      supportsApprovals: false,
      supportsMcp: true,
      protocol: 'jsonl',
    };

    expect(cursorCaps.requiresSetup).toBe(true);
    expect(cursorCaps.supportsApprovals).toBe(false);
  });
});

describe('OutputChunk', () => {
  it('should properly type stdout chunks', () => {
    const chunk: OutputChunk = {
      type: 'stdout',
      data: Buffer.from('test output'),
      timestamp: new Date(),
    };

    expect(chunk.type).toBe('stdout');
    expect(chunk.data).toBeInstanceOf(Buffer);
    expect(chunk.timestamp).toBeInstanceOf(Date);
  });

  it('should properly type stderr chunks', () => {
    const chunk: OutputChunk = {
      type: 'stderr',
      data: Buffer.from('error message'),
      timestamp: new Date(),
    };

    expect(chunk.type).toBe('stderr');
  });
});

describe('SpawnedChild', () => {
  it('should include ManagedProcess', () => {
    const mockProcess: ManagedProcess = {
      id: 'proc-123',
      pid: 12345,
      status: 'idle',
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

    const spawned: SpawnedChild = {
      process: mockProcess,
    };

    expect(spawned.process.id).toBe('proc-123');
    expect(spawned.process.pid).toBe(12345);
  });

  it('should support optional exit signal', () => {
    const mockProcess: ManagedProcess = {
      id: 'proc-123',
      pid: 12345,
      status: 'idle',
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

    const exitSignal = Promise.resolve();

    const spawned: SpawnedChild = {
      process: mockProcess,
      exitSignal,
    };

    expect(spawned.exitSignal).toBeDefined();
  });
});

describe('NormalizedEntry', () => {
  it('should support system messages', () => {
    const entry: NormalizedEntry = {
      index: 0,
      timestamp: new Date(),
      type: { kind: 'system_message' },
      content: 'System initialized',
    };

    expect(entry.type.kind).toBe('system_message');
  });

  it('should support user messages', () => {
    const entry: NormalizedEntry = {
      index: 1,
      type: { kind: 'user_message' },
      content: 'User prompt',
    };

    expect(entry.type.kind).toBe('user_message');
  });

  it('should support assistant messages', () => {
    const entry: NormalizedEntry = {
      index: 2,
      type: { kind: 'assistant_message' },
      content: 'Assistant response',
    };

    expect(entry.type.kind).toBe('assistant_message');
  });

  it('should support thinking entries with optional reasoning', () => {
    const entryWithReasoning: NormalizedEntry = {
      index: 3,
      type: { kind: 'thinking', reasoning: 'Analyzing the problem...' },
      content: 'Thinking about solution',
    };

    expect(entryWithReasoning.type.kind).toBe('thinking');
    if (entryWithReasoning.type.kind === 'thinking') {
      expect(entryWithReasoning.type.reasoning).toBe('Analyzing the problem...');
    }

    const entryWithoutReasoning: NormalizedEntry = {
      index: 4,
      type: { kind: 'thinking' },
      content: 'Processing...',
    };

    expect(entryWithoutReasoning.type.kind).toBe('thinking');
  });

  it('should support tool use entries', () => {
    const toolEntry: ToolUseEntry = {
      toolName: 'Bash',
      action: { kind: 'command_run', command: 'npm test' },
      status: 'running',
    };

    const entry: NormalizedEntry = {
      index: 5,
      type: { kind: 'tool_use', tool: toolEntry },
      content: 'Running command: npm test',
    };

    expect(entry.type.kind).toBe('tool_use');
    if (entry.type.kind === 'tool_use') {
      expect(entry.type.tool.toolName).toBe('Bash');
      expect(entry.type.tool.status).toBe('running');
    }
  });

  it('should support error entries', () => {
    const entry: NormalizedEntry = {
      index: 6,
      type: {
        kind: 'error',
        error: {
          message: 'Command failed',
          code: 'ENOENT',
        },
      },
      content: 'Error occurred',
    };

    expect(entry.type.kind).toBe('error');
    if (entry.type.kind === 'error') {
      expect(entry.type.error.message).toBe('Command failed');
      expect(entry.type.error.code).toBe('ENOENT');
    }
  });

  it('should support optional metadata', () => {
    const entry: NormalizedEntry = {
      index: 7,
      type: { kind: 'assistant_message' },
      content: 'Response',
      metadata: {
        model: 'claude-sonnet-4',
        tokens: 150,
      },
    };

    expect(entry.metadata?.model).toBe('claude-sonnet-4');
    expect(entry.metadata?.tokens).toBe(150);
  });
});

describe('ActionType discriminated union', () => {
  it('should support file read action', () => {
    const action: ActionType = {
      kind: 'file_read',
      path: '/path/to/file.ts',
    };

    expect(action.kind).toBe('file_read');
    if (action.kind === 'file_read') {
      expect(action.path).toBe('/path/to/file.ts');
    }
  });

  it('should support file write action', () => {
    const action: ActionType = {
      kind: 'file_write',
      path: '/path/to/output.txt',
    };

    expect(action.kind).toBe('file_write');
  });

  it('should support file edit action with changes', () => {
    const action: ActionType = {
      kind: 'file_edit',
      path: '/path/to/file.ts',
      changes: [
        {
          type: 'edit',
          unifiedDiff: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new',
        },
      ],
    };

    expect(action.kind).toBe('file_edit');
    if (action.kind === 'file_edit') {
      expect(action.changes).toHaveLength(1);
      expect(action.changes[0].type).toBe('edit');
    }
  });

  it('should support command run action', () => {
    const action: ActionType = {
      kind: 'command_run',
      command: 'npm test',
      result: {
        exitCode: 0,
        stdout: 'All tests passed',
        stderr: '',
      },
    };

    expect(action.kind).toBe('command_run');
    if (action.kind === 'command_run') {
      expect(action.command).toBe('npm test');
      expect(action.result?.exitCode).toBe(0);
    }
  });

  it('should support search action', () => {
    const action: ActionType = {
      kind: 'search',
      query: 'function executeTask',
    };

    expect(action.kind).toBe('search');
    if (action.kind === 'search') {
      expect(action.query).toBe('function executeTask');
    }
  });

  it('should support generic tool action', () => {
    const action: ActionType = {
      kind: 'tool',
      toolName: 'mcp:filesystem:read',
      args: { path: '/file.txt' },
      result: { success: true, data: 'file contents' },
    };

    expect(action.kind).toBe('tool');
    if (action.kind === 'tool') {
      expect(action.toolName).toBe('mcp:filesystem:read');
    }
  });
});

describe('IApprovalService', () => {
  it('should support approval requests', async () => {
    const service: IApprovalService = {
      requestApproval: async (request: ApprovalRequest): Promise<ApprovalDecision> => {
        if (request.toolName === 'Read') {
          return { status: 'approved' };
        }
        return { status: 'denied', reason: 'Not allowed' };
      },
    };

    const readRequest: ApprovalRequest = {
      requestId: 'req-1',
      toolName: 'Read',
      toolInput: { path: '/file.txt' },
    };

    const readDecision = await service.requestApproval(readRequest);
    expect(readDecision.status).toBe('approved');

    const bashRequest: ApprovalRequest = {
      requestId: 'req-2',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf /' },
      context: 'Deleting files',
    };

    const bashDecision = await service.requestApproval(bashRequest);
    expect(bashDecision.status).toBe('denied');
    if (bashDecision.status === 'denied') {
      expect(bashDecision.reason).toBe('Not allowed');
    }
  });

  it('should support timeout status', async () => {
    const service: IApprovalService = {
      requestApproval: async (_request: ApprovalRequest): Promise<ApprovalDecision> => {
        return { status: 'timeout' };
      },
    };

    const decision = await service.requestApproval({
      requestId: 'req-3',
      toolName: 'Write',
      toolInput: {},
    });

    expect(decision.status).toBe('timeout');
  });
});

describe('Type safety and discriminated unions', () => {
  it('should enable exhaustiveness checking for NormalizedEntryType', () => {
    const handleEntry = (type: NormalizedEntryType): string => {
      switch (type.kind) {
        case 'system_message':
          return 'System';
        case 'user_message':
          return 'User';
        case 'assistant_message':
          return 'Assistant';
        case 'thinking':
          return 'Thinking';
        case 'tool_use':
          return `Tool: ${type.tool.toolName}`;
        case 'error':
          return `Error: ${type.error.message}`;
        default:
          // TypeScript will error here if we missed a case
          const _exhaustive: never = type;
          return _exhaustive;
      }
    };

    expect(handleEntry({ kind: 'system_message' })).toBe('System');
    expect(handleEntry({ kind: 'user_message' })).toBe('User');
    expect(handleEntry({ kind: 'assistant_message' })).toBe('Assistant');
    expect(handleEntry({ kind: 'thinking' })).toBe('Thinking');
    expect(
      handleEntry({
        kind: 'tool_use',
        tool: { toolName: 'Bash', action: { kind: 'command_run', command: 'ls' }, status: 'success' },
      }),
    ).toBe('Tool: Bash');
    expect(
      handleEntry({ kind: 'error', error: { message: 'Failed' } }),
    ).toBe('Error: Failed');
  });

  it('should enable exhaustiveness checking for ActionType', () => {
    const handleAction = (action: ActionType): string => {
      switch (action.kind) {
        case 'file_read':
          return `Read: ${action.path}`;
        case 'file_write':
          return `Write: ${action.path}`;
        case 'file_edit':
          return `Edit: ${action.path}`;
        case 'command_run':
          return `Command: ${action.command}`;
        case 'search':
          return `Search: ${action.query}`;
        case 'tool':
          return `Tool: ${action.toolName}`;
        default:
          const _exhaustive: never = action;
          return _exhaustive;
      }
    };

    expect(handleAction({ kind: 'file_read', path: '/file.ts' })).toBe('Read: /file.ts');
    expect(handleAction({ kind: 'command_run', command: 'npm test' })).toBe('Command: npm test');
  });

  it('should enable exhaustiveness checking for ApprovalDecision', () => {
    const handleDecision = (decision: ApprovalDecision): string => {
      switch (decision.status) {
        case 'approved':
          return 'Approved';
        case 'denied':
          return `Denied: ${decision.reason || 'No reason'}`;
        case 'timeout':
          return 'Timeout';
        default:
          const _exhaustive: never = decision;
          return _exhaustive;
      }
    };

    expect(handleDecision({ status: 'approved' })).toBe('Approved');
    expect(handleDecision({ status: 'denied', reason: 'Unsafe' })).toBe('Denied: Unsafe');
    expect(handleDecision({ status: 'timeout' })).toBe('Timeout');
  });
});
