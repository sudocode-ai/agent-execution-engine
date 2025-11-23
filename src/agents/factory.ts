/**
 * Agent Executor Factory
 *
 * Factory function for creating agent executors based on agent name.
 * Provides centralized executor instantiation for multi-agent support.
 *
 * @module agents/factory
 */

import { ClaudeCodeExecutor } from './claude/executor.js';
import type { ClaudeCodeConfig } from './claude/types/config.js';
import { CursorExecutor } from './cursor/executor.js';
import type { CursorConfig } from './cursor/types/config.js';
import { CopilotExecutor } from './copilot/executor.js';
import type { CopilotConfig } from './copilot/config.js';
import { CodexExecutor } from './codex/executor.js';
import type { CodexConfig } from './codex/types/config.js';
import type { IAgentExecutor } from './types/agent-executor.js';

/**
 * Supported agent names
 */
export type AgentName = 'claude' | 'cursor' | 'codex' | 'copilot';

/**
 * Agent configuration types mapped by agent name
 */
export interface AgentConfigMap {
  claude: ClaudeCodeConfig;
  cursor: CursorConfig;
  codex: CodexConfig;
  copilot: CopilotConfig;
}

/**
 * Create an agent executor instance
 *
 * Factory function for creating agent executors based on the agent name.
 * Provides a single entry point for instantiating any supported agent.
 *
 * @param agent - Agent name ('claude', 'cursor', 'codex', or 'copilot')
 * @param config - Agent-specific configuration
 * @returns Agent executor instance
 * @throws {Error} If agent is not supported
 *
 * @example Basic usage
 * ```typescript
 * const executor = createAgentExecutor('claude', {
 *   workDir: '/path/to/project',
 *   print: true,
 *   outputFormat: 'stream-json',
 *   dangerouslySkipPermissions: true,
 * });
 *
 * const task: ExecutionTask = {
 *   id: 'task-1',
 *   type: 'custom',
 *   prompt: 'List all TypeScript files',
 *   workDir: '/path/to/project',
 *   priority: 5,
 *   dependencies: [],
 *   createdAt: new Date(),
 *   config: {},
 * };
 *
 * const spawned = await executor.executeTask(task);
 * ```
 *
 * @example With type inference
 * ```typescript
 * // TypeScript infers the correct config type based on agent name
 * const executor = createAgentExecutor('claude', {
 *   workDir: '/path/to/project',
 *   print: true,
 *   outputFormat: 'stream-json', // Type-safe: only 'stream-json' | 'markdown' | 'text'
 * });
 * ```
 */
export function createAgentExecutor<T extends AgentName>(
  agent: T,
  config: AgentConfigMap[T],
): IAgentExecutor {
  switch (agent) {
    case 'claude':
      return new ClaudeCodeExecutor(config as ClaudeCodeConfig);

    case 'cursor':
      return new CursorExecutor(config as CursorConfig);

    case 'copilot':
      return new CopilotExecutor(config as CopilotConfig);

    case 'codex':
      return new CodexExecutor(config as CodexConfig);

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = agent;
      throw new Error(`Unsupported agent: ${agent}`);
  }
}

/**
 * Available agents registry
 *
 * Map of available agent names with their status and capabilities.
 * Used for discovery and validation.
 *
 * @example
 * ```typescript
 * // Check if agent is available
 * if (AVAILABLE_AGENTS.claude.available) {
 *   const executor = createAgentExecutor('claude', config);
 * }
 *
 * // List all available agents
 * const availableAgents = Object.entries(AVAILABLE_AGENTS)
 *   .filter(([_, info]) => info.available)
 *   .map(([name]) => name);
 * ```
 */
export const AVAILABLE_AGENTS = {
  claude: {
    available: true,
    displayName: 'Claude Code',
    description: 'Anthropic Claude CLI with stream-json protocol',
  },
  cursor: {
    available: true,
    displayName: 'Cursor',
    description: 'Cursor CLI with JSONL protocol',
  },
  copilot: {
    available: true,
    displayName: 'GitHub Copilot',
    description: 'GitHub Copilot CLI with plain text output',
  },
  codex: {
    available: true,
    displayName: 'Codex',
    description: 'Codex CLI with JSON-RPC protocol',
  },
} as const;

/**
 * Get list of available agent names
 *
 * @returns Array of agent names that are currently available
 *
 * @example
 * ```typescript
 * const agents = getAvailableAgents();
 * console.log('Available agents:', agents); // ['claude']
 * ```
 */
export function getAvailableAgents(): AgentName[] {
  return Object.entries(AVAILABLE_AGENTS)
    .filter(([_, info]) => info.available)
    .map(([name]) => name as AgentName);
}

/**
 * Check if an agent is available
 *
 * @param agent - Agent name to check
 * @returns True if agent is available
 *
 * @example
 * ```typescript
 * if (isAgentAvailable('claude')) {
 *   // Create Claude executor
 * }
 * ```
 */
export function isAgentAvailable(agent: string): agent is AgentName {
  return agent in AVAILABLE_AGENTS && AVAILABLE_AGENTS[agent as AgentName].available;
}
