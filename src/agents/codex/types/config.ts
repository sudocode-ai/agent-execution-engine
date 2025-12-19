/**
 * Codex Executor Configuration
 *
 * Configuration options for Codex CLI executor (simplified for execution engine use).
 * For full Codex ProcessConfig building, see config-builder.ts
 *
 * @module agents/codex/types/config
 */

/**
 * MCP server configuration
 *
 * Defines how to spawn an MCP server for Codex to connect to.
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

  /**
   * MCP servers to configure inline
   *
   * Maps to -c mcp_servers.{name}.{field}=value flags using TOML format.
   * Overrides values from ~/.codex/config.toml for this session.
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
}
