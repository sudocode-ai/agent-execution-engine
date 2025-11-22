/**
 * Gemini CLI Integration
 *
 * Complete integration for Google's Gemini CLI using stream-json output format.
 */

// Main executor
export { GeminiExecutor } from './executor.js';
export type { GeminiConfig } from './config.js';

// Stream-JSON harness components
export { StreamJsonHarness } from './harness/stream-harness.js';
export type {
  GeminiStreamConfig,
  GeminiClientEvents,
  OutputChunk,
  SessionInfo,
} from './harness/types.js';

// Session management
export { SessionManager } from './session/session-manager.js';
export type { SessionManagerConfig, SessionEvent } from './session/types.js';

// Output normalization
export { GeminiOutputNormalizer } from './normalizer/output-normalizer.js';
