/**
 * Claude ACP Adapter
 *
 * Implements IAcpAgentAdapter for Claude Code, enabling ACP-based execution
 * alongside the traditional CLI execution mode.
 *
 * This adapter supports two execution modes:
 * 1. ACP mode: Uses @zed-industries/claude-code-acp binary for full ACP protocol support
 * 2. CLI mode (fallback): Uses the standard `claude` CLI with stream-json output
 *
 * @module agents/claude/acp-adapter
 */

import type { ProcessConfig } from '../../process/types.js';
import type {
  IAcpAgentAdapter,
  AcpAgentConfig,
  AcpCapabilities,
  AcpAvailabilityResult,
} from '../acp/adapter.js';
import type { AcpExecutorConfig } from '../acp/executor.js';
import type { AgentMetadata } from '../types/agent-adapter.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

/**
 * MCP server configuration (matches CLI format)
 */
export interface ClaudeMcpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Claude-specific ACP configuration
 *
 * These options map to the Claude CLI flags and are translated to
 * ACP protocol _meta options when using claude-code-acp.
 */
export interface ClaudeAcpConfig extends AcpAgentConfig {
  /**
   * Path to Claude CLI executable (for fallback CLI mode)
   * @default 'claude'
   */
  claudePath?: string;

  /**
   * Path to claude-code-acp binary (for ACP mode)
   * If not specified, attempts to find it in node_modules/.bin/
   */
  claudeAcpPath?: string;

  /**
   * Model to use
   * Passed via setSessionModel() after session creation
   */
  model?: string;

  /**
   * System prompt to use
   * Passed via _meta.systemPrompt in newSession
   */
  systemPrompt?: string | { append?: string };

  /**
   * Whether to prefer ACP mode over CLI mode
   * @default true
   */
  preferAcp?: boolean;

  // ============================================
  // Tool configuration (maps to CLI --tools, --allowed-tools, --disallowed-tools)
  // ============================================

  /**
   * Allowed tool names (whitelist)
   * Can use patterns like "Bash(git:*)"
   * Passed via _meta.claudeCode.options.allowedTools
   */
  allowedTools?: string[];

  /**
   * Disallowed tool names (blacklist)
   * Can use patterns like "Bash(rm:*)"
   * Passed via _meta.claudeCode.options.disallowedTools
   */
  disallowedTools?: string[];

  /**
   * Disable all built-in tools (Read, Write, Edit, Bash, etc.)
   * Useful when you want to provide all tools via MCP
   * Passed via _meta.disableBuiltInTools
   */
  disableBuiltInTools?: boolean;

  // ============================================
  // MCP configuration (maps to CLI --mcp-config)
  // ============================================

  /**
   * Additional MCP server configurations
   * These are merged with mcpServers passed via ACP protocol
   * Passed via _meta.claudeCode.options.mcpServers
   */
  additionalMcpServers?: Record<string, ClaudeMcpServerConfig>;

  // ============================================
  // Permission configuration (maps to CLI --dangerously-skip-permissions, --permission-mode)
  // ============================================

  /**
   * Permission mode setting
   * Available modes: 'default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'
   * Note: bypassPermissions only works in non-root mode
   * Set via setSessionMode() after session creation
   */
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

  // ============================================
  // Hooks configuration (maps to Claude SDK hooks)
  // ============================================

  /**
   * Custom hooks configuration
   * Passed via _meta.claudeCode.options.hooks
   */
  hooks?: {
    PreToolUse?: Array<{ hooks: Array<{ type?: string; command?: string; timeout?: number }> }>;
    PostToolUse?: Array<{ hooks: Array<{ type?: string; command?: string; timeout?: number }> }>;
  };
}

/**
 * ClaudeAcpAdapter
 *
 * Adapter for Claude Code with ACP support. Uses @zed-industries/claude-code-acp
 * which wraps the Claude Agent SDK with full ACP protocol support.
 *
 * @example
 * ```typescript
 * const adapter = new ClaudeAcpAdapter();
 *
 * // Check ACP availability
 * const availability = await adapter.checkAcpAvailability();
 * if (availability.available) {
 *   // Use ACP mode with claude-code-acp binary
 *   const acpConfig = adapter.buildAcpExecutorConfig({
 *     workDir: '/path/to/project',
 *     autoApprove: true,
 *   });
 *   const executor = new AcpExecutor(acpConfig);
 * } else {
 *   // Fall back to traditional CLI mode
 *   const processConfig = adapter.buildProcessConfig({
 *     workDir: '/path/to/project',
 *   });
 * }
 * ```
 */
export class ClaudeAcpAdapter implements IAcpAgentAdapter<ClaudeAcpConfig> {
  /**
   * Agent metadata
   */
  readonly metadata: AgentMetadata = {
    name: 'claude-code-acp',
    displayName: 'Claude Code (ACP)',
    version: '1.0.0',
    supportedModes: ['structured'],
    supportsStreaming: true,
    supportsStructuredOutput: true,
  };

  /**
   * This adapter supports ACP
   */
  readonly supportsAcp = true;

  /**
   * ACP-specific capabilities
   */
  readonly acpCapabilities: AcpCapabilities = {
    supportsLoadSession: false, // Claude Code ACP doesn't support session loading yet
    supportsListSessions: false,
    supportsSessionModes: true,
    supportsSessionModels: true,
    authMethods: ['claude-login'],
  };

  /**
   * Cached path to claude-code-acp binary
   */
  #cachedAcpPath: string | null = null;

  /**
   * Find the claude-code-acp binary path
   *
   * Searches in order:
   * 1. Explicit path from config
   * 2. node_modules/.bin/claude-code-acp relative to this module
   * 3. node_modules/.bin/claude-code-acp relative to cwd
   */
  findClaudeAcpPath(configPath?: string): string | null {
    // Use explicit path if provided
    if (configPath) {
      if (existsSync(configPath)) {
        return configPath;
      }
      return null;
    }

    // Return cached path if we already found it
    if (this.#cachedAcpPath && existsSync(this.#cachedAcpPath)) {
      return this.#cachedAcpPath;
    }

    // Try to find relative to this module (when installed as dependency)
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      // Go up from dist/agents/claude to find node_modules
      const moduleRelativePath = join(__dirname, '../../..', 'node_modules/.bin/claude-code-acp');
      if (existsSync(moduleRelativePath)) {
        this.#cachedAcpPath = moduleRelativePath;
        return moduleRelativePath;
      }
    } catch {
      // import.meta.url not available, try other methods
    }

    // Try relative to cwd
    const cwdRelativePath = join(process.cwd(), 'node_modules/.bin/claude-code-acp');
    if (existsSync(cwdRelativePath)) {
      this.#cachedAcpPath = cwdRelativePath;
      return cwdRelativePath;
    }

    return null;
  }

  /**
   * Build traditional CLI ProcessConfig
   *
   * Used as fallback when ACP is not available.
   */
  buildProcessConfig(config: ClaudeAcpConfig): ProcessConfig {
    const claudePath = config.claudePath ?? 'claude';
    const args: string[] = ['--print', '--output-format', 'stream-json'];

    if (config.model) {
      args.push('--model', config.model);
    }

    return {
      executablePath: claudePath,
      args,
      workDir: config.workDir,
      env: config.env,
      mode: 'structured',
    };
  }

  /**
   * Build _meta options for newSession request
   *
   * Translates ClaudeAcpConfig options to Claude-specific _meta format
   * that claude-code-acp understands.
   */
  buildSessionMeta(config: ClaudeAcpConfig): Record<string, unknown> | undefined {
    const meta: Record<string, unknown> = {};
    let hasContent = false;

    // System prompt
    if (config.systemPrompt) {
      if (typeof config.systemPrompt === 'string') {
        meta.systemPrompt = config.systemPrompt;
      } else if (config.systemPrompt.append) {
        meta.systemPrompt = {
          type: 'preset',
          preset: 'claude_code',
          append: config.systemPrompt.append,
        };
      }
      hasContent = true;
    }

    // Disable built-in tools
    if (config.disableBuiltInTools) {
      meta.disableBuiltInTools = true;
      hasContent = true;
    }

    // Claude Code SDK options
    const claudeCodeOptions: Record<string, unknown> = {};
    let hasClaudeCodeOptions = false;

    if (config.allowedTools && config.allowedTools.length > 0) {
      claudeCodeOptions.allowedTools = config.allowedTools;
      hasClaudeCodeOptions = true;
    }

    if (config.disallowedTools && config.disallowedTools.length > 0) {
      claudeCodeOptions.disallowedTools = config.disallowedTools;
      hasClaudeCodeOptions = true;
    }

    if (config.additionalMcpServers && Object.keys(config.additionalMcpServers).length > 0) {
      // Convert to SDK format
      const mcpServers: Record<string, unknown> = {};
      for (const [name, server] of Object.entries(config.additionalMcpServers)) {
        mcpServers[name] = {
          type: 'stdio',
          command: server.command,
          args: server.args,
          env: server.env,
        };
      }
      claudeCodeOptions.mcpServers = mcpServers;
      hasClaudeCodeOptions = true;
    }

    if (config.hooks) {
      claudeCodeOptions.hooks = config.hooks;
      hasClaudeCodeOptions = true;
    }

    if (hasClaudeCodeOptions) {
      meta.claudeCode = { options: claudeCodeOptions };
      hasContent = true;
    }

    return hasContent ? meta : undefined;
  }

  /**
   * Build ACP executor configuration
   *
   * Uses claude-code-acp binary from @zed-industries/claude-code-acp package.
   * This binary is an ACP agent that wraps the Claude Agent SDK.
   */
  buildAcpExecutorConfig(config: ClaudeAcpConfig): AcpExecutorConfig {
    // Find the claude-code-acp binary
    const acpPath = this.findClaudeAcpPath(config.claudeAcpPath);

    if (!acpPath) {
      throw new Error(
        'claude-code-acp binary not found. Install @zed-industries/claude-code-acp package.',
      );
    }

    // claude-code-acp doesn't take command-line arguments for model/prompt
    // Those are set via ACP protocol (setSessionModel, _meta in newSession)
    const args: string[] = [];

    // Build environment variables for any customization
    const env: Record<string, string> = {
      ...(config.env as Record<string, string> | undefined),
    };

    // claude-code-acp checks for CLAUDE_CODE_EXECUTABLE env var
    if (config.claudePath && config.claudePath !== 'claude') {
      env['CLAUDE_CODE_EXECUTABLE'] = config.claudePath;
    }

    return {
      executablePath: acpPath,
      args,
      autoApprove: config.autoApprove ?? false,
      clientCapabilities: config.clientCapabilities ?? {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      agentName: 'claude-code-acp',
      supportsSessionResume: false, // claude-code-acp doesn't support loadSession yet
      requiresSetup: false,
      supportsMcp: true,
    };
  }

  /**
   * Check if ACP mode is available
   *
   * Checks for claude-code-acp binary availability.
   */
  async checkAcpAvailability(): Promise<AcpAvailabilityResult> {
    // First, check if claude-code-acp binary exists
    const acpPath = this.findClaudeAcpPath();
    if (acpPath) {
      try {
        // Read version from the package
        const packagePath = join(dirname(acpPath), '..', '@zed-industries/claude-code-acp/package.json');
        if (existsSync(packagePath)) {
          const { readFileSync } = await import('node:fs');
          const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
          return {
            available: true,
            reason: 'claude-code-acp binary available',
            version: pkg.version ?? 'unknown',
          };
        }
      } catch {
        // Ignore version lookup errors
      }

      return {
        available: true,
        reason: 'claude-code-acp binary available',
        version: 'unknown',
      };
    }

    // Fallback: check if claude CLI is available (for fallback mode)
    try {
      const { execSync } = await import('node:child_process');
      const result = execSync('claude --version 2>&1', {
        encoding: 'utf-8',
        timeout: 5000,
      });

      const versionMatch = result.match(/(\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      return {
        available: false,
        reason: 'claude-code-acp not found, but Claude CLI available for fallback',
        version,
      };
    } catch {
      return {
        available: false,
        reason: 'Neither claude-code-acp nor Claude CLI found. Install @zed-industries/claude-code-acp.',
      };
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config: ClaudeAcpConfig): string[] {
    const errors: string[] = [];

    if (!config.workDir) {
      errors.push('workDir is required');
    }

    // Validate explicit ACP path if provided
    if (config.claudeAcpPath && !existsSync(config.claudeAcpPath)) {
      errors.push(`claudeAcpPath does not exist: ${config.claudeAcpPath}`);
    }

    return errors;
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): Partial<ClaudeAcpConfig> {
    return {
      claudePath: 'claude',
      autoApprove: false,
      preferAcp: true,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    };
  }
}

/**
 * Create a Claude ACP adapter instance
 */
export function createClaudeAcpAdapter(): ClaudeAcpAdapter {
  return new ClaudeAcpAdapter();
}
