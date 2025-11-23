/**
 * Lifecycle Types
 *
 * Type definitions for CLI lifecycle management.
 */

/**
 * Shutdown configuration options
 */
export interface ShutdownOptions {
  /**
   * Maximum time to wait for graceful shutdown (milliseconds)
   * @default 5000
   */
  gracefulTimeoutMs?: number;

  /**
   * Whether to log shutdown messages
   * @default true
   */
  verbose?: boolean;
}

/**
 * Shutdown result
 */
export interface ShutdownResult {
  /** Whether shutdown was successful */
  success: boolean;

  /** How the process was terminated */
  method: 'graceful' | 'forced' | 'already-exited' | 'no-process';

  /** Duration of shutdown in milliseconds */
  durationMs: number;

  /** Error message if shutdown failed */
  error?: string;
}
