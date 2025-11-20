import { describe, it, expect, beforeEach } from 'vitest';
import { CursorNormalizationState } from '@/agents/cursor/normalizer/state';
import {
  mapToolToAction,
  mapToolToActionWithResult,
  makePathRelative,
} from '@/agents/cursor/normalizer/mappers';
import type {
  CursorToolCallMessage,
  CursorShellTool,
  CursorReadTool,
  CursorWriteTool,
  CursorEditTool,
  CursorDeleteTool,
  CursorGrepTool,
  CursorMcpTool,
} from '@/agents/cursor/types/tools';

describe('Tool Mapping', () => {
  const workDir = '/project';

  describe('mapToolToAction', () => {
    it('should map shell tool to command_run', () => {
      const toolCall: CursorShellTool = {
        shellToolCall: {
          args: { command: 'npm test' },
        },
      };

      const result = mapToolToAction(toolCall, workDir);

      expect(result.actionType).toEqual({
        kind: 'command_run',
        command: 'npm test',
      });
      expect(result.content).toContain('npm test');
    });

    it('should map read tool to file_read', () => {
      const toolCall: CursorReadTool = {
        readToolCall: {
          args: { path: '/project/src/index.ts' },
        },
      };

      const result = mapToolToAction(toolCall, workDir);

      expect(result.actionType).toEqual({
        kind: 'file_read',
        path: 'src/index.ts',
      });
      expect(result.content).toContain('src/index.ts');
    });

    it('should map write tool to file_write', () => {
      const toolCall: CursorWriteTool = {
        writeToolCall: {
          args: { path: '/project/src/new.ts', content: 'code' },
        },
      };

      const result = mapToolToAction(toolCall, workDir);

      expect(result.actionType).toEqual({
        kind: 'file_write',
        path: 'src/new.ts',
      });
    });

    it('should map edit tool to file_edit', () => {
      const toolCall: CursorEditTool = {
        editToolCall: {
          args: {
            path: '/project/src/index.ts',
            strategy: 'strReplace',
            old_text: 'old',
            new_text: 'new',
          },
        },
      };

      const result = mapToolToAction(toolCall, workDir);

      expect(result.actionType.kind).toBe('file_edit');
      if (result.actionType.kind === 'file_edit') {
        expect(result.actionType.path).toBe('src/index.ts');
        expect(result.actionType.changes).toHaveLength(1);
      }
    });

    it('should map delete tool to file_edit with delete change', () => {
      const toolCall: CursorDeleteTool = {
        deleteToolCall: {
          args: { path: '/project/old.ts' },
        },
      };

      const result = mapToolToAction(toolCall, workDir);

      expect(result.actionType.kind).toBe('file_edit');
      if (result.actionType.kind === 'file_edit') {
        expect(result.actionType.path).toBe('old.ts');
        expect(result.actionType.changes[0].type).toBe('delete');
      }
    });

    it('should map grep tool to search', () => {
      const toolCall: CursorGrepTool = {
        grepToolCall: {
          args: { pattern: 'TODO' },
        },
      };

      const result = mapToolToAction(toolCall, workDir);

      expect(result.actionType).toEqual({
        kind: 'search',
        query: 'TODO',
      });
    });

    it('should map MCP tool to tool action', () => {
      const toolCall: CursorMcpTool = {
        mcpToolCall: {
          args: {
            name: 'filesystem_read',
            provider_identifier: 'filesystem',
            tool_name: 'read',
            args: { path: '/file.txt' },
          },
        },
      };

      const result = mapToolToAction(toolCall, workDir);

      expect(result.actionType.kind).toBe('tool');
      if (result.actionType.kind === 'tool') {
        expect(result.actionType.toolName).toBe('mcp:filesystem:read');
      }
    });
  });

  describe('mapToolToActionWithResult', () => {
    it('should include shell command result', () => {
      const toolCall: CursorShellTool = {
        shellToolCall: {
          args: { command: 'ls' },
          result: {
            success: {
              stdout: 'file1\nfile2',
              stderr: '',
              exitCode: 0,
            },
          },
        },
      };

      const result = mapToolToActionWithResult(toolCall, workDir);

      expect(result.actionType.kind).toBe('command_run');
      if (result.actionType.kind === 'command_run') {
        expect(result.actionType.result).toEqual({
          exitCode: 0,
          stdout: 'file1\nfile2',
          stderr: '',
        });
      }
      expect(result.content).toContain('file1');
    });

    it('should handle shell command failure', () => {
      const toolCall: CursorShellTool = {
        shellToolCall: {
          args: { command: 'invalid' },
          result: {
            failure: {
              stdout: '',
              stderr: 'command not found',
              exitCode: 127,
            },
          },
        },
      };

      const result = mapToolToActionWithResult(toolCall, workDir);

      expect(result.actionType.kind).toBe('command_run');
      if (result.actionType.kind === 'command_run') {
        expect(result.actionType.result?.exitCode).toBe(127);
        expect(result.actionType.result?.stderr).toBe('command not found');
      }
    });

    it('should extract MCP result content', () => {
      const toolCall: CursorMcpTool = {
        mcpToolCall: {
          args: {
            server_name: 'filesystem',
            tool_name: 'read',
            arguments: { path: '/file.txt' },
          },
          result: {
            success: {
              content: [
                { type: 'text', text: { text: 'File contents here' } },
              ],
            },
          },
        },
      };

      const result = mapToolToActionWithResult(toolCall, workDir);

      expect(result.content).toContain('File contents here');
    });
  });

  describe('Edit Tool Strategies', () => {
    it('should handle applyPatch strategy', () => {
      const toolCall: CursorEditTool = {
        editToolCall: {
          args: {
            path: '/project/file.ts',
            strategy: 'applyPatch',
            patchContent: '@@ -1,1 +1,1 @@\n-old\n+new',
          },
          result: {
            success: {
              diffString: '@@ -1,1 +1,1 @@\n-old\n+new',
            },
          },
        },
      };

      const result = mapToolToActionWithResult(toolCall, workDir);

      expect(result.content).toContain('@@ -1,1 +1,1 @@');
    });

    it('should handle strReplace strategy', () => {
      const toolCall: CursorEditTool = {
        editToolCall: {
          args: {
            path: '/project/file.ts',
            strReplace: {
              oldText: 'const x = 1',
              newText: 'const x = 2',
            },
          },
          result: {
            success: {},
          },
        },
      };

      const result = mapToolToActionWithResult(toolCall, workDir);

      expect(result.content).toContain('- const x = 1');
      expect(result.content).toContain('+ const x = 2');
    });

    it('should handle multiStrReplace strategy', () => {
      const toolCall: CursorEditTool = {
        editToolCall: {
          args: {
            path: '/project/file.ts',
            multiStrReplace: {
              edits: [
                { oldText: 'a', newText: 'b' },
                { oldText: 'c', newText: 'd' },
              ],
            },
          },
          result: {
            success: {},
          },
        },
      };

      const result = mapToolToActionWithResult(toolCall, workDir);

      expect(result.content).toContain('- a');
      expect(result.content).toContain('+ b');
      expect(result.content).toContain('- c');
      expect(result.content).toContain('+ d');
    });
  });

  describe('makePathRelative', () => {
    it('should make absolute paths relative to workDir', () => {
      const result = makePathRelative('/project/src/index.ts', '/project');
      expect(result).toBe('src/index.ts');
    });

    it('should return path unchanged if not under workDir', () => {
      const result = makePathRelative('/other/file.ts', '/project');
      expect(result).toBe('/other/file.ts');
    });

    it('should return relative paths unchanged', () => {
      const result = makePathRelative('src/index.ts', '/project');
      expect(result).toBe('src/index.ts');
    });

    it('should not use relative path if it goes up too far', () => {
      const result = makePathRelative('/other/project/file.ts', '/project/foo/bar');
      expect(result).toBe('/other/project/file.ts');
    });
  });
});

describe('Tool Call Lifecycle', () => {
  let state: CursorNormalizationState;
  const workDir = '/project';

  beforeEach(() => {
    state = new CursorNormalizationState();
  });

  describe('handleToolCallStarted', () => {
    it('should create tool_use entry with running status', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'call-1',
        tool_call: {
          shellToolCall: {
            args: { command: 'npm test' },
          },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);

      expect(entry.type.kind).toBe('tool_use');
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('shell');
        expect(entry.type.tool.status).toBe('running');
        expect(entry.type.tool.action.kind).toBe('command_run');
      }
    });

    it('should track call_id for later completion', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'call-123',
        tool_call: {
          readToolCall: {
            args: { path: '/project/file.ts' },
          },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);

      const tracked = state.getToolCall('call-123');
      expect(tracked).toBeDefined();
      expect(tracked?.index).toBe(entry.index);
    });
  });

  describe('handleToolCallCompleted', () => {
    it('should update existing entry with success status', () => {
      const startedMsg: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'call-1',
        tool_call: {
          shellToolCall: {
            args: { command: 'echo hello' },
          },
        },
      };

      const completedMsg: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'completed',
        call_id: 'call-1',
        tool_call: {
          shellToolCall: {
            args: { command: 'echo hello' },
            result: {
              success: {
                stdout: 'hello',
                stderr: '',
                exitCode: 0,
              },
            },
          },
        },
      };

      const startEntry = state.handleToolCallStarted(startedMsg, workDir);
      const completeEntry = state.handleToolCallCompleted(completedMsg, workDir);

      // Should reuse same index
      expect(completeEntry?.index).toBe(startEntry.index);

      // Should have success status
      expect(completeEntry?.type.kind).toBe('tool_use');
      if (completeEntry?.type.kind === 'tool_use') {
        expect(completeEntry.type.tool.status).toBe('success');
      }
    });

    it('should update with failed status on error', () => {
      const startedMsg: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'call-2',
        tool_call: {
          shellToolCall: {
            args: { command: 'invalid' },
          },
        },
      };

      const completedMsg: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'completed',
        call_id: 'call-2',
        tool_call: {
          shellToolCall: {
            args: { command: 'invalid' },
            result: {
              failure: {
                stdout: '',
                stderr: 'command not found',
                exitCode: 127,
              },
            },
          },
        },
      };

      state.handleToolCallStarted(startedMsg, workDir);
      const completeEntry = state.handleToolCallCompleted(completedMsg, workDir);

      expect(completeEntry?.type.kind).toBe('tool_use');
      if (completeEntry?.type.kind === 'tool_use') {
        expect(completeEntry.type.tool.status).toBe('failed');
      }
    });

    it('should create standalone entry if no matching started event', () => {
      const completedMsg: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'completed',
        call_id: 'call-orphan',
        tool_call: {
          readToolCall: {
            args: { path: '/project/file.ts' },
          },
        },
      };

      const entry = state.handleToolCallCompleted(completedMsg, workDir);

      expect(entry).toBeDefined();
      expect(entry?.type.kind).toBe('tool_use');
      expect(entry?.index).toBe(0); // New index, not reused
    });
  });

  describe('All 11 Tool Types', () => {
    it('should handle shell tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'shell-1',
        tool_call: {
          shellToolCall: { args: { command: 'ls' } },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      expect(entry.type.kind).toBe('tool_use');
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('shell');
      }
    });

    it('should handle read tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'read-1',
        tool_call: {
          readToolCall: { args: { path: '/file.ts' } },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('read');
      }
    });

    it('should handle write tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'write-1',
        tool_call: {
          writeToolCall: { args: { path: '/file.ts', content: 'code' } },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('write');
      }
    });

    it('should handle edit tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'edit-1',
        tool_call: {
          editToolCall: {
            args: {
              path: '/file.ts',
              strategy: 'strReplace',
              old_text: 'a',
              new_text: 'b',
            },
          },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('edit');
      }
    });

    it('should handle delete tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'delete-1',
        tool_call: {
          deleteToolCall: { args: { path: '/old.ts' } },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('delete');
      }
    });

    it('should handle ls tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'ls-1',
        tool_call: {
          lsToolCall: { args: { path: '/' } },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('ls');
      }
    });

    it('should handle glob tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'glob-1',
        tool_call: {
          globToolCall: { args: { pattern: '**/*.ts' } },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('glob');
      }
    });

    it('should handle grep tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'grep-1',
        tool_call: {
          grepToolCall: { args: { pattern: 'TODO' } },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('grep');
      }
    });

    it('should handle semsearch tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'sem-1',
        tool_call: {
          semSearchToolCall: { args: { query: 'authentication' } },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('semsearch');
      }
    });

    it('should handle todo tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'todo-1',
        tool_call: {
          todoToolCall: { args: { todos: [] } },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        expect(entry.type.tool.toolName).toBe('todo');
      }
    });

    it('should handle mcp tool', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'mcp-1',
        tool_call: {
          mcpToolCall: {
            args: {
              name: 'filesystem_read',
              provider_identifier: 'filesystem',
              tool_name: 'read',
              args: {},
            },
          },
        },
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        // getToolName() returns just 'mcp', but the action should have full name
        expect(entry.type.tool.toolName).toBe('mcp');
        expect(entry.type.tool.action.kind).toBe('tool');
        if (entry.type.tool.action.kind === 'tool') {
          expect(entry.type.tool.action.toolName).toBe('mcp:filesystem:read');
        }
      }
    });

    it('should handle unknown tool with fallback', () => {
      const message: CursorToolCallMessage = {
        type: 'tool_call',
        subtype: 'started',
        call_id: 'unknown-1',
        tool_call: {
          customToolCall: { args: {} },
        } as any,
      };

      const entry = state.handleToolCallStarted(message, workDir);
      if (entry.type.kind === 'tool_use') {
        // getToolName() removes 'ToolCall' suffix
        expect(entry.type.tool.toolName).toBe('custom');
      }
    });
  });
});
