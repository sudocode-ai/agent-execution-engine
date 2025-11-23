/**
 * CLI State Types
 *
 * Type definitions for CLI state management.
 */

import type { NormalizedEntry } from '../../agents/types/agent-executor.js';

/**
 * CLI state tracking for active task
 */
export interface CliState {
  /** Task ID */
  taskId: string;

  /** Process ID */
  processId: string;

  /** Agent name (e.g., 'claude', 'codex') */
  agentName: string;

  /** Working directory */
  workDir: string;

  /** Task start time */
  startTime: Date;

  /** Accumulated normalized entries */
  entries: NormalizedEntry[];
}

/**
 * Options for submit command
 */
export interface SubmitOptions {
  /** Agent to use (e.g., 'claude', 'codex') */
  agent: string;

  /** Prompt/task to submit */
  prompt: string;

  /** Working directory for the agent */
  workDir: string;

  /** Follow mode: stream output until completion (default: true) */
  follow?: boolean;

  /** Detach mode: return task/process IDs immediately (default: false) */
  detach?: boolean;

  /** Output format (default: 'pretty') */
  outputFormat?: 'pretty' | 'json' | 'markdown';

  /** Resume from session ID (optional) */
  resume?: string;

  /** Show thinking entries (default: true) */
  showThinking?: boolean;

  /** Show timestamps (default: false) */
  showTimestamps?: boolean;

  // Agent-specific options

  /** Model selection (for agents that support it, e.g., Cursor, Claude) */
  model?: string;

  /** Auto-approve all tool executions (default: true for MVP) */
  force?: boolean;

  /** MCP servers to enable (comma-separated list) */
  mcpServers?: string;
}

/**
 * Result from submit command execution
 */
export interface SubmitResult {
  /** Task ID */
  taskId: string;

  /** Process ID */
  processId: string;

  /** Success status */
  success: boolean;

  /** Exit code */
  exitCode: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Number of tools used */
  toolsUsed: number;

  /** Number of files changed */
  filesChanged: number;

  /** Error message if failed */
  error?: string;

  /** All normalized entries (for JSON output) */
  entries?: NormalizedEntry[];
}
