/**
 * Output Renderer
 *
 * Formats NormalizedEntry objects for terminal display with colors and formatting.
 */

import boxen from 'boxen';
import stripAnsi from 'strip-ansi';
import type { NormalizedEntry } from '../../agents/types/agent-executor.js';
import type { RenderOptions, ExecutionResult, TaskHeader } from './types.js';
import { colors, icons } from './colors.js';

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Wrap text to specified width, preserving indentation
 */
function wrapText(text: string, maxWidth: number): string {
  if (maxWidth === 0 || text.length === 0) {
    return text;
  }

  const lines = text.split('\n');
  const wrapped: string[] = [];

  for (const line of lines) {
    const plainLine = stripAnsi(line);
    if (plainLine.length <= maxWidth) {
      wrapped.push(line);
      continue;
    }

    // Simple word wrapping
    const words = line.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (stripAnsi(testLine).length <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          wrapped.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      wrapped.push(currentLine);
    }
  }

  return wrapped.join('\n');
}

/**
 * Render a single normalized entry
 */
export function renderEntry(
  entry: NormalizedEntry,
  options: RenderOptions = {},
): string {
  const {
    showTimestamps = false,
    showThinking = true,
    useColors = true,
    maxWidth = 0,
  } = options;

  // Skip thinking entries if disabled
  if (entry.type.kind === 'thinking' && !showThinking) {
    return '';
  }

  const parts: string[] = [];

  // Timestamp
  if (showTimestamps && entry.timestamp) {
    const timestamp = formatTimestamp(entry.timestamp);
    parts.push(useColors ? colors.dim(`[${timestamp}]`) : `[${timestamp}]`);
  }

  // Icon and type-specific rendering
  switch (entry.type.kind) {
    case 'system_message': {
      const icon = useColors ? colors.system(icons.system) : icons.system;
      parts.push(icon);
      const content = useColors ? colors.system(entry.content) : entry.content;
      parts.push(content);
      break;
    }

    case 'user_message': {
      const icon = useColors ? colors.user(icons.user) : icons.user;
      parts.push(icon);
      const content = useColors ? colors.user(entry.content) : entry.content;
      parts.push(content);
      break;
    }

    case 'assistant_message': {
      const icon = useColors ? colors.assistant(icons.assistant) : icons.assistant;
      parts.push(icon);
      const content = useColors ? colors.assistant(entry.content) : entry.content;
      parts.push(content);
      break;
    }

    case 'thinking': {
      const icon = useColors ? colors.thinking(icons.thinking) : icons.thinking;
      parts.push(icon);
      const content = useColors ? colors.thinking(entry.content) : entry.content;
      parts.push(content);
      break;
    }

    case 'tool_use': {
      const { tool } = entry.type;
      const icon = useColors ? colors.toolUse(icons.toolUse) : icons.toolUse;
      const toolName = useColors ? colors.toolUse(tool.toolName) : tool.toolName;
      parts.push(`${icon} ${toolName}`);

      // Add action details
      if (tool.action.kind === 'file_read') {
        parts.push(useColors ? colors.dim(`Read: ${tool.action.path}`) : `Read: ${tool.action.path}`);
      } else if (tool.action.kind === 'file_write') {
        parts.push(useColors ? colors.dim(`Write: ${tool.action.path}`) : `Write: ${tool.action.path}`);
      } else if (tool.action.kind === 'file_edit') {
        parts.push(useColors ? colors.dim(`Edit: ${tool.action.path}`) : `Edit: ${tool.action.path}`);
      } else if (tool.action.kind === 'command_run') {
        parts.push(useColors ? colors.dim(`Run: ${tool.action.command}`) : `Run: ${tool.action.command}`);
      } else if (tool.action.kind === 'search') {
        parts.push(useColors ? colors.dim(`Search: ${tool.action.query}`) : `Search: ${tool.action.query}`);
      }

      // Add content if present
      if (entry.content) {
        parts.push(useColors ? colors.dim(entry.content) : entry.content);
      }
      break;
    }

    case 'error': {
      const { error } = entry.type;
      const icon = useColors ? colors.error(icons.error) : icons.error;
      parts.push(icon);
      const message = useColors ? colors.error(error.message) : error.message;
      parts.push(message);

      if (error.code) {
        const code = useColors ? colors.dim(`(${error.code})`) : `(${error.code})`;
        parts.push(code);
      }
      break;
    }
  }

  let output = parts.join(' ');

  // Apply text wrapping
  if (maxWidth > 0) {
    output = wrapText(output, maxWidth);
  }

  return output;
}

/**
 * Render task header in a bordered box
 */
export function renderHeader(header: TaskHeader): string {
  const lines: string[] = [];

  lines.push(colors.info(`Task ID: ${header.taskId}`));
  lines.push(colors.dim(`Process: ${header.processId}`));
  lines.push(colors.dim(`Agent: ${header.agentName}`));

  if (header.sessionId) {
    lines.push(colors.dim(`Session: ${header.sessionId}`));
  }

  return boxen(lines.join('\n'), {
    padding: 1,
    margin: 0,
    borderStyle: 'round',
    borderColor: 'cyan',
  });
}

/**
 * Render execution summary
 */
export function renderSummary(result: ExecutionResult): string {
  const lines: string[] = [];

  // Status
  if (result.success) {
    lines.push(colors.success(`${icons.success} Task completed successfully`));
  } else {
    lines.push(colors.error(`${icons.error} Task failed`));
    if (result.error) {
      lines.push(colors.error(`  Error: ${result.error}`));
    }
  }

  // Metrics
  lines.push('');
  lines.push(colors.dim('Metrics:'));
  lines.push(colors.dim(`  Duration: ${formatDuration(result.durationMs)}`));
  lines.push(colors.dim(`  Tools used: ${result.toolsUsed}`));
  lines.push(colors.dim(`  Files changed: ${result.filesChanged}`));

  if (result.exitCode !== undefined) {
    lines.push(colors.dim(`  Exit code: ${result.exitCode}`));
  }

  return boxen(lines.join('\n'), {
    padding: 1,
    margin: { top: 1, bottom: 0, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: result.success ? 'green' : 'red',
  });
}
