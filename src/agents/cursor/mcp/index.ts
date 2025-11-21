/**
 * MCP (Model Context Protocol) Utilities
 *
 * @module agents/cursor/mcp
 */

export {
  ensureMcpServerTrust,
  getDefaultMcpConfigPath,
  readMcpConfig,
  isMcpServerTrusted,
  listMcpServers,
} from './trust.js';
export type { McpServerConfig, McpConfig } from './trust.js';
