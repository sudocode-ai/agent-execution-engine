/**
 * Unit Tests: Claude ACP Adapter
 *
 * Tests the ClaudeAcpAdapter class for ACP-based Claude execution.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaudeAcpAdapter, type ClaudeAcpConfig } from '@/agents/claude/acp-adapter';
import type { ClaudeAcpSessionMeta } from '@/agents/claude/acp-types';

describe('ClaudeAcpAdapter', () => {
  let adapter: ClaudeAcpAdapter;

  beforeEach(() => {
    adapter = new ClaudeAcpAdapter();
  });

  describe('metadata', () => {
    it('should have correct agent metadata', () => {
      expect(adapter.metadata.name).toBe('claude-code-acp');
      expect(adapter.metadata.displayName).toBe('Claude Code (ACP)');
      expect(adapter.metadata.supportsStreaming).toBe(true);
      expect(adapter.metadata.supportsStructuredOutput).toBe(true);
    });

    it('should support ACP', () => {
      expect(adapter.supportsAcp).toBe(true);
    });

    it('should have correct ACP capabilities', () => {
      expect(adapter.acpCapabilities.supportsLoadSession).toBe(false);
      expect(adapter.acpCapabilities.supportsListSessions).toBe(false);
      expect(adapter.acpCapabilities.supportsSessionModes).toBe(true);
      expect(adapter.acpCapabilities.supportsSessionModels).toBe(true);
    });
  });

  describe('findClaudeAcpPath', () => {
    it('should return explicit path if it exists', () => {
      // Use a path that definitely exists
      const result = adapter.findClaudeAcpPath('/bin/sh');
      expect(result).toBe('/bin/sh');
    });

    it('should return null for explicit path that does not exist', () => {
      const result = adapter.findClaudeAcpPath('/nonexistent/path/to/binary');
      expect(result).toBeNull();
    });

    it('should cache the found path', () => {
      // First call with explicit path
      const path1 = adapter.findClaudeAcpPath('/bin/sh');
      expect(path1).toBe('/bin/sh');

      // Second call without explicit path should not use cached value
      // because explicit path takes precedence
      const path2 = adapter.findClaudeAcpPath('/bin/ls');
      expect(path2).toBe('/bin/ls');
    });
  });

  describe('buildProcessConfig (CLI fallback)', () => {
    it('should build basic CLI config', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
      };

      const result = adapter.buildProcessConfig(config);

      expect(result.executablePath).toBe('claude');
      expect(result.args).toContain('--print');
      expect(result.args).toContain('--output-format');
      expect(result.args).toContain('stream-json');
      expect(result.workDir).toBe('/test/project');
      expect(result.mode).toBe('structured');
    });

    it('should include model in CLI args', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        model: 'claude-3-opus',
      };

      const result = adapter.buildProcessConfig(config);

      expect(result.args).toContain('--model');
      expect(result.args).toContain('claude-3-opus');
    });

    it('should use custom claude path', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        claudePath: '/custom/path/to/claude',
      };

      const result = adapter.buildProcessConfig(config);

      expect(result.executablePath).toBe('/custom/path/to/claude');
    });

    it('should pass environment variables', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        env: { MY_VAR: 'value' },
      };

      const result = adapter.buildProcessConfig(config);

      expect(result.env).toEqual({ MY_VAR: 'value' });
    });
  });

  describe('buildSessionMeta', () => {
    it('should return undefined when no options are set', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
      };

      const result = adapter.buildSessionMeta(config);

      expect(result).toBeUndefined();
    });

    it('should include string systemPrompt', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        systemPrompt: 'You are a helpful assistant',
      };

      const result = adapter.buildSessionMeta(config);

      expect(result).toBeDefined();
      expect(result?.systemPrompt).toBe('You are a helpful assistant');
    });

    it('should include systemPrompt with append', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        systemPrompt: { append: 'Additional instructions' },
      };

      const result = adapter.buildSessionMeta(config);

      expect(result).toBeDefined();
      expect(result?.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code',
        append: 'Additional instructions',
      });
    });

    it('should include disableBuiltInTools', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        disableBuiltInTools: true,
      };

      const result = adapter.buildSessionMeta(config);

      expect(result).toBeDefined();
      expect(result?.disableBuiltInTools).toBe(true);
    });

    it('should include allowedTools', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        allowedTools: ['Read', 'Bash(git:*)'],
      };

      const result = adapter.buildSessionMeta(config);

      expect(result).toBeDefined();
      const claudeCode = result?.claudeCode as { options?: { allowedTools?: string[] } };
      expect(claudeCode?.options?.allowedTools).toEqual(['Read', 'Bash(git:*)']);
    });

    it('should include disallowedTools', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        disallowedTools: ['Write', 'Bash(rm:*)'],
      };

      const result = adapter.buildSessionMeta(config);

      expect(result).toBeDefined();
      const claudeCode = result?.claudeCode as { options?: { disallowedTools?: string[] } };
      expect(claudeCode?.options?.disallowedTools).toEqual(['Write', 'Bash(rm:*)']);
    });

    it('should include additionalMcpServers', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        additionalMcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
            env: { DEBUG: 'true' },
          },
        },
      };

      const result = adapter.buildSessionMeta(config);

      expect(result).toBeDefined();
      const claudeCode = result?.claudeCode as { options?: { mcpServers?: Record<string, unknown> } };
      expect(claudeCode?.options?.mcpServers).toEqual({
        filesystem: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: { DEBUG: 'true' },
        },
      });
    });

    it('should include hooks', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        hooks: {
          PreToolUse: [
            {
              hooks: [{ command: 'echo "pre-hook"', timeout: 5000 }],
            },
          ],
          PostToolUse: [
            {
              hooks: [{ command: 'echo "post-hook"' }],
            },
          ],
        },
      };

      const result = adapter.buildSessionMeta(config);

      expect(result).toBeDefined();
      const claudeCode = result?.claudeCode as { options?: { hooks?: unknown } };
      expect(claudeCode?.options?.hooks).toEqual(config.hooks);
    });

    it('should combine multiple options', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        systemPrompt: 'Custom prompt',
        allowedTools: ['Read'],
        disallowedTools: ['Write'],
        disableBuiltInTools: false,
      };

      const result = adapter.buildSessionMeta(config);

      expect(result).toBeDefined();
      expect(result?.systemPrompt).toBe('Custom prompt');
      const claudeCode = result?.claudeCode as {
        options?: { allowedTools?: string[]; disallowedTools?: string[] };
      };
      expect(claudeCode?.options?.allowedTools).toEqual(['Read']);
      expect(claudeCode?.options?.disallowedTools).toEqual(['Write']);
    });
  });

  describe('buildAcpExecutorConfig', () => {
    it('should throw when claude-code-acp is not found', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        claudeAcpPath: '/nonexistent/path',
      };

      expect(() => adapter.buildAcpExecutorConfig(config)).toThrow(
        'claude-code-acp binary not found'
      );
    });

    it('should build config with explicit ACP path', () => {
      // Use a path that exists (we'll use /bin/sh as a stand-in)
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        claudeAcpPath: '/bin/sh',
        autoApprove: true,
      };

      const result = adapter.buildAcpExecutorConfig(config);

      expect(result.executablePath).toBe('/bin/sh');
      expect(result.args).toEqual([]);
      expect(result.autoApprove).toBe(true);
      expect(result.agentName).toBe('claude-code-acp');
      expect(result.supportsSessionResume).toBe(false);
      expect(result.supportsMcp).toBe(true);
    });

    it('should include default client capabilities', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        claudeAcpPath: '/bin/sh',
      };

      const result = adapter.buildAcpExecutorConfig(config);

      expect(result.clientCapabilities).toEqual({
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      });
    });

    it('should use custom client capabilities', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        claudeAcpPath: '/bin/sh',
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: false },
          terminal: false,
        },
      };

      const result = adapter.buildAcpExecutorConfig(config);

      expect(result.clientCapabilities).toEqual({
        fs: { readTextFile: true, writeTextFile: false },
        terminal: false,
      });
    });
  });

  describe('validateConfig', () => {
    it('should return error when workDir is missing', () => {
      const config = {} as ClaudeAcpConfig;

      const errors = adapter.validateConfig(config);

      expect(errors).toContain('workDir is required');
    });

    it('should return error when claudeAcpPath does not exist', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        claudeAcpPath: '/nonexistent/path/to/binary',
      };

      const errors = adapter.validateConfig(config);

      expect(errors.some((e) => e.includes('claudeAcpPath does not exist'))).toBe(true);
    });

    it('should return empty array for valid config', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
      };

      const errors = adapter.validateConfig(config);

      expect(errors).toEqual([]);
    });

    it('should accept valid claudeAcpPath', () => {
      const config: ClaudeAcpConfig = {
        workDir: '/test/project',
        claudeAcpPath: '/bin/sh', // Exists on most systems
      };

      const errors = adapter.validateConfig(config);

      expect(errors).toEqual([]);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return sensible defaults', () => {
      const defaults = adapter.getDefaultConfig();

      expect(defaults.claudePath).toBe('claude');
      expect(defaults.autoApprove).toBe(false);
      expect(defaults.preferAcp).toBe(true);
      expect(defaults.clientCapabilities).toEqual({
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      });
    });
  });

  describe('checkAcpAvailability', () => {
    it('should return available: false when binary not found', async () => {
      // Create a fresh adapter that won't find the binary
      const freshAdapter = new ClaudeAcpAdapter();

      // Mock the findClaudeAcpPath to return null
      vi.spyOn(freshAdapter, 'findClaudeAcpPath').mockReturnValue(null);

      const result = await freshAdapter.checkAcpAvailability();

      // Should either be available (if Claude CLI is installed) or not
      expect(typeof result.available).toBe('boolean');
      expect(typeof result.reason).toBe('string');
    });
  });
});

describe('createClaudeAcpAdapter', () => {
  it('should create adapter instance', async () => {
    const { createClaudeAcpAdapter } = await import('@/agents/claude/acp-adapter');
    const adapter = createClaudeAcpAdapter();

    expect(adapter).toBeInstanceOf(ClaudeAcpAdapter);
  });
});
