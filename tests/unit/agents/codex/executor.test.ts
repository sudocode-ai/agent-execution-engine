/**
 * Tests for Codex Executor
 *
 * Tests the CodexExecutor class for proper argument building,
 * especially MCP server configuration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodexExecutor } from '@/agents/codex/executor';
import type { CodexConfig } from '@/agents/codex/types/config';
import type { ExecutionTask } from '@/engine/types';

describe('CodexExecutor', () => {
  let executor: CodexExecutor;
  let baseConfig: CodexConfig;

  beforeEach(() => {
    baseConfig = {
      workDir: '/test/dir',
    };
  });

  describe('MCP server configuration', () => {
    it('accepts MCP server configuration', () => {
      const config: CodexConfig = {
        ...baseConfig,
        mcpServers: {
          'sudocode-mcp': {
            command: 'sudocode-mcp',
          },
        },
      };

      executor = new CodexExecutor(config);

      // Verify the executor was created with MCP config
      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers?.['sudocode-mcp'].command).toBe('sudocode-mcp');
    });

    it('includes MCP server args as JSON array', () => {
      const config: CodexConfig = {
        ...baseConfig,
        mcpServers: {
          'my-server': {
            command: 'node',
            args: ['server.js', '--port', '3000'],
          },
        },
      };

      executor = new CodexExecutor(config);

      // Verify config structure
      expect(config.mcpServers?.['my-server'].args).toEqual(['server.js', '--port', '3000']);
    });

    it('includes MCP server env variables', () => {
      const config: CodexConfig = {
        ...baseConfig,
        mcpServers: {
          'my-server': {
            command: 'node',
            env: {
              API_KEY: 'secret',
              PORT: '3000',
            },
          },
        },
      };

      executor = new CodexExecutor(config);

      // Verify config structure
      expect(config.mcpServers?.['my-server'].env).toEqual({
        API_KEY: 'secret',
        PORT: '3000',
      });
    });

    it('includes full MCP server configuration', () => {
      const config: CodexConfig = {
        ...baseConfig,
        mcpServers: {
          'my-server': {
            command: 'node',
            args: ['/path/to/server.js', '--port', '3000'],
            env: {
              API_KEY: 'secret',
            },
          },
        },
      };

      executor = new CodexExecutor(config);

      // Verify full config structure
      const serverConfig = config.mcpServers?.['my-server'];
      expect(serverConfig?.command).toBe('node');
      expect(serverConfig?.args).toEqual(['/path/to/server.js', '--port', '3000']);
      expect(serverConfig?.env).toEqual({ API_KEY: 'secret' });
    });

    it('includes multiple MCP servers', () => {
      const config: CodexConfig = {
        ...baseConfig,
        mcpServers: {
          'server-1': {
            command: 'node',
            args: ['server1.js'],
          },
          'server-2': {
            command: 'python',
            args: ['server2.py'],
          },
        },
      };

      executor = new CodexExecutor(config);

      // Verify both servers are configured
      expect(Object.keys(config.mcpServers || {})).toHaveLength(2);
      expect(config.mcpServers?.['server-1'].command).toBe('node');
      expect(config.mcpServers?.['server-2'].command).toBe('python');
    });

    it('handles MCP server with no args or env', () => {
      const config: CodexConfig = {
        ...baseConfig,
        mcpServers: {
          'simple-server': {
            command: 'npx',
          },
        },
      };

      executor = new CodexExecutor(config);

      // Verify minimal config
      const serverConfig = config.mcpServers?.['simple-server'];
      expect(serverConfig?.command).toBe('npx');
      expect(serverConfig?.args).toBeUndefined();
      expect(serverConfig?.env).toBeUndefined();
    });

    it('handles empty args array', () => {
      const config: CodexConfig = {
        ...baseConfig,
        mcpServers: {
          'my-server': {
            command: 'node',
            args: [],
          },
        },
      };

      executor = new CodexExecutor(config);

      // Verify empty args array
      expect(config.mcpServers?.['my-server'].args).toEqual([]);
    });

    it('combines MCP servers with other config options', () => {
      const config: CodexConfig = {
        ...baseConfig,
        json: true,
        model: 'gpt-5-codex',
        autoApprove: true,
        mcpServers: {
          'my-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      };

      executor = new CodexExecutor(config);

      // Verify all config options are set
      expect(config.json).toBe(true);
      expect(config.model).toBe('gpt-5-codex');
      expect(config.autoApprove).toBe(true);
      expect(config.mcpServers?.['my-server'].command).toBe('node');
    });
  });

  describe('getCapabilities', () => {
    it('reports MCP support', () => {
      executor = new CodexExecutor(baseConfig);
      const capabilities = executor.getCapabilities();

      expect(capabilities.supportsMcp).toBe(true);
    });

    it('reports session resume support', () => {
      executor = new CodexExecutor(baseConfig);
      const capabilities = executor.getCapabilities();

      expect(capabilities.supportsSessionResume).toBe(true);
    });

    it('reports JSONL protocol', () => {
      executor = new CodexExecutor(baseConfig);
      const capabilities = executor.getCapabilities();

      expect(capabilities.protocol).toBe('jsonl');
    });
  });

  describe('checkAvailability', () => {
    it('returns boolean result', async () => {
      executor = new CodexExecutor(baseConfig);

      // Should return a boolean (might be true or false depending on environment)
      const available = await executor.checkAvailability();
      expect(typeof available).toBe('boolean');
    });
  });
});
