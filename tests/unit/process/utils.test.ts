/**
 * Tests for Process Layer Utilities
 *
 * Tests utility functions including ID generation, formatting,
 * and validation helpers.
 */

import { describe, it , expect } from 'vitest'
import {
  generateId,
  formatDuration,
  isValidSignal,
  formatProcessError,
} from '@/process/utils';

describe('generateId', () => {
  it('generates an ID with the specified prefix', () => {
    const id = generateId('process');
    expect(id).toMatch(/^process-[a-z0-9]+$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    const count = 1000;

    for (let i = 0; i < count; i++) {
      ids.add(generateId('test'));
    }

    // All IDs should be unique
    expect(ids.size).toBe(count);
  });

  it('generates IDs of consistent length', () => {
    const id1 = generateId('process');
    const id2 = generateId('process');

    // Both should have prefix + separator + 10 character nanoid
    expect(id1.length).toBe(id2.length);
    expect(id1.length).toBe('process-'.length + 10);
  });

  it('generates URL-safe IDs (alphanumeric lowercase)', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateId('test');
      const suffix = id.split('-')[1];

      // Should only contain lowercase alphanumeric
      expect(suffix).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('handles different prefixes', () => {
    const processId = generateId('process');
    const taskId = generateId('task');
    const executionId = generateId('execution');

    expect(processId).toMatch(/^process-/);
    expect(taskId).toMatch(/^task-/);
    expect(executionId).toMatch(/^execution-/);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds under 1 second', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(30000)).toBe('30s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m');
    expect(formatDuration(65000)).toBe('1m 5s');
    expect(formatDuration(125000)).toBe('2m 5s');
    expect(formatDuration(3599000)).toBe('59m 59s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3600000)).toBe('1h');
    expect(formatDuration(3660000)).toBe('1h 1m');
    expect(formatDuration(7200000)).toBe('2h');
    expect(formatDuration(7320000)).toBe('2h 2m');
  });

  it('omits zero values in compound formats', () => {
    // 1 minute exactly (no seconds)
    expect(formatDuration(60000)).toBe('1m');

    // 1 hour exactly (no minutes)
    expect(formatDuration(3600000)).toBe('1h');
  });

  it('handles large durations', () => {
    // 24 hours
    expect(formatDuration(86400000)).toBe('24h');

    // 24 hours 30 minutes
    expect(formatDuration(88200000)).toBe('24h 30m');
  });
});

describe('isValidSignal', () => {
  it('validates common Unix signals', () => {
    expect(isValidSignal('SIGTERM')).toBe(true);
    expect(isValidSignal('SIGKILL')).toBe(true);
    expect(isValidSignal('SIGINT')).toBe(true);
    expect(isValidSignal('SIGHUP')).toBe(true);
    expect(isValidSignal('SIGQUIT')).toBe(true);
    expect(isValidSignal('SIGABRT')).toBe(true);
  });

  it('rejects invalid signals', () => {
    expect(isValidSignal('INVALID')).toBe(false);
    expect(isValidSignal('SIGFOO')).toBe(false);
    expect(isValidSignal('sigterm')).toBe(false); // lowercase
    expect(isValidSignal('')).toBe(false);
    expect(isValidSignal('SIG')).toBe(false);
  });

  it('is case sensitive', () => {
    expect(isValidSignal('SIGTERM')).toBe(true);
    expect(isValidSignal('sigterm')).toBe(false);
    expect(isValidSignal('SigTerm')).toBe(false);
  });
});

describe('formatProcessError', () => {
  it('formats signal termination', () => {
    const error = formatProcessError(null, 'SIGTERM');
    expect(error).toBe('Process terminated by signal: SIGTERM');
  });

  it('formats exit code errors', () => {
    const error = formatProcessError(1, null);
    expect(error).toBe('Process exited with code: 1');
  });

  it('prioritizes signal over exit code', () => {
    // If both are present, signal takes precedence
    const error = formatProcessError(1, 'SIGKILL');
    expect(error).toBe('Process terminated by signal: SIGKILL');
  });

  it('handles successful exit (code 0)', () => {
    const error = formatProcessError(0, null);
    expect(error).toBe('Process exited unexpectedly');
  });

  it('handles unknown failures', () => {
    const error = formatProcessError(null, null);
    expect(error).toBe('Process exited unexpectedly');
  });

  it('formats different exit codes', () => {
    expect(formatProcessError(1, null)).toMatch(/code: 1/);
    expect(formatProcessError(137, null)).toMatch(/code: 137/);
    expect(formatProcessError(255, null)).toMatch(/code: 255/);
  });

  it('formats different signals', () => {
    expect(formatProcessError(null, 'SIGKILL')).toMatch(/SIGKILL/);
    expect(formatProcessError(null, 'SIGINT')).toMatch(/SIGINT/);
    expect(formatProcessError(null, 'SIGHUP')).toMatch(/SIGHUP/);
  });
});
