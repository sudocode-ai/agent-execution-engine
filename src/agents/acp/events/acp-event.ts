/**
 * ACP Event Helpers
 *
 * Simplified event types and helper functions for working with ACP protocol events.
 * Converts complex SessionUpdate discriminated unions to a flatter, easier-to-use format.
 *
 * @module agents/acp/events/acp-event
 */

import type {
  SessionNotification,
  SessionUpdate,
  ContentBlock,
  ToolCall,
  ToolCallUpdate,
  Plan,
  AvailableCommand,
  SessionModeId,
  RequestPermissionRequest,
} from '../types/protocol.js';

/**
 * Simplified ACP event type
 *
 * Flattened discriminated union that's easier to pattern match than the nested
 * SessionUpdate variants. Converts from the SDK's nested structure to a simpler format.
 *
 * @example
 * ```typescript
 * const event = sessionUpdateToEvent(notification);
 *
 * switch (event.type) {
 *   case 'Message':
 *     console.log('Agent:', extractTextContent(event.content));
 *     break;
 *   case 'ToolCall':
 *     console.log('Tool:', event.toolCall.kind);
 *     break;
 * }
 * ```
 */
export type AcpEvent =
  | { type: 'User'; content: string }
  | { type: 'SessionStart'; sessionId: string }
  | { type: 'Message'; content: ContentBlock }
  | { type: 'Thought'; content: ContentBlock }
  | { type: 'ToolCall'; toolCall: ToolCall }
  | { type: 'ToolUpdate'; update: ToolCallUpdate }
  | { type: 'Plan'; plan: Plan }
  | { type: 'AvailableCommands'; commands: AvailableCommand[] }
  | { type: 'CurrentMode'; modeId: SessionModeId }
  | { type: 'RequestPermission'; request: RequestPermissionRequest }
  | { type: 'Error'; message: string }
  | { type: 'Done'; sessionId: string }
  | { type: 'Other'; notification: SessionNotification };

/**
 * Convert SessionNotification to simplified AcpEvent
 *
 * Transforms the SDK's nested SessionUpdate discriminated union into a flatter
 * event type that's easier to work with. This is the main conversion function
 * you'll use in your Client.sessionUpdate() implementation.
 *
 * @param notification - Session notification from SDK
 * @returns Simplified event
 *
 * @example
 * ```typescript
 * import type * as acp from '@agentclientprotocol/sdk';
 *
 * class AcpClient implements acp.Client {
 *   async sessionUpdate(params: acp.SessionNotification) {
 *     const event = sessionUpdateToEvent(params);
 *
 *     if (event.type === 'Message') {
 *       const text = extractTextContent(event.content);
 *       console.log('Agent message:', text);
 *     }
 *   }
 * }
 * ```
 */
export function sessionUpdateToEvent(
  notification: SessionNotification,
): AcpEvent {
  const update = notification.update;

  // Handle each SessionUpdate variant
  if ('AgentMessageChunk' in update) {
    return {
      type: 'Message',
      content: update.AgentMessageChunk.content,
    };
  }

  if ('AgentThoughtChunk' in update) {
    return {
      type: 'Thought',
      content: update.AgentThoughtChunk.content,
    };
  }

  if ('ToolCall' in update) {
    return {
      type: 'ToolCall',
      toolCall: update.ToolCall,
    };
  }

  if ('ToolCallUpdate' in update) {
    return {
      type: 'ToolUpdate',
      update: update.ToolCallUpdate,
    };
  }

  if ('Plan' in update) {
    return {
      type: 'Plan',
      plan: update.Plan,
    };
  }

  if ('AvailableCommandsUpdate' in update) {
    return {
      type: 'AvailableCommands',
      commands: update.AvailableCommandsUpdate.available_commands,
    };
  }

  if ('CurrentModeUpdate' in update) {
    return {
      type: 'CurrentMode',
      modeId: update.CurrentModeUpdate.current_mode_id,
    };
  }

  // Unknown variant - return as Other
  return {
    type: 'Other',
    notification,
  };
}

/**
 * Extract text content from ContentBlock
 *
 * Returns the text string if this is a Text content block, otherwise null.
 * Useful for getting plain text from agent messages.
 *
 * @param content - Content block from agent message
 * @returns Text string or null if not a text block
 *
 * @example
 * ```typescript
 * const event = sessionUpdateToEvent(notification);
 *
 * if (event.type === 'Message') {
 *   const text = extractTextContent(event.content);
 *   if (text) {
 *     console.log('Agent says:', text);
 *   } else {
 *     console.log('Non-text content (image, audio, etc.)');
 *   }
 * }
 * ```
 */
export function extractTextContent(content: ContentBlock): string | null {
  if ('Text' in content) {
    return content.Text.text;
  }
  return null;
}

/**
 * Check if event is a message type (Message or Thought)
 *
 * Type guard that narrows the event to message types for easier handling.
 *
 * @param event - ACP event
 * @returns True if event is Message or Thought
 *
 * @example
 * ```typescript
 * const event = sessionUpdateToEvent(notification);
 *
 * if (isMessageEvent(event)) {
 *   // TypeScript knows event.content is ContentBlock
 *   const text = extractTextContent(event.content);
 * }
 * ```
 */
export function isMessageEvent(
  event: AcpEvent,
): event is { type: 'Message' | 'Thought'; content: ContentBlock } {
  return event.type === 'Message' || event.type === 'Thought';
}

/**
 * Check if event is a tool type (ToolCall or ToolUpdate)
 *
 * Type guard that narrows the event to tool-related types.
 *
 * @param event - ACP event
 * @returns True if event is ToolCall or ToolUpdate
 *
 * @example
 * ```typescript
 * const event = sessionUpdateToEvent(notification);
 *
 * if (isToolEvent(event)) {
 *   if (event.type === 'ToolCall') {
 *     console.log('Tool:', event.toolCall.kind);
 *   } else {
 *     console.log('Tool update:', event.update.status);
 *   }
 * }
 * ```
 */
export function isToolEvent(
  event: AcpEvent,
): event is
  | { type: 'ToolCall'; toolCall: ToolCall }
  | { type: 'ToolUpdate'; update: ToolCallUpdate } {
  return event.type === 'ToolCall' || event.type === 'ToolUpdate';
}

/**
 * Check if ToolCall status is terminal (completed or failed)
 *
 * Helps determine when a tool execution has finished.
 *
 * @param status - Tool call status
 * @returns True if status indicates completion
 *
 * @example
 * ```typescript
 * if (event.type === 'ToolCall' && isTerminalStatus(event.toolCall.status)) {
 *   console.log('Tool finished with status:', event.toolCall.status);
 * }
 * ```
 */
export function isTerminalStatus(
  status: ToolCall['status'],
): status is 'Success' | 'Error' {
  return status === 'Success' || status === 'Error';
}
