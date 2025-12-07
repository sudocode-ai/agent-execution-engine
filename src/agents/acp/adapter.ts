/**
 * ACP Adapter Interface Module
 *
 * Extends the base IAgentAdapter interface with ACP-specific capabilities.
 * Agents that support both CLI and ACP modes can implement this interface.
 *
 * @module execution-engine/agents/acp/adapter
 */

import type { ProcessConfig } from '../../process/types.js';
import type { IAgentAdapter, BaseAgentConfig, AgentMetadata } from '../types/agent-adapter.js';
import type { Agent, ClientCapabilities } from './types.js';
import type { AcpExecutorConfig } from './executor.js';

/**
 * ACP-specific agent configuration
 */
export interface AcpAgentConfig extends BaseAgentConfig {
  /**
   * Client capabilities to advertise
   */
  clientCapabilities?: ClientCapabilities;

  /**
   * Whether to use auto-approve mode
   * @default false
   */
  autoApprove?: boolean;
}

/**
 * ACP capabilities that an agent can support
 */
export interface AcpCapabilities {
  /**
   * Whether the agent supports session loading
   */
  supportsLoadSession: boolean;

  /**
   * Whether the agent supports session listing
   */
  supportsListSessions: boolean;

  /**
   * Whether the agent supports mode switching
   */
  supportsSessionModes: boolean;

  /**
   * Whether the agent supports model switching
   */
  supportsSessionModels: boolean;

  /**
   * Available authentication methods
   */
  authMethods?: string[];
}

/**
 * Result of checking ACP availability
 */
export interface AcpAvailabilityResult {
  /**
   * Whether ACP is available
   */
  available: boolean;

  /**
   * Reason if not available
   */
  reason?: string;

  /**
   * Version information if available
   */
  version?: string;
}

/**
 * IAcpAgentAdapter Interface
 *
 * Extends IAgentAdapter with ACP-specific methods. Agents that support
 * both traditional CLI execution and ACP can implement this interface.
 *
 * @example
 * ```typescript
 * class ClaudeAcpAdapter implements IAcpAgentAdapter<ClaudeAcpConfig> {
 *   readonly metadata: AgentMetadata = {
 *     name: 'claude-code-acp',
 *     displayName: 'Claude Code (ACP)',
 *     supportedModes: ['structured'],
 *     supportsStreaming: true,
 *     supportsStructuredOutput: true,
 *   };
 *
 *   readonly supportsAcp = true;
 *
 *   buildProcessConfig(config: ClaudeAcpConfig): ProcessConfig {
 *     // For traditional CLI mode
 *     return {
 *       executablePath: 'claude',
 *       args: ['--print', '--output-format', 'stream-json'],
 *       workDir: config.workDir,
 *       mode: 'structured',
 *     };
 *   }
 *
 *   buildAcpExecutorConfig(config: ClaudeAcpConfig): AcpExecutorConfig {
 *     return {
 *       executablePath: 'claude',
 *       args: ['--acp'],
 *       autoApprove: config.autoApprove,
 *     };
 *   }
 *
 *   async checkAcpAvailability(): Promise<AcpAvailabilityResult> {
 *     // Check if Claude supports ACP mode
 *     return { available: true };
 *   }
 * }
 * ```
 */
export interface IAcpAgentAdapter<TConfig extends AcpAgentConfig = AcpAgentConfig>
  extends IAgentAdapter<TConfig> {
  /**
   * Whether this adapter supports ACP mode
   */
  readonly supportsAcp: boolean;

  /**
   * ACP-specific capabilities
   */
  readonly acpCapabilities?: AcpCapabilities;

  /**
   * Build ACP executor configuration
   *
   * Returns the configuration needed to create an AcpExecutor for this agent.
   *
   * @param config - Agent-specific configuration
   * @returns ACP executor configuration
   */
  buildAcpExecutorConfig(config: TConfig): AcpExecutorConfig;

  /**
   * Check if ACP mode is available for this agent
   *
   * This may check for ACP-specific CLI flags, SDK availability, etc.
   *
   * @returns Promise resolving to availability result
   */
  checkAcpAvailability(): Promise<AcpAvailabilityResult>;

  /**
   * Create an in-process ACP Agent implementation (optional)
   *
   * For agents that have SDK implementations, this method can return
   * an Agent interface implementation that runs in-process instead of
   * spawning a CLI process.
   *
   * @param config - Agent-specific configuration
   * @returns Agent implementation or undefined if not supported
   */
  createAcpAgent?(config: TConfig): Promise<Agent> | Agent | undefined;
}

/**
 * Type guard to check if an adapter supports ACP
 *
 * @param adapter - Agent adapter to check
 * @returns True if the adapter implements IAcpAgentAdapter
 *
 * @example
 * ```typescript
 * const adapter = registry.get('claude-code');
 * if (isAcpCapableAdapter(adapter)) {
 *   const acpConfig = adapter.buildAcpExecutorConfig(config);
 *   const executor = new AcpExecutor(acpConfig);
 * }
 * ```
 */
export function isAcpCapableAdapter(
  adapter: IAgentAdapter | undefined,
): adapter is IAcpAgentAdapter {
  return adapter !== undefined && 'supportsAcp' in adapter && adapter.supportsAcp === true;
}

/**
 * Create an ACP adapter wrapper around a regular adapter
 *
 * Utility for adding basic ACP support to existing adapters.
 *
 * @param adapter - Base adapter to wrap
 * @param options - ACP configuration options
 * @returns ACP-capable adapter
 *
 * @example
 * ```typescript
 * const baseAdapter = new MyCustomAdapter();
 * const acpAdapter = wrapAsAcpAdapter(baseAdapter, {
 *   args: ['--acp'],
 *   checkAvailability: async () => ({ available: true }),
 * });
 * ```
 */
export function wrapAsAcpAdapter<TConfig extends AcpAgentConfig>(
  adapter: IAgentAdapter<TConfig>,
  options: {
    args?: string[];
    acpCapabilities?: AcpCapabilities;
    checkAvailability?: () => Promise<AcpAvailabilityResult>;
  },
): IAcpAgentAdapter<TConfig> {
  return {
    ...adapter,
    supportsAcp: true,
    acpCapabilities: options.acpCapabilities,

    buildAcpExecutorConfig(config: TConfig): AcpExecutorConfig {
      const processConfig = adapter.buildProcessConfig(config);
      return {
        executablePath: processConfig.executablePath,
        args: options.args ?? processConfig.args,
        autoApprove: config.autoApprove,
        clientCapabilities: config.clientCapabilities,
        agentName: adapter.metadata.name,
      };
    },

    async checkAcpAvailability(): Promise<AcpAvailabilityResult> {
      if (options.checkAvailability) {
        return options.checkAvailability();
      }
      // Default: assume available if adapter is present
      return { available: true };
    },
  };
}
