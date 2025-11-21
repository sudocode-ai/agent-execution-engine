/**
 * Tests for OpenAI Codex Agent Adapter
 *
 * Tests the CodexAdapter implementation of IAgentAdapter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CodexAdapter } from '@/agents/codex/adapter';

describe('CodexAdapter', () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    adapter = new CodexAdapter();
  });

  describe('metadata', () => {
    it('has correct metadata', () => {
      expect(adapter.metadata.name).toBe('codex');
      expect(adapter.metadata.displayName).toBe('OpenAI Codex');
      expect(adapter.metadata.version).toBe('>=1.0.0');
      expect(adapter.metadata.supportedModes).toContain('structured');
      expect(adapter.metadata.supportedModes).toContain('interactive');
      expect(adapter.metadata.supportsStreaming).toBe(true);
      expect(adapter.metadata.supportsStructuredOutput).toBe(true);
    });
  });

  describe('buildProcessConfig', () => {
    it('builds valid ProcessConfig', () => {
      const config = adapter.buildProcessConfig({
        workDir: '/test/dir',
        exec: true,
        json: true,
      });

      expect(config.executablePath).toBe('codex');
      expect(config.args).toContain('exec');
      expect(config.args).toContain('--json');
      expect(config.workDir).toBe('/test/dir');
    });

    it('uses custom codexPath', () => {
      const config = adapter.buildProcessConfig({
        codexPath: '/custom/codex',
        workDir: '/test/dir',
      });

      expect(config.executablePath).toBe('/custom/codex');
    });
  });

  describe('validateConfig', () => {
    it('validates successfully with valid config', () => {
      const errors = adapter.validateConfig({
        workDir: '/test/dir',
      });

      expect(errors).toEqual([]);
    });

    it('requires workDir', () => {
      const errors = adapter.validateConfig({
        workDir: '',
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('workDir is required');
    });

    it('rejects both json and experimentalJson', () => {
      const errors = adapter.validateConfig({
        workDir: '/test/dir',
        json: true,
        experimentalJson: true,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Cannot use both json and experimentalJson flags');
    });

    it('rejects fullAuto with sandbox', () => {
      const errors = adapter.validateConfig({
        workDir: '/test/dir',
        fullAuto: true,
        sandbox: 'workspace-write',
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('fullAuto cannot be used with sandbox');
    });

    it('rejects fullAuto with askForApproval', () => {
      const errors = adapter.validateConfig({
        workDir: '/test/dir',
        fullAuto: true,
        askForApproval: 'on-failure',
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('fullAuto cannot be used with');
    });

    it('rejects yolo with sandbox', () => {
      const errors = adapter.validateConfig({
        workDir: '/test/dir',
        yolo: true,
        sandbox: 'workspace-write',
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('yolo flag cannot be used with');
    });

    it('rejects yolo with fullAuto', () => {
      const errors = adapter.validateConfig({
        workDir: '/test/dir',
        yolo: true,
        fullAuto: true,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('yolo flag cannot be used with');
    });

    it('validates sandbox values', () => {
      const errors = adapter.validateConfig({
        workDir: '/test/dir',
        sandbox: 'invalid' as any,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('sandbox must be one of');
    });

    it('accepts valid sandbox values', () => {
      const sandboxValues = ['read-only', 'workspace-write', 'danger-full-access'] as const;

      sandboxValues.forEach((value) => {
        const errors = adapter.validateConfig({
          workDir: '/test/dir',
          sandbox: value,
        });
        expect(errors).toEqual([]);
      });
    });

    it('validates askForApproval values', () => {
      const errors = adapter.validateConfig({
        workDir: '/test/dir',
        askForApproval: 'invalid' as any,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('askForApproval must be one of');
    });

    it('accepts valid askForApproval values', () => {
      const approvalValues = ['untrusted', 'on-failure', 'on-request', 'never'] as const;

      approvalValues.forEach((value) => {
        const errors = adapter.validateConfig({
          workDir: '/test/dir',
          askForApproval: value,
        });
        expect(errors).toEqual([]);
      });
    });

    it('validates color values', () => {
      const errors = adapter.validateConfig({
        workDir: '/test/dir',
        color: 'invalid' as any,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('color must be one of');
    });

    it('accepts valid color values', () => {
      const colorValues = ['always', 'never', 'auto'] as const;

      colorValues.forEach((value) => {
        const errors = adapter.validateConfig({
          workDir: '/test/dir',
          color: value,
        });
        expect(errors).toEqual([]);
      });
    });

    it('reports multiple errors', () => {
      const errors = adapter.validateConfig({
        workDir: '',
        json: true,
        experimentalJson: true,
        fullAuto: true,
        sandbox: 'workspace-write',
      });

      expect(errors.length).toBeGreaterThan(1);
    });
  });

  describe('getDefaultConfig', () => {
    it('returns sensible defaults', () => {
      const defaults = adapter.getDefaultConfig();

      expect(defaults.codexPath).toBe('codex');
      expect(defaults.exec).toBe(true);
      expect(defaults.json).toBe(true); // Enabled by default for structured output
      expect(defaults.experimentalJson).toBe(false);
      expect(defaults.fullAuto).toBe(true); // Enabled by default for automation
      expect(defaults.skipGitRepoCheck).toBe(false);
      expect(defaults.color).toBe('auto');
      expect(defaults.search).toBe(true); // Enabled by default
      expect(defaults.yolo).toBe(false);
    });

    it('defaults can be merged with custom config', () => {
      const defaults = adapter.getDefaultConfig();
      const custom = {
        workDir: '/test/dir',
        json: true,
      };

      const merged = { ...defaults, ...custom };
      const errors = adapter.validateConfig(merged);

      expect(errors).toEqual([]);
      expect(merged.workDir).toBe('/test/dir');
      expect(merged.json).toBe(true);
      expect(merged.codexPath).toBe('codex');
    });
  });
});
