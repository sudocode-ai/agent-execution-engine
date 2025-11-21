/**
 * Cursor tool call type definitions.
 *
 * Cursor supports 11 built-in tools plus MCP server integration.
 * Each tool has a specific format with args and optional result.
 *
 * @module agents/cursor/types/tools
 */

/**
 * Shell tool - Execute bash commands.
 *
 * @example
 * ```json
 * {
 *   "shellToolCall": {
 *     "args": {
 *       "command": "ls -la",
 *       "working_directory": "/tmp",
 *       "timeout": 30000
 *     },
 *     "result": {
 *       "success": {
 *         "stdout": "file1\nfile2",
 *         "stderr": "",
 *         "exitCode": 0
 *       }
 *     }
 *   }
 * }
 * ```
 */
export interface CursorShellTool {
  shellToolCall: {
    args: {
      command: string;
      working_directory?: string;
      timeout?: number;
    };
    result?: {
      success?: {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
      };
      failure?: {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
      };
    };
  };
}

/**
 * Read tool - Read file contents.
 *
 * @example
 * ```json
 * {
 *   "readToolCall": {
 *     "args": {
 *       "path": "/path/to/file.ts",
 *       "offset": 0,
 *       "limit": 100
 *     },
 *     "result": { "content": "file contents..." }
 *   }
 * }
 * ```
 */
export interface CursorReadTool {
  readToolCall: {
    args: {
      path: string;
      offset?: number;
      limit?: number;
    };
    result?: unknown;
  };
}

/**
 * Write tool - Create or overwrite file.
 *
 * @example
 * ```json
 * {
 *   "writeToolCall": {
 *     "args": {
 *       "path": "/path/to/file.ts",
 *       "contents": "const x = 1;"
 *     },
 *     "result": { "success": true }
 *   }
 * }
 * ```
 */
export interface CursorWriteTool {
  writeToolCall: {
    args: {
      path: string;
      contents?: string; // Alternative names: file_text, content
    };
    result?: unknown;
  };
}

/**
 * Edit tool result for successful edits.
 */
export interface CursorEditResultSuccess {
  path: string;
  resultForModel?: string;
  linesAdded?: number;
  linesRemoved?: number;
  diffString?: string; // Unified diff format
  afterFullFileContent?: string;
}

/**
 * Edit tool - Modify file with 3 strategies.
 *
 * Strategies:
 * 1. applyPatch - Apply unified diff patch
 * 2. strReplace - Simple find/replace
 * 3. multiStrReplace - Multiple find/replace operations
 *
 * @example Strategy 1: applyPatch
 * ```json
 * {
 *   "editToolCall": {
 *     "args": {
 *       "path": "/path/to/file.ts",
 *       "applyPatch": {
 *         "patchContent": "@@ -1,3 +1,3 @@\n-old line\n+new line"
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * @example Strategy 2: strReplace
 * ```json
 * {
 *   "editToolCall": {
 *     "args": {
 *       "path": "/path/to/file.ts",
 *       "strReplace": {
 *         "oldText": "const x = 1;",
 *         "newText": "const x = 2;",
 *         "replaceAll": false
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * @example Strategy 3: multiStrReplace
 * ```json
 * {
 *   "editToolCall": {
 *     "args": {
 *       "path": "/path/to/file.ts",
 *       "multiStrReplace": {
 *         "edits": [
 *           { "oldText": "foo", "newText": "bar" },
 *           { "oldText": "baz", "newText": "qux" }
 *         ]
 *       }
 *     }
 *   }
 * }
 * ```
 */
export interface CursorEditTool {
  editToolCall: {
    args: {
      path: string;
      applyPatch?: {
        patchContent: string;
      };
      strReplace?: {
        oldText: string;
        newText: string;
        replaceAll?: boolean;
      };
      multiStrReplace?: {
        edits: Array<{
          oldText: string;
          newText: string;
          replaceAll?: boolean;
        }>;
      };
    };
    result?: {
      success?: CursorEditResultSuccess;
      failure?: unknown;
    };
  };
}

/**
 * Delete tool - Remove file or directory.
 *
 * @example
 * ```json
 * {
 *   "deleteToolCall": {
 *     "args": {
 *       "path": "/path/to/file.ts"
 *     },
 *     "result": { "success": true }
 *   }
 * }
 * ```
 */
export interface CursorDeleteTool {
  deleteToolCall: {
    args: {
      path: string;
    };
    result?: unknown;
  };
}

/**
 * Ls tool - List directory contents.
 *
 * @example
 * ```json
 * {
 *   "lsToolCall": {
 *     "args": {
 *       "path": "/path/to/dir",
 *       "ignore": ["node_modules", ".git"]
 *     },
 *     "result": { "entries": ["file1.ts", "file2.ts"] }
 *   }
 * }
 * ```
 */
export interface CursorLsTool {
  lsToolCall: {
    args: {
      path: string;
      ignore?: string[];
    };
    result?: unknown;
  };
}

/**
 * Glob tool - Pattern-based file search.
 *
 * @example
 * ```json
 * {
 *   "globToolCall": {
 *     "args": {
 *       "glob_pattern": "**\/*.ts",
 *       "path": "/path/to/project"
 *     },
 *     "result": { "files": ["src/index.ts", "src/types.ts"] }
 *   }
 * }
 * ```
 */
export interface CursorGlobTool {
  globToolCall: {
    args: {
      glob_pattern?: string;
      path?: string; // Alternative: target_directory
    };
    result?: unknown;
  };
}

/**
 * Grep tool - Text search with regex.
 *
 * @example
 * ```json
 * {
 *   "grepToolCall": {
 *     "args": {
 *       "pattern": "function.*\\(",
 *       "path": "/path/to/search",
 *       "glob_filter": "*.ts",
 *       "output_mode": "content",
 *       "case_insensitive": true,
 *       "multiline": false,
 *       "head_limit": 10,
 *       "type": "ts"
 *     },
 *     "result": { "matches": [...] }
 *   }
 * }
 * ```
 */
export interface CursorGrepTool {
  grepToolCall: {
    args: {
      pattern: string;
      path?: string;
      glob_filter?: string;
      output_mode?: string;
      case_insensitive?: boolean;
      multiline?: boolean;
      head_limit?: number;
      type?: string;
    };
    result?: unknown;
  };
}

/**
 * SemSearch tool - Semantic code search.
 *
 * @example
 * ```json
 * {
 *   "semSearchToolCall": {
 *     "args": {
 *       "query": "authentication logic",
 *       "target_directories": ["src/auth", "src/middleware"],
 *       "explanation": "Looking for login handling code"
 *     },
 *     "result": { "results": [...] }
 *   }
 * }
 * ```
 */
export interface CursorSemSearchTool {
  semSearchToolCall: {
    args: {
      query: string;
      target_directories?: string[];
      explanation?: string;
    };
    result?: unknown;
  };
}

/**
 * Todo item structure.
 */
export interface CursorTodoItem {
  id?: string;
  content: string;
  status: string; // 'pending' | 'in_progress' | 'completed'
  created_at?: string;
  updated_at?: string;
  dependencies?: string[];
}

/**
 * Todo tool - Manage todo lists.
 *
 * @example
 * ```json
 * {
 *   "updateTodosToolCall": {
 *     "args": {
 *       "todos": [
 *         {
 *           "id": "todo-1",
 *           "content": "Implement login",
 *           "status": "in_progress"
 *         },
 *         {
 *           "content": "Write tests",
 *           "status": "pending"
 *         }
 *       ]
 *     },
 *     "result": { "updated": true }
 *   }
 * }
 * ```
 */
export interface CursorTodoTool {
  updateTodosToolCall: {
    args: {
      todos?: CursorTodoItem[];
    };
    result?: unknown;
  };
}

/**
 * MCP content item from tool result.
 */
export interface CursorMcpContentItem {
  text?: {
    text: string;
  };
}

/**
 * MCP tool - Model Context Protocol tool calls.
 *
 * @example
 * ```json
 * {
 *   "mcpToolCall": {
 *     "args": {
 *       "name": "read_file",
 *       "args": { "path": "README.md" },
 *       "provider_identifier": "filesystem",
 *       "tool_name": "read_file"
 *     },
 *     "result": {
 *       "success": {
 *         "content": [
 *           { "text": { "text": "# Project README..." } }
 *         ],
 *         "isError": false
 *       }
 *     }
 *   }
 * }
 * ```
 */
export interface CursorMcpTool {
  mcpToolCall: {
    args: {
      name: string;
      args: unknown;
      provider_identifier?: string;
      tool_name?: string;
    };
    result?: {
      success?: {
        content?: CursorMcpContentItem[];
        isError?: boolean;
      };
      failure?: {
        content?: CursorMcpContentItem[];
        isError?: boolean;
      };
    };
  };
}

/**
 * Unknown tool - Fallback for future tools not yet defined.
 * Captures any tool format with dynamic property name.
 *
 * @example
 * ```json
 * {
 *   "futureToolCall": {
 *     "args": { "param1": "value1" },
 *     "result": { "data": "..." }
 *   }
 * }
 * ```
 */
export interface CursorUnknownTool {
  [toolName: string]: {
    args: Record<string, unknown>;
    result?: unknown;
  };
}

/**
 * Discriminated union of all Cursor tool types.
 * Tools are distinguished by their property name (shellToolCall, readToolCall, etc.).
 *
 * @example Type checking
 * ```typescript
 * function handleTool(tool: CursorToolCall) {
 *   if ('shellToolCall' in tool) {
 *     console.log('Command:', tool.shellToolCall.args.command);
 *   } else if ('editToolCall' in tool) {
 *     console.log('Path:', tool.editToolCall.args.path);
 *   }
 *   // ... etc
 * }
 * ```
 */
export type CursorToolCall =
  | CursorShellTool
  | CursorReadTool
  | CursorWriteTool
  | CursorEditTool
  | CursorDeleteTool
  | CursorLsTool
  | CursorGlobTool
  | CursorGrepTool
  | CursorSemSearchTool
  | CursorTodoTool
  | CursorMcpTool
  | CursorUnknownTool;

/**
 * Extract tool name from tool call.
 * Returns the property name identifying the tool type.
 *
 * @param toolCall - Any Cursor tool call
 * @returns Tool name (e.g., 'shell', 'read', 'edit', etc.)
 *
 * @example
 * ```typescript
 * const tool: CursorToolCall = {
 *   shellToolCall: {
 *     args: { command: 'ls' }
 *   }
 * };
 *
 * const name = getToolName(tool);
 * console.log(name); // "shell"
 * ```
 */
export function getToolName(toolCall: CursorToolCall): string {
  if ('shellToolCall' in toolCall) return 'shell';
  if ('readToolCall' in toolCall) return 'read';
  if ('writeToolCall' in toolCall) return 'write';
  if ('editToolCall' in toolCall) return 'edit';
  if ('deleteToolCall' in toolCall) return 'delete';
  if ('lsToolCall' in toolCall) return 'ls';
  if ('globToolCall' in toolCall) return 'glob';
  if ('grepToolCall' in toolCall) return 'grep';
  if ('semSearchToolCall' in toolCall) return 'semsearch';
  if ('updateTodosToolCall' in toolCall) return 'todo';
  if ('mcpToolCall' in toolCall) return 'mcp';

  // Unknown tool: extract first property name
  const keys = Object.keys(toolCall);
  if (keys.length > 0) {
    return keys[0].replace(/ToolCall$/, '').toLowerCase();
  }

  return 'unknown';
}
