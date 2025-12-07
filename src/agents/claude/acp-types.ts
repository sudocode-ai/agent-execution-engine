/**
 * Claude-specific ACP Types
 *
 * Types for Claude Code ACP integration via @zed-industries/claude-code-acp.
 * These types define the _meta structure that claude-code-acp expects in
 * the newSession request.
 *
 * @module agents/claude/acp-types
 */

/**
 * Claude Code SDK options that can be passed via _meta
 * These map to the options accepted by @anthropic-ai/claude-agent-sdk's query() function
 */
export interface ClaudeCodeSdkOptions {
  /**
   * Allowed tool names (whitelist)
   * Can use patterns like "Bash(git:*)"
   */
  allowedTools?: string[];

  /**
   * Disallowed tool names (blacklist)
   * Can use patterns like "Bash(rm:*)"
   */
  disallowedTools?: string[];

  /**
   * MCP server configurations
   * Additional MCP servers beyond what's passed in mcpServers
   */
  mcpServers?: Record<string, ClaudeAcpMcpServerConfig>;

  /**
   * Custom hooks configuration
   */
  hooks?: ClaudeHooksConfig;

  /**
   * Extra arguments to pass to the SDK
   */
  extraArgs?: Record<string, unknown>;
}

/**
 * MCP server configuration for Claude SDK
 */
export interface ClaudeAcpMcpServerConfig {
  type: 'stdio' | 'http' | 'sse' | 'sdk';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Hooks configuration for Claude SDK
 */
export interface ClaudeHooksConfig {
  PreToolUse?: ClaudeHookEntry[];
  PostToolUse?: ClaudeHookEntry[];
}

/**
 * Hook entry for Claude SDK
 */
export interface ClaudeHookEntry {
  hooks: Array<{
    type?: string;
    command?: string;
    timeout?: number;
  }>;
}

/**
 * System prompt configuration for Claude ACP
 */
export type ClaudeSystemPrompt =
  | string
  | { type: 'preset'; preset: 'claude_code'; append?: string };

/**
 * Metadata for newSession request specific to Claude Code ACP
 * This is passed via the _meta field in NewSessionRequest
 *
 * Uses index signature to be compatible with SDK's { [key: string]: unknown }
 */
export interface ClaudeAcpSessionMeta {
  /**
   * Custom system prompt
   * Can be a string or a preset with optional append
   */
  systemPrompt?: ClaudeSystemPrompt;

  /**
   * Disable all built-in tools (Read, Write, Edit, Bash, etc.)
   * Useful when you want to provide all tools via MCP
   */
  disableBuiltInTools?: boolean;

  /**
   * Claude Code SDK options
   */
  claudeCode?: {
    options?: ClaudeCodeSdkOptions;
  };

  /**
   * Allow additional properties for forward compatibility
   */
  [key: string]: unknown;
}

/**
 * Extended NewSessionRequest with Claude-specific _meta
 */
export interface ClaudeNewSessionRequest {
  cwd: string;
  mcpServers?: Array<{
    name: string;
    command?: string;
    args?: string[];
    env?: Array<{ name: string; value: string }>;
    type?: string;
    url?: string;
    headers?: Array<{ name: string; value: string }>;
  }>;
  _meta?: ClaudeAcpSessionMeta;
}
