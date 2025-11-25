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
  CursorToolCallMessage,
} from '../types/messages.js';
import { concatText } from '../types/messages.js';
import { getToolName } from '../types/tools.js';
import {
  mapToolToAction,
  mapToolToActionWithResult,
} from './mappers.js';

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

  /** Current session ID (captured from system message) */
  private sessionId: string | null = null;

  /** Current model (captured from system message) */
  private model: string | null = null;

  /**
   * Get next entry index and increment counter.
   *
   * @returns Next sequential entry index
   */
  nextIndex(): number {
    return this.entryIndex++;
  }

  /**
   * Get standardized metadata for entries.
   *
   * Returns metadata with sessionId and model if available.
   *
   * @returns Metadata object or undefined if no metadata available
   */
  private getMetadata() {
    if (!this.sessionId && !this.model) {
      return undefined;
    }

    // Build metadata object, only including fields that are set
    const metadata: Record<string, unknown> = {};
    if (this.sessionId) {
      metadata.sessionId = this.sessionId;
    }
    if (this.model) {
      metadata.model = this.model;
    }

    return metadata;
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

    // Capture session ID and model for metadata
    if (message.session_id) {
      this.sessionId = message.session_id;
    }
    if (message.model) {
      this.model = message.model;
    }

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

    // Build metadata
    const metadata: Record<string, unknown> = {};
    if (this.sessionId) {
      metadata.sessionId = this.sessionId;
    }
    if (this.model) {
      metadata.model = this.model;
    }
    if (message.permission_mode) {
      metadata.permissionMode = message.permission_mode;
    }

    return {
      index: this.nextIndex(),
      timestamp: new Date(),
      type: { kind: 'system_message' },
      content: parts.join(', '),
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
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
      metadata: this.getMetadata(),
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
        metadata: this.getMetadata(),
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
      metadata: this.getMetadata(),
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
        metadata: this.getMetadata(),
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
      metadata: this.getMetadata(),
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
        metadata: this.getMetadata(),
      };
    }

    // Success - no entry needed (implicit)
    return null;
  }

  /**
   * Handle tool call started event.
   *
   * Creates a new tool_use entry with 'running' status and tracks
   * the call_id for later completion updates.
   *
   * @param message - Tool call message with subtype 'started'
   * @param workDir - Working directory for path relativization
   * @returns Tool use entry
   */
  handleToolCallStarted(
    message: CursorToolCallMessage,
    workDir: string
  ): NormalizedEntry {
    // Close any active streaming messages
    this.assistantMessage = undefined;
    this.thinkingMessage = undefined;

    const toolCall = message.tool_call as any; // CursorToolCall type
    const toolName = getToolName(toolCall);
    const { actionType, content } = mapToolToAction(toolCall, workDir);

    const index = this.nextIndex();
    const entry: NormalizedEntry = {
      index,
      timestamp: new Date(),
      type: {
        kind: 'tool_use',
        tool: {
          toolName,
          action: actionType,
          status: 'running',
        },
      },
      content,
      metadata: this.getMetadata(),
    };

    // Track call_id → entry for result merging
    if (message.call_id) {
      this.toolCalls.set(message.call_id, { index, entry });
    }

    return entry;
  }

  /**
   * Handle tool call completed event.
   *
   * Updates the existing tool_use entry with 'success' or 'failed' status
   * and includes result data. Reuses the same entry index as the started event.
   *
   * @param message - Tool call message with subtype 'completed'
   * @param workDir - Working directory for path relativization
   * @returns Updated tool use entry, or null if no matching started event
   */
  handleToolCallCompleted(
    message: CursorToolCallMessage,
    workDir: string
  ): NormalizedEntry | null {
    // Find existing entry by call_id
    const existing = message.call_id
      ? this.toolCalls.get(message.call_id)
      : undefined;

    const toolCall = message.tool_call as any; // CursorToolCall type

    if (!existing) {
      // No matching started event - create standalone entry
      const toolName = getToolName(toolCall);
      const { actionType, content } = mapToolToActionWithResult(
        toolCall,
        workDir
      );

      return {
        index: this.nextIndex(),
        timestamp: new Date(),
        type: {
          kind: 'tool_use',
          tool: {
            toolName,
            action: actionType,
            status: 'success',
          },
        },
        content,
        metadata: this.getMetadata(),
      };
    }

    // Update existing entry with result
    const toolName = getToolName(toolCall);
    const { actionType, content } = mapToolToActionWithResult(
      toolCall,
      workDir
    );

    // Determine status from result
    const hasError = this.toolHasError(toolCall);
    const status = hasError ? 'failed' : 'success';

    return {
      index: existing.index, // SAME index as started event
      timestamp: new Date(),
      type: {
        kind: 'tool_use',
        tool: {
          toolName,
          action: actionType,
          status,
        },
      },
      content,
      metadata: this.getMetadata(),
    };
  }

  /**
   * Check if tool call result indicates an error.
   *
   * @param toolCall - Tool call to check
   * @returns True if tool has error result
   * @private
   */
  private toolHasError(toolCall: any): boolean {
    // Check for failure result in various tool types
    if ('shellToolCall' in toolCall) {
      const result = toolCall.shellToolCall.result;
      return result && typeof result === 'object' && 'failure' in result;
    }

    if ('editToolCall' in toolCall) {
      const result = toolCall.editToolCall.result;
      return result && typeof result === 'object' && 'failure' in result;
    }

    if ('writeToolCall' in toolCall) {
      const result = toolCall.writeToolCall.result;
      return result && typeof result === 'object' && 'failure' in result;
    }

    if ('mcpToolCall' in toolCall) {
      const result = toolCall.mcpToolCall.result;
      return result && typeof result === 'object' && 'failure' in result;
    }

    // Default to success if no failure field found
    return false;
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
