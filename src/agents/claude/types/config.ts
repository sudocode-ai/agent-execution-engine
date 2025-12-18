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
  outputFormat?: "stream-json" | "json";

  /**
   * Input format
   *
   * @deprecated This field is no longer used. The executor uses the SDK control
   * protocol via ProtocolPeer, which sends sdk_control_request messages.
   * Specifying --input-format would cause a protocol mismatch.
   *
   * This field is kept for backward compatibility but has no effect.
   */
  inputFormat?: "stream-json";

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

  /**
   * Restrict file operations to the working directory
   *
   * When enabled, a PreToolUse hook is configured to block Read, Write, Edit,
   * Glob, and Grep operations that target files outside the working directory.
   *
   * This provides security isolation when running agents in worktrees or
   * sandboxed environments.
   *
   * @default false
   */
  restrictToWorkDir?: boolean;

  /**
   * Path to the directory guard hook script
   *
   * Only used when restrictToWorkDir is enabled. If not specified,
   * the executor will use the bundled hook script.
   */
  directoryGuardHookPath?: string;

  /**
   * MCP servers to connect to Claude Code
   *
   * Each key is a server name, and the value defines how to spawn it.
   * Passed to Claude via --mcp-config flag.
   *
   * @example
   * ```typescript
   * mcpServers: {
   *   'my-server': {
   *     command: 'node',
   *     args: ['/path/to/server.js', '--port', '3000'],
   *     env: { API_KEY: 'secret' }
   *   }
   * }
   * ```
   */
  mcpServers?: Record<string, McpServerConfig>;

  /**
   * System prompt to append to Claude's default system prompt
   *
   * Useful for adding context about the task or workflow.
   */
  appendSystemPrompt?: string;

  /**
   * List of tool names to disallow
   *
   * Tools in this list will be automatically denied by Claude CLI using the
   * --disallowed-tools flag. This is useful for blocking tools that the
   * framework cannot handle or that are incompatible with the execution
   * environment.
   *
   * @example
   * ```typescript
   * disallowedTools: ['EnterPlanMode', 'Bash', 'SlashCommand']
   * ```
   */
  disallowedTools?: string[];
}

/**
 * MCP Server configuration
 *
 * Defines how to spawn an MCP server for Claude to connect to.
 */
export interface McpServerConfig {
  /**
   * The command to run (e.g., 'node', 'python', 'npx')
   */
  command: string;

  /**
   * Arguments to pass to the command
   */
  args?: string[];

  /**
   * Environment variables to set for the server process
   */
  env?: Record<string, string>;
}
