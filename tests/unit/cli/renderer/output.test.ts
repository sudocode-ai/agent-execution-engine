import { describe, it, expect } from 'vitest';
import stripAnsi from 'strip-ansi';
import type { NormalizedEntry } from '@/agents/types/agent-executor';
import { renderEntry, renderHeader, renderSummary } from '@/cli/renderer/output';
import type { ExecutionResult, TaskHeader } from '@/cli/renderer/types';

describe('renderEntry', () => {
  describe('system_message', () => {
    it('should render system message with icon', () => {
      const entry: NormalizedEntry = {
        index: 0,
        timestamp: new Date('2025-01-01T12:00:00Z'),
        type: { kind: 'system_message' },
        content: 'Session started',
      };

      const output = renderEntry(entry, { useColors: false });
      expect(output).toContain('[SYS]');
      expect(output).toContain('Session started');
    });

    it('should include timestamp when enabled', () => {
      const entry: NormalizedEntry = {
        index: 0,
        timestamp: new Date('2025-01-01T12:34:56Z'),
        type: { kind: 'system_message' },
        content: 'Test',
      };

      const output = renderEntry(entry, { showTimestamps: true, useColors: false });
      expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
    });
  });

  describe('user_message', () => {
    it('should render user message with icon', () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: { kind: 'user_message' },
        content: 'Add a login feature',
      };

      const output = renderEntry(entry, { useColors: false });
      expect(output).toContain('[USER]');
      expect(output).toContain('Add a login feature');
    });
  });

  describe('assistant_message', () => {
    it('should render assistant message with icon', () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: { kind: 'assistant_message' },
        content: 'I will add a login feature',
      };

      const output = renderEntry(entry, { useColors: false });
      expect(output).toContain('[AI]');
      expect(output).toContain('I will add a login feature');
    });
  });

  describe('thinking', () => {
    it('should render thinking entry with icon', () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: { kind: 'thinking' },
        content: 'Let me analyze the codebase',
      };

      const output = renderEntry(entry, { useColors: false });
      expect(output).toContain('[...]');
      expect(output).toContain('Let me analyze the codebase');
    });

    it('should hide thinking when showThinking is false', () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: { kind: 'thinking' },
        content: 'Internal reasoning',
      };

      const output = renderEntry(entry, { showThinking: false });
      expect(output).toBe('');
    });
  });

  describe('tool_use', () => {
    it('should render file read tool use', () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: {
          kind: 'tool_use',
          tool: {
            toolName: 'Read',
            action: { kind: 'file_read', path: 'src/index.ts' },
            status: 'running',
          },
        },
        content: 'Reading file',
      };

      const output = renderEntry(entry, { useColors: false });
      expect(output).toContain('[TOOL]');
      expect(output).toContain('Read');
      expect(output).toContain('src/index.ts');
    });

    it('should render file write tool use', () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: {
          kind: 'tool_use',
          tool: {
            toolName: 'Write',
            action: { kind: 'file_write', path: 'output.txt' },
            status: 'success',
          },
        },
        content: '',
      };

      const output = renderEntry(entry, { useColors: false });
      expect(output).toContain('Write');
      expect(output).toContain('output.txt');
    });

    it('should render command run tool use', () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: {
          kind: 'tool_use',
          tool: {
            toolName: 'Bash',
            action: { kind: 'command_run', command: 'npm test' },
            status: 'running',
          },
        },
        content: '',
      };

      const output = renderEntry(entry, { useColors: false });
      expect(output).toContain('Bash');
      expect(output).toContain('npm test');
    });
  });

  describe('error', () => {
    it('should render error with message', () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: {
          kind: 'error',
          error: {
            message: 'File not found',
            code: 'ENOENT',
          },
        },
        content: '',
      };

      const output = renderEntry(entry, { useColors: false });
      expect(output).toContain('[ERR]');
      expect(output).toContain('File not found');
      expect(output).toContain('ENOENT');
    });
  });

  describe('color handling', () => {
    it('should strip ANSI codes correctly', () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: { kind: 'user_message' },
        content: 'Test',
      };

      const withColors = renderEntry(entry, { useColors: true });
      const withoutColors = renderEntry(entry, { useColors: false });

      // Strip ANSI should give same content
      expect(stripAnsi(withColors)).toBe(withoutColors);
    });
  });
});

describe('renderHeader', () => {
  it('should render task header in a box', () => {
    const header: TaskHeader = {
      taskId: 'task-123',
      processId: 'proc-456',
      agentName: 'claude',
    };

    const output = renderHeader(header);
    const plain = stripAnsi(output);

    expect(plain).toContain('task-123');
    expect(plain).toContain('proc-456');
    expect(plain).toContain('claude');
  });

  it('should include session ID when provided', () => {
    const header: TaskHeader = {
      taskId: 'task-123',
      processId: 'proc-456',
      agentName: 'cursor',
      sessionId: 'session-789',
    };

    const output = renderHeader(header);
    const plain = stripAnsi(output);

    expect(plain).toContain('session-789');
  });
});

describe('renderSummary', () => {
  it('should render successful execution summary', () => {
    const result: ExecutionResult = {
      taskId: 'task-123',
      success: true,
      durationMs: 45200,
      toolsUsed: 5,
      filesChanged: 3,
      exitCode: 0,
    };

    const output = renderSummary(result);
    const plain = stripAnsi(output);

    expect(plain).toContain('successfully');
    expect(plain).toContain('45.2s');
    expect(plain).toContain('Tools used: 5');
    expect(plain).toContain('Files changed: 3');
    expect(plain).toContain('Exit code: 0');
  });

  it('should render failed execution summary', () => {
    const result: ExecutionResult = {
      taskId: 'task-123',
      success: false,
      durationMs: 1500,
      toolsUsed: 2,
      filesChanged: 0,
      error: 'Process exited with code 1',
      exitCode: 1,
    };

    const output = renderSummary(result);
    const plain = stripAnsi(output);

    expect(plain).toContain('failed');
    expect(plain).toContain('Process exited with code 1');
    expect(plain).toContain('1.5s');
    expect(plain).toContain('Exit code: 1');
  });

  it('should format milliseconds correctly', () => {
    const result: ExecutionResult = {
      taskId: 'task-123',
      success: true,
      durationMs: 500,
      toolsUsed: 0,
      filesChanged: 0,
    };

    const output = renderSummary(result);
    const plain = stripAnsi(output);

    expect(plain).toContain('500ms');
  });
});
