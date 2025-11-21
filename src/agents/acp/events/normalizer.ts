/**
 * ACP Event Normalizer
 *
 * Converts ACP events to the unified NormalizedEntry format used by the execution engine.
 * This allows ACP agents (Gemini, Qwen) to produce output in the same format as other agents.
 *
 * @module agents/acp/events/normalizer
 */

import type { NormalizedEntry, NormalizedEntryType } from '../../types/agent-executor.js';
import type { AcpEvent } from './acp-event.js';
import { extractTextContent, isTerminalStatus } from './acp-event.js';

/**
 * Convert AcpEvent to NormalizedEntry
 *
 * Transforms ACP protocol events into the unified entry format for session persistence
 * and UI rendering. This is the bridge between the ACP protocol and our internal format.
 *
 * @param event - ACP event to convert
 * @param index - Sequential entry number (0-indexed)
 * @param timestamp - When this entry was created
 * @returns Normalized entry
 *
 * @example
 * ```typescript
 * let index = 0;
 *
 * class AcpClient implements acp.Client {
 *   async sessionUpdate(params: acp.SessionNotification) {
 *     const event = sessionUpdateToEvent(params);
 *     const entry = toNormalizedEntry(event, index++, new Date());
 *     await this.sessionManager.append(entry);
 *   }
 * }
 * ```
 */
export function toNormalizedEntry(
  event: AcpEvent,
  index: number,
  timestamp: Date,
): NormalizedEntry {
  switch (event.type) {
    case 'User':
      return {
        index,
        timestamp,
        type: { kind: 'user_message' },
        content: event.content,
      };

    case 'Message': {
      const text = extractTextContent(event.content);
      return {
        index,
        timestamp,
        type: { kind: 'assistant_message' },
        content: text || '[Non-text content]',
        metadata: text ? undefined : { contentBlock: event.content },
      };
    }

    case 'Thought': {
      const text = extractTextContent(event.content);
      return {
        index,
        timestamp,
        type: { kind: 'thinking', reasoning: text || undefined },
        content: text || '[Agent thinking]',
      };
    }

    case 'ToolCall': {
      const tool = event.toolCall;
      const status = mapToolStatus(tool.status);

      return {
        index,
        timestamp,
        type: {
          kind: 'tool_use',
          tool: {
            toolName: tool.kind,
            action: mapToolAction(tool),
            status,
            result: status === 'success' || status === 'failed'
              ? { success: status === 'success', data: tool }
              : undefined,
          },
        },
        content: formatToolCall(tool),
        metadata: { toolCall: tool },
      };
    }

    case 'ToolUpdate': {
      const update = event.update;
      const status = mapToolStatus(update.status);

      return {
        index,
        timestamp,
        type: {
          kind: 'tool_use',
          tool: {
            toolName: 'ToolUpdate',
            action: { kind: 'tool', toolName: 'ToolUpdate', args: update },
            status,
            result: status === 'success' || status === 'failed'
              ? { success: status === 'success', data: update }
              : undefined,
          },
        },
        content: `Tool ${update.toolCallId}: ${update.status}`,
        metadata: { toolUpdate: update },
      };
    }

    case 'Plan': {
      const planContent = event.plan.entries
        .map((entry, i) => `${i + 1}. ${entry.content}`)
        .join('\n');

      return {
        index,
        timestamp,
        type: { kind: 'thinking', reasoning: 'Planning' },
        content: `## Plan\n\n${planContent}`,
        metadata: { plan: event.plan },
      };
    }

    case 'SessionStart':
      return {
        index,
        timestamp,
        type: { kind: 'system_message' },
        content: `Session started: ${event.sessionId}`,
        metadata: { sessionId: event.sessionId },
      };

    case 'Done':
      return {
        index,
        timestamp,
        type: { kind: 'system_message' },
        content: 'Session completed',
        metadata: { sessionId: event.sessionId },
      };

    case 'Error':
      return {
        index,
        timestamp,
        type: { kind: 'error', error: { message: event.message } },
        content: `Error: ${event.message}`,
      };

    case 'AvailableCommands':
      return {
        index,
        timestamp,
        type: { kind: 'system_message' },
        content: `Available commands updated (${event.commands.length} commands)`,
        metadata: { commands: event.commands },
      };

    case 'CurrentMode':
      return {
        index,
        timestamp,
        type: { kind: 'system_message' },
        content: `Mode changed: ${event.modeId.id}`,
        metadata: { modeId: event.modeId },
      };

    case 'RequestPermission':
      return {
        index,
        timestamp,
        type: { kind: 'system_message' },
        content: `Permission requested: ${event.request.toolCall.title}`,
        metadata: { permissionRequest: event.request },
      };

    case 'Other':
      return {
        index,
        timestamp,
        type: { kind: 'system_message' },
        content: '[Unknown event type]',
        metadata: { notification: event.notification },
      };

    default: {
      // Exhaustiveness check
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/**
 * Map ACP tool status to normalized status
 */
function mapToolStatus(
  status: string,
): 'created' | 'running' | 'success' | 'failed' {
  switch (status) {
    case 'Pending':
      return 'created';
    case 'Running':
      return 'running';
    case 'Success':
      return 'success';
    case 'Error':
      return 'failed';
    default:
      return 'created';
  }
}

/**
 * Map ACP tool call to normalized action type
 */
function mapToolAction(tool: any): NormalizedEntryType extends { kind: 'tool_use'; tool: { action: infer A } } ? A : never {
  const kind = tool.kind;

  switch (kind) {
    case 'Read':
      return { kind: 'file_read', path: tool.title };
    case 'Edit':
      return { kind: 'file_edit', path: tool.title, changes: [] };
    case 'Execute':
      return { kind: 'command_run', command: tool.title };
    case 'Search':
      return { kind: 'search', query: tool.title };
    default:
      return { kind: 'tool', toolName: kind, args: tool };
  }
}

/**
 * Format tool call for display
 */
function formatToolCall(tool: any): string {
  const status = tool.status;
  const statusEmoji = status === 'Success' ? '✅' : status === 'Error' ? '❌' : '⏳';

  return `${statusEmoji} **${tool.kind}**: ${tool.title}`;
}
