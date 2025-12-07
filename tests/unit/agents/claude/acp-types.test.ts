/**
 * Unit Tests: Claude ACP Types
 *
 * Tests type definitions and their usage for Claude ACP integration.
 */

import { describe, it, expect } from 'vitest';
import type {
  ClaudeAcpSessionMeta,
  ClaudeCodeSdkOptions,
  ClaudeAcpMcpServerConfig,
  ClaudeHooksConfig,
  ClaudeHookEntry,
  ClaudeSystemPrompt,
  ClaudeNewSessionRequest,
} from '@/agents/claude/acp-types';

describe('Claude ACP Types', () => {
  describe('ClaudeSystemPrompt', () => {
    it('should accept string type', () => {
      const prompt: ClaudeSystemPrompt = 'You are a helpful assistant';
      expect(prompt).toBe('You are a helpful assistant');
    });

    it('should accept preset object type', () => {
      const prompt: ClaudeSystemPrompt = {
        type: 'preset',
        preset: 'claude_code',
      };
      expect(prompt.type).toBe('preset');
      expect(prompt.preset).toBe('claude_code');
    });

    it('should accept preset with append', () => {
      const prompt: ClaudeSystemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: 'Additional instructions here',
      };
      expect(prompt.append).toBe('Additional instructions here');
    });
  });

  describe('ClaudeHookEntry', () => {
    it('should define hook with command', () => {
      const entry: ClaudeHookEntry = {
        hooks: [
          { command: 'echo "hook executed"' },
        ],
      };
      expect(entry.hooks).toHaveLength(1);
      expect(entry.hooks[0].command).toBe('echo "hook executed"');
    });

    it('should define hook with timeout', () => {
      const entry: ClaudeHookEntry = {
        hooks: [
          { command: 'long-running-script.sh', timeout: 30000 },
        ],
      };
      expect(entry.hooks[0].timeout).toBe(30000);
    });

    it('should define hook with type', () => {
      const entry: ClaudeHookEntry = {
        hooks: [
          { type: 'validation', command: 'validate.sh' },
        ],
      };
      expect(entry.hooks[0].type).toBe('validation');
    });

    it('should support multiple hooks', () => {
      const entry: ClaudeHookEntry = {
        hooks: [
          { command: 'first.sh' },
          { command: 'second.sh', timeout: 5000 },
          { type: 'cleanup', command: 'cleanup.sh' },
        ],
      };
      expect(entry.hooks).toHaveLength(3);
    });
  });

  describe('ClaudeHooksConfig', () => {
    it('should define PreToolUse hooks', () => {
      const config: ClaudeHooksConfig = {
        PreToolUse: [
          { hooks: [{ command: 'pre-tool.sh' }] },
        ],
      };
      expect(config.PreToolUse).toHaveLength(1);
    });

    it('should define PostToolUse hooks', () => {
      const config: ClaudeHooksConfig = {
        PostToolUse: [
          { hooks: [{ command: 'post-tool.sh' }] },
        ],
      };
      expect(config.PostToolUse).toHaveLength(1);
    });

    it('should define both hook types', () => {
      const config: ClaudeHooksConfig = {
        PreToolUse: [
          { hooks: [{ command: 'pre.sh' }] },
        ],
        PostToolUse: [
          { hooks: [{ command: 'post.sh' }] },
        ],
      };
      expect(config.PreToolUse).toBeDefined();
      expect(config.PostToolUse).toBeDefined();
    });
  });

  describe('ClaudeAcpMcpServerConfig', () => {
    it('should define stdio server', () => {
      const config: ClaudeAcpMcpServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      };
      expect(config.type).toBe('stdio');
      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp']);
    });

    it('should define stdio server with env', () => {
      const config: ClaudeAcpMcpServerConfig = {
        type: 'stdio',
        command: 'my-server',
        env: { DEBUG: 'true', LOG_LEVEL: 'verbose' },
      };
      expect(config.env).toEqual({ DEBUG: 'true', LOG_LEVEL: 'verbose' });
    });

    it('should define http server', () => {
      const config: ClaudeAcpMcpServerConfig = {
        type: 'http',
        url: 'http://localhost:8080/mcp',
        headers: { 'Authorization': 'Bearer token' },
      };
      expect(config.type).toBe('http');
      expect(config.url).toBe('http://localhost:8080/mcp');
      expect(config.headers).toEqual({ 'Authorization': 'Bearer token' });
    });

    it('should define sse server', () => {
      const config: ClaudeAcpMcpServerConfig = {
        type: 'sse',
        url: 'http://localhost:8080/events',
      };
      expect(config.type).toBe('sse');
    });

    it('should define sdk server', () => {
      const config: ClaudeAcpMcpServerConfig = {
        type: 'sdk',
      };
      expect(config.type).toBe('sdk');
    });
  });

  describe('ClaudeCodeSdkOptions', () => {
    it('should define allowedTools', () => {
      const options: ClaudeCodeSdkOptions = {
        allowedTools: ['Read', 'Bash(git:*)', 'Edit'],
      };
      expect(options.allowedTools).toHaveLength(3);
    });

    it('should define disallowedTools', () => {
      const options: ClaudeCodeSdkOptions = {
        disallowedTools: ['Write', 'Bash(rm:*)', 'Bash(sudo:*)'],
      };
      expect(options.disallowedTools).toHaveLength(3);
    });

    it('should define mcpServers', () => {
      const options: ClaudeCodeSdkOptions = {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          },
          api: {
            type: 'http',
            url: 'http://localhost:3000/mcp',
          },
        },
      };
      expect(Object.keys(options.mcpServers!)).toEqual(['filesystem', 'api']);
    });

    it('should define hooks', () => {
      const options: ClaudeCodeSdkOptions = {
        hooks: {
          PreToolUse: [{ hooks: [{ command: 'validate.sh' }] }],
        },
      };
      expect(options.hooks?.PreToolUse).toBeDefined();
    });

    it('should define extraArgs', () => {
      const options: ClaudeCodeSdkOptions = {
        extraArgs: {
          'custom-flag': true,
          'custom-value': 'test',
        },
      };
      expect(options.extraArgs).toEqual({
        'custom-flag': true,
        'custom-value': 'test',
      });
    });

    it('should combine all options', () => {
      const options: ClaudeCodeSdkOptions = {
        allowedTools: ['Read'],
        disallowedTools: ['Write'],
        mcpServers: {
          test: { type: 'stdio', command: 'test-server' },
        },
        hooks: {
          PostToolUse: [{ hooks: [{ command: 'log.sh' }] }],
        },
        extraArgs: { verbose: true },
      };

      expect(options.allowedTools).toBeDefined();
      expect(options.disallowedTools).toBeDefined();
      expect(options.mcpServers).toBeDefined();
      expect(options.hooks).toBeDefined();
      expect(options.extraArgs).toBeDefined();
    });
  });

  describe('ClaudeAcpSessionMeta', () => {
    it('should accept string systemPrompt', () => {
      const meta: ClaudeAcpSessionMeta = {
        systemPrompt: 'Custom system prompt',
      };
      expect(meta.systemPrompt).toBe('Custom system prompt');
    });

    it('should accept preset systemPrompt', () => {
      const meta: ClaudeAcpSessionMeta = {
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: 'Focus on TypeScript',
        },
      };
      expect(meta.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code',
        append: 'Focus on TypeScript',
      });
    });

    it('should define disableBuiltInTools', () => {
      const meta: ClaudeAcpSessionMeta = {
        disableBuiltInTools: true,
      };
      expect(meta.disableBuiltInTools).toBe(true);
    });

    it('should define claudeCode options', () => {
      const meta: ClaudeAcpSessionMeta = {
        claudeCode: {
          options: {
            allowedTools: ['Read', 'Grep'],
            disallowedTools: ['Bash(rm:*)'],
          },
        },
      };
      expect(meta.claudeCode?.options?.allowedTools).toEqual(['Read', 'Grep']);
    });

    it('should support index signature for forward compatibility', () => {
      const meta: ClaudeAcpSessionMeta = {
        systemPrompt: 'Test',
        // Index signature allows additional properties
        customField: 'custom value',
        anotherField: 123,
      };
      expect(meta.customField).toBe('custom value');
      expect(meta.anotherField).toBe(123);
    });

    it('should define complete session meta', () => {
      const meta: ClaudeAcpSessionMeta = {
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: 'Be concise',
        },
        disableBuiltInTools: false,
        claudeCode: {
          options: {
            allowedTools: ['Read', 'Grep', 'Glob'],
            disallowedTools: ['Bash(rm:-rf:*)'],
            mcpServers: {
              local: { type: 'stdio', command: 'local-mcp' },
            },
            hooks: {
              PreToolUse: [{ hooks: [{ command: 'validate.sh' }] }],
            },
          },
        },
      };

      expect(meta.systemPrompt).toBeDefined();
      expect(meta.disableBuiltInTools).toBe(false);
      expect(meta.claudeCode?.options?.allowedTools).toHaveLength(3);
      expect(meta.claudeCode?.options?.mcpServers?.local).toBeDefined();
    });
  });

  describe('ClaudeNewSessionRequest', () => {
    it('should define minimal request', () => {
      const request: ClaudeNewSessionRequest = {
        cwd: '/path/to/project',
      };
      expect(request.cwd).toBe('/path/to/project');
    });

    it('should define request with mcpServers', () => {
      const request: ClaudeNewSessionRequest = {
        cwd: '/project',
        mcpServers: [
          {
            name: 'filesystem',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
          },
        ],
      };
      expect(request.mcpServers).toHaveLength(1);
      expect(request.mcpServers![0].name).toBe('filesystem');
    });

    it('should define request with http mcp server', () => {
      const request: ClaudeNewSessionRequest = {
        cwd: '/project',
        mcpServers: [
          {
            name: 'api',
            type: 'http',
            url: 'http://localhost:3000/mcp',
            headers: [
              { name: 'Authorization', value: 'Bearer token' },
            ],
          },
        ],
      };
      expect(request.mcpServers![0].type).toBe('http');
      expect(request.mcpServers![0].url).toBe('http://localhost:3000/mcp');
    });

    it('should define request with _meta', () => {
      const request: ClaudeNewSessionRequest = {
        cwd: '/project',
        _meta: {
          systemPrompt: 'Be helpful',
          disableBuiltInTools: false,
          claudeCode: {
            options: {
              allowedTools: ['Read'],
            },
          },
        },
      };
      expect(request._meta?.systemPrompt).toBe('Be helpful');
      expect(request._meta?.claudeCode?.options?.allowedTools).toEqual(['Read']);
    });

    it('should define complete request', () => {
      const request: ClaudeNewSessionRequest = {
        cwd: '/path/to/project',
        mcpServers: [
          {
            name: 'fs',
            command: 'fs-server',
            args: ['--path', '/tmp'],
            env: [{ name: 'DEBUG', value: 'true' }],
          },
          {
            name: 'api',
            type: 'http',
            url: 'http://api.example.com/mcp',
          },
        ],
        _meta: {
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: 'Focus on testing',
          },
          claudeCode: {
            options: {
              allowedTools: ['Read', 'Bash(npm:*)'],
              hooks: {
                PostToolUse: [{ hooks: [{ command: 'audit.sh' }] }],
              },
            },
          },
        },
      };

      expect(request.cwd).toBe('/path/to/project');
      expect(request.mcpServers).toHaveLength(2);
      expect(request._meta?.systemPrompt).toBeDefined();
      expect(request._meta?.claudeCode?.options?.allowedTools).toHaveLength(2);
    });
  });
});
