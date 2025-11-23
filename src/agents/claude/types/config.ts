/**
 * Claude Code Configuration Types
 *
 * Configuration interface for the ClaudeCodeExecutor.
 *
 * @module agents/claude/types/config
 */

/**
 * Claude Code executor configuration
 *
 * Configuration options for executing tasks with Claude Code CLI.
 *
 * @example Basic usage
 * ```typescript
 * const config: ClaudeCodeConfig = {
 *   workDir: '/path/to/project',
 *   print: true,
 *   outputFormat: 'stream-json'
 * };
 * ```
 *
 * @example With all options
 * ```typescript
 * const config: ClaudeCodeConfig = {
 *   workDir: '/path/to/project',
 *   executablePath: '/usr/local/bin/claude',
 *   print: true,
 *   outputFormat: 'stream-json',
 *   inputFormat: 'stream-json',
 *   verbose: true,
 *   dangerouslySkipPermissions: false
 * };
 * ```
 */
export interface ClaudeCodeConfig {
  /**
   * Working directory for task execution
   */
  workDir: string;

  /**
   * Path to claude executable
   *
   * @default 'claude' (uses PATH)
   */
  executablePath?: string;

  /**
   * Enable print mode (-p flag)
   *
   * Required for stream-json output format.
   *
   * @default false
   */
  print?: boolean;

  /**
   * Output format
   *
   * - 'stream-json': Newline-delimited JSON (recommended)
   * - 'json': Single JSON object (deprecated)
   *
   * @default 'stream-json'
   */
  outputFormat?: 'stream-json' | 'json';

  /**
   * Input format
   *
   * @deprecated This field is no longer used. The executor uses the SDK control
   * protocol via ProtocolPeer, which sends sdk_control_request messages.
   * Specifying --input-format would cause a protocol mismatch.
   *
   * This field is kept for backward compatibility but has no effect.
   */
  inputFormat?: 'stream-json';

  /**
   * Enable verbose output (--verbose flag)
   *
   * Adds debugging information to stderr.
   *
   * @default false
   */
  verbose?: boolean;

  /**
   * Skip all permission prompts (--dangerously-skip-permissions flag)
   *
   * **WARNING**: This bypasses all approval checks. Use only for testing
   * or in trusted environments.
   *
   * @default false
   */
  dangerouslySkipPermissions?: boolean;
}
