/**
 * agent-execution-engine
 *
 * Generic execution engine for CLI agents with process management,
 * resilience, and workflow orchestration.
 *
 * @module execution-engine
 */

// Re-export all layers
export * from "./process/index.js";
export * from "./engine/index.js";
export * from "./resilience/index.js";
export * from "./workflow/index.js";
export * from "./agents/index.js";

// Note: generateId is exported from both process/utils.js and workflow/utils.js
// We explicitly export from workflow to avoid ambiguity
export { generateId } from "./workflow/utils.js";

// Convenience exports for common use cases
export { createProcessManager } from "./process/factory.js";
export { SimpleExecutionEngine } from "./engine/simple-engine.js";
export { ResilientExecutor } from "./resilience/resilient-executor.js";
export { LinearOrchestrator } from "./workflow/linear-orchestrator.js";

// Agent adapters
export { ClaudeCodeAdapter } from "./agents/claude/adapter.js";
export { AgentRegistry, globalAgentRegistry } from "./agents/registry.js";

// Type exports
export type { IProcessManager } from "./process/manager.js";
export type { IExecutionEngine } from "./engine/engine.js";
export type { IResilientExecutor } from "./resilience/executor.js";
export type {
  IWorkflowOrchestrator,
  IWorkflowStorage,
} from "./workflow/orchestrator.js";
export type {
  IAgentAdapter,
  IAgentRegistry,
  AgentMetadata,
} from "./agents/types/agent-adapter.js";
