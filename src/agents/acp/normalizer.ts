/**
 * ACP Normalizer Module
 *
 * Converts ACP SessionNotification updates to the unified NormalizedEntry format.
 * This enables consistent output handling across ACP and non-ACP agents.
 *
 * @module execution-engine/agents/acp/normalizer
 */

import type {
  SessionNotification,
  SessionUpdate,
  ToolCall,
  ToolCallUpdate,
  ToolKind,
  ToolCallStatus,
  ContentBlock,
  Plan,
} from './types.js';

import type {
  NormalizedEntry,
  NormalizedEntryType,
  ActionType,
  ToolUseEntry,
  FileChange,
  NormalizedEntryMetadata,
} from '../types/agent-executor.js';

/**
 * Options for the ACP normalizer
 */
export interface AcpNormalizerOptions {
  /**
   * Whether to include thought chunks as thinking entries
   * @default true
   */
  includeThoughts?: boolean;

  /**
   * Whether to include plan updates
   * @default true
   */
  includePlans?: boolean;

  /**
   * Whether to coalesce consecutive message chunks into single entries
   * @default true
   */
  coalesceChunks?: boolean;

  /**
   * Session ID to include in metadata
   */
  sessionId?: string;

  /**
   * Model name to include in metadata
   */
  model?: string;
}

/**
 * Internal state for coalescing chunks
 */
interface ChunkBuffer {
  type: 'user' | 'assistant' | 'thought';
  content: string;
  startTime: Date;
}

/**
 * AcpNormalizer class
 *
 * Converts ACP SessionNotification updates into NormalizedEntry format.
 * Handles streaming output with optional chunk coalescing.
 */
export class AcpNormalizer {
  readonly #options: Required<AcpNormalizerOptions>;
  #entryIndex = 0;
  #toolCalls = new Map<string, ToolCall>();
  #currentBuffer: ChunkBuffer | null = null;

  constructor(options: AcpNormalizerOptions = {}) {
    this.#options = {
      includeThoughts: options.includeThoughts ?? true,
      includePlans: options.includePlans ?? true,
      coalesceChunks: options.coalesceChunks ?? true,
      sessionId: options.sessionId ?? undefined,
      model: options.model ?? undefined,
    } as Required<AcpNormalizerOptions>;
  }

  /**
   * Normalize a single ACP session notification
   *
   * @param notification - The ACP session notification
   * @returns Array of normalized entries (may be empty if buffering)
   */
  normalize(notification: SessionNotification): NormalizedEntry[] {
    const entries: NormalizedEntry[] = [];
    const update = notification.update;

    switch (update.sessionUpdate) {
      case 'user_message_chunk':
        entries.push(...this.#handleMessageChunk('user', update.content));
        break;

      case 'agent_message_chunk':
        entries.push(...this.#handleMessageChunk('assistant', update.content));
        break;

      case 'agent_thought_chunk':
        if (this.#options.includeThoughts) {
          entries.push(...this.#handleMessageChunk('thought', update.content));
        }
        break;

      case 'tool_call':
        entries.push(...this.#handleToolCall(update));
        break;

      case 'tool_call_update':
        entries.push(...this.#handleToolCallUpdate(update));
        break;

      case 'plan':
        if (this.#options.includePlans) {
          entries.push(this.#handlePlan(update));
        }
        break;

      case 'available_commands_update':
        // Commands are informational, not converted to entries
        break;

      case 'current_mode_update':
        // Mode changes are informational, not converted to entries
        break;
    }

    return entries;
  }

  /**
   * Flush any buffered content
   *
   * Call this when the session ends to get any remaining buffered content.
   *
   * @returns Array of remaining normalized entries
   */
  flush(): NormalizedEntry[] {
    return this.#flushBuffer();
  }

  /**
   * Reset the normalizer state
   */
  reset(): void {
    this.#entryIndex = 0;
    this.#toolCalls.clear();
    this.#currentBuffer = null;
  }

  /**
   * Handle message chunk (user, assistant, or thought)
   */
  #handleMessageChunk(
    type: 'user' | 'assistant' | 'thought',
    content: ContentBlock,
  ): NormalizedEntry[] {
    const text = this.#extractText(content);

    if (!this.#options.coalesceChunks) {
      return [this.#createMessageEntry(type, text)];
    }

    // Coalescing mode
    if (this.#currentBuffer && this.#currentBuffer.type === type) {
      // Append to existing buffer
      this.#currentBuffer.content += text;
      return [];
    }

    // Different type - flush current buffer and start new one
    const entries = this.#flushBuffer();
    this.#currentBuffer = {
      type,
      content: text,
      startTime: new Date(),
    };

    return entries;
  }

  /**
   * Flush the current buffer
   */
  #flushBuffer(): NormalizedEntry[] {
    if (!this.#currentBuffer) {
      return [];
    }

    const buffer = this.#currentBuffer;
    this.#currentBuffer = null;

    if (!buffer.content.trim()) {
      return [];
    }

    return [this.#createMessageEntry(buffer.type, buffer.content, buffer.startTime)];
  }

  /**
   * Create a message entry
   */
  #createMessageEntry(
    type: 'user' | 'assistant' | 'thought',
    content: string,
    timestamp?: Date,
  ): NormalizedEntry {
    let entryType: NormalizedEntryType;

    switch (type) {
      case 'user':
        entryType = { kind: 'user_message' };
        break;
      case 'assistant':
        entryType = { kind: 'assistant_message' };
        break;
      case 'thought':
        entryType = { kind: 'thinking', reasoning: content };
        break;
    }

    return {
      index: this.#entryIndex++,
      timestamp: timestamp ?? new Date(),
      type: entryType,
      content,
      metadata: this.#createMetadata(),
    };
  }

  /**
   * Handle a new tool call
   */
  #handleToolCall(toolCall: ToolCall & { sessionUpdate: 'tool_call' }): NormalizedEntry[] {
    // Flush any buffered content first
    const entries = this.#flushBuffer();

    // Store the tool call for later updates
    this.#toolCalls.set(toolCall.toolCallId, toolCall);

    const tool = this.#convertToolCall(toolCall);

    entries.push({
      index: this.#entryIndex++,
      timestamp: new Date(),
      type: { kind: 'tool_use', tool },
      content: toolCall.title,
      metadata: this.#createMetadata(),
    });

    return entries;
  }

  /**
   * Handle a tool call update
   */
  #handleToolCallUpdate(update: ToolCallUpdate & { sessionUpdate: 'tool_call_update' }): NormalizedEntry[] {
    // Flush any buffered content first
    const entries = this.#flushBuffer();

    // Get existing tool call and merge update
    const existing = this.#toolCalls.get(update.toolCallId);
    if (existing) {
      // Merge update into existing, handling null values properly
      const merged: ToolCall = {
        ...existing,
        title: update.title ?? existing.title,
        toolCallId: update.toolCallId,
        content: update.content ?? existing.content,
        locations: update.locations ?? existing.locations,
        kind: update.kind ?? existing.kind,
        rawInput: update.rawInput ?? existing.rawInput,
        rawOutput: update.rawOutput ?? existing.rawOutput,
        status: update.status ?? existing.status,
      };
      this.#toolCalls.set(update.toolCallId, merged);
    }

    // Only emit entry if status changed or content was added
    if (update.status || update.content) {
      const toolCall = this.#toolCalls.get(update.toolCallId);
      if (toolCall) {
        const tool = this.#convertToolCall(toolCall);

        entries.push({
          index: this.#entryIndex++,
          timestamp: new Date(),
          type: { kind: 'tool_use', tool },
          content: toolCall.title,
          metadata: this.#createMetadata(),
        });
      }
    }

    return entries;
  }

  /**
   * Handle a plan update
   */
  #handlePlan(plan: Plan & { sessionUpdate: 'plan' }): NormalizedEntry {
    // Flush any buffered content first
    this.#flushBuffer();

    // Format plan entries as markdown
    const content = plan.entries
      .map((entry) => {
        const statusIcon = this.#getPlanStatusIcon(entry.status);
        const priorityTag = entry.priority !== 'medium' ? ` [${entry.priority}]` : '';
        return `${statusIcon} ${entry.content}${priorityTag}`;
      })
      .join('\n');

    return {
      index: this.#entryIndex++,
      timestamp: new Date(),
      type: { kind: 'system_message' },
      content: `## Plan\n\n${content}`,
      metadata: this.#createMetadata(),
    };
  }

  /**
   * Convert ACP ToolCall to NormalizedEntry ToolUseEntry
   */
  #convertToolCall(toolCall: ToolCall): ToolUseEntry {
    return {
      toolName: this.#extractToolName(toolCall),
      action: this.#convertToolKindToAction(toolCall),
      status: this.#convertToolStatus(toolCall.status),
      result: this.#extractToolResult(toolCall),
    };
  }

  /**
   * Extract tool name from ToolCall
   */
  #extractToolName(toolCall: ToolCall): string {
    // Use title as tool name, or kind as fallback
    if (toolCall.title) {
      // Extract first word as tool name
      const match = toolCall.title.match(/^(\w+)/);
      if (match) {
        return match[1];
      }
    }
    return toolCall.kind ?? 'Tool';
  }

  /**
   * Convert ACP ToolKind to ActionType
   */
  #convertToolKindToAction(toolCall: ToolCall): ActionType {
    const kind = toolCall.kind;
    const locations = toolCall.locations ?? [];
    const path = locations[0]?.path ?? '';

    switch (kind) {
      case 'read':
        return { kind: 'file_read', path };

      case 'edit':
        const changes = this.#extractFileChanges(toolCall);
        if (changes.length > 0) {
          return { kind: 'file_edit', path, changes };
        }
        return { kind: 'file_write', path };

      case 'delete':
        return { kind: 'file_edit', path, changes: [{ type: 'delete' }] };

      case 'execute':
        const command = this.#extractCommand(toolCall);
        return { kind: 'command_run', command };

      case 'search':
        const query = this.#extractSearchQuery(toolCall);
        return { kind: 'search', query };

      case 'think':
      case 'fetch':
      case 'switch_mode':
      case 'move':
      case 'other':
      default:
        return {
          kind: 'tool',
          toolName: this.#extractToolName(toolCall),
          args: toolCall.rawInput,
          result: toolCall.rawOutput,
        };
    }
  }

  /**
   * Extract file changes from tool call content
   */
  #extractFileChanges(toolCall: ToolCall): FileChange[] {
    const changes: FileChange[] = [];

    for (const content of toolCall.content ?? []) {
      if (content.type === 'diff') {
        changes.push({
          type: 'edit',
          unifiedDiff: this.#createUnifiedDiff(content.oldText, content.newText, content.path),
        });
      }
    }

    return changes;
  }

  /**
   * Create a unified diff string
   */
  #createUnifiedDiff(oldText: string | null | undefined, newText: string, path: string): string {
    const oldLines = (oldText ?? '').split('\n');
    const newLines = newText.split('\n');

    let diff = `--- a/${path}\n+++ b/${path}\n`;

    // Simple diff - this could be made more sophisticated
    if (!oldText) {
      // New file
      diff += `@@ -0,0 +1,${newLines.length} @@\n`;
      diff += newLines.map((line) => `+${line}`).join('\n');
    } else {
      // Modified file - simplified diff
      diff += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
      diff += oldLines.map((line) => `-${line}`).join('\n') + '\n';
      diff += newLines.map((line) => `+${line}`).join('\n');
    }

    return diff;
  }

  /**
   * Extract command from tool call
   */
  #extractCommand(toolCall: ToolCall): string {
    // Try to extract from rawInput
    if (toolCall.rawInput && typeof toolCall.rawInput === 'object') {
      const input = toolCall.rawInput as Record<string, unknown>;
      if (typeof input.command === 'string') {
        return input.command;
      }
    }

    // Try to extract from title
    if (toolCall.title) {
      const match = toolCall.title.match(/`([^`]+)`/);
      if (match) {
        return match[1];
      }
    }

    return toolCall.title ?? 'unknown command';
  }

  /**
   * Extract search query from tool call
   */
  #extractSearchQuery(toolCall: ToolCall): string {
    if (toolCall.rawInput && typeof toolCall.rawInput === 'object') {
      const input = toolCall.rawInput as Record<string, unknown>;
      if (typeof input.query === 'string') {
        return input.query;
      }
      if (typeof input.pattern === 'string') {
        return input.pattern;
      }
    }

    return toolCall.title ?? 'unknown query';
  }

  /**
   * Convert ACP ToolCallStatus to internal status
   */
  #convertToolStatus(status?: ToolCallStatus): 'created' | 'running' | 'success' | 'failed' {
    switch (status) {
      case 'pending':
        return 'created';
      case 'in_progress':
        return 'running';
      case 'completed':
        return 'success';
      case 'failed':
        return 'failed';
      default:
        return 'created';
    }
  }

  /**
   * Extract tool result from tool call
   */
  #extractToolResult(toolCall: ToolCall): { success: boolean; data?: unknown; error?: string } | undefined {
    if (toolCall.status === 'completed') {
      return {
        success: true,
        data: toolCall.rawOutput,
      };
    }

    if (toolCall.status === 'failed') {
      let error = 'Tool execution failed';

      // Try to extract error message from rawOutput
      if (toolCall.rawOutput && typeof toolCall.rawOutput === 'object') {
        const output = toolCall.rawOutput as Record<string, unknown>;
        if (typeof output.error === 'string') {
          error = output.error;
        } else if (typeof output.message === 'string') {
          error = output.message;
        }
      }

      return {
        success: false,
        error,
      };
    }

    return undefined;
  }

  /**
   * Extract text content from ContentBlock
   */
  #extractText(content: ContentBlock): string {
    switch (content.type) {
      case 'text':
        return content.text;
      case 'image':
        return '[Image]';
      case 'audio':
        return '[Audio]';
      case 'resource_link':
        return `[${content.name}](${content.uri})`;
      case 'resource':
        if ('text' in content.resource) {
          return content.resource.text;
        }
        return `[Resource: ${content.resource.uri}]`;
      default:
        return '';
    }
  }

  /**
   * Get icon for plan entry status
   */
  #getPlanStatusIcon(status: 'pending' | 'in_progress' | 'completed'): string {
    switch (status) {
      case 'pending':
        return '○';
      case 'in_progress':
        return '◐';
      case 'completed':
        return '●';
    }
  }

  /**
   * Create metadata for entries
   */
  #createMetadata(): NormalizedEntryMetadata | undefined {
    if (!this.#options.sessionId && !this.#options.model) {
      return undefined;
    }

    return {
      sessionId: this.#options.sessionId,
      model: this.#options.model,
    };
  }
}

/**
 * Normalize a stream of ACP notifications
 *
 * @param notifications - Async iterable of ACP notifications
 * @param options - Normalizer options
 * @returns Async iterable of normalized entries
 */
export async function* normalizeAcpStream(
  notifications: AsyncIterable<SessionNotification>,
  options?: AcpNormalizerOptions,
): AsyncIterable<NormalizedEntry> {
  const normalizer = new AcpNormalizer(options);

  for await (const notification of notifications) {
    const entries = normalizer.normalize(notification);
    for (const entry of entries) {
      yield entry;
    }
  }

  // Flush any remaining buffered content
  const remaining = normalizer.flush();
  for (const entry of remaining) {
    yield entry;
  }
}
