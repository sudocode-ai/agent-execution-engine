/**
 * Agent Client Protocol (ACP) - TypeScript implementation
 *
 * A TypeScript implementation of the ACP protocol used by Gemini CLI,
 * Qwen Code, and other AI coding agents.
 *
 * @example
 * ```typescript
 * import { type SessionNotification } from 'agent-execution-engine/acp';
 *
 * // Use ACP types for agent communication
 * const notification: SessionNotification = {
 *   sessionId: { id: 'session-123' },
 *   update: { AgentMessageChunk: { content: { Text: { text: 'Hello!' } } } }
 * };
 * ```
 */

// Export all types
export type * from './types/index.js';

// Export errors
export * from './errors/index.js';

// Export events and helpers
export type { AcpEvent } from './events/index.js';
export {
  sessionUpdateToEvent,
  extractTextContent,
  isMessageEvent,
  isToolEvent,
  isTerminalStatus,
  toNormalizedEntry,
} from './events/index.js';
