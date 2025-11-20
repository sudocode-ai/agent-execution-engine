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

// Agent registry
export * from "./registry.js";

// Built-in agents
export * from "./claude/index.js";
export * from "./codex/index.js";
