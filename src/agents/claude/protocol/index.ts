/**
 * Claude Protocol Module
 *
 * Bidirectional stream-json protocol implementation for Claude CLI.
 *
 * @module agents/claude/protocol
 */

// Protocol peer
export {
  ProtocolPeer,
  type IProtocolClient,
  type MessageHandler,
  type ErrorHandler,
} from './protocol-peer.js';

// Client
export { ClaudeAgentClient } from './client.js';

// Utilities
export {
  parseStreamJsonLine,
  readStreamJson,
  serializeStreamJson,
} from './utils.js';
