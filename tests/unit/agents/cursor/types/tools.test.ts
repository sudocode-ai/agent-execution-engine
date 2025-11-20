import { describe, it, expect } from 'vitest';
import {
  getToolName,
  type CursorToolCall,
  type CursorShellTool,
  type CursorReadTool,
  type CursorWriteTool,
  type CursorEditTool,
  type CursorDeleteTool,
  type CursorLsTool,
  type CursorGlobTool,
  type CursorGrepTool,
  type CursorSemSearchTool,
  type CursorTodoTool,
  type CursorMcpTool,
} from '@/agents/cursor/types/tools';

describe('Cursor Tool Types', () => {
  describe('CursorShellTool', () => {
    it('should parse shell tool call without result', () => {
      const json = `{"shellToolCall":{"args":{"command":"ls -la","working_directory":"/tmp","timeout":30000}}}`;
      const tool = JSON.parse(json) as CursorShellTool;

      expect('shellToolCall' in tool).toBe(true);
      expect(tool.shellToolCall.args.command).toBe('ls -la');
      expect(tool.shellToolCall.args.working_directory).toBe('/tmp');
      expect(tool.shellToolCall.args.timeout).toBe(30000);
    });

    it('should parse shell tool call with success result', () => {
      const json = `{"shellToolCall":{"args":{"command":"ls"},"result":{"success":{"stdout":"file1\\nfile2","stderr":"","exitCode":0}}}}`;
      const tool = JSON.parse(json) as CursorShellTool;

      expect(tool.shellToolCall.result?.success?.stdout).toBe('file1\nfile2');
      expect(tool.shellToolCall.result?.success?.stderr).toBe('');
      expect(tool.shellToolCall.result?.success?.exitCode).toBe(0);
    });

    it('should parse shell tool call with failure result', () => {
      const json = `{"shellToolCall":{"args":{"command":"invalid"},"result":{"failure":{"stdout":"","stderr":"command not found","exitCode":1}}}}`;
      const tool = JSON.parse(json) as CursorShellTool;

      expect(tool.shellToolCall.result?.failure?.exitCode).toBe(1);
      expect(tool.shellToolCall.result?.failure?.stderr).toBe('command not found');
    });
  });

  describe('CursorReadTool', () => {
    it('should parse read tool call', () => {
      const json = `{"readToolCall":{"args":{"path":"/path/to/file.ts","offset":0,"limit":100}}}`;
      const tool = JSON.parse(json) as CursorReadTool;

      expect('readToolCall' in tool).toBe(true);
      expect(tool.readToolCall.args.path).toBe('/path/to/file.ts');
      expect(tool.readToolCall.args.offset).toBe(0);
      expect(tool.readToolCall.args.limit).toBe(100);
    });

    it('should parse read tool call without offset/limit', () => {
      const json = `{"readToolCall":{"args":{"path":"file.txt"}}}`;
      const tool = JSON.parse(json) as CursorReadTool;

      expect(tool.readToolCall.args.path).toBe('file.txt');
      expect(tool.readToolCall.args.offset).toBeUndefined();
    });
  });

  describe('CursorWriteTool', () => {
    it('should parse write tool call', () => {
      const json = `{"writeToolCall":{"args":{"path":"/path/to/file.ts","contents":"const x = 1;"}}}`;
      const tool = JSON.parse(json) as CursorWriteTool;

      expect('writeToolCall' in tool).toBe(true);
      expect(tool.writeToolCall.args.path).toBe('/path/to/file.ts');
      expect(tool.writeToolCall.args.contents).toBe('const x = 1;');
    });
  });

  describe('CursorEditTool', () => {
    it('should parse edit tool with applyPatch strategy', () => {
      const json = `{"editToolCall":{"args":{"path":"file.ts","applyPatch":{"patchContent":"@@ -1,3 +1,3 @@\\n-old\\n+new"}}}}`;
      const tool = JSON.parse(json) as CursorEditTool;

      expect('editToolCall' in tool).toBe(true);
      expect(tool.editToolCall.args.path).toBe('file.ts');
      expect(tool.editToolCall.args.applyPatch).toBeDefined();
      expect(tool.editToolCall.args.applyPatch?.patchContent).toContain('@@ -1,3 +1,3 @@');
    });

    it('should parse edit tool with strReplace strategy', () => {
      const json = `{"editToolCall":{"args":{"path":"file.ts","strReplace":{"oldText":"const x = 1;","newText":"const x = 2;","replaceAll":false}}}}`;
      const tool = JSON.parse(json) as CursorEditTool;

      expect(tool.editToolCall.args.strReplace).toBeDefined();
      expect(tool.editToolCall.args.strReplace?.oldText).toBe('const x = 1;');
      expect(tool.editToolCall.args.strReplace?.newText).toBe('const x = 2;');
      expect(tool.editToolCall.args.strReplace?.replaceAll).toBe(false);
    });

    it('should parse edit tool with multiStrReplace strategy', () => {
      const json = `{"editToolCall":{"args":{"path":"file.ts","multiStrReplace":{"edits":[{"oldText":"foo","newText":"bar"},{"oldText":"baz","newText":"qux"}]}}}}`;
      const tool = JSON.parse(json) as CursorEditTool;

      expect(tool.editToolCall.args.multiStrReplace).toBeDefined();
      expect(tool.editToolCall.args.multiStrReplace?.edits).toHaveLength(2);
      expect(tool.editToolCall.args.multiStrReplace?.edits[0].oldText).toBe('foo');
      expect(tool.editToolCall.args.multiStrReplace?.edits[0].newText).toBe('bar');
    });

    it('should parse edit tool with success result', () => {
      const json = `{"editToolCall":{"args":{"path":"file.ts","strReplace":{"oldText":"old","newText":"new"}},"result":{"success":{"path":"file.ts","linesAdded":1,"linesRemoved":1,"diffString":"@@ -1 +1 @@\\n-old\\n+new"}}}}`;
      const tool = JSON.parse(json) as CursorEditTool;

      expect(tool.editToolCall.result?.success).toBeDefined();
      expect(tool.editToolCall.result?.success?.path).toBe('file.ts');
      expect(tool.editToolCall.result?.success?.linesAdded).toBe(1);
      expect(tool.editToolCall.result?.success?.linesRemoved).toBe(1);
      expect(tool.editToolCall.result?.success?.diffString).toContain('@@ -1 +1 @@');
    });
  });

  describe('CursorDeleteTool', () => {
    it('should parse delete tool call', () => {
      const json = `{"deleteToolCall":{"args":{"path":"/path/to/file.ts"}}}`;
      const tool = JSON.parse(json) as CursorDeleteTool;

      expect('deleteToolCall' in tool).toBe(true);
      expect(tool.deleteToolCall.args.path).toBe('/path/to/file.ts');
    });
  });

  describe('CursorLsTool', () => {
    it('should parse ls tool call', () => {
      const json = `{"lsToolCall":{"args":{"path":"/path/to/dir","ignore":["node_modules",".git"]}}}`;
      const tool = JSON.parse(json) as CursorLsTool;

      expect('lsToolCall' in tool).toBe(true);
      expect(tool.lsToolCall.args.path).toBe('/path/to/dir');
      expect(tool.lsToolCall.args.ignore).toEqual(['node_modules', '.git']);
    });
  });

  describe('CursorGlobTool', () => {
    it('should parse glob tool call', () => {
      const json = `{"globToolCall":{"args":{"glob_pattern":"**/*.ts","path":"/project"}}}`;
      const tool = JSON.parse(json) as CursorGlobTool;

      expect('globToolCall' in tool).toBe(true);
      expect(tool.globToolCall.args.glob_pattern).toBe('**/*.ts');
      expect(tool.globToolCall.args.path).toBe('/project');
    });
  });

  describe('CursorGrepTool', () => {
    it('should parse grep tool call with all options', () => {
      const json = `{"grepToolCall":{"args":{"pattern":"function.*\\\\(","path":"/search","glob_filter":"*.ts","output_mode":"content","case_insensitive":true,"multiline":false,"head_limit":10,"type":"ts"}}}`;
      const tool = JSON.parse(json) as CursorGrepTool;

      expect('grepToolCall' in tool).toBe(true);
      expect(tool.grepToolCall.args.pattern).toBe('function.*\\(');
      expect(tool.grepToolCall.args.path).toBe('/search');
      expect(tool.grepToolCall.args.glob_filter).toBe('*.ts');
      expect(tool.grepToolCall.args.output_mode).toBe('content');
      expect(tool.grepToolCall.args.case_insensitive).toBe(true);
      expect(tool.grepToolCall.args.multiline).toBe(false);
      expect(tool.grepToolCall.args.head_limit).toBe(10);
      expect(tool.grepToolCall.args.type).toBe('ts');
    });
  });

  describe('CursorSemSearchTool', () => {
    it('should parse semsearch tool call', () => {
      const json = `{"semSearchToolCall":{"args":{"query":"authentication logic","target_directories":["src/auth","src/middleware"],"explanation":"Looking for login code"}}}`;
      const tool = JSON.parse(json) as CursorSemSearchTool;

      expect('semSearchToolCall' in tool).toBe(true);
      expect(tool.semSearchToolCall.args.query).toBe('authentication logic');
      expect(tool.semSearchToolCall.args.target_directories).toEqual(['src/auth', 'src/middleware']);
      expect(tool.semSearchToolCall.args.explanation).toBe('Looking for login code');
    });
  });

  describe('CursorTodoTool', () => {
    it('should parse todo tool call', () => {
      const json = `{"updateTodosToolCall":{"args":{"todos":[{"id":"todo-1","content":"Implement login","status":"in_progress","dependencies":[]},{"content":"Write tests","status":"pending"}]}}}`;
      const tool = JSON.parse(json) as CursorTodoTool;

      expect('updateTodosToolCall' in tool).toBe(true);
      expect(tool.updateTodosToolCall.args.todos).toHaveLength(2);
      expect(tool.updateTodosToolCall.args.todos?.[0].id).toBe('todo-1');
      expect(tool.updateTodosToolCall.args.todos?.[0].content).toBe('Implement login');
      expect(tool.updateTodosToolCall.args.todos?.[0].status).toBe('in_progress');
      expect(tool.updateTodosToolCall.args.todos?.[1].content).toBe('Write tests');
      expect(tool.updateTodosToolCall.args.todos?.[1].status).toBe('pending');
    });
  });

  describe('CursorMcpTool', () => {
    it('should parse mcp tool call', () => {
      const json = `{"mcpToolCall":{"args":{"name":"read_file","args":{"path":"README.md"},"provider_identifier":"filesystem","tool_name":"read_file"}}}`;
      const tool = JSON.parse(json) as CursorMcpTool;

      expect('mcpToolCall' in tool).toBe(true);
      expect(tool.mcpToolCall.args.name).toBe('read_file');
      expect(tool.mcpToolCall.args.provider_identifier).toBe('filesystem');
      expect(tool.mcpToolCall.args.tool_name).toBe('read_file');
    });

    it('should parse mcp tool call with success result', () => {
      const json = `{"mcpToolCall":{"args":{"name":"test","args":{}},"result":{"success":{"content":[{"text":{"text":"# README"}}],"isError":false}}}}`;
      const tool = JSON.parse(json) as CursorMcpTool;

      expect(tool.mcpToolCall.result?.success).toBeDefined();
      expect(tool.mcpToolCall.result?.success?.content).toHaveLength(1);
      expect(tool.mcpToolCall.result?.success?.content?.[0].text?.text).toBe('# README');
      expect(tool.mcpToolCall.result?.success?.isError).toBe(false);
    });

    it('should parse mcp tool call with failure result', () => {
      const json = `{"mcpToolCall":{"args":{"name":"test","args":{}},"result":{"failure":{"content":[{"text":{"text":"Error: File not found"}}],"isError":true}}}}`;
      const tool = JSON.parse(json) as CursorMcpTool;

      expect(tool.mcpToolCall.result?.failure).toBeDefined();
      expect(tool.mcpToolCall.result?.failure?.isError).toBe(true);
    });
  });

  describe('CursorUnknownTool', () => {
    it('should parse unknown tool type', () => {
      const json = `{"futureToolCall":{"args":{"param1":"value1","param2":"value2"},"result":{"data":"result"}}}`;
      const tool = JSON.parse(json);

      expect('futureToolCall' in tool).toBe(true);
      expect(tool.futureToolCall.args.param1).toBe('value1');
      expect(tool.futureToolCall.result.data).toBe('result');
    });
  });

  describe('getToolName', () => {
    it('should return "shell" for shell tool', () => {
      const tool: CursorShellTool = {
        shellToolCall: { args: { command: 'ls' } },
      };
      expect(getToolName(tool)).toBe('shell');
    });

    it('should return "read" for read tool', () => {
      const tool: CursorReadTool = {
        readToolCall: { args: { path: 'file.txt' } },
      };
      expect(getToolName(tool)).toBe('read');
    });

    it('should return "write" for write tool', () => {
      const tool: CursorWriteTool = {
        writeToolCall: { args: { path: 'file.txt', contents: 'content' } },
      };
      expect(getToolName(tool)).toBe('write');
    });

    it('should return "edit" for edit tool', () => {
      const tool: CursorEditTool = {
        editToolCall: {
          args: { path: 'file.txt', strReplace: { oldText: 'old', newText: 'new' } },
        },
      };
      expect(getToolName(tool)).toBe('edit');
    });

    it('should return "delete" for delete tool', () => {
      const tool: CursorDeleteTool = {
        deleteToolCall: { args: { path: 'file.txt' } },
      };
      expect(getToolName(tool)).toBe('delete');
    });

    it('should return "ls" for ls tool', () => {
      const tool: CursorLsTool = {
        lsToolCall: { args: { path: '/dir' } },
      };
      expect(getToolName(tool)).toBe('ls');
    });

    it('should return "glob" for glob tool', () => {
      const tool: CursorGlobTool = {
        globToolCall: { args: { glob_pattern: '*.ts' } },
      };
      expect(getToolName(tool)).toBe('glob');
    });

    it('should return "grep" for grep tool', () => {
      const tool: CursorGrepTool = {
        grepToolCall: { args: { pattern: 'test' } },
      };
      expect(getToolName(tool)).toBe('grep');
    });

    it('should return "semsearch" for semsearch tool', () => {
      const tool: CursorSemSearchTool = {
        semSearchToolCall: { args: { query: 'login' } },
      };
      expect(getToolName(tool)).toBe('semsearch');
    });

    it('should return "todo" for todo tool', () => {
      const tool: CursorTodoTool = {
        updateTodosToolCall: { args: {} },
      };
      expect(getToolName(tool)).toBe('todo');
    });

    it('should return "mcp" for mcp tool', () => {
      const tool: CursorMcpTool = {
        mcpToolCall: { args: { name: 'test', args: {} } },
      };
      expect(getToolName(tool)).toBe('mcp');
    });

    it('should extract name from unknown tool property', () => {
      const tool = {
        customToolCall: { args: {}, result: {} },
      };
      expect(getToolName(tool as CursorToolCall)).toBe('custom');
    });

    it('should return "unknown" for empty object', () => {
      const tool = {};
      expect(getToolName(tool as CursorToolCall)).toBe('unknown');
    });
  });

  describe('CursorToolCall discriminated union', () => {
    it('should narrow type using "in" operator', () => {
      const tools: CursorToolCall[] = [
        { shellToolCall: { args: { command: 'ls' } } },
        { readToolCall: { args: { path: 'file.txt' } } },
        { writeToolCall: { args: { path: 'file.txt' } } },
        { editToolCall: { args: { path: 'file.txt', strReplace: { oldText: '', newText: '' } } } },
        { deleteToolCall: { args: { path: 'file.txt' } } },
        { lsToolCall: { args: { path: '/dir' } } },
        { globToolCall: { args: {} } },
        { grepToolCall: { args: { pattern: 'test' } } },
        { semSearchToolCall: { args: { query: 'search' } } },
        { updateTodosToolCall: { args: {} } },
        { mcpToolCall: { args: { name: 'tool', args: {} } } },
      ];

      tools.forEach((tool) => {
        if ('shellToolCall' in tool) {
          expect(tool.shellToolCall.args.command).toBeDefined();
        } else if ('readToolCall' in tool) {
          expect(tool.readToolCall.args.path).toBeDefined();
        } else if ('writeToolCall' in tool) {
          expect(tool.writeToolCall.args.path).toBeDefined();
        } else if ('editToolCall' in tool) {
          expect(tool.editToolCall.args.path).toBeDefined();
        } else if ('deleteToolCall' in tool) {
          expect(tool.deleteToolCall.args.path).toBeDefined();
        } else if ('lsToolCall' in tool) {
          expect(tool.lsToolCall.args.path).toBeDefined();
        } else if ('globToolCall' in tool) {
          expect(tool.globToolCall.args).toBeDefined();
        } else if ('grepToolCall' in tool) {
          expect(tool.grepToolCall.args.pattern).toBeDefined();
        } else if ('semSearchToolCall' in tool) {
          expect(tool.semSearchToolCall.args.query).toBeDefined();
        } else if ('updateTodosToolCall' in tool) {
          expect(tool.updateTodosToolCall.args).toBeDefined();
        } else if ('mcpToolCall' in tool) {
          expect(tool.mcpToolCall.args.name).toBeDefined();
        }
      });
    });
  });
});
