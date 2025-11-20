/**
 * Agent Profile System Types
 *
 * Configuration management system for agent executors and their variants.
 * Allows multiple configurations per agent (e.g., "claude:default", "claude:plan").
 *
 * Inspired by vibe-kanban's profile system.
 *
 * @module execution-engine/agents/profiles/types
 */

import type { IAgentExecutor } from '../types/agent-executor.js';

/**
 * Agent profile identifier
 *
 * Uniquely identifies an agent executor and optional variant.
 * Used to retrieve specific configurations from the registry.
 *
 * @example
 * ```typescript
 * // Default variant (executor only)
 * const defaultProfile: AgentProfileId = {
 *   executor: 'claude-code'
 * };
 *
 * // Specific variant
 * const planProfile: AgentProfileId = {
 *   executor: 'claude-code',
 *   variant: 'plan'
 * };
 * ```
 */
export interface AgentProfileId {
  /**
   * Agent executor type
   * Examples: 'claude-code', 'cursor', 'gemini', 'codex'
   */
  executor: string;

  /**
   * Optional variant name
   * Examples: 'default', 'plan', 'flash', 'interactive'
   *
   * If omitted, falls back to 'default' variant
   */
  variant?: string;
}

/**
 * Agent profile configuration
 *
 * Contains the configuration for a specific agent variant,
 * along with display metadata for UI purposes.
 *
 * @template TConfig - Agent-specific configuration type
 *
 * @example
 * ```typescript
 * const cursorProfile: AgentProfile<CursorConfig> = {
 *   config: {
 *     force: true,
 *     model: 'sonnet-4.5',
 *     workDir: '/project'
 *   },
 *   displayName: 'Cursor (Auto-approve)',
 *   description: 'Cursor with auto-approval enabled'
 * };
 * ```
 */
export interface AgentProfile<TConfig = unknown> {
  /**
   * Agent-specific configuration
   * Type varies by agent (ClaudeCodeConfig, CursorConfig, etc.)
   */
  config: TConfig;

  /**
   * Human-readable name for UI display
   */
  displayName: string;

  /**
   * Optional description for UI display
   */
  description?: string;
}

/**
 * Profile registry structure
 *
 * Nested map of executors → variants → profiles.
 * This structure supports multiple agents, each with multiple variants.
 *
 * @example
 * ```json
 * {
 *   "executors": {
 *     "cursor": {
 *       "default": {
 *         "config": { "force": true, "model": "auto" },
 *         "displayName": "Cursor (Auto-approve)",
 *         "description": "Cursor with auto-approval enabled"
 *       },
 *       "interactive": {
 *         "config": { "force": false, "model": "sonnet-4.5" },
 *         "displayName": "Cursor (Interactive)",
 *         "description": "Cursor with manual approvals"
 *       }
 *     },
 *     "claude-code": {
 *       "default": {
 *         "config": { "print": true, "outputFormat": "stream-json" },
 *         "displayName": "Claude Code",
 *         "description": "Standard Claude Code configuration"
 *       },
 *       "plan": {
 *         "config": { "print": true, "outputFormat": "stream-json", "planMode": true },
 *         "displayName": "Claude Code (Plan Mode)",
 *         "description": "Claude with plan mode enabled"
 *       }
 *     }
 *   }
 * }
 * ```
 */
export interface ProfileRegistry {
  /**
   * Executor configurations
   *
   * Map of executor name → variants → profile
   * First level: executor names ('cursor', 'claude-code', etc.)
   * Second level: variant names ('default', 'plan', etc.)
   */
  executors: Record<string, Record<string, AgentProfile>>;
}

/**
 * Executor factory function
 *
 * Creates an agent executor instance from configuration.
 * Used by the registry to instantiate executors on demand.
 *
 * @template TConfig - Agent-specific configuration type
 * @param config - Configuration object for the executor
 * @returns Agent executor instance
 *
 * @example
 * ```typescript
 * // Type-safe factory for Cursor executor
 * const cursorFactory: ExecutorFactory<CursorConfig> = (config) => {
 *   return new CursorExecutor(config);
 * };
 *
 * // Register with registry
 * registry.registerExecutor('cursor', cursorFactory);
 * ```
 */
export type ExecutorFactory<TConfig = unknown> = (config: TConfig) => IAgentExecutor;
