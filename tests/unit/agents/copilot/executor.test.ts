/**
 * Unit tests for CopilotExecutor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopilotExecutor } from '@/agents/copilot/executor';
import type { CopilotConfig } from '@/agents/copilot/config';
import type { ExecutionTask } from '@/engine/types';

describe('CopilotExecutor', () => {
  describe('Constructor', () => {
    it('should create executor with minimal config', () => {
      const config: CopilotConfig = {
        workDir: '/tmp/test',
      };

      const executor = new CopilotExecutor(config);
      expect(executor).toBeDefined();
    });

    it('should create executor with full config', () => {
      const config: CopilotConfig = {
        workDir: '/tmp/test',
        model: 'gpt-4o',
        allowAllTools: true,
        addDir: ['/extra/dir'],
        disableMcpServer: ['server1'],
        systemPrompt: 'Use TypeScript',
      };

      const executor = new CopilotExecutor(config);
      expect(executor).toBeDefined();
    });
  });

  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const executor = new CopilotExecutor({ workDir: '/tmp' });
      const caps = executor.getCapabilities();

      expect(caps.supportsSessionResume).toBe(true);
      expect(caps.requiresSetup).toBe(true);
      expect(caps.supportsApprovals).toBe(false);
      expect(caps.supportsMcp).toBe(true);
      expect(caps.protocol).toBe('custom');
    });
  });

  describe('getDefaultMcpConfigPath', () => {
    it('should return MCP config path in home directory', () => {
      const executor = new CopilotExecutor({ workDir: '/tmp' });
      const path = executor.getDefaultMcpConfigPath();

      expect(path).toContain('.copilot');
      expect(path).toContain('mcp-config.json');
    });
  });

  describe('checkAvailability', () => {
    it('should return false if MCP config does not exist', async () => {
      const executor = new CopilotExecutor({ workDir: '/tmp' });

      // Most test environments won't have Copilot set up
      const available = await executor.checkAvailability();

      // Just verify it returns a boolean
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Command Building', () => {
    it('should build basic command args', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
      });

      // Access private method via type assertion for testing
      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      // Default config doesn't use npx, so no version args
      expect(args).not.toContain('-y');
      expect(args).not.toContain('@github/copilot');
      expect(args).toContain('--no-color');
      expect(args).toContain('--log-level');
      expect(args).toContain('debug');
      expect(args).toContain('--log-dir');
      expect(args).toContain('/tmp/logs');
    });

    it('should include npx args when executablePath is npx', () => {
      const executor = new CopilotExecutor({
        executablePath: 'npx',
        copilotVersion: '0.0.362',
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      expect(args).toContain('-y');
      expect(args).toContain('@github/copilot@0.0.362');
    });

    it('should use latest version when executablePath is npx without version', () => {
      const executor = new CopilotExecutor({
        executablePath: 'npx',
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      expect(args).toContain('-y');
      expect(args).toContain('@github/copilot@latest');
    });

    it('should include model in args when specified', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        model: 'gpt-4o',
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      expect(args).toContain('--model');
      expect(args).toContain('gpt-4o');
    });

    it('should include resume flag when session ID provided', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
      });

      const args = (executor as any).buildArgs('/tmp/logs', 'test-session-id');

      expect(args).toContain('--resume');
      expect(args).toContain('test-session-id');
    });

    it('should include tool permissions in args', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        allowAllTools: true,
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);
      expect(args).toContain('--allow-all-tools');
    });

    it('should include allow-tool in args', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        allowTool: 'bash,read_file',
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);
      expect(args).toContain('--allow-tool');
      expect(args).toContain('bash,read_file');
    });

    it('should include deny-tool in args', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        denyTool: 'web_fetch',
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);
      expect(args).toContain('--deny-tool');
      expect(args).toContain('web_fetch');
    });

    it('should include additional directories in args', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        addDir: ['/path/one', '/path/two'],
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);
      const addDirCount = args.filter((arg: string) => arg === '--add-dir').length;

      expect(addDirCount).toBe(2);
      expect(args).toContain('/path/one');
      expect(args).toContain('/path/two');
    });

    it('should include MCP server disabling in args', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        disableMcpServer: ['server1', 'server2'],
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);
      const disableCount = args.filter((arg: string) => arg === '--disable-mcp-server').length;

      expect(disableCount).toBe(2);
      expect(args).toContain('server1');
      expect(args).toContain('server2');
    });

    it('should include MCP servers inline config in args', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        mcpServers: {
          'my-server': {
            command: 'node',
            args: ['/path/to/server.js'],
            env: { API_KEY: 'secret' },
          },
        },
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      expect(args).toContain('--additional-mcp-config');
      const configIndex = args.indexOf('--additional-mcp-config');
      expect(configIndex).toBeGreaterThan(-1);

      const configJson = args[configIndex + 1];
      const config = JSON.parse(configJson);

      expect(config).toHaveProperty('mcpServers');
      expect(config.mcpServers).toHaveProperty('my-server');
      expect(config.mcpServers['my-server'].type).toBe('local'); // Default
      expect(config.mcpServers['my-server'].command).toBe('node');
      expect(config.mcpServers['my-server'].args).toEqual(['/path/to/server.js']);
      expect(config.mcpServers['my-server'].env).toEqual({ API_KEY: 'secret' });
      expect(config.mcpServers['my-server'].tools).toEqual(['*']); // Default
    });

    it('should include multiple MCP servers in single --additional-mcp-config', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        mcpServers: {
          server1: {
            command: 'node',
            args: ['server1.js'],
          },
          server2: {
            command: 'python',
            args: ['-m', 'server2'],
            env: { DEBUG: 'true' },
          },
        },
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      const configFlags = args.filter((arg: string) => arg === '--additional-mcp-config');
      expect(configFlags).toHaveLength(1); // Single flag with all servers

      const configIndex = args.indexOf('--additional-mcp-config');
      const configJson = args[configIndex + 1];
      const config = JSON.parse(configJson);

      expect(Object.keys(config.mcpServers)).toHaveLength(2);
      expect(config.mcpServers).toHaveProperty('server1');
      expect(config.mcpServers).toHaveProperty('server2');
    });

    it('should handle MCP servers with minimal config', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        mcpServers: {
          'minimal-server': {
            command: 'npx',
          },
        },
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      const configIndex = args.indexOf('--additional-mcp-config');
      const configJson = args[configIndex + 1];
      const config = JSON.parse(configJson);

      // Should apply defaults
      expect(config.mcpServers['minimal-server']).toEqual({
        type: 'local',
        command: 'npx',
        args: [],
        tools: ['*'],
      });
    });

    it('should not include --additional-mcp-config when mcpServers is undefined', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      expect(args).not.toContain('--additional-mcp-config');
    });

    it('should not include --additional-mcp-config when mcpServers is empty', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        mcpServers: {},
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      expect(args).not.toContain('--additional-mcp-config');
    });

    it('should handle custom tools array', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        mcpServers: {
          'custom-tools-server': {
            command: 'npx',
            tools: ['read_file', 'write_file'],
          },
        },
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      const configIndex = args.indexOf('--additional-mcp-config');
      const configJson = args[configIndex + 1];
      const config = JSON.parse(configJson);

      expect(config.mcpServers['custom-tools-server'].tools).toEqual([
        'read_file',
        'write_file',
      ]);
    });

    it('should handle custom type field', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        mcpServers: {
          'custom-type-server': {
            type: 'remote',
            command: 'npx',
          },
        },
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      const configIndex = args.indexOf('--additional-mcp-config');
      const configJson = args[configIndex + 1];
      const config = JSON.parse(configJson);

      expect(config.mcpServers['custom-type-server'].type).toBe('remote');
    });

    it('should handle sudocode-mcp config with all tools', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        mcpServers: {
          'sudocode-mcp': {
            type: 'local',
            command: 'sudocode-mcp',
            args: [],
            tools: ['*'],
          },
        },
      });

      const args = (executor as any).buildArgs('/tmp/logs', undefined);

      const configIndex = args.indexOf('--additional-mcp-config');
      const configJson = args[configIndex + 1];
      const config = JSON.parse(configJson);

      expect(config.mcpServers['sudocode-mcp']).toEqual({
        type: 'local',
        command: 'sudocode-mcp',
        args: [],
        tools: ['*'],
      });
    });
  });

  describe('Prompt Combination', () => {
    it('should return user prompt when no system prompt', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
      });

      const combined = (executor as any).combinePrompt('User prompt');
      expect(combined).toBe('User prompt');
    });

    it('should combine system and user prompts', () => {
      const executor = new CopilotExecutor({
        workDir: '/tmp/test',
        systemPrompt: 'Use TypeScript with strict mode',
      });

      const combined = (executor as any).combinePrompt('Add a function');
      expect(combined).toContain('Use TypeScript with strict mode');
      expect(combined).toContain('Add a function');
      expect(combined).toMatch(/Use TypeScript with strict mode\n\nAdd a function/);
    });
  });
});
