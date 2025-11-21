/**
 * Unit tests for Copilot session management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createTempLogDir,
  isValidUUID,
  extractSessionId,
  formatSessionLine,
  parseSessionLine,
  watchSessionId,
} from '@/agents/copilot/session';

describe('Session Utilities', () => {
  describe('isValidUUID', () => {
    it('should accept valid UUIDs', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
    });

    it('should accept UUIDs regardless of case', () => {
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
      expect(isValidUUID('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false); // Too short
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false); // Too long
      expect(isValidUUID('550e8400_e29b_41d4_a716_446655440000')).toBe(false); // Wrong separator
      expect(isValidUUID('')).toBe(false);
    });

    it('should reject UUIDs with invalid characters', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false); // 'g' not hex
      expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000!')).toBe(false); // Special char
    });
  });

  describe('extractSessionId', () => {
    it('should extract session ID from log filename', () => {
      const sessionId = extractSessionId('550e8400-e29b-41d4-a716-446655440000.log');
      expect(sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return null for non-log files', () => {
      expect(extractSessionId('session.txt')).toBeNull();
      expect(extractSessionId('data.json')).toBeNull();
    });

    it('should return null for invalid UUID in filename', () => {
      expect(extractSessionId('not-a-uuid.log')).toBeNull();
      expect(extractSessionId('invalid-format.log')).toBeNull();
    });

    it('should return null for empty filename', () => {
      expect(extractSessionId('')).toBeNull();
      expect(extractSessionId('.log')).toBeNull();
    });
  });

  describe('formatSessionLine', () => {
    it('should format session ID with prefix and newline', () => {
      const line = formatSessionLine('550e8400-e29b-41d4-a716-446655440000');
      expect(line).toBe('[copilot-session] 550e8400-e29b-41d4-a716-446655440000\n');
    });

    it('should work with any string', () => {
      const line = formatSessionLine('test-session');
      expect(line).toBe('[copilot-session] test-session\n');
    });
  });

  describe('parseSessionLine', () => {
    it('should parse session ID from formatted line', () => {
      const sessionId = parseSessionLine('[copilot-session] 550e8400-e29b-41d4-a716-446655440000\n');
      expect(sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should trim whitespace', () => {
      const sessionId = parseSessionLine('[copilot-session] 550e8400-e29b-41d4-a716-446655440000  \n');
      expect(sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return null for non-session lines', () => {
      expect(parseSessionLine('Regular output line\n')).toBeNull();
      expect(parseSessionLine('[other-prefix] data\n')).toBeNull();
      expect(parseSessionLine('copilot-session without brackets\n')).toBeNull();
    });

    it('should return null for empty input', () => {
      expect(parseSessionLine('')).toBeNull();
    });
  });

  describe('createTempLogDir', () => {
    let createdDirs: string[] = [];

    afterEach(async () => {
      // Clean up created directories
      for (const dir of createdDirs) {
        try {
          await fs.rm(dir, { recursive: true, force: true });
        } catch (err) {
          // Ignore cleanup errors
        }
      }
      createdDirs = [];
    });

    it('should create unique temp directory', async () => {
      const dir1 = await createTempLogDir('/test/project');
      const dir2 = await createTempLogDir('/test/project');

      createdDirs.push(dir1, dir2);

      expect(dir1).not.toBe(dir2);
      expect(dir1).toContain('copilot_logs');
      expect(dir2).toContain('copilot_logs');
    });

    it('should include work directory name in path', async () => {
      const dir = await createTempLogDir('/path/to/my-project');
      createdDirs.push(dir);

      expect(dir).toContain('my-project');
    });

    it('should handle paths without directory name', async () => {
      const dir = await createTempLogDir('/');
      createdDirs.push(dir);

      expect(dir).toContain('copilot_logs');
    });

    it('should create directory structure', async () => {
      const dir = await createTempLogDir('/test/project');
      createdDirs.push(dir);

      // Verify directory exists
      const stats = await fs.stat(dir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('watchSessionId', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `copilot-session-test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    });

    it('should find session ID when log file exists', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      await fs.writeFile(join(testDir, `${sessionId}.log`), 'test content');

      const found = await watchSessionId(testDir, {
        pollIntervalMs: 50,
        timeoutMs: 2000,
      });

      expect(found).toBe(sessionId);
    });

    it('should wait for log file to be created', async () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';

      // Create file after a delay
      setTimeout(async () => {
        await fs.writeFile(join(testDir, `${sessionId}.log`), 'test');
      }, 300);

      const found = await watchSessionId(testDir, {
        pollIntervalMs: 50,
        timeoutMs: 2000,
      });

      expect(found).toBe(sessionId);
    });

    it('should ignore non-UUID log files', async () => {
      const validSessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

      await fs.writeFile(join(testDir, 'invalid-uuid.log'), 'test');
      await fs.writeFile(join(testDir, 'another-file.log'), 'test');

      // Create valid file after delay
      setTimeout(async () => {
        await fs.writeFile(join(testDir, `${validSessionId}.log`), 'test');
      }, 300);

      const found = await watchSessionId(testDir, {
        pollIntervalMs: 50,
        timeoutMs: 2000,
      });

      expect(found).toBe(validSessionId);
    });

    it('should timeout if no session file found', async () => {
      await expect(
        watchSessionId(testDir, {
          pollIntervalMs: 50,
          timeoutMs: 200,
        })
      ).rejects.toThrow('No session log file found');
    });

    it('should handle non-existent directory initially', async () => {
      const nonExistentDir = join(testDir, 'nonexistent');
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      // Create directory and file after delay
      setTimeout(async () => {
        await fs.mkdir(nonExistentDir, { recursive: true });
        await fs.writeFile(join(nonExistentDir, `${sessionId}.log`), 'test');
      }, 300);

      const found = await watchSessionId(nonExistentDir, {
        pollIntervalMs: 50,
        timeoutMs: 2000,
      });

      expect(found).toBe(sessionId);
    });
  });
});
