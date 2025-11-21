/**
 * ACP Events Module
 *
 * Helper types and functions for converting ACP protocol events to normalized format.
 *
 * @module agents/acp/events
 */

export type { AcpEvent } from './acp-event.js';
export {
  sessionUpdateToEvent,
  extractTextContent,
  isMessageEvent,
  isToolEvent,
  isTerminalStatus,
} from './acp-event.js';

export { toNormalizedEntry } from './normalizer.js';
