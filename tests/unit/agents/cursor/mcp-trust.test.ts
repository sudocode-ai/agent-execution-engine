/**
 * Tests for MCP server trust utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getDefaultMcpConfigPath,
  ensureMcpServerTrust,
  readMcpConfig,
  isMcpServerTrusted,
  listMcpServers,
} from '@/agents/cursor/mcp/trust';
import type { McpConfig } from '@/agents/cursor/mcp/trust';

// Mock fs module
vi.mock('fs');

describe('MCP Trust Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDefaultMcpConfigPath()', () => {
    it('should return ~/.cursor/mcp.json path', () => {
      const homedir = os.homedir();
      const expected = path.join(homedir, '.cursor', 'mcp.json');

      const result = getDefaultMcpConfigPath();

      expect(result).toBe(expected);
    });

    it('should use os.homedir() for home directory', () => {
      const result = getDefaultMcpConfigPath();

      expect(result).toContain('.cursor');
      expect(result).toContain('mcp.json');
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('ensureMcpServerTrust()', () => {
    const mockConfig: McpConfig = {
      mcpServers: {
        filesystem: {
          command: 'mcp-server-filesystem',
          trusted: true,
        },
        github: {
          command: 'mcp-server-github',
          trusted: false,
        },
        database: {
          command: 'mcp-server-db',
          // No trusted field (defaults to false)
        },
      },
    };

    it('should return immediately if config file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await ensureMcpServerTrust('/project');

      expect(fs.existsSync).toHaveBeenCalledOnce();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should return immediately if no mcpServers in config', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ otherField: 'value' })
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await ensureMcpServerTrust('/project');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return immediately if mcpServers is empty', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ mcpServers: {} })
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await ensureMcpServerTrust('/project');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should warn about untrusted servers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await ensureMcpServerTrust('/project');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('not trusted')
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('github'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('database')
      );

      consoleSpy.mockRestore();
    });

    it('should not warn about trusted servers', async () => {
      const trustedConfig: McpConfig = {
        mcpServers: {
          filesystem: {
            command: 'mcp-server-filesystem',
            trusted: true,
          },
          github: {
            command: 'mcp-server-github',
            trusted: true,
          },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(trustedConfig)
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await ensureMcpServerTrust('/project');

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('not trusted')
      );

      consoleSpy.mockRestore();
    });

    it('should handle JSON parse errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await ensureMcpServerTrust('/project');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to check MCP server trust:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle file read errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await ensureMcpServerTrust('/project');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to check MCP server trust:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('readMcpConfig()', () => {
    it('should return null if config file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await readMcpConfig();

      expect(result).toBeNull();
    });

    it('should read and parse config from default path', async () => {
      const mockConfig: McpConfig = {
        mcpServers: {
          filesystem: { command: 'mcp-fs', trusted: true },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const result = await readMcpConfig();

      expect(result).toEqual(mockConfig);
      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should read from custom config path', async () => {
      const customPath = '/custom/path/mcp.json';
      const mockConfig: McpConfig = {
        mcpServers: {
          github: { command: 'mcp-github', trusted: false },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const result = await readMcpConfig(customPath);

      expect(result).toEqual(mockConfig);
      expect(fs.existsSync).toHaveBeenCalledWith(customPath);
    });

    it('should return null on JSON parse error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json');

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await readMcpConfig();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to read MCP config:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should return null on file read error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await readMcpConfig();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('isMcpServerTrusted()', () => {
    it('should return true if server is trusted', async () => {
      const mockConfig: McpConfig = {
        mcpServers: {
          filesystem: { command: 'mcp-fs', trusted: true },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const result = await isMcpServerTrusted('filesystem');

      expect(result).toBe(true);
    });

    it('should return false if server is not trusted', async () => {
      const mockConfig: McpConfig = {
        mcpServers: {
          github: { command: 'mcp-github', trusted: false },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const result = await isMcpServerTrusted('github');

      expect(result).toBe(false);
    });

    it('should return false if server has no trust field', async () => {
      const mockConfig: McpConfig = {
        mcpServers: {
          database: { command: 'mcp-db' }, // No trusted field
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const result = await isMcpServerTrusted('database');

      expect(result).toBe(false);
    });

    it('should return false if server does not exist', async () => {
      const mockConfig: McpConfig = {
        mcpServers: {
          filesystem: { command: 'mcp-fs', trusted: true },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const result = await isMcpServerTrusted('nonexistent');

      expect(result).toBe(false);
    });

    it('should return false if config file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await isMcpServerTrusted('filesystem');

      expect(result).toBe(false);
    });

    it('should return false if no mcpServers in config', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const result = await isMcpServerTrusted('filesystem');

      expect(result).toBe(false);
    });

    it('should use custom config path', async () => {
      const customPath = '/custom/mcp.json';
      const mockConfig: McpConfig = {
        mcpServers: {
          custom: { command: 'custom-mcp', trusted: true },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const result = await isMcpServerTrusted('custom', customPath);

      expect(result).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith(customPath);
    });
  });

  describe('listMcpServers()', () => {
    it('should return list of server names', async () => {
      const mockConfig: McpConfig = {
        mcpServers: {
          filesystem: { command: 'mcp-fs', trusted: true },
          github: { command: 'mcp-github', trusted: false },
          database: { command: 'mcp-db' },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const result = await listMcpServers();

      expect(result).toEqual(['filesystem', 'github', 'database']);
    });

    it('should return empty array if no servers configured', async () => {
      const mockConfig: McpConfig = {
        mcpServers: {},
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const result = await listMcpServers();

      expect(result).toEqual([]);
    });

    it('should return empty array if no mcpServers field', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const result = await listMcpServers();

      expect(result).toEqual([]);
    });

    it('should return empty array if config file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await listMcpServers();

      expect(result).toEqual([]);
    });

    it('should use custom config path', async () => {
      const customPath = '/custom/mcp.json';
      const mockConfig: McpConfig = {
        mcpServers: {
          server1: { command: 'cmd1', trusted: true },
          server2: { command: 'cmd2', trusted: false },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const result = await listMcpServers(customPath);

      expect(result).toEqual(['server1', 'server2']);
      expect(fs.existsSync).toHaveBeenCalledWith(customPath);
    });
  });
});
