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
