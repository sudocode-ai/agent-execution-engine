/**
 * Unit tests for Copilot configuration
 */

import { describe, it, expect } from 'vitest';
import {
  validateCopilotConfig,
  type CopilotConfig,
} from '@/agents/copilot/config';

describe('CopilotConfig Validation', () => {
  it('should pass validation for valid config', () => {
    const config: CopilotConfig = {
      workDir: '/tmp/test',
      model: 'gpt-4o',
      allowAllTools: true,
    };

    const errors = validateCopilotConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('should warn when allowTool is used with allowAllTools', () => {
    const config: CopilotConfig = {
      workDir: '/tmp/test',
      allowAllTools: true,
      allowTool: 'bash',
    };

    const errors = validateCopilotConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('allowTool');
    expect(errors[0].message).toContain('ignored when allowAllTools is true');
  });

  it('should warn when denyTool is used with allowAllTools', () => {
    const config: CopilotConfig = {
      workDir: '/tmp/test',
      allowAllTools: true,
      denyTool: 'bash',
    };

    const errors = validateCopilotConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('denyTool');
    expect(errors[0].message).toContain('takes precedence over allowAllTools');
  });

  it('should detect empty addDir paths', () => {
    const config: CopilotConfig = {
      workDir: '/tmp/test',
      addDir: ['/valid/path', '', '/another/path'],
    };

    const errors = validateCopilotConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('addDir');
    expect(errors[0].message).toContain('empty path');
  });

  it('should detect empty disableMcpServer names', () => {
    const config: CopilotConfig = {
      workDir: '/tmp/test',
      disableMcpServer: ['server1', '', 'server2'],
    };

    const errors = validateCopilotConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('disableMcpServer');
    expect(errors[0].message).toContain('empty server name');
  });

  it('should pass for tool permissions without conflicts', () => {
    const config1: CopilotConfig = {
      workDir: '/tmp/test',
      allowTool: 'bash,read_file',
    };

    const config2: CopilotConfig = {
      workDir: '/tmp/test',
      denyTool: 'web_fetch',
    };

    expect(validateCopilotConfig(config1)).toHaveLength(0);
    expect(validateCopilotConfig(config2)).toHaveLength(0);
  });

  it('should allow multiple validation errors', () => {
    const config: CopilotConfig = {
      workDir: '/tmp/test',
      allowAllTools: true,
      allowTool: 'bash',
      denyTool: 'write_file',
      addDir: ['', '/path'],
      disableMcpServer: [''],
    };

    const errors = validateCopilotConfig(config);
    expect(errors.length).toBeGreaterThan(1);
  });

  describe('MCP Server Configuration', () => {
    it('should pass validation for valid MCP server config', () => {
      const config: CopilotConfig = {
        workDir: '/tmp/test',
        mcpServers: {
          'my-server': {
            command: 'node',
            args: ['/path/to/server.js'],
            env: { API_KEY: 'secret' },
          },
        },
      };

      const errors = validateCopilotConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should detect empty MCP server name', () => {
      const config: CopilotConfig = {
        workDir: '/tmp/test',
        mcpServers: {
          '': {
            command: 'node',
            args: ['server.js'],
          },
        },
      };

      const errors = validateCopilotConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('empty server name'))).toBe(
        true
      );
    });

    it('should detect empty MCP server command', () => {
      const config: CopilotConfig = {
        workDir: '/tmp/test',
        mcpServers: {
          'my-server': {
            command: '',
            args: ['server.js'],
          },
        },
      };

      const errors = validateCopilotConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('empty command'))).toBe(true);
    });

    it('should detect non-string argument in MCP server args', () => {
      const config: CopilotConfig = {
        workDir: '/tmp/test',
        mcpServers: {
          'my-server': {
            command: 'node',
            args: ['server.js', 123 as any], // Invalid non-string arg
          },
        },
      };

      const errors = validateCopilotConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some((e) => e.message.includes('non-string argument'))
      ).toBe(true);
    });

    it('should detect empty environment variable name', () => {
      const config: CopilotConfig = {
        workDir: '/tmp/test',
        mcpServers: {
          'my-server': {
            command: 'node',
            env: { '': 'value' },
          },
        },
      };

      const errors = validateCopilotConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some((e) =>
          e.message.includes('empty environment variable name')
        )
      ).toBe(true);
    });

    it('should detect non-string environment variable value', () => {
      const config: CopilotConfig = {
        workDir: '/tmp/test',
        mcpServers: {
          'my-server': {
            command: 'node',
            env: { API_KEY: 123 as any }, // Invalid non-string value
          },
        },
      };

      const errors = validateCopilotConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some((e) =>
          e.message.includes('non-string environment variable value')
        )
      ).toBe(true);
    });

    it('should validate multiple MCP servers', () => {
      const config: CopilotConfig = {
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
      };

      const errors = validateCopilotConfig(config);
      expect(errors).toHaveLength(0);
    });
  });
});
