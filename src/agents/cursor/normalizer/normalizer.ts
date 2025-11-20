/**
 * Cursor Output Normalizer
 *
 * Converts Cursor JSONL messages to normalized entries for UI rendering.
 * Handles streaming message coalescing and session metadata tracking.
 *
 * @module agents/cursor/normalizer/normalizer
 */

import type { OutputChunk, NormalizedEntry } from '../../types/agent-executor.js';
import type { CursorMessage } from '../types/messages.js';
import { CursorNormalizationState } from './state.js';

/**
 * Normalize Cursor JSONL output to unified format.
 *
 * Parses line-delimited JSON output from Cursor CLI and converts
 * to normalized entries. Handles streaming message coalescing,
 * session metadata extraction, and authentication error detection.
 *
 * @param outputStream - Stream of output chunks from process
 * @param workDir - Working directory for path relativization
 * @returns Async iterable of normalized entries
 *
 * @example
 * ```typescript
 * const executor = new CursorExecutor();
 * const spawned = await executor.executeTask(task);
 * const outputStream = executor.createOutputChunks(spawned.process);
 *
 * for await (const entry of normalizeOutput(outputStream, task.workDir)) {
 *   console.log(entry.type.kind, entry.content);
 * }
 * ```
 */
export async function* normalizeOutput(
  outputStream: AsyncIterable<OutputChunk>,
  workDir: string
): AsyncIterable<NormalizedEntry> {
  const state = new CursorNormalizationState();
  let buffer = '';

  for await (const chunk of outputStream) {
    // Handle stderr separately
    if (chunk.type === 'stderr') {
      yield* handleStderr(chunk, state);
      continue;
    }

    // Accumulate stdout data
    buffer += chunk.data.toString();

    // Process complete lines
    const lines = buffer.split('\n');
    // Keep last incomplete line in buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      // Try to parse as JSON
      let message: CursorMessage;
      try {
        message = JSON.parse(line);
      } catch {
        // Non-JSON line -> system message
        yield createSystemMessage(line, state);
        continue;
      }

      // Route to appropriate handler
      const entry = normalizeMessage(message, state, workDir);
      if (entry) {
        yield entry;
      }
    }
  }

  // Process any remaining buffer content
  if (buffer.trim()) {
    try {
      const message: CursorMessage = JSON.parse(buffer);
      const entry = normalizeMessage(message, state, workDir);
      if (entry) {
        yield entry;
      }
    } catch {
      // Non-JSON line -> system message
      yield createSystemMessage(buffer, state);
    }
  }
}

/**
 * Known authentication error message from Cursor CLI.
 *
 * This exact message indicates that the user needs to authenticate
 * via `cursor-agent login` or set CURSOR_API_KEY.
 */
const AUTH_ERROR_MESSAGE =
  "Authentication required. Please run 'cursor-agent login' first, or set CURSOR_API_KEY environment variable.";

/**
 * Detect if stderr contains an authentication error.
 *
 * Checks for both the exact auth error message and common auth-related keywords.
 *
 * @param stderr - Stderr text to check
 * @returns True if authentication error detected
 */
function detectAuthError(stderr: string): boolean {
  // Check for exact error message first
  if (stderr.includes(AUTH_ERROR_MESSAGE)) {
    return true;
  }

  // Check for auth-related keywords
  return (
    stderr.includes('authentication') ||
    stderr.includes('login') ||
    stderr.includes('CURSOR_API_KEY') ||
    stderr.includes('not authenticated')
  );
}

/**
 * Handle stderr output.
 *
 * Detects authentication errors and other stderr messages.
 * Authentication errors trigger setup_required error entries.
 *
 * @param chunk - Stderr output chunk
 * @param state - Normalization state
 * @returns Async iterable of error entries
 */
async function* handleStderr(
  chunk: OutputChunk,
  state: CursorNormalizationState
): AsyncIterable<NormalizedEntry> {
  const text = chunk.data.toString();

  // Detect authentication errors
  if (detectAuthError(text)) {
    yield {
      index: state.nextIndex(),
      timestamp: new Date(),
      type: {
        kind: 'error',
        error: {
          message: text.trim(),
          code: 'SETUP_REQUIRED',
        },
      },
      content: `Authentication required: ${text.trim()}`,
    };
    return;
  }

  // Other stderr messages become system messages
  if (text.trim()) {
    yield {
      index: state.nextIndex(),
      timestamp: new Date(),
      type: { kind: 'system_message' },
      content: text.trim(),
    };
  }
}

/**
 * Create system message entry from non-JSON line.
 *
 * @param line - Non-JSON output line
 * @param state - Normalization state
 * @returns System message entry
 */
function createSystemMessage(
  line: string,
  state: CursorNormalizationState
): NormalizedEntry {
  return {
    index: state.nextIndex(),
    timestamp: new Date(),
    type: { kind: 'system_message' },
    content: line,
  };
}

/**
 * Handle tool call message lifecycle.
 *
 * Routes to started or completed handler based on subtype.
 *
 * @param message - Tool call message
 * @param state - Normalization state
 * @param workDir - Working directory for path relativization
 * @returns Normalized entry, or null if message should be skipped
 */
function handleToolCallMessage(
  message: CursorMessage & { type: 'tool_call' },
  state: CursorNormalizationState,
  workDir: string
): NormalizedEntry | null {
  if (message.subtype === 'started') {
    return state.handleToolCallStarted(message, workDir);
  }

  if (message.subtype === 'completed') {
    return state.handleToolCallCompleted(message, workDir);
  }

  // Unknown subtype - skip
  return null;
}

/**
 * Normalize a single Cursor message.
 *
 * Routes message to appropriate handler based on type.
 * Handles streaming coalescing for assistant and thinking messages.
 *
 * @param message - Parsed Cursor message
 * @param state - Normalization state
 * @param workDir - Working directory for path relativization
 * @returns Normalized entry, or null if message should be skipped
 */
function normalizeMessage(
  message: CursorMessage,
  state: CursorNormalizationState,
  workDir: string
): NormalizedEntry | null {
  switch (message.type) {
    case 'system':
      return state.handleSystemMessage(message);

    case 'user':
      return state.handleUserMessage(message);

    case 'assistant':
      return state.handleAssistantMessage(message);

    case 'thinking':
      return state.handleThinkingMessage(message);

    case 'tool_call':
      return handleToolCallMessage(message, state, workDir);

    case 'result':
      return state.handleResultMessage(message);

    default:
      // Exhaustiveness check
      const _exhaustive: never = message;
      return null;
  }
}
