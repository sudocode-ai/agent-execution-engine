/**
 * Gemini CLI Configuration
 *
 * Configuration options for the Gemini AI CLI executor.
 */

import type { BaseAgentConfig } from '../types/agent-adapter.js';

/**
 * Gemini CLI configuration options
 */
export interface GeminiConfig extends BaseAgentConfig {
  /**
   * Model selection
   * Default: 'default' (uses Gemini's default model)
   */
  model?: 'default' | 'flash' | 'gemini-2.5-flash-thinking-exp-01-21';

  /**
   * Auto-approve tool requests
   * Default: true
   */
  autoApprove?: boolean;

  /**
   * Session namespace for persistence
   * Default: 'gemini-sessions'
   */
  sessionNamespace?: string;

  /**
   * System prompt (appended to all prompts)
   */
  systemPrompt?: string;

  /**
   * Additional CLI parameters
   */
  additionalParams?: string[];
}
