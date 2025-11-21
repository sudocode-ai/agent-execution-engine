/**
 * GitHub Copilot CLI Agent Executor
 *
 * This module provides integration with GitHub Copilot CLI (@github/copilot).
 * It uses a plain text streaming protocol with ANSI escape code handling.
 *
 * @module execution-engine/agents/copilot
 */

export type {
  CopilotConfig,
  CopilotConfigValidationError,
} from './config.js';
export { validateCopilotConfig } from './config.js';

// Import CopilotConfig for use in registerCopilotProfiles
import type { CopilotConfig } from './config.js';
import { CopilotExecutor } from './executor.js';
import { copilotProfiles } from './profiles.js';

export type {
  EntryIndexProvider,
  ConversationPatch,
  PlainTextProcessorConfig,
} from './plain-text-processor.js';
export {
  PlainTextLogProcessor,
  PlainTextProcessorBuilder,
  CounterIndexProvider,
} from './plain-text-processor.js';

export {
  SESSION_DISCOVERY_CONFIG,
  createTempLogDir,
  isValidUUID,
  watchSessionId,
  extractSessionId,
  formatSessionLine,
  parseSessionLine,
} from './session.js';

export { CopilotExecutor };

export {
  copilotProfiles,
  getCopilotProfile,
  getCopilotProfileVariants,
} from './profiles.js';

/**
 * Register Copilot executor with the global profile registry
 *
 * This function registers the Copilot executor factory and loads default profiles
 * into the global profile registry. Call this once during application initialization.
 *
 * @example
 * ```typescript
 * import { registerCopilotProfiles } from 'agent-execution-engine/agents/copilot';
 *
 * // Register during app initialization
 * registerCopilotProfiles();
 *
 * // Now you can use the global registry
 * import { globalProfileRegistry } from 'agent-execution-engine/agents/profiles';
 *
 * const executor = globalProfileRegistry.getExecutor({
 *   executor: 'copilot',
 *   variant: 'gpt-4o'
 * });
 * ```
 */
export function registerCopilotProfiles(): void {
  // Lazy import to avoid circular dependencies
  const { globalProfileRegistry } = require('../profiles/registry.js');

  // Register executor factory
  globalProfileRegistry.registerExecutor(
    'copilot',
    (config: CopilotConfig) => new CopilotExecutor(config)
  );

  // Load default profiles
  globalProfileRegistry.loadProfiles(copilotProfiles);
}
