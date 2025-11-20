/**
 * MCP Server Trust Utilities
 *
 * Validates that MCP servers configured in Cursor are trusted.
 * Cursor requires explicit trust for MCP servers before they can be used.
 *
 * @module agents/cursor/mcp/trust
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * MCP server configuration from Cursor's mcp.json.
 */
export interface McpServerConfig {
  /** Server command to execute */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Whether user has trusted this server */
  trusted?: boolean;
}

/**
 * Root structure of Cursor's mcp.json configuration file.
 */
export interface McpConfig {
  /** Map of server name to server configuration */
  mcpServers?: Record<string, McpServerConfig>;
}

/**
 * Get the default path to Cursor's MCP configuration file.
 *
 * The configuration is typically stored at `~/.cursor/mcp.json`.
 *
 * @returns Absolute path to mcp.json
 *
 * @example
 * ```typescript
 * const configPath = getDefaultMcpConfigPath();
 * // Returns: /Users/username/.cursor/mcp.json
 * ```
 */
export function getDefaultMcpConfigPath(): string {
  return path.join(os.homedir(), '.cursor', 'mcp.json');
}

/**
 * Check if MCP servers are configured and trusted.
 *
 * Reads Cursor's MCP configuration and warns about any untrusted servers.
 * This is non-blocking - execution continues even if servers are untrusted,
 * but warnings are logged to help users understand why MCP tools might fail.
 *
 * @param workDir - Working directory (currently unused, for future filtering)
 * @returns Promise that resolves when check is complete
 *
 * @example
 * ```typescript
 * // Before executing Cursor task with MCP servers
 * await ensureMcpServerTrust('/path/to/project');
 * ```
 */
export async function ensureMcpServerTrust(workDir: string): Promise<void> {
  const mcpConfigPath = getDefaultMcpConfigPath();

  // No MCP config file - nothing to check
  if (!fs.existsSync(mcpConfigPath)) {
    return;
  }

  try {
    const configContent = fs.readFileSync(mcpConfigPath, 'utf-8');
    const config: McpConfig = JSON.parse(configContent);

    // No servers configured - nothing to check
    if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
      return;
    }

    // Check trust status for each server
    const untrustedServers: string[] = [];
    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      if (!serverConfig.trusted) {
        untrustedServers.push(serverName);
      }
    }

    // Warn about untrusted servers
    if (untrustedServers.length > 0) {
      console.warn(
        `Warning: The following MCP servers are not trusted and may not work correctly:`
      );
      for (const serverName of untrustedServers) {
        console.warn(`  - ${serverName}`);
      }
      console.warn(
        `To trust these servers, open Cursor settings and enable them in the MCP section.`
      );
    }
  } catch (err) {
    // Don't fail execution if we can't read MCP config
    // Just log a warning and continue
    console.warn('Failed to check MCP server trust:', err);
  }
}

/**
 * Read MCP configuration from Cursor's config file.
 *
 * This is a lower-level utility that reads and parses the MCP config
 * without performing any validation or warnings.
 *
 * @param configPath - Optional custom path to mcp.json (defaults to ~/.cursor/mcp.json)
 * @returns Parsed MCP configuration, or null if file doesn't exist or is invalid
 *
 * @example
 * ```typescript
 * const config = await readMcpConfig();
 * if (config?.mcpServers) {
 *   console.log('Configured servers:', Object.keys(config.mcpServers));
 * }
 * ```
 */
export async function readMcpConfig(
  configPath?: string
): Promise<McpConfig | null> {
  const mcpConfigPath = configPath || getDefaultMcpConfigPath();

  if (!fs.existsSync(mcpConfigPath)) {
    return null;
  }

  try {
    const configContent = fs.readFileSync(mcpConfigPath, 'utf-8');
    return JSON.parse(configContent);
  } catch (err) {
    console.warn('Failed to read MCP config:', err);
    return null;
  }
}

/**
 * Check if a specific MCP server is trusted.
 *
 * @param serverName - Name of the MCP server to check
 * @param configPath - Optional custom path to mcp.json
 * @returns True if server exists and is trusted, false otherwise
 *
 * @example
 * ```typescript
 * if (await isMcpServerTrusted('filesystem')) {
 *   console.log('Filesystem MCP server is trusted');
 * }
 * ```
 */
export async function isMcpServerTrusted(
  serverName: string,
  configPath?: string
): Promise<boolean> {
  const config = await readMcpConfig(configPath);

  if (!config?.mcpServers) {
    return false;
  }

  const serverConfig = config.mcpServers[serverName];
  return serverConfig?.trusted === true;
}

/**
 * Get list of all configured MCP servers.
 *
 * @param configPath - Optional custom path to mcp.json
 * @returns Array of server names, or empty array if no servers configured
 *
 * @example
 * ```typescript
 * const servers = await listMcpServers();
 * console.log('Configured MCP servers:', servers);
 * ```
 */
export async function listMcpServers(
  configPath?: string
): Promise<string[]> {
  const config = await readMcpConfig(configPath);

  if (!config?.mcpServers) {
    return [];
  }

  return Object.keys(config.mcpServers);
}
