/**
 * Stream-JSON harness for Gemini CLI.
 */

export { StreamJsonHarness } from './stream-harness.js';
export type { SpawnedChild } from '../../types/agent-executor.js';
export type {
  GeminiStreamConfig,
  GeminiClientEvents,
  OutputChunk,
  SessionInfo,
} from './types.js';

// Re-export session manager for convenience
export { SessionManager } from '../session/session-manager.js';
export type { SessionManagerConfig, SessionEvent } from '../session/types.js';
