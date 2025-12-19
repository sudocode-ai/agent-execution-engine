/**
 * GitHub Copilot CLI Configuration
 *
 * Configuration interface for the GitHub Copilot CLI executor.
 * Supports model selection, tool permissions, MCP configuration, and context management.
 *
 * @module execution-engine/agents/copilot
 */

import type { BaseAgentConfig } from '../types/agent-adapter.js';

/**
 * MCP Server configuration
 *
 * Defines how to spawn an MCP server for Copilot to connect to.
 */
export interface McpServerConfig {
  /**
   * The type of MCP server
   *
   * @default "local"
   * @example "local"
   */
  type?: string;

  /**
   * The command to run (e.g., 'node', 'python', 'npx')
   */
  command: string;

  /**
   * Arguments to pass to the command
   *
   * @default []
   */
  args?: string[];

  /**
   * Environment variables to set for the server process
   */
  env?: Record<string, string>;

  /**
   * Tools to enable from this MCP server
   *
   * Use ["*"] to enable all tools from this server.
   *
   * @default ["*"]
   * @example ["*"]
   * @example ["read_file", "write_file"]
   */
  tools?: string[];
}

/**
 * GitHub Copilot CLI configuration options
 *
 * Extends BaseAgentConfig with Copilot-specific settings for model selection,
 * tool permissions, and MCP server management.
 *
 * @example
 * ```typescript
 * const config: CopilotConfig = {
 *   workDir: '/path/to/project',
 *   model: 'gpt-4o',
 *   allowAllTools: true,
 *   addDir: ['/path/to/shared-lib'],
 * };
 * ```
 *
 * @example Profile with restricted tools
 * ```typescript
 * const restrictedConfig: CopilotConfig = {
 *   workDir: '/path/to/project',
 *   model: 'claude-sonnet-4.5',
 *   allowTool: 'read_file,write_file,edit_file',
 *   denyTool: 'bash',
 * };
 * ```
 */
export interface CopilotConfig extends BaseAgentConfig {
  /**
   * Copilot CLI version to use
   *
   * Only used when `executablePath` is set to 'npx'.
   * If not specified, uses 'latest' version.
   *
   * **Note**: By default, the executor uses the locally installed 'copilot'
   * command from PATH, which is version-agnostic. Only set this if you
   * want to use npx with a specific version.
   *
   * @example "0.0.362"
   * @example "latest"
   * @default "latest"
   */
  copilotVersion?: string;

  /**
   * Model to use for code generation
   *
   * Supports various model providers:
   * - OpenAI: "gpt-5", "gpt-5.1-codex"
   * - Anthropic: "claude-sonnet-4.5", "claude-sonnet-4", "claude-haiku-4.5"
   * - Others supported by GitHub Copilot CLI
   *
   * If not specified, uses your account's default model.
   *
   * @example "gpt-5"
   * @example "claude-sonnet-4.5"
   */
  model?: string;

  /**
   * Allow all tools without prompting
   *
   * When true, all tool usage is auto-approved. Useful for CI/CD environments
   * or when you trust the agent completely.
   *
   * **Note**: Mutually exclusive with `allowTool` and `denyTool`.
   * If set to true, specific tool permissions are ignored.
   *
   * @default false
   */
  allowAllTools?: boolean;

  /**
   * Specific tool(s) to allow
   *
   * Comma-separated list of tool names to whitelist. Only these tools
   * will be allowed without prompting.
   *
   * **Common tools**:
   * - `bash` - Shell command execution
   * - `read_file` - Read file contents
   * - `write_file` - Write file contents
   * - `edit_file` - Edit file with patches
   * - `search` - Code search
   * - `web_fetch` - Fetch URLs
   *
   * **Note**: Mutually exclusive with `allowAllTools`.
   *
   * @example "bash,read_file,write_file"
   * @example "read_file,search"
   */
  allowTool?: string;

  /**
   * Specific tool(s) to deny
   *
   * Comma-separated list of tool names to blacklist. These tools will
   * never be allowed, even if `allowAllTools` is true.
   *
   * **Note**: Takes precedence over `allowTool` and `allowAllTools`.
   *
   * @example "bash"
   * @example "web_fetch,bash"
   */
  denyTool?: string;

  /**
   * Additional directories to add to agent context
   *
   * Array of absolute paths to directories that should be included
   * in the agent's context. Useful for:
   * - Shared library directories
   * - Configuration directories
   * - Documentation directories
   *
   * **Note**: Paths should be absolute. Relative paths will be resolved
   * relative to `workDir`.
   *
   * @example ['/path/to/shared-lib', '/path/to/docs']
   */
  addDir?: string[];

  /**
   * MCP servers to configure inline
   *
   * Each key is a server name, and the value defines how to spawn it.
   * Passed to Copilot via --additional-mcp-config flag.
   *
   * This augments servers defined in `~/.copilot/mcp-config.json` for this session.
   * Inline servers take precedence over global config if names conflict.
   *
   * @example
   * ```typescript
   * mcpServers: {
   *   'my-server': {
   *     type: 'local',
   *     command: 'node',
   *     args: ['/path/to/server.js', '--port', '3000'],
   *     env: { API_KEY: 'secret' },
   *     tools: ['*']  // Enable all tools from this server
   *   },
   *   'sudocode-mcp': {
   *     type: 'local',
   *     command: 'sudocode-mcp',
   *     args: [],
   *     tools: ['*']
   *   }
   * }
   * ```
   */
  mcpServers?: Record<string, McpServerConfig>;

  /**
   * MCP servers to disable
   *
   * Array of MCP server names to disable for this execution.
   * Server names must match those defined in `~/.copilot/mcp-config.json`.
   *
   * Useful for:
   * - Disabling slow or unreliable servers
   * - Limiting context to specific servers
   * - Testing without certain capabilities
   *
   * @example ['my-slow-server', 'experimental-server']
   */
  disableMcpServer?: string[];

  /**
   * System prompt to prepend to user prompt
   *
   * Optional system-level instructions that will be prepended to every
   * user prompt. Useful for:
   * - Setting coding standards
   * - Defining project conventions
   * - Providing background context
   *
   * **Note**: Combined with user prompt before sending to Copilot.
   * Format: `<systemPrompt>\n\n<userPrompt>`
   *
   * @example "Always write TypeScript with strict mode. Use functional programming patterns."
   */
  systemPrompt?: string;
}

/**
 * Validation errors for CopilotConfig
 */
export interface CopilotConfigValidationError {
  field: keyof CopilotConfig;
  message: string;
}

/**
 * Validate CopilotConfig
 *
 * Checks for logical conflicts and invalid values in configuration.
 *
 * @param config - Configuration to validate
 * @returns Array of validation errors (empty if valid)
 *
 * @example
 * ```typescript
 * const errors = validateCopilotConfig({
 *   workDir: '/tmp',
 *   allowAllTools: true,
 *   allowTool: 'bash', // Conflict!
 * });
 * // errors = [{ field: 'allowTool', message: '...' }]
 * ```
 */
export function validateCopilotConfig(
  config: CopilotConfig
): CopilotConfigValidationError[] {
  const errors: CopilotConfigValidationError[] = [];

  // Check for conflicting tool permissions
  if (config.allowAllTools && config.allowTool) {
    errors.push({
      field: 'allowTool',
      message:
        'allowTool is ignored when allowAllTools is true. Remove allowTool or set allowAllTools to false.',
    });
  }

  if (config.allowAllTools && config.denyTool) {
    errors.push({
      field: 'denyTool',
      message:
        'denyTool takes precedence over allowAllTools. This may cause unexpected behavior.',
    });
  }

  // Validate addDir paths (basic check - existence check should be done at runtime)
  if (config.addDir) {
    for (const dir of config.addDir) {
      if (!dir || dir.trim() === '') {
        errors.push({
          field: 'addDir',
          message: 'addDir contains empty path',
        });
      }
    }
  }

  // Validate mcpServers
  if (config.mcpServers) {
    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      if (!serverName || serverName.trim() === '') {
        errors.push({
          field: 'mcpServers',
          message: 'mcpServers contains empty server name',
        });
        continue;
      }

      if (!serverConfig.command || serverConfig.command.trim() === '') {
        errors.push({
          field: 'mcpServers',
          message: `MCP server '${serverName}' has empty command`,
        });
      }

      // Validate args array
      if (serverConfig.args) {
        for (const arg of serverConfig.args) {
          if (typeof arg !== 'string') {
            errors.push({
              field: 'mcpServers',
              message: `MCP server '${serverName}' has non-string argument`,
            });
          }
        }
      }

      // Validate env object
      if (serverConfig.env) {
        for (const [key, value] of Object.entries(serverConfig.env)) {
          if (!key || key.trim() === '') {
            errors.push({
              field: 'mcpServers',
              message: `MCP server '${serverName}' has empty environment variable name`,
            });
          }
          if (typeof value !== 'string') {
            errors.push({
              field: 'mcpServers',
              message: `MCP server '${serverName}' has non-string environment variable value for '${key}'`,
            });
          }
        }
      }

      // Validate tools array
      if (serverConfig.tools) {
        if (!Array.isArray(serverConfig.tools)) {
          errors.push({
            field: 'mcpServers',
            message: `MCP server '${serverName}' tools must be an array`,
          });
        } else {
          for (const tool of serverConfig.tools) {
            if (typeof tool !== 'string') {
              errors.push({
                field: 'mcpServers',
                message: `MCP server '${serverName}' has non-string tool name`,
              });
            }
          }
        }
      }

      // Validate type field
      if (serverConfig.type && typeof serverConfig.type !== 'string') {
        errors.push({
          field: 'mcpServers',
          message: `MCP server '${serverName}' type must be a string`,
        });
      }
    }
  }

  // Validate disableMcpServer
  if (config.disableMcpServer) {
    for (const server of config.disableMcpServer) {
      if (!server || server.trim() === '') {
        errors.push({
          field: 'disableMcpServer',
          message: 'disableMcpServer contains empty server name',
        });
      }
    }
  }

  return errors;
}
