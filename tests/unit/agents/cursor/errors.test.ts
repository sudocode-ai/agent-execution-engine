/**
 * Tests for Cursor executor error types
 */

import { describe, it, expect } from 'vitest';
import { CursorExecutorError } from '@/agents/cursor/errors';

describe('CursorExecutorError', () => {
  describe('constructor', () => {
    it('should create error with message and code', () => {
      const error = new CursorExecutorError('Test error', 'TEST_CODE');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CursorExecutorError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('CursorExecutorError');
      expect(error.cause).toBeUndefined();
    });

    it('should create error with cause', () => {
      const cause = new Error('Underlying error');
      const error = new CursorExecutorError('Test error', 'TEST_CODE', cause);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.cause).toBe(cause);
    });

    it('should have proper stack trace', () => {
      const error = new CursorExecutorError('Test error', 'TEST_CODE');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('CursorExecutorError');
    });
  });

  describe('notAvailable()', () => {
    it('should create NOT_AVAILABLE error', () => {
      const error = CursorExecutorError.notAvailable();

      expect(error).toBeInstanceOf(CursorExecutorError);
      expect(error.code).toBe('NOT_AVAILABLE');
      expect(error.message).toContain('Cursor CLI not available');
      expect(error.message).toContain('https://cursor.sh');
      expect(error.cause).toBeUndefined();
    });
  });

  describe('authRequired()', () => {
    it('should create AUTH_REQUIRED error', () => {
      const error = CursorExecutorError.authRequired();

      expect(error).toBeInstanceOf(CursorExecutorError);
      expect(error.code).toBe('AUTH_REQUIRED');
      expect(error.message).toContain('Authentication required');
      expect(error.message).toContain('cursor-agent login');
      expect(error.message).toContain('CURSOR_API_KEY');
      expect(error.cause).toBeUndefined();
    });
  });

  describe('sessionNotFound()', () => {
    it('should create SESSION_NOT_FOUND error with session ID', () => {
      const error = CursorExecutorError.sessionNotFound('sess-abc123');

      expect(error).toBeInstanceOf(CursorExecutorError);
      expect(error.code).toBe('SESSION_NOT_FOUND');
      expect(error.message).toBe('Session not found: sess-abc123');
      expect(error.cause).toBeUndefined();
    });

    it('should include any session ID format', () => {
      const error = CursorExecutorError.sessionNotFound('my-custom-session-id');

      expect(error.message).toBe('Session not found: my-custom-session-id');
    });
  });

  describe('spawnFailed()', () => {
    it('should create SPAWN_FAILED error with cause', () => {
      const cause = new Error('ENOENT: command not found');
      const error = CursorExecutorError.spawnFailed(cause);

      expect(error).toBeInstanceOf(CursorExecutorError);
      expect(error.code).toBe('SPAWN_FAILED');
      expect(error.message).toBe('Failed to spawn cursor-agent process');
      expect(error.cause).toBe(cause);
    });

    it('should wrap any error type', () => {
      const cause = new TypeError('Invalid argument');
      const error = CursorExecutorError.spawnFailed(cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('taskFailed()', () => {
    it('should create TASK_FAILED error with task ID and reason', () => {
      const error = CursorExecutorError.taskFailed('task-123', 'Exit code: 1');

      expect(error).toBeInstanceOf(CursorExecutorError);
      expect(error.code).toBe('TASK_FAILED');
      expect(error.message).toBe('Task task-123 failed: Exit code: 1');
      expect(error.cause).toBeUndefined();
    });

    it('should include custom failure reasons', () => {
      const error = CursorExecutorError.taskFailed(
        'task-456',
        'Process crashed unexpectedly'
      );

      expect(error.message).toBe(
        'Task task-456 failed: Process crashed unexpectedly'
      );
    });
  });

  describe('invalidConfig()', () => {
    it('should create INVALID_CONFIG error with reason', () => {
      const error = CursorExecutorError.invalidConfig('workDir is required');

      expect(error).toBeInstanceOf(CursorExecutorError);
      expect(error.code).toBe('INVALID_CONFIG');
      expect(error.message).toBe('Invalid configuration: workDir is required');
      expect(error.cause).toBeUndefined();
    });

    it('should include detailed validation reasons', () => {
      const error = CursorExecutorError.invalidConfig(
        'executablePath must be absolute'
      );

      expect(error.message).toBe(
        'Invalid configuration: executablePath must be absolute'
      );
    });
  });

  describe('error chaining', () => {
    it('should support error cause chaining', () => {
      const rootCause = new Error('Network timeout');
      const spawnError = CursorExecutorError.spawnFailed(rootCause);

      expect(spawnError.cause).toBe(rootCause);
      expect(spawnError.cause?.message).toBe('Network timeout');
    });

    it('should be catchable as Error', () => {
      const throwError = () => {
        throw CursorExecutorError.notAvailable();
      };

      expect(throwError).toThrow(Error);
      expect(throwError).toThrow(CursorExecutorError);
    });

    it('should be distinguishable by code', () => {
      try {
        throw CursorExecutorError.authRequired();
      } catch (err) {
        expect(err).toBeInstanceOf(CursorExecutorError);
        if (err instanceof CursorExecutorError) {
          expect(err.code).toBe('AUTH_REQUIRED');
        }
      }
    });
  });

  describe('error properties', () => {
    it('should have code and message properties', () => {
      const error = CursorExecutorError.invalidConfig('test');

      expect(error.code).toBe('INVALID_CONFIG');
      expect(error.message).toBe('Invalid configuration: test');
      expect(error.name).toBe('CursorExecutorError');
    });

    it('should include cause if provided', () => {
      const cause = new Error('Root cause');
      const error = CursorExecutorError.spawnFailed(cause);

      expect(error.cause).toBeDefined();
      expect(error.cause?.message).toBe('Root cause');
    });

    it('should serialize code property to JSON', () => {
      const error = CursorExecutorError.invalidConfig('test');
      const json = JSON.stringify(error);

      // Code is enumerable and will be serialized
      expect(json).toContain('INVALID_CONFIG');
    });
  });

  describe('instanceof checks', () => {
    it('should pass instanceof Error check', () => {
      const error = CursorExecutorError.notAvailable();

      expect(error instanceof Error).toBe(true);
    });

    it('should pass instanceof CursorExecutorError check', () => {
      const error = CursorExecutorError.authRequired();

      expect(error instanceof CursorExecutorError).toBe(true);
    });

    it('should fail instanceof for other error types', () => {
      const error = CursorExecutorError.taskFailed('task-1', 'Failed');

      expect(error instanceof TypeError).toBe(false);
      expect(error instanceof RangeError).toBe(false);
    });
  });
});
