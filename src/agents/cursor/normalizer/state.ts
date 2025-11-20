/**
 * Cursor Output Normalization State
 *
 * Tracks state during JSONL parsing and output normalization,
 * including streaming message coalescing and session metadata.
 *
 * @module agents/cursor/normalizer/state
 */

import type { NormalizedEntry } from '../../types/agent-executor.js';
import type {
  CursorSystemMessage,
  CursorUserMessage,
  CursorAssistantMessage,
  CursorThinkingMessage,
  CursorResultMessage,
} from '../types/messages.js';
import { concatText } from '../types/messages.js';

/**
 * State tracker for Cursor output normalization.
 *
 * Manages streaming message coalescing, tool call tracking,
 * and session metadata reporting.
 */
export class CursorNormalizationState {
  /** Current entry index (incremented for each new entry) */
  private entryIndex: number = 0;

  /** Active assistant message being coalesced */
  private assistantMessage?: { index: number; content: string };

  /** Active thinking message being coalesced */
  private thinkingMessage?: { index: number; content: string };

  /** Map of call_id to tool use entry (for completion updates) */
  private toolCalls: Map<string, { index: number; entry: NormalizedEntry }> =
    new Map();

  /** Whether model has been reported (report once) */
  private modelReported: boolean = false;

  /** Whether session ID has been reported (report once) */
  private sessionIdReported: boolean = false;

  /**
   * Get next entry index and increment counter.
   *
   * @returns Next sequential entry index
   */
  nextIndex(): number {
    return this.entryIndex++;
  }

  /**
   * Handle system message.
   *
   * Extracts and reports session ID and model info (once each).
   * Subsequent system messages are skipped to avoid duplicate reporting.
   *
   * @param message - System message
   * @returns System message entry, or null if already reported
   */
  handleSystemMessage(message: CursorSystemMessage): NormalizedEntry | null {
    // Close any active streaming messages
    this.assistantMessage = undefined;
    this.thinkingMessage = undefined;

    // Build content parts
    const parts: string[] = [];

    // Report session ID once
    if (message.session_id && !this.sessionIdReported) {
      parts.push(`Session: ${message.session_id}`);
      this.sessionIdReported = true;
    }

    // Report model once
    if (message.model && !this.modelReported) {
      parts.push(`Model: ${message.model}`);
      this.modelReported = true;
    }

    // Report other metadata
    if (message.permission_mode) {
      parts.push(`Mode: ${message.permission_mode}`);
    }

    // Skip if nothing to report
    if (parts.length === 0) {
      return null;
    }

    return {
      index: this.nextIndex(),
      timestamp: new Date(),
      type: { kind: 'system_message' },
      content: parts.join(', '),
    };
  }

  /**
   * Handle user message.
   *
   * Creates entry with user prompt content.
   *
   * @param message - User message
   * @returns User message entry
   */
  handleUserMessage(message: CursorUserMessage): NormalizedEntry {
    // Close any active streaming messages
    this.assistantMessage = undefined;
    this.thinkingMessage = undefined;

    const content = concatText(message.message);

    return {
      index: this.nextIndex(),
      timestamp: new Date(),
      type: { kind: 'user_message' },
      content,
    };
  }

  /**
   * Handle assistant message with streaming coalescing.
   *
   * Multiple assistant messages are coalesced into a single entry.
   * The first message creates a new entry, subsequent messages update
   * the same entry index with accumulated content.
   *
   * @param message - Assistant message
   * @returns Assistant message entry (coalesced)
   */
  handleAssistantMessage(message: CursorAssistantMessage): NormalizedEntry {
    // Close any active thinking message
    this.thinkingMessage = undefined;

    const chunk = concatText(message.message);

    // If we have an active message, this is a continuation
    if (this.assistantMessage) {
      this.assistantMessage.content += chunk;
      return {
        index: this.assistantMessage.index,
        timestamp: new Date(),
        type: { kind: 'assistant_message' },
        content: this.assistantMessage.content,
      };
    }

    // Start a new assistant message
    const index = this.nextIndex();
    this.assistantMessage = { index, content: chunk };

    return {
      index,
      timestamp: new Date(),
      type: { kind: 'assistant_message' },
      content: chunk,
    };
  }

  /**
   * Handle thinking message with streaming coalescing.
   *
   * Multiple thinking messages are coalesced into a single entry.
   * The first message creates a new entry, subsequent messages update
   * the same entry index with accumulated text.
   *
   * @param message - Thinking message
   * @returns Thinking message entry (coalesced), or null if no text
   */
  handleThinkingMessage(message: CursorThinkingMessage): NormalizedEntry | null {
    // Close any active assistant message
    this.assistantMessage = undefined;

    const chunk = message.text || '';

    // Skip empty thinking messages
    if (!chunk && !this.thinkingMessage) {
      return null;
    }

    // If we have an active thinking message, this is a continuation
    if (this.thinkingMessage) {
      this.thinkingMessage.content += chunk;
      return {
        index: this.thinkingMessage.index,
        timestamp: new Date(),
        type: { kind: 'thinking' },
        content: this.thinkingMessage.content,
      };
    }

    // Start a new thinking message
    const index = this.nextIndex();
    this.thinkingMessage = { index, content: chunk };

    return {
      index,
      timestamp: new Date(),
      type: { kind: 'thinking' },
      content: chunk,
    };
  }

  /**
   * Handle result message.
   *
   * Creates error entry if result indicates failure, otherwise returns null
   * (success is implicit).
   *
   * @param message - Result message
   * @returns Error entry if failed, null otherwise
   */
  handleResultMessage(message: CursorResultMessage): NormalizedEntry | null {
    // Close any active streaming messages
    this.assistantMessage = undefined;
    this.thinkingMessage = undefined;

    // If there's an error, create an error entry
    if (message.is_error && message.result) {
      return {
        index: this.nextIndex(),
        timestamp: new Date(),
        type: {
          kind: 'error',
          error: {
            message:
              typeof message.result === 'string'
                ? message.result
                : JSON.stringify(message.result),
            code: message.subtype || 'TASK_ERROR',
          },
        },
        content: `Task failed: ${
          typeof message.result === 'string'
            ? message.result
            : JSON.stringify(message.result)
        }`,
      };
    }

    // Success - no entry needed (implicit)
    return null;
  }

  /**
   * Get active tool call entry by call ID.
   *
   * @param callId - Tool call ID
   * @returns Tool call entry if found, undefined otherwise
   */
  getToolCall(callId: string): { index: number; entry: NormalizedEntry } | undefined {
    return this.toolCalls.get(callId);
  }

  /**
   * Store tool call entry for later completion updates.
   *
   * @param callId - Tool call ID
   * @param index - Entry index
   * @param entry - Normalized entry
   */
  setToolCall(callId: string, index: number, entry: NormalizedEntry): void {
    this.toolCalls.set(callId, { index, entry });
  }

  /**
   * Clear active assistant message (used when switching message types).
   */
  clearAssistantMessage(): void {
    this.assistantMessage = undefined;
  }

  /**
   * Clear active thinking message (used when switching message types).
   */
  clearThinkingMessage(): void {
    this.thinkingMessage = undefined;
  }
}
