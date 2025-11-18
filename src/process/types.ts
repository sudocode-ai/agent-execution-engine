/**
 * Process Layer Types
 *
 * Core types and interfaces for the Process Layer (Layer 1) of the execution system.
 * Defines generic types for managing any CLI tool/agent process lifecycle.
 *
 * @module execution/process/types
 */

import type { ChildProcess } from 'child_process';
import type { Readable, Writable } from 'stream';

/**
 * Execution mode for CLI tools
 * - structured: Non-interactive, JSON-parseable output via stdio (existing behavior)
 * - interactive: Full terminal emulation with user input via PTY
 * - hybrid: Both terminal view and structured parsing simultaneously
 */
export type ExecutionMode = 'structured' | 'interactive' | 'hybrid';

/**
 * Terminal configuration for PTY processes
 * Used in interactive and hybrid execution modes
 */
export interface TerminalConfig {
  /** Terminal width in columns */
  cols: number;
  /** Terminal height in rows */
  rows: number;
  /** Working directory (defaults to ProcessConfig.workDir if not specified) */
  cwd?: string;
  /** Terminal type (default: xterm-256color) */
  name?: string;
}

/**
 * Status of a managed process throughout its lifecycle
 */
export type ProcessStatus =
  | 'spawning'     // Being created
  | 'idle'         // Ready for work (pool only)
  | 'busy'         // Executing task
  | 'terminating'  // Shutting down
  | 'crashed'      // Exited unexpectedly
  | 'completed';   // Exited normally

/**
 * Configuration for spawning a new process
 * Generic interface that works with any CLI tool/agent
 */
export interface ProcessConfig {
  /** Path to the executable (e.g., 'claude', 'codex', 'node') */
  executablePath: string;

  /** Command-line arguments to pass to the executable */
  args: string[];

  /** Working directory for the process */
  workDir: string;

  /** Environment variables to pass to the process */
  env?: Record<string, string>;

  /** Maximum execution time in milliseconds */
  timeout?: number;

  /** Maximum idle time before cleanup (pool only) */
  idleTimeout?: number;

  /** Retry configuration for failed spawns */
  retry?: {
    /** Maximum number of retry attempts */
    maxAttempts: number;
    /** Initial backoff delay in milliseconds */
    backoffMs: number;
  };

  /** Execution mode (defaults to 'structured' for backward compatibility) */
  mode?: ExecutionMode;

  /** Terminal configuration (required for interactive/hybrid modes) */
  terminal?: TerminalConfig;
}

/**
 * Represents a single managed process instance with its lifecycle state
 * Can be any CLI tool/agent (Claude Code, Codex, Gemini CLI, etc.)
 */
export interface ManagedProcess {
  // Identity
  /** Unique process identifier */
  id: string;
  /** Operating system process ID */
  pid: number;

  // Lifecycle
  /** Current status of the process */
  status: ProcessStatus;
  /** When the process was spawned */
  spawnedAt: Date;
  /** Last I/O activity timestamp */
  lastActivity: Date;
  /** Exit code if process has exited */
  exitCode: number | null;
  /** Signal that terminated the process if applicable */
  signal: string | null;

  // Resources (optional for PTY-based processes)
  /** Node.js ChildProcess handle (not available for PTY processes) */
  process?: ChildProcess;
  /** Process I/O streams (not available for PTY processes) */
  streams?: {
    stdout: Readable;
    stderr: Readable;
    stdin: Writable;
  };

  // Metrics
  /** Process execution metrics */
  metrics: {
    /** Total duration in milliseconds */
    totalDuration: number;
    /** Number of tasks completed */
    tasksCompleted: number;
    /** Success rate (0-1) */
    successRate: number;
  };
}

/**
 * PTY-specific process interface for interactive terminal execution
 * Extends ManagedProcess with PTY-specific methods and properties
 */
export interface ManagedPtyProcess extends Omit<ManagedProcess, 'process' | 'streams'> {
  /** PTY process instance */
  ptyProcess: import('node-pty').IPty;

  /** Write data to PTY */
  write: (data: string) => void;

  /** Resize terminal */
  resize: (cols: number, rows: number) => void;

  /** Listen to PTY output */
  onData: (callback: (data: string) => void) => void;

  /** Listen to PTY exit */
  onExit: (callback: (exitCode: number, signal?: number) => void) => void;
}

/**
 * Handler for process output (stdout/stderr)
 *
 * @param data - Output data buffer
 * @param type - Stream type
 */
export type OutputHandler = (data: Buffer, type: 'stdout' | 'stderr') => void;

/**
 * Handler for process errors
 *
 * @param error - Error that occurred
 */
export type ErrorHandler = (error: Error) => void;

/**
 * Aggregate metrics for all processes managed by a ProcessManager
 */
export interface ProcessMetrics {
  /** Total number of processes spawned */
  totalSpawned: number;
  /** Number of currently active processes */
  currentlyActive: number;
  /** Total number of successfully completed processes */
  totalCompleted: number;
  /** Total number of failed processes */
  totalFailed: number;
  /** Average process duration in milliseconds */
  averageDuration: number;
}
