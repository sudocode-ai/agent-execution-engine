/**
 * Agent Adapter Interface
 *
 * Defines the contract for CLI agent adapters. Each agent (Claude Code, Aider,
 * Gemini Code Assist, etc.) can implement this interface to provide agent-specific
 * configuration and behavior.
 *
 * @module execution-engine/agents/types
 */

import type { ProcessConfig, ExecutionMode } from '../../process/types.js';

/**
 * Base configuration options that all agents should support
 */
export interface BaseAgentConfig {
  /**
   * Path to the agent's CLI executable
   */
  executablePath?: string;

  /**
   * Working directory for execution
   */
  workDir: string;

  /**
   * Environment variables to pass to the process
   */
  env?: Record<string, string>;

  /**
   * Maximum execution time in milliseconds
   */
  timeout?: number;

  /**
   * Execution mode (if agent supports multiple modes)
   */
  mode?: ExecutionMode;
}

/**
 * Agent metadata and capabilities
 */
export interface AgentMetadata {
  /**
   * Unique identifier for the agent
   * Examples: 'claude-code', 'aider', 'gemini-code-assist', 'codex-cli'
   */
  readonly name: string;

  /**
   * Human-readable agent name
   */
  readonly displayName: string;

  /**
   * Agent version or version range supported
   */
  readonly version?: string;

  /**
   * Supported execution modes
   */
  readonly supportedModes: ExecutionMode[];

  /**
   * Whether the agent supports streaming output
   */
  readonly supportsStreaming: boolean;

  /**
   * Whether the agent supports structured output (JSON)
   */
  readonly supportsStructuredOutput: boolean;
}

/**
 * Agent Adapter Interface
 *
 * Implement this interface to add support for a new CLI agent.
 * The adapter is responsible for translating agent-agnostic configuration
 * into agent-specific ProcessConfig.
 *
 * @example
 * ```typescript
 * class ClaudeCodeAdapter implements IAgentAdapter {
 *   readonly metadata: AgentMetadata = {
 *     name: 'claude-code',
 *     displayName: 'Claude Code',
 *     supportedModes: ['structured', 'interactive', 'hybrid'],
 *     supportsStreaming: true,
 *     supportsStructuredOutput: true,
 *   };
 *
 *   buildProcessConfig(config: ClaudeCodeConfig): ProcessConfig {
 *     return {
 *       executablePath: config.claudePath || 'claude',
 *       args: ['--print', '--output-format', 'stream-json'],
 *       workDir: config.workDir,
 *       // ...
 *     };
 *   }
 * }
 * ```
 */
export interface IAgentAdapter<TConfig extends BaseAgentConfig = BaseAgentConfig> {
  /**
   * Agent metadata and capabilities
   */
  readonly metadata: AgentMetadata;

  /**
   * Build a ProcessConfig from agent-specific configuration
   *
   * @param config - Agent-specific configuration options
   * @returns Generic ProcessConfig that can be used with process managers
   */
  buildProcessConfig(config: TConfig): ProcessConfig;

  /**
   * Validate agent-specific configuration
   *
   * @param config - Configuration to validate
   * @returns Array of validation errors (empty if valid)
   */
  validateConfig?(config: TConfig): string[];

  /**
   * Get default configuration for this agent
   *
   * @returns Default configuration values
   */
  getDefaultConfig?(): Partial<TConfig>;
}

/**
 * Agent registry for managing multiple agent adapters
 */
export interface IAgentRegistry {
  /**
   * Register an agent adapter
   *
   * @param adapter - Agent adapter to register
   */
  register(adapter: IAgentAdapter): void;

  /**
   * Get an agent adapter by name
   *
   * @param name - Agent name (e.g., 'claude-code')
   * @returns Agent adapter or undefined if not found
   */
  get(name: string): IAgentAdapter | undefined;

  /**
   * Get all registered agents
   *
   * @returns Array of all registered agent adapters
   */
  getAll(): IAgentAdapter[];

  /**
   * Check if an agent is registered
   *
   * @param name - Agent name to check
   * @returns True if agent is registered
   */
  has(name: string): boolean;
}
