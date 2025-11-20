/**
 * Claude Output Normalizer
 *
 * Converts Claude stream-json messages to normalized entries for UI rendering.
 *
 * @module agents/claude/normalizer
 */

import path from 'path';
import type {
  ClaudeStreamMessage,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolUseMessage,
  ResultMessage,
  ContentBlock,
  ToolUseBlock,
  TextBlock,
} from './types/messages.js';
import type {
  NormalizedEntry,
  ActionType,
  ToolUseEntry,
  ErrorEntry,
} from '../types/agent-executor.js';

/**
 * Normalizer state for tracking streaming and tool uses
 */
interface NormalizerState {
  /** Current entry index */
  index: number;
  /** Active assistant message being coalesced */
  activeMessage: { index: number; content: string } | null;
  /** Map of tool_use_id to entry index */
  toolUseMap: Map<string, number>;
}

/**
 * Create initial normalizer state
 */
export function createNormalizerState(): NormalizerState {
  return {
    index: 0,
    activeMessage: null,
    toolUseMap: new Map(),
  };
}

/**
 * Normalize a single Claude stream-json message
 *
 * @param message - Stream-json message from Claude
 * @param workDir - Working directory for path relativization
 * @param state - Normalizer state (modified in place)
 * @returns Normalized entry, or null if message should be skipped
 */
export function normalizeMessage(
  message: ClaudeStreamMessage,
  workDir: string,
  state: NormalizerState
): NormalizedEntry | null {
  switch (message.type) {
    case 'system':
      return createSystemMessage(message, state);

    case 'user':
      return createUserMessage(message, state);

    case 'assistant':
      return handleAssistantMessage(message, workDir, state);

    case 'tool_use':
      return handleToolUseMessage(message, workDir, state);

    case 'result':
      return handleResultMessage(message, workDir, state);

    case 'control_request':
    case 'control_response':
      // Control protocol messages are not displayed
      return null;

    default:
      // Exhaustiveness check
      const _exhaustive: never = message;
      return null;
  }
}

/**
 * Create system message entry
 */
function createSystemMessage(
  message: SystemMessage,
  state: NormalizerState
): NormalizedEntry {
  return {
    index: state.index++,
    timestamp: new Date(),
    type: { kind: 'system_message' },
    content: `Session: ${message.sessionId}${message.model ? `, Model: ${message.model}` : ''}`,
  };
}

/**
 * Create user message entry
 */
function createUserMessage(
  message: UserMessage,
  state: NormalizerState
): NormalizedEntry {
  // Close any active assistant message
  state.activeMessage = null;

  const content =
    typeof message.message.content === 'string'
      ? message.message.content
      : message.message.content
          .filter((block) => block.type === 'text')
          .map((block) => (block as TextBlock).text)
          .join('');

  return {
    index: state.index++,
    timestamp: new Date(),
    type: { kind: 'user_message' },
    content,
  };
}

/**
 * Handle assistant message with coalescing
 *
 * Streaming assistant messages are coalesced into a single entry.
 * Each chunk updates the existing entry.
 *
 * Also handles tool_use blocks within assistant messages.
 */
function handleAssistantMessage(
  message: AssistantMessage,
  workDir: string,
  state: NormalizerState
): NormalizedEntry | null {
  const content = extractAssistantContent(message.message.content);

  // Check for tool use blocks
  const toolUseBlocks = message.message.content.filter(
    (block): block is ToolUseBlock => block.type === 'tool_use'
  );

  // If there are tool use blocks, create tool_use entries
  if (toolUseBlocks.length > 0) {
    // Close active assistant message
    state.activeMessage = null;

    // For now, handle first tool use block
    const toolUse = toolUseBlocks[0];
    const entryIndex = state.index++;
    state.toolUseMap.set(toolUse.id, entryIndex);

    const action = parseToolAction(toolUse, workDir);

    return {
      index: entryIndex,
      timestamp: new Date(),
      type: {
        kind: 'tool_use',
        tool: {
          toolName: toolUse.name,
          action,
          status: 'running',
        },
      },
      content: formatToolUseContent(toolUse),
    };
  }

  // Otherwise, handle as text message with coalescing
  if (!content) {
    return null; // Skip empty messages
  }

  // If we have an active message, this is a continuation
  if (state.activeMessage) {
    state.activeMessage.content += content;
    return {
      index: state.activeMessage.index,
      timestamp: new Date(),
      type: { kind: 'assistant_message' },
      content: state.activeMessage.content,
    };
  }

  // Start a new assistant message
  state.activeMessage = {
    index: state.index++,
    content,
  };

  return {
    index: state.activeMessage.index,
    timestamp: new Date(),
    type: { kind: 'assistant_message' },
    content,
  };
}

/**
 * Extract text content from assistant message content blocks
 */
function extractAssistantContent(content: ContentBlock[]): string {
  return content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * Handle tool use message
 *
 * Tool use messages are lifecycle events (started/completed).
 * For now, we skip these since the actual tool details come from
 * AssistantMessage with tool_use blocks.
 */
function handleToolUseMessage(
  message: ToolUseMessage,
  workDir: string,
  state: NormalizerState
): NormalizedEntry | null {
  // Skip lifecycle events - we get tool details from AssistantMessage
  return null;
}

/**
 * Parse tool use input to ActionType
 */
function parseToolAction(toolUse: ToolUseBlock, workDir: string): ActionType {
  const { name, input } = toolUse;

  switch (name) {
    case 'Bash': {
      const bashInput = input as { command?: string };
      return {
        kind: 'command_run',
        command: bashInput.command || '',
      };
    }

    case 'Edit': {
      const editInput = input as {
        file_path?: string;
        old_string?: string;
        new_string?: string;
      };
      // For Edit, we convert to file_edit with a change
      return {
        kind: 'file_edit',
        path: relativizePath(editInput.file_path || '', workDir),
        changes: [
          {
            type: 'edit',
            unifiedDiff: createUnifiedDiff(
              editInput.old_string || '',
              editInput.new_string || ''
            ),
          },
        ],
      };
    }

    case 'Read': {
      const readInput = input as { file_path?: string };
      return {
        kind: 'file_read',
        path: relativizePath(readInput.file_path || '', workDir),
      };
    }

    case 'Write': {
      const writeInput = input as { file_path?: string };
      return {
        kind: 'file_write',
        path: relativizePath(writeInput.file_path || '', workDir),
      };
    }

    default:
      // MCP tools or unknown tools
      return {
        kind: 'tool',
        toolName: name,
        args: input,
      };
  }
}

/**
 * Create a simple unified diff representation
 */
function createUnifiedDiff(oldStr: string, newStr: string): string {
  return `- ${oldStr}\n+ ${newStr}`;
}

/**
 * Format tool use content for display
 */
function formatToolUseContent(toolUse: ToolUseBlock): string {
  return `Tool: ${toolUse.name}\nInput: ${JSON.stringify(toolUse.input, null, 2)}`;
}

/**
 * Handle result message
 *
 * Final result message indicates task completion.
 * For now, we skip these as they don't add actionable info to the UI.
 */
function handleResultMessage(
  message: ResultMessage,
  workDir: string,
  state: NormalizerState
): NormalizedEntry | null {
  // Close any active assistant message
  state.activeMessage = null;

  // If there's an error, create an error entry
  if (message.isError && message.result) {
    return {
      index: state.index++,
      timestamp: new Date(),
      type: {
        kind: 'error',
        error: {
          message: JSON.stringify(message.result),
          code: 'TASK_ERROR',
        },
      },
      content: `Task failed: ${JSON.stringify(message.result)}`,
    };
  }

  // Otherwise skip - task success is implicit
  return null;
}

/**
 * Relativize file path based on working directory
 *
 * Converts absolute paths to relative paths for better display.
 */
function relativizePath(filePath: string, workDir: string): string {
  if (!filePath || !path.isAbsolute(filePath)) {
    return filePath;
  }

  try {
    const relative = path.relative(workDir, filePath);
    // Only use relative path if it's shorter and doesn't start with ../..
    if (relative.length < filePath.length && !relative.startsWith('../..')) {
      return relative;
    }
  } catch {
    // Ignore path errors
  }

  return filePath;
}
