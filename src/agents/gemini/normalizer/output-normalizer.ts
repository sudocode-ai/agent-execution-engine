/**
 * Output normalizer for Gemini CLI.
 *
 * Converts SDK SessionNotification events to NormalizedEntry format.
 */

import type * as acp from '@agentclientprotocol/sdk';
import type { NormalizedEntry, ActionType } from '../../types/agent-executor.js';

/**
 * Normalizes Gemini SDK output to unified NormalizedEntry format.
 *
 * @example
 * ```typescript
 * const normalizer = new GeminiOutputNormalizer();
 *
 * // Normalize SDK notification
 * const entry = normalizer.normalize(notification, '/path/to/project');
 * if (entry) {
 *   console.log('Entry:', entry.type.kind, entry.content);
 * }
 * ```
 */
export class GeminiOutputNormalizer {
  private index = 0;

  /**
   * Normalize SDK SessionNotification to NormalizedEntry.
   *
   * @param notification - SDK session notification
   * @param workDir - Working directory for relative path resolution
   * @returns Normalized entry or null if event should be skipped
   */
  normalize(
    notification: acp.SessionNotification,
    workDir: string
  ): NormalizedEntry | null {
    const update = notification.update;
    const timestamp = new Date();

    // AgentMessageChunk → assistant_message
    if ('AgentMessageChunk' in update) {
      const chunk = update.AgentMessageChunk as any;
      const content = chunk.content;
      if ('Text' in content) {
        return {
          index: this.index++,
          timestamp,
          type: { kind: 'assistant_message' },
          content: content.Text.text,
        };
      }
      // Skip non-text content (images, audio)
      return null;
    }

    // AgentThoughtChunk → thinking
    if ('AgentThoughtChunk' in update) {
      const chunk = update.AgentThoughtChunk as any;
      const content = chunk.content;
      if ('Text' in content) {
        return {
          index: this.index++,
          timestamp,
          type: { kind: 'thinking', reasoning: content.Text.text },
          content: content.Text.text,
        };
      }
      return null;
    }

    // ToolCall → tool_use
    if ('ToolCall' in update) {
      const tool = update.ToolCall as any;
      return {
        index: this.index++,
        timestamp,
        type: {
          kind: 'tool_use',
          tool: {
            toolName: tool.kind,
            action: this.mapToolAction(tool),
            status: this.mapToolStatus(tool.status),
          },
        },
        content: `[Tool: ${tool.kind} ${tool.title || ''}]`,
        metadata: { toolCall: tool },
      };
    }

    // ToolCallUpdate → tool_use (update)
    if ('ToolCallUpdate' in update) {
      const toolUpdate = update.ToolCallUpdate as any;
      return {
        index: this.index++,
        timestamp,
        type: {
          kind: 'tool_use',
          tool: {
            toolName: 'unknown',
            action: { kind: 'tool', toolName: 'unknown' },
            status: this.mapToolStatus(toolUpdate.status),
          },
        },
        content: `[Tool Update: ${toolUpdate.toolCallId} → ${toolUpdate.status}]`,
        metadata: { toolCallUpdate: toolUpdate },
      };
    }

    // Plan → thinking with formatted plan
    if ('Plan' in update) {
      const plan = update.Plan as any;
      const content =
        '## Plan\n' +
        plan.entries.map((e: any, i: number) => `${i + 1}. ${e.content}`).join('\n');

      return {
        index: this.index++,
        timestamp,
        type: { kind: 'thinking', reasoning: content },
        content,
        metadata: { plan },
      };
    }

    // AvailableCommandsUpdate → skip (not user-facing)
    if ('AvailableCommandsUpdate' in update) {
      return null;
    }

    // CurrentModeUpdate → skip (not user-facing)
    if ('CurrentModeUpdate' in update) {
      return null;
    }

    // Unknown/unsupported update type
    return null;
  }

  /**
   * Map SDK tool kind to ActionType.
   */
  private mapToolAction(tool: any): ActionType {
    const kind = String(tool.kind).toLowerCase();
    const title = tool.title || '';

    if (kind === 'read') {
      return { kind: 'file_read', path: title };
    }

    if (kind === 'edit' || kind === 'write') {
      return {
        kind: 'file_edit',
        path: title,
        changes: [], // TODO: Extract from tool content if available
      };
    }

    if (kind === 'execute' || kind === 'run') {
      return {
        kind: 'command_run',
        command: title,
      };
    }

    if (kind === 'search' || kind === 'grep') {
      return {
        kind: 'search',
        query: title,
      };
    }

    // Fallback to generic tool (includes Fetch/HTTP and unknown tools)
    return {
      kind: 'tool',
      toolName: tool.kind,
    };
  }

  /**
   * Map SDK tool status to normalized status.
   */
  private mapToolStatus(
    status: string
  ): 'created' | 'running' | 'success' | 'failed' {
    const lower = String(status).toLowerCase();

    if (lower === 'pending' || lower === 'created') {
      return 'created';
    }

    if (lower === 'running' || lower === 'in_progress' || lower === 'inprogress') {
      return 'running';
    }

    if (lower === 'success' || lower === 'completed' || lower === 'done') {
      return 'success';
    }

    if (lower === 'error' || lower === 'failed' || lower === 'failure') {
      return 'failed';
    }

    // Default to created for unknown status
    return 'created';
  }

  /**
   * Reset normalizer state (for new sessions).
   */
  reset(): void {
    this.index = 0;
  }

  /**
   * Get current entry index.
   */
  getCurrentIndex(): number {
    return this.index;
  }
}
