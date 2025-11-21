/**
 * Cursor Tool to ActionType Mappers
 *
 * Maps Cursor's 11 tool types to normalized ActionType format.
 * Handles tool call lifecycle (started → completed) and result extraction.
 *
 * @module agents/cursor/normalizer/mappers
 */

import path from 'path';
import type {
  ActionType,
  CommandResult,
  FileChange,
} from '../../types/agent-executor.js';
import type {
  CursorToolCall,
  CursorShellTool,
  CursorReadTool,
  CursorWriteTool,
  CursorEditTool,
  CursorDeleteTool,
  CursorLsTool,
  CursorGlobTool,
  CursorGrepTool,
  CursorSemSearchTool,
  CursorTodoTool,
  CursorMcpTool,
} from '../types/tools.js';
import { getToolName } from '../types/tools.js';
import {
  extractEditChanges,
  extractResultDiff,
} from './diff-utils.js';

/**
 * Tool mapping result containing action type and display content.
 */
export interface ToolMapping {
  /** Normalized action type */
  actionType: ActionType;
  /** Display content for UI */
  content: string;
}

/**
 * Map tool call to ActionType (for started events without result).
 *
 * @param toolCall - Cursor tool call
 * @param workDir - Working directory for path relativization
 * @returns Tool mapping with action type and content
 */
export function mapToolToAction(
  toolCall: CursorToolCall,
  workDir: string
): ToolMapping {
  if ('shellToolCall' in toolCall) {
    return mapShellTool(toolCall as CursorShellTool, workDir, false);
  }

  if ('readToolCall' in toolCall) {
    return mapReadTool(toolCall as CursorReadTool, workDir);
  }

  if ('writeToolCall' in toolCall) {
    return mapWriteTool(toolCall as CursorWriteTool, workDir, false);
  }

  if ('editToolCall' in toolCall) {
    return mapEditTool(toolCall as CursorEditTool, workDir, false);
  }

  if ('deleteToolCall' in toolCall) {
    return mapDeleteTool(toolCall as CursorDeleteTool, workDir);
  }

  if ('lsToolCall' in toolCall) {
    return mapLsTool(toolCall as CursorLsTool, workDir);
  }

  if ('globToolCall' in toolCall) {
    return mapGlobTool(toolCall as CursorGlobTool, workDir);
  }

  if ('grepToolCall' in toolCall) {
    return mapGrepTool(toolCall as CursorGrepTool, workDir);
  }

  if ('semSearchToolCall' in toolCall) {
    return mapSemSearchTool(toolCall as CursorSemSearchTool, workDir);
  }

  if ('updateTodosToolCall' in toolCall) {
    return mapTodoTool(toolCall as CursorTodoTool, workDir);
  }

  if ('mcpToolCall' in toolCall) {
    return mapMcpTool(toolCall as CursorMcpTool, workDir, false);
  }

  // Unknown tool fallback
  return mapUnknownTool(toolCall, workDir);
}

/**
 * Map tool call with result to ActionType (for completed events).
 *
 * @param toolCall - Cursor tool call with result
 * @param workDir - Working directory for path relativization
 * @returns Tool mapping with action type and content including result
 */
export function mapToolToActionWithResult(
  toolCall: CursorToolCall,
  workDir: string
): ToolMapping {
  if ('shellToolCall' in toolCall) {
    return mapShellTool(toolCall as CursorShellTool, workDir, true);
  }

  if ('writeToolCall' in toolCall) {
    return mapWriteTool(toolCall as CursorWriteTool, workDir, true);
  }

  if ('editToolCall' in toolCall) {
    return mapEditTool(toolCall as CursorEditTool, workDir, true);
  }

  if ('mcpToolCall' in toolCall) {
    return mapMcpTool(toolCall as CursorMcpTool, workDir, true);
  }

  // For other tools, no result processing needed
  return mapToolToAction(toolCall, workDir);
}

/**
 * Map shell tool to command_run action.
 */
function mapShellTool(
  toolCall: CursorShellTool,
  workDir: string,
  includeResult: boolean
): ToolMapping {
  const command = toolCall.shellToolCall.args.command || '';

  if (!includeResult || !toolCall.shellToolCall.result) {
    return {
      actionType: { kind: 'command_run', command },
      content: `\`\`\`bash\n${command}\n\`\`\``,
    };
  }

  const result = parseShellResult(toolCall);

  return {
    actionType: { kind: 'command_run', command, result },
    content: formatShellResult(command, result),
  };
}

/**
 * Parse shell tool result.
 */
function parseShellResult(toolCall: CursorShellTool): CommandResult | undefined {
  const resultObj = toolCall.shellToolCall.result as any;
  if (!resultObj) return undefined;

  const successResult = resultObj.success;
  const failureResult = resultObj.failure;

  const result = successResult || failureResult;
  if (!result) return undefined;

  return {
    exitCode: result.exitCode ?? (successResult ? 0 : 1),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/**
 * Format shell result for display.
 */
function formatShellResult(command: string, result?: CommandResult): string {
  let content = `\`\`\`bash\n${command}\n\`\`\`\n\n`;

  if (result) {
    content += `**Exit Code:** ${result.exitCode}\n\n`;

    if (result.stdout) {
      content += `**Output:**\n\`\`\`\n${result.stdout}\n\`\`\`\n\n`;
    }

    if (result.stderr) {
      content += `**Error:**\n\`\`\`\n${result.stderr}\n\`\`\`\n\n`;
    }
  }

  return content.trim();
}

/**
 * Map read tool to file_read action.
 */
function mapReadTool(toolCall: CursorReadTool, workDir: string): ToolMapping {
  const filePath = toolCall.readToolCall.args.path || '';
  const relativePath = makePathRelative(filePath, workDir);

  return {
    actionType: { kind: 'file_read', path: relativePath },
    content: `Read file: \`${relativePath}\``,
  };
}

/**
 * Map write tool to file_write action.
 */
function mapWriteTool(
  toolCall: CursorWriteTool,
  workDir: string,
  includeResult: boolean
): ToolMapping {
  const filePath = toolCall.writeToolCall.args.path || '';
  const relativePath = makePathRelative(filePath, workDir);

  let content = `Write file: \`${relativePath}\``;

  if (includeResult && toolCall.writeToolCall.result) {
    const result = toolCall.writeToolCall.result as any;
    const success = result && typeof result === 'object' && 'success' in result;
    content += success ? ' ✓' : ' ✗';
  }

  return {
    actionType: { kind: 'file_write', path: relativePath },
    content,
  };
}

/**
 * Map edit tool to file_edit action.
 */
function mapEditTool(
  toolCall: CursorEditTool,
  workDir: string,
  includeResult: boolean
): ToolMapping {
  const filePath = toolCall.editToolCall.args.path || '';
  const relativePath = makePathRelative(filePath, workDir);

  let changes: FileChange[];

  if (includeResult && toolCall.editToolCall.result) {
    // Try to extract from args first (has strategy info)
    const argsChanges = extractEditChanges(
      toolCall.editToolCall.args,
      relativePath
    );

    if (argsChanges.length > 0) {
      changes = argsChanges;
    } else {
      // Fallback: extract from result.success.diffString
      const resultChange = extractResultDiff(
        toolCall.editToolCall.result,
        relativePath
      );
      changes = resultChange ? [resultChange] : [{ type: 'edit' }];
    }
  } else {
    // No result, just indicate edit happened
    changes = [{ type: 'edit' }];
  }

  let content = `Edit file: \`${relativePath}\``;

  // Include diff in content if available
  const firstChange = changes[0];
  if (firstChange && 'unifiedDiff' in firstChange && firstChange.unifiedDiff) {
    content += `\n\n\`\`\`diff\n${firstChange.unifiedDiff}\n\`\`\``;
  }

  return {
    actionType: { kind: 'file_edit', path: relativePath, changes },
    content,
  };
}

/**
 * Map delete tool to file_edit action with delete change.
 */
function mapDeleteTool(
  toolCall: CursorDeleteTool,
  workDir: string
): ToolMapping {
  const filePath = toolCall.deleteToolCall.args.path || '';
  const relativePath = makePathRelative(filePath, workDir);

  const changes: FileChange[] = [{ type: 'delete' }];

  return {
    actionType: { kind: 'file_edit', path: relativePath, changes },
    content: `Delete file: \`${relativePath}\``,
  };
}

/**
 * Map ls tool to tool action.
 */
function mapLsTool(toolCall: CursorLsTool, workDir: string): ToolMapping {
  const dirPath = toolCall.lsToolCall.args.path || '.';
  const relativePath = makePathRelative(dirPath, workDir);

  return {
    actionType: { kind: 'tool', toolName: 'ls' },
    content: `List directory: \`${relativePath}\``,
  };
}

/**
 * Map glob tool to tool action.
 */
function mapGlobTool(toolCall: CursorGlobTool, workDir: string): ToolMapping {
  const pattern = toolCall.globToolCall.args.glob_pattern || '';

  return {
    actionType: { kind: 'tool', toolName: 'glob' },
    content: `Glob pattern: \`${pattern}\``,
  };
}

/**
 * Map grep tool to search action.
 */
function mapGrepTool(toolCall: CursorGrepTool, workDir: string): ToolMapping {
  const pattern = toolCall.grepToolCall.args.pattern || '';

  return {
    actionType: { kind: 'search', query: pattern },
    content: `Search: \`${pattern}\``,
  };
}

/**
 * Map semantic search tool to search action.
 */
function mapSemSearchTool(
  toolCall: CursorSemSearchTool,
  workDir: string
): ToolMapping {
  const query = toolCall.semSearchToolCall.args.query || '';

  return {
    actionType: { kind: 'search', query },
    content: `Semantic search: \`${query}\``,
  };
}

/**
 * Map todo tool to tool action.
 */
function mapTodoTool(toolCall: CursorTodoTool, workDir: string): ToolMapping {
  const todos = toolCall.updateTodosToolCall.args.todos || [];
  const operation = todos.length > 0 ? 'Update todos' : 'View todos';

  return {
    actionType: { kind: 'tool', toolName: 'todo' },
    content: `${operation} (${todos.length} items)`,
  };
}

/**
 * Map MCP tool to tool action.
 */
function mapMcpTool(
  toolCall: CursorMcpTool,
  workDir: string,
  includeResult: boolean
): ToolMapping {
  const providerIdentifier = toolCall.mcpToolCall.args.provider_identifier || '';
  const toolName = toolCall.mcpToolCall.args.tool_name || toolCall.mcpToolCall.args.name || 'unknown';
  const fullToolName = providerIdentifier
    ? `mcp:${providerIdentifier}:${toolName}`
    : `mcp:${toolName}`;

  let content = `MCP Tool: \`${fullToolName}\``;

  if (includeResult) {
    const resultText = parseMcpResult(toolCall);
    if (resultText) {
      content += `\n\n${resultText}`;
    }
  }

  return {
    actionType: {
      kind: 'tool',
      toolName: fullToolName,
      args: toolCall.mcpToolCall.args.args,
    },
    content,
  };
}

/**
 * Extract markdown content from MCP result.
 */
function parseMcpResult(toolCall: CursorMcpTool): string {
  const successResult = toolCall.mcpToolCall.result?.success;
  const failureResult = toolCall.mcpToolCall.result?.failure;

  const contentArray = successResult?.content || failureResult?.content || [];

  return contentArray
    .map((item) => {
      if (item.text) {
        return item.text.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Map unknown tool to generic tool action.
 */
function mapUnknownTool(
  toolCall: CursorToolCall,
  workDir: string
): ToolMapping {
  const toolName = getToolName(toolCall);

  return {
    actionType: { kind: 'tool', toolName, args: toolCall },
    content: `Tool: \`${toolName}\``,
  };
}

/**
 * Make absolute path relative to working directory.
 *
 * @param absolutePath - Absolute file path
 * @param workDir - Working directory
 * @returns Relative path, or original if not under workDir
 */
export function makePathRelative(
  absolutePath: string,
  workDir: string
): string {
  if (!absolutePath || !path.isAbsolute(absolutePath)) {
    return absolutePath;
  }

  try {
    const relative = path.relative(workDir, absolutePath);
    // Only use relative path if it's shorter and doesn't go up too far
    if (relative.length < absolutePath.length && !relative.startsWith('../..')) {
      return relative;
    }
  } catch {
    // Ignore path errors
  }

  return absolutePath;
}
