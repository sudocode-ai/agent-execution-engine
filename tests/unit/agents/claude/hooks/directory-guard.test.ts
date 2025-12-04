/**
 * Directory Guard Hook Tests
 *
 * Tests for the PreToolUse hook that restricts file operations to a working directory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import {
  isPathWithinWorkdir,
  extractFilePath,
  processHookInput,
  FILE_TOOLS,
  type HookInput,
} from '@/agents/claude/hooks/directory-guard';

describe('Directory Guard Hook', () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    // Set a consistent HOME for tests
    process.env.HOME = '/Users/testuser';
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  describe('isPathWithinWorkdir', () => {
    const workdir = '/project/workspace';

    describe('allows paths within workdir', () => {
      it('should allow exact workdir path', () => {
        expect(isPathWithinWorkdir('/project/workspace', workdir)).toBe(true);
      });

      it('should allow files directly in workdir', () => {
        expect(isPathWithinWorkdir('/project/workspace/file.ts', workdir)).toBe(true);
      });

      it('should allow nested subdirectories', () => {
        expect(isPathWithinWorkdir('/project/workspace/src/utils/helper.ts', workdir)).toBe(true);
      });

      it('should allow relative paths within workdir', () => {
        expect(isPathWithinWorkdir('./src/file.ts', workdir)).toBe(true);
        expect(isPathWithinWorkdir('src/file.ts', workdir)).toBe(true);
      });

      it('should handle trailing slashes', () => {
        expect(isPathWithinWorkdir('/project/workspace/', workdir)).toBe(true);
        expect(isPathWithinWorkdir('/project/workspace/src/', workdir)).toBe(true);
      });

      it('should handle . in paths', () => {
        expect(isPathWithinWorkdir('/project/workspace/./src/file.ts', workdir)).toBe(true);
      });

      it('should allow .. that stays within workdir', () => {
        expect(isPathWithinWorkdir('/project/workspace/src/../lib/file.ts', workdir)).toBe(true);
      });
    });

    describe('blocks paths outside workdir', () => {
      it('should block parent directory', () => {
        expect(isPathWithinWorkdir('/project', workdir)).toBe(false);
      });

      it('should block sibling directories', () => {
        expect(isPathWithinWorkdir('/project/other', workdir)).toBe(false);
      });

      it('should block absolute paths outside workdir', () => {
        expect(isPathWithinWorkdir('/etc/passwd', workdir)).toBe(false);
        expect(isPathWithinWorkdir('/home/user/.ssh/id_rsa', workdir)).toBe(false);
      });

      it('should block .. that escapes workdir', () => {
        expect(isPathWithinWorkdir('/project/workspace/../other/file.ts', workdir)).toBe(false);
        expect(isPathWithinWorkdir('../other/file.ts', workdir)).toBe(false);
      });

      it('should block paths that look similar but are outside', () => {
        // /project/workspace-other is not inside /project/workspace
        expect(isPathWithinWorkdir('/project/workspace-other/file.ts', workdir)).toBe(false);
        expect(isPathWithinWorkdir('/project/workspaceX/file.ts', workdir)).toBe(false);
      });

      it('should block home directory paths outside workdir', () => {
        expect(isPathWithinWorkdir('~/.aws/credentials', workdir)).toBe(false);
        expect(isPathWithinWorkdir('~/Documents/secret.txt', workdir)).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty paths', () => {
        // Empty path resolves to workdir itself, which is allowed
        expect(isPathWithinWorkdir('', workdir)).toBe(true);
      });

      it('should handle workdir with trailing slash', () => {
        const workdirWithSlash = '/project/workspace/';
        expect(isPathWithinWorkdir('/project/workspace/file.ts', workdirWithSlash)).toBe(true);
        expect(isPathWithinWorkdir('/project/other/file.ts', workdirWithSlash)).toBe(false);
      });

      it('should handle paths with multiple slashes', () => {
        expect(isPathWithinWorkdir('/project/workspace//src//file.ts', workdir)).toBe(true);
      });
    });
  });

  describe('extractFilePath', () => {
    describe('Read/Edit/Write tools', () => {
      it('should extract file_path from Read tool', () => {
        expect(extractFilePath('Read', { file_path: '/path/to/file.ts' })).toBe('/path/to/file.ts');
      });

      it('should extract file_path from Edit tool', () => {
        expect(extractFilePath('Edit', { file_path: '/path/to/file.ts', old_string: 'a', new_string: 'b' })).toBe('/path/to/file.ts');
      });

      it('should extract file_path from Write tool', () => {
        expect(extractFilePath('Write', { file_path: '/path/to/file.ts', content: 'hello' })).toBe('/path/to/file.ts');
      });

      it('should return null if file_path is missing', () => {
        expect(extractFilePath('Read', {})).toBe(null);
      });
    });

    describe('MultiEdit tool', () => {
      it('should extract file_path from MultiEdit', () => {
        expect(extractFilePath('MultiEdit', { file_path: '/path/to/file.ts', edits: [] })).toBe('/path/to/file.ts');
      });
    });

    describe('Glob/Grep tools', () => {
      it('should extract path from Glob tool', () => {
        expect(extractFilePath('Glob', { path: '/search/path', pattern: '*.ts' })).toBe('/search/path');
      });

      it('should extract path from Grep tool', () => {
        expect(extractFilePath('Grep', { path: '/search/path', pattern: 'TODO' })).toBe('/search/path');
      });

      it('should return null if path is not specified', () => {
        expect(extractFilePath('Glob', { pattern: '*.ts' })).toBe(null);
        expect(extractFilePath('Grep', { pattern: 'TODO' })).toBe(null);
      });
    });

    describe('unknown tools', () => {
      it('should return null for unknown tools', () => {
        expect(extractFilePath('Bash', { command: 'ls' })).toBe(null);
        expect(extractFilePath('WebFetch', { url: 'https://example.com' })).toBe(null);
      });
    });
  });

  describe('processHookInput', () => {
    const workdir = '/project/workspace';

    describe('allows file operations within workdir', () => {
      it('should allow Read within workdir', () => {
        const input: HookInput = {
          tool_name: 'Read',
          tool_input: { file_path: '/project/workspace/src/file.ts' },
        };
        expect(processHookInput(input, workdir)).toEqual({ decision: 'allow' });
      });

      it('should allow Edit within workdir', () => {
        const input: HookInput = {
          tool_name: 'Edit',
          tool_input: { file_path: '/project/workspace/file.ts', old_string: 'a', new_string: 'b' },
        };
        expect(processHookInput(input, workdir)).toEqual({ decision: 'allow' });
      });

      it('should allow Write within workdir', () => {
        const input: HookInput = {
          tool_name: 'Write',
          tool_input: { file_path: '/project/workspace/new-file.ts', content: 'code' },
        };
        expect(processHookInput(input, workdir)).toEqual({ decision: 'allow' });
      });

      it('should allow Glob within workdir', () => {
        const input: HookInput = {
          tool_name: 'Glob',
          tool_input: { path: '/project/workspace/src', pattern: '*.ts' },
        };
        expect(processHookInput(input, workdir)).toEqual({ decision: 'allow' });
      });

      it('should allow Grep within workdir', () => {
        const input: HookInput = {
          tool_name: 'Grep',
          tool_input: { path: '/project/workspace', pattern: 'TODO' },
        };
        expect(processHookInput(input, workdir)).toEqual({ decision: 'allow' });
      });
    });

    describe('blocks file operations outside workdir', () => {
      it('should block Read outside workdir', () => {
        const input: HookInput = {
          tool_name: 'Read',
          tool_input: { file_path: '/etc/passwd' },
        };
        const result = processHookInput(input, workdir);
        expect(result.decision).toBe('block');
        expect(result.reason).toContain('/etc/passwd');
        expect(result.reason).toContain('outside the allowed directory');
      });

      it('should block Edit outside workdir', () => {
        const input: HookInput = {
          tool_name: 'Edit',
          tool_input: { file_path: '/home/user/.bashrc', old_string: 'a', new_string: 'b' },
        };
        const result = processHookInput(input, workdir);
        expect(result.decision).toBe('block');
      });

      it('should block Write outside workdir', () => {
        const input: HookInput = {
          tool_name: 'Write',
          tool_input: { file_path: '/tmp/malicious.sh', content: 'rm -rf /' },
        };
        const result = processHookInput(input, workdir);
        expect(result.decision).toBe('block');
      });

      it('should block path traversal attacks', () => {
        const input: HookInput = {
          tool_name: 'Read',
          tool_input: { file_path: '/project/workspace/../../../etc/passwd' },
        };
        const result = processHookInput(input, workdir);
        expect(result.decision).toBe('block');
      });

      it('should block home directory access', () => {
        const input: HookInput = {
          tool_name: 'Read',
          tool_input: { file_path: '~/.aws/credentials' },
        };
        const result = processHookInput(input, workdir);
        expect(result.decision).toBe('block');
      });
    });

    describe('allows non-file tools', () => {
      it('should allow Bash commands', () => {
        const input: HookInput = {
          tool_name: 'Bash',
          tool_input: { command: 'npm install' },
        };
        expect(processHookInput(input, workdir)).toEqual({ decision: 'allow' });
      });

      it('should allow WebFetch', () => {
        const input: HookInput = {
          tool_name: 'WebFetch',
          tool_input: { url: 'https://example.com' },
        };
        expect(processHookInput(input, workdir)).toEqual({ decision: 'allow' });
      });

      it('should allow Task', () => {
        const input: HookInput = {
          tool_name: 'Task',
          tool_input: { prompt: 'do something' },
        };
        expect(processHookInput(input, workdir)).toEqual({ decision: 'allow' });
      });
    });

    describe('allows file tools without explicit path', () => {
      it('should allow Glob without path (uses cwd)', () => {
        const input: HookInput = {
          tool_name: 'Glob',
          tool_input: { pattern: '*.ts' },
        };
        expect(processHookInput(input, workdir)).toEqual({ decision: 'allow' });
      });

      it('should allow Grep without path (uses cwd)', () => {
        const input: HookInput = {
          tool_name: 'Grep',
          tool_input: { pattern: 'TODO' },
        };
        expect(processHookInput(input, workdir)).toEqual({ decision: 'allow' });
      });
    });
  });

  describe('FILE_TOOLS constant', () => {
    it('should include all file operation tools', () => {
      expect(FILE_TOOLS).toContain('Read');
      expect(FILE_TOOLS).toContain('Edit');
      expect(FILE_TOOLS).toContain('Write');
      expect(FILE_TOOLS).toContain('MultiEdit');
      expect(FILE_TOOLS).toContain('Glob');
      expect(FILE_TOOLS).toContain('Grep');
    });

    it('should not include non-file tools', () => {
      expect(FILE_TOOLS).not.toContain('Bash');
      expect(FILE_TOOLS).not.toContain('WebFetch');
      expect(FILE_TOOLS).not.toContain('Task');
    });
  });
});
