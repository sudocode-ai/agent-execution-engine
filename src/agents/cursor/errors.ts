/**
 * Cursor Executor Error Types
 *
 * Custom error classes for Cursor CLI executor.
 * Provides factory methods for common error scenarios.
 *
 * @module agents/cursor/errors
 */

/**
 * Base error class for Cursor executor errors.
 *
 * All Cursor-specific errors extend this class for type-safe error handling.
 *
 * @example
 * ```typescript
 * throw CursorExecutorError.notAvailable();
 * throw CursorExecutorError.authRequired();
 * throw CursorExecutorError.sessionNotFound('session-123');
 * ```
 */
export class CursorExecutorError extends Error {
  /**
   * Create a new CursorExecutorError.
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code
   * @param cause - Optional underlying error
   */
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'CursorExecutorError';

    // Maintain proper stack trace (only available in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CursorExecutorError);
    }
  }

  /**
   * Create error for Cursor CLI not being available.
   *
   * Indicates that cursor-agent executable is not installed or not in PATH.
   *
   * @returns CursorExecutorError with NOT_AVAILABLE code
   *
   * @example
   * ```typescript
   * if (!(await checkAvailability())) {
   *   throw CursorExecutorError.notAvailable();
   * }
   * ```
   */
  static notAvailable(): CursorExecutorError {
    return new CursorExecutorError(
      'Cursor CLI not available. Install from: https://cursor.sh',
      'NOT_AVAILABLE'
    );
  }

  /**
   * Create error for authentication being required.
   *
   * Indicates that user needs to authenticate via cursor-agent login
   * or set CURSOR_API_KEY environment variable.
   *
   * @returns CursorExecutorError with AUTH_REQUIRED code
   *
   * @example
   * ```typescript
   * if (detectAuthError(stderr)) {
   *   throw CursorExecutorError.authRequired();
   * }
   * ```
   */
  static authRequired(): CursorExecutorError {
    return new CursorExecutorError(
      'Authentication required. Please run "cursor-agent login" first, or set CURSOR_API_KEY environment variable.',
      'AUTH_REQUIRED'
    );
  }

  /**
   * Create error for session not found.
   *
   * Indicates that a requested session ID doesn't exist.
   *
   * @param sessionId - The session ID that was not found
   * @returns CursorExecutorError with SESSION_NOT_FOUND code
   *
   * @example
   * ```typescript
   * const session = sessions.get(sessionId);
   * if (!session) {
   *   throw CursorExecutorError.sessionNotFound(sessionId);
   * }
   * ```
   */
  static sessionNotFound(sessionId: string): CursorExecutorError {
    return new CursorExecutorError(
      `Session not found: ${sessionId}`,
      'SESSION_NOT_FOUND'
    );
  }

  /**
   * Create error for process spawn failure.
   *
   * Wraps underlying Node.js spawn errors in CursorExecutorError.
   *
   * @param cause - The underlying spawn error
   * @returns CursorExecutorError with SPAWN_FAILED code
   *
   * @example
   * ```typescript
   * try {
   *   const child = spawn('cursor-agent', args);
   * } catch (err) {
   *   throw CursorExecutorError.spawnFailed(err as Error);
   * }
   * ```
   */
  static spawnFailed(cause: Error): CursorExecutorError {
    return new CursorExecutorError(
      'Failed to spawn cursor-agent process',
      'SPAWN_FAILED',
      cause
    );
  }

  /**
   * Create error for task execution failure.
   *
   * Indicates that a task failed to execute (non-zero exit code, crash, etc.).
   *
   * @param taskId - The task ID that failed
   * @param reason - Human-readable reason for failure
   * @returns CursorExecutorError with TASK_FAILED code
   *
   * @example
   * ```typescript
   * if (exitCode !== 0) {
   *   throw CursorExecutorError.taskFailed(taskId, `Exit code: ${exitCode}`);
   * }
   * ```
   */
  static taskFailed(taskId: string, reason: string): CursorExecutorError {
    return new CursorExecutorError(
      `Task ${taskId} failed: ${reason}`,
      'TASK_FAILED'
    );
  }

  /**
   * Create error for invalid configuration.
   *
   * Indicates that task or executor configuration is invalid.
   *
   * @param reason - Description of configuration error
   * @returns CursorExecutorError with INVALID_CONFIG code
   *
   * @example
   * ```typescript
   * if (!task.workDir) {
   *   throw CursorExecutorError.invalidConfig('workDir is required');
   * }
   * ```
   */
  static invalidConfig(reason: string): CursorExecutorError {
    return new CursorExecutorError(
      `Invalid configuration: ${reason}`,
      'INVALID_CONFIG'
    );
  }
}
