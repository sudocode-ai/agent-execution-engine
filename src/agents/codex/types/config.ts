/**
 * Codex Executor Configuration
 *
 * Configuration options for Codex CLI executor (simplified for execution engine use).
 * For full Codex ProcessConfig building, see config-builder.ts
 *
 * @module agents/codex/types/config
 */

/**
 * Configuration options for Codex CLI executor
 */
export interface CodexConfig {
  /**
   * Working directory for the process
   */
  workDir: string;

  /**
   * Path to codex executable
   * @default 'codex'
   */
  executablePath?: string;

  /**
   * Model to use (e.g., 'gpt-5-codex', 'gpt-5')
   */
  model?: string;

  /**
   * Auto-approve all tool executions
   * Uses --dangerously-bypass-approvals-and-sandbox when true
   * Uses --full-auto when false (safer automation)
   * @default true
   */
  autoApprove?: boolean;

  /**
   * Enable JSON output format
   * @default true (for structured parsing)
   */
  json?: boolean;
}
