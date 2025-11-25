/**
 * Cursor executor configuration types.
 *
 * @module agents/cursor/types/config
 */

/**
 * Configuration for the Cursor executor.
 *
 * @example Basic usage
 * ```typescript
 * const config: CursorConfig = {
 *   force: true,  // Auto-approve all tools
 *   model: 'auto' // Use default model
 * };
 * ```
 *
 * @example Custom model
 * ```typescript
 * const config: CursorConfig = {
 *   force: false,  // Prompt for approvals
 *   model: 'sonnet-4.5',
 *   appendPrompt: '\n\nPlease be concise.'
 * };
 * ```
 *
 * @example Custom executable
 * ```typescript
 * const config: CursorConfig = {
 *   force: true,
 *   executablePath: '/custom/path/to/cursor-agent'
 * };
 * ```
 */
export interface CursorConfig {
  /**
   * Auto-approve all tool executions.
   * When true, adds --force flag to disable interactive approvals.
   *
   * @default false
   */
  force?: boolean;

  /**
   * Model to use for code generation.
   *
   * Available models:
   * - 'auto' - Let Cursor choose (default)
   * - 'sonnet-4.5' - Claude Sonnet 4.5
   * - 'sonnet-4.5-thinking' - Claude Sonnet 4.5 with extended thinking
   * - 'gpt-5' - OpenAI GPT-5
   * - 'opus-4.1' - Claude Opus 4.1
   * - 'grok' - xAI Grok
   *
   * @default 'auto'
   */
  model?:
    | "auto"
    | "sonnet-4.5"
    | "sonnet-4.5-thinking"
    | "gpt-5"
    | "opus-4.1"
    | "grok"
    | string;

  /**
   * Additional text to append to user prompts.
   * Useful for adding consistent instructions or constraints.
   *
   * @example
   * ```typescript
   * appendPrompt: '\n\nPlease include unit tests for all changes.'
   * ```
   */
  appendPrompt?: string;

  /**
   * Automatically approve all MCP servers.
   * Only works with --print/headless mode.
   *
   * @default false
   */
  approveMcps?: boolean;

  /**
   * Enable browser automation support.
   *
   * @default false
   */
  browser?: boolean;

  /**
   * Workspace directory to use.
   * If not specified, uses current working directory.
   *
   * @example
   * ```typescript
   * workspace: '/path/to/project'
   * ```
   */
  workspace?: string;

  /**
   * Path to cursor-agent executable.
   * If not specified, searches PATH for 'cursor-agent'.
   *
   * @default 'cursor-agent'
   */
  executablePath?: string;
}
