/**
 * Claude Code Agent Adapter
 *
 * Implements the IAgentAdapter interface for Claude Code CLI.
 * Provides agent-specific configuration building and metadata.
 *
 * @module execution-engine/agents/claude
 */

import type { IAgentAdapter, AgentMetadata } from '../types/agent-adapter.js';
import type { ProcessConfig } from '../../process/types.js';
import { buildClaudeConfig, type ClaudeCodeConfig } from './config-builder.js';

/**
 * Claude Code agent metadata
 */
const CLAUDE_METADATA: AgentMetadata = {
  name: 'claude-code',
  displayName: 'Claude Code',
  version: '>=0.1.0',
  supportedModes: ['structured', 'interactive', 'hybrid'],
  supportsStreaming: true,
  supportsStructuredOutput: true,
};

/**
 * Claude Code Agent Adapter
 *
 * Provides Claude Code-specific configuration building and capabilities.
 *
 * @example
 * ```typescript
 * const adapter = new ClaudeCodeAdapter();
 * const config = adapter.buildProcessConfig({
 *   workDir: '/path/to/project',
 *   print: true,
 *   outputFormat: 'stream-json',
 * });
 *
 * const processManager = createProcessManager(config);
 * ```
 */
export class ClaudeCodeAdapter implements IAgentAdapter<ClaudeCodeConfig> {
  readonly metadata = CLAUDE_METADATA;

  /**
   * Build ProcessConfig from Claude Code-specific configuration
   *
   * @param config - Claude Code configuration
   * @returns Generic ProcessConfig
   */
  buildProcessConfig(config: ClaudeCodeConfig): ProcessConfig {
    return buildClaudeConfig(config);
  }

  /**
   * Validate Claude Code configuration
   *
   * @param config - Configuration to validate
   * @returns Array of validation errors (empty if valid)
   */
  validateConfig(config: ClaudeCodeConfig): string[] {
    const errors: string[] = [];

    if (!config.workDir) {
      errors.push('workDir is required');
    }

    if (config.outputFormat === 'stream-json' && !config.print) {
      errors.push('stream-json output format requires print mode to be enabled');
    }

    return errors;
  }

  /**
   * Get default Claude Code configuration
   *
   * @returns Default configuration values
   */
  getDefaultConfig(): Partial<ClaudeCodeConfig> {
    return {
      claudePath: 'claude',
      print: true,
      outputFormat: 'stream-json',
      dangerouslySkipPermissions: false,
    };
  }
}
