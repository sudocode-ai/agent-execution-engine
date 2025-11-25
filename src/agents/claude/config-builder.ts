/**
 * Claude Code Configuration Builder
 *
 * Utility for building ProcessConfig specific to Claude Code CLI.
 * Provides type-safe configuration for Claude Code's flags and options.
 *
 * @module execution-engine/agents/claude
 */

import type { ProcessConfig } from "../../process/types.js";

/**
 * MCP server configuration object
 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * MCP configuration (JSON object or file path)
 */
export type McpConfig =
  | { mcpServers: Record<string, McpServerConfig> }
  | string;

/**
 * Configuration options specific to Claude Code CLI
 */
export interface ClaudeCodeConfig {
  /**
   * Path to Claude Code CLI executable
   * @default 'claude'
   */
  claudePath?: string;

  /**
   * Working directory for the process
   */
  workDir: string;

  /**
   * Run in non-interactive print mode
   * @default false
   */
  print?: boolean;

  /**
   * Output format (stream-json recommended for parsing)
   * @default 'text'
   */
  outputFormat?: "stream-json" | "json" | "text";

  /**
   * Enable verbose output (required for stream-json with print mode)
   * @default false
   */
  verbose?: boolean;

  /**
   * Skip permission prompts
   * @default false
   */
  dangerouslySkipPermissions?: boolean;

  /**
   * Permission mode setting
   */
  permissionMode?: string;

  /**
   * MCP server configurations (JSON objects or file paths)
   * Can be a single config or array of configs
   * @example
   * ```typescript
   * mcpConfig: {
   *   mcpServers: {
   *     filesystem: {
   *       command: 'npx',
   *       args: ['-y', '@modelcontextprotocol/server-filesystem', '/path']
   *     }
   *   }
   * }
   * ```
   */
  mcpConfig?: McpConfig | McpConfig[];

  /**
   * Only use MCP servers from mcpConfig, ignore all other MCP configurations
   * @default false
   */
  strictMcpConfig?: boolean;

  /**
   * Plugin directories to load for this session
   * Can be a single directory or array of directories
   * @example
   * ```typescript
   * pluginDir: './my-plugins'
   * // or
   * pluginDir: ['./plugins1', './plugins2']
   * ```
   */
  pluginDir?: string | string[];

  /**
   * Specify available tools from built-in set
   * Use empty string to disable all tools, 'default' for all tools,
   * or specify tool names (only works with print mode)
   * @example
   * ```typescript
   * tools: ['Bash', 'Edit', 'Read']
   * // or
   * tools: '' // disable all tools
   * ```
   */
  tools?: string | string[];

  /**
   * Allowed tool names (whitelist)
   * Can use patterns like "Bash(git:*)"
   * @example
   * ```typescript
   * allowedTools: ['Bash(git:*)', 'Edit', 'Read']
   * ```
   */
  allowedTools?: string | string[];

  /**
   * Disallowed tool names (blacklist)
   * Can use patterns like "Bash(rm:*)"
   * @example
   * ```typescript
   * disallowedTools: ['Bash(rm:*)', 'Write']
   * ```
   */
  disallowedTools?: string | string[];

  /**
   * Environment variables to pass to the process
   */
  env?: Record<string, string>;

  /**
   * Maximum execution time in milliseconds
   */
  timeout?: number;

  /**
   * Maximum idle time before cleanup (pool only)
   */
  idleTimeout?: number;

  /**
   * Retry configuration for failed spawns
   */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };

  /**
   * Prompt to send to Claude Code
   */
  prompt?: string;
}

/**
 * Build a generic ProcessConfig from Claude Code specific configuration
 *
 * @param config - Claude Code specific configuration
 * @returns Generic ProcessConfig that can be used with any ProcessManager
 *
 * @example
 * ```typescript
 * const config = buildClaudeConfig({
 *   workDir: '/path/to/project',
 *   print: true,
 *   outputFormat: 'stream-json',
 *   dangerouslySkipPermissions: true,
 * });
 *
 * const process = await manager.acquireProcess(config);
 * ```
 */
/**
 * Helper function to serialize MCP config to JSON string
 */
function serializeMcpConfig(config: McpConfig): string {
  if (typeof config === "string") {
    return config; // Already a file path
  }
  return JSON.stringify(config);
}

/**
 * Helper function to normalize array or single value
 */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function buildClaudeConfig(config: ClaudeCodeConfig): ProcessConfig {
  const args: string[] = [];

  // Add --print flag for non-interactive mode
  if (config.print) {
    args.push("--print");
  }

  // Add --output-format flag
  if (config.outputFormat) {
    args.push("--output-format", config.outputFormat);
  }

  // Add --verbose flag (required for stream-json with print mode)
  if (
    config.verbose ||
    (config.print && config.outputFormat === "stream-json")
  ) {
    args.push("--verbose");
  }

  // Add --dangerously-skip-permissions flag
  if (config.dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  // Add --permission-mode flag if specified
  if (config.permissionMode) {
    args.push("--permission-mode", config.permissionMode);
  }

  // Add MCP configuration flags
  if (config.mcpConfig) {
    const mcpConfigs = toArray(config.mcpConfig);
    for (const mcpConfig of mcpConfigs) {
      args.push("--mcp-config", serializeMcpConfig(mcpConfig));
    }
  }

  // Add --strict-mcp-config flag
  if (config.strictMcpConfig) {
    args.push("--strict-mcp-config");
  }

  // Add plugin directory flags
  if (config.pluginDir) {
    const pluginDirs = toArray(config.pluginDir);
    for (const dir of pluginDirs) {
      args.push("--plugin-dir", dir);
    }
  }

  // Add --tools flag
  if (config.tools !== undefined) {
    const tools = Array.isArray(config.tools)
      ? config.tools.join(",")
      : config.tools;
    args.push("--tools", tools);
  }

  // Add --allowed-tools flag
  if (config.allowedTools) {
    const allowed = toArray(config.allowedTools);
    args.push("--allowed-tools", ...allowed);
  }

  // Add --disallowed-tools flag
  if (config.disallowedTools) {
    const disallowed = toArray(config.disallowedTools);
    args.push("--disallowed-tools", ...disallowed);
  }

  // Add prompt as the last argument (if provided)
  if (config.prompt) {
    args.push(config.prompt);
  }

  return {
    executablePath: config.claudePath || "claude",
    args,
    workDir: config.workDir,
    env: config.env,
    timeout: config.timeout,
    idleTimeout: config.idleTimeout,
    retry: config.retry,
  };
}
