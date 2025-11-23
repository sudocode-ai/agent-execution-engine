/**
 * CLI Agent Adapters
 *
 * Agent-specific adapters for various CLI agents (Claude Code, Aider, etc.).
 * Each agent adapter implements the IAgentAdapter interface to provide
 * agent-specific configuration building and capabilities.
 *
 * @module execution-engine/agents
 */

// Types and interfaces
export * from "./types/index.js";

// Base executor
export * from "./base/index.js";

// Profile system
export * from "./profiles/index.js";

// Agent registry
export * from "./registry.js";

// Agent executor factory
export * from "./factory.js";

// Built-in agents
export * from "./claude/index.js";
export * from "./codex/index.js";
export * from "./cursor/index.js";

// Copilot agent (explicit exports to avoid conflicts)
export type {
  CopilotConfig,
  CopilotConfigValidationError,
} from "./copilot/config.js";
export { validateCopilotConfig } from "./copilot/config.js";
export type {
  EntryIndexProvider as CopilotEntryIndexProvider,
  ConversationPatch as CopilotConversationPatch,
  PlainTextProcessorConfig,
} from "./copilot/plain-text-processor.js";
export {
  PlainTextLogProcessor,
  PlainTextProcessorBuilder,
  CounterIndexProvider as CopilotCounterIndexProvider,
} from "./copilot/plain-text-processor.js";
export {
  SESSION_DISCOVERY_CONFIG,
  createTempLogDir,
  isValidUUID as isValidCopilotUUID,
  watchSessionId as watchCopilotSessionId,
  extractSessionId as extractCopilotSessionId,
  formatSessionLine as formatCopilotSessionLine,
  parseSessionLine as parseCopilotSessionLine,
} from "./copilot/session.js";
export { CopilotExecutor } from "./copilot/executor.js";
