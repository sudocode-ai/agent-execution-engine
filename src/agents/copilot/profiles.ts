/**
 * GitHub Copilot CLI profile configurations
 *
 * Provides default profile configurations for common Copilot use cases.
 *
 * @module agents/copilot/profiles
 */

import type { ProfileRegistry } from '../profiles/types.js';
import type { CopilotConfig } from './config.js';

/**
 * Default Copilot profile configurations
 *
 * These profiles match the vibe-kanban defaults and cover common use cases:
 * - **default**: Auto-approve all tools (no model specified, uses account default)
 * - **gpt-5**: Explicit GPT-5 model selection
 * - **claude-sonnet-4.5**: Use Claude Sonnet 4.5 via Copilot
 * - **interactive**: Requires approval for tool use
 * - **read-only**: Only allows read operations
 */
export const copilotProfiles: ProfileRegistry = {
  executors: {
    copilot: {
      // Default profile: Auto-approve, no model specified
      default: {
        config: {
          allowAllTools: true,
          // No model specified - uses account default
        } as CopilotConfig,
        displayName: 'GitHub Copilot (Default)',
        description: 'GitHub Copilot with auto-approval enabled (uses account default model)',
      },

      // GPT-5 profile (explicit)
      'gpt-5': {
        config: {
          allowAllTools: true,
          model: 'gpt-5',
        } as CopilotConfig,
        displayName: 'GitHub Copilot (GPT-5)',
        description: 'GitHub Copilot with GPT-5 model',
      },

      // Claude Sonnet 4.5 profile
      'claude-sonnet-4.5': {
        config: {
          allowAllTools: true,
          model: 'claude-sonnet-4.5',
        } as CopilotConfig,
        displayName: 'GitHub Copilot (Claude Sonnet 4.5)',
        description: 'GitHub Copilot with Claude Sonnet 4.5 model',
      },

      // Claude Sonnet 4 profile
      'claude-sonnet-4': {
        config: {
          allowAllTools: true,
          model: 'claude-sonnet-4',
        } as CopilotConfig,
        displayName: 'GitHub Copilot (Claude Sonnet 4)',
        description: 'GitHub Copilot with Claude Sonnet 4 model',
      },

      // Interactive profile (requires approvals, no model specified)
      interactive: {
        config: {
          allowAllTools: false,
          allowTool: 'bash,read_file,write_file,edit_file,list_files,grep',
          // No model specified - uses account default
        } as CopilotConfig,
        displayName: 'GitHub Copilot (Interactive)',
        description:
          'GitHub Copilot with tool approval prompts for common operations',
      },

      // Read-only profile (no model specified)
      'read-only': {
        config: {
          allowAllTools: false,
          allowTool: 'read_file,list_files,grep,search',
          denyTool: 'bash,write_file,edit_file,delete_file',
          // No model specified - uses account default
        } as CopilotConfig,
        displayName: 'GitHub Copilot (Read-only)',
        description: 'GitHub Copilot restricted to read-only operations',
      },

      // No bash profile (prevents shell execution, no model specified)
      'no-bash': {
        config: {
          allowAllTools: true,
          denyTool: 'bash',
          // No model specified - uses account default
        } as CopilotConfig,
        displayName: 'GitHub Copilot (No Bash)',
        description:
          'GitHub Copilot with all tools except bash shell execution',
      },
    },
  },
};

/**
 * Get Copilot profile configuration
 *
 * Helper function to retrieve a specific Copilot profile configuration.
 *
 * @param variant - Profile variant name (default: 'default')
 * @returns Profile configuration, or undefined if not found
 *
 * @example
 * ```typescript
 * // Get default profile
 * const defaultProfile = getCopilotProfile();
 *
 * // Get specific variant
 * const claudeProfile = getCopilotProfile('claude-sonnet-4.5');
 *
 * if (claudeProfile) {
 *   console.log(claudeProfile.displayName);
 *   console.log(claudeProfile.config.model); // 'claude-sonnet-4.5'
 * }
 * ```
 */
export function getCopilotProfile(variant: string = 'default') {
  return copilotProfiles.executors.copilot[variant];
}

/**
 * Get all Copilot profile variants
 *
 * @returns Array of available profile variant names
 *
 * @example
 * ```typescript
 * const variants = getCopilotProfileVariants();
 * console.log(variants);
 * // ['default', 'gpt-5', 'claude-sonnet-4.5', 'claude-sonnet-4', 'interactive', 'read-only', 'no-bash']
 * ```
 */
export function getCopilotProfileVariants(): string[] {
  return Object.keys(copilotProfiles.executors.copilot);
}
