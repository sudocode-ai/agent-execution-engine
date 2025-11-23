/**
 * Renderer Types
 *
 * Type definitions for the CLI output renderer.
 */

/**
 * Rendering options for customizing output display
 */
export interface RenderOptions {
  /**
   * Whether to show timestamps with each entry
   * @default false
   */
  showTimestamps?: boolean;

  /**
   * Whether to show thinking/reasoning entries
   * @default true
   */
  showThinking?: boolean;

  /**
   * Whether to use colors in output
   * @default true
   */
  useColors?: boolean;

  /**
   * Maximum width for wrapped content (0 = no wrapping)
   * @default 0
   */
  maxWidth?: number;
}

/**
 * Execution result summary for rendering
 */
export interface ExecutionResult {
  /** Task ID */
  taskId: string;

  /** Whether the task succeeded */
  success: boolean;

  /** Exit code (if applicable) */
  exitCode?: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Number of tools used */
  toolsUsed: number;

  /** Number of files changed */
  filesChanged: number;

  /** Error message (if failed) */
  error?: string;
}

/**
 * Header information for task display
 */
export interface TaskHeader {
  /** Task ID */
  taskId: string;

  /** Process ID */
  processId: string;

  /** Agent name (e.g., "claude", "cursor") */
  agentName: string;

  /** Optional session ID */
  sessionId?: string;
}
