/**
 * Tests for OpenAI Codex Configuration Builder
 *
 * Tests the buildCodexConfig utility for creating ProcessConfig
 * specific to OpenAI Codex CLI.
 */

import { describe, it, expect } from 'vitest';
import { buildCodexConfig } from '@/agents/codex/config-builder';

describe('buildCodexConfig', () => {
  it('builds config with minimal options', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
    });

    expect(config.executablePath).toBe('codex');
    expect(config.args).toEqual(['exec', '-']); // exec with stdin indicator
    expect(config.workDir).toBe('/test/dir');
  });

  it('builds config with custom codexPath', () => {
    const config = buildCodexConfig({
      codexPath: '/custom/path/to/codex',
      workDir: '/test/dir',
    });

    expect(config.executablePath).toBe('/custom/path/to/codex');
  });

  it('includes exec subcommand by default with stdin indicator', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
    });

    expect(config.args[0]).toBe('exec');
    expect(config.args[1]).toBe('-'); // stdin indicator
  });

  it('omits exec subcommand when exec is false', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      exec: false,
    });

    expect(config.args.includes('exec')).toBeFalsy();
  });

  it('includes --json flag when enabled', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      json: true,
    });

    expect(config.args.includes('--json')).toBeTruthy();
  });

  it('includes --experimental-json flag when enabled', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      experimentalJson: true,
    });

    expect(config.args.includes('--experimental-json')).toBeTruthy();
  });

  it('includes --output-last-message flag', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      outputLastMessage: '/path/to/output.txt',
    });

    expect(config.args.includes('--output-last-message')).toBeTruthy();
    expect(config.args.includes('/path/to/output.txt')).toBeTruthy();
  });

  it('includes --model flag when provided', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      model: 'gpt-5-codex',
    });

    expect(config.args.includes('--model')).toBeTruthy();
    expect(config.args.includes('gpt-5-codex')).toBeTruthy();
  });

  it('includes --sandbox flag when provided', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      sandbox: 'workspace-write',
    });

    expect(config.args.includes('--sandbox')).toBeTruthy();
    expect(config.args.includes('workspace-write')).toBeTruthy();
  });

  it('includes --ask-for-approval flag when provided', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      askForApproval: 'on-failure',
    });

    expect(config.args.includes('--ask-for-approval')).toBeTruthy();
    expect(config.args.includes('on-failure')).toBeTruthy();
  });

  it('includes --full-auto flag when enabled', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      fullAuto: true,
    });

    expect(config.args.includes('--full-auto')).toBeTruthy();
  });

  it('includes --skip-git-repo-check flag when enabled', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      skipGitRepoCheck: true,
    });

    expect(config.args.includes('--skip-git-repo-check')).toBeTruthy();
  });

  it('includes --color flag when provided', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      color: 'always',
    });

    expect(config.args.includes('--color')).toBeTruthy();
    expect(config.args.includes('always')).toBeTruthy();
  });

  it('includes --search flag when enabled', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      search: true,
    });

    expect(config.args.includes('--search')).toBeTruthy();
  });

  it('includes --image flag with comma-separated paths', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      image: ['/path/to/image1.png', '/path/to/image2.jpg'],
    });

    expect(config.args.includes('--image')).toBeTruthy();
    expect(config.args.includes('/path/to/image1.png,/path/to/image2.jpg')).toBeTruthy();
  });

  it('includes --profile flag when provided', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      profile: 'my-profile',
    });

    expect(config.args.includes('--profile')).toBeTruthy();
    expect(config.args.includes('my-profile')).toBeTruthy();
  });

  it('includes multiple --add-dir flags', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      addDir: ['/path/to/dir1', '/path/to/dir2'],
    });

    expect(config.args.includes('--add-dir')).toBeTruthy();
    expect(config.args.includes('/path/to/dir1')).toBeTruthy();
    expect(config.args.includes('/path/to/dir2')).toBeTruthy();
  });

  it('includes --yolo flag when enabled', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      yolo: true,
    });

    expect(config.args.includes('--dangerously-bypass-approvals-and-sandbox')).toBeTruthy();
  });

  it('includes prompt as last argument when provided', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      prompt: 'Write a hello world function',
    });

    expect(config.args[config.args.length - 1]).toBe('Write a hello world function');
    // Should not include '-' when prompt is provided as argument
    expect(config.args.includes('-')).toBeFalsy();
  });

  it('builds config with all flags together', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      exec: true,
      json: true,
      model: 'gpt-5-codex',
      sandbox: 'workspace-write',
      askForApproval: 'on-failure',
      color: 'auto',
      search: true,
      prompt: 'Test prompt',
    });

    expect(config.args.includes('exec')).toBeTruthy();
    expect(config.args.includes('--json')).toBeTruthy();
    expect(config.args.includes('--model')).toBeTruthy();
    expect(config.args.includes('gpt-5-codex')).toBeTruthy();
    expect(config.args.includes('--sandbox')).toBeTruthy();
    expect(config.args.includes('workspace-write')).toBeTruthy();
    expect(config.args.includes('--ask-for-approval')).toBeTruthy();
    expect(config.args.includes('on-failure')).toBeTruthy();
    expect(config.args.includes('--color')).toBeTruthy();
    expect(config.args.includes('auto')).toBeTruthy();
    expect(config.args.includes('--search')).toBeTruthy();
    expect(config.args[config.args.length - 1]).toBe('Test prompt');
  });

  it('passes through environment variables', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      env: {
        TEST_VAR: 'test_value',
      },
    });

    expect(config.env).toEqual({ TEST_VAR: 'test_value' });
  });

  it('passes through timeout settings', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      timeout: 5000,
      idleTimeout: 1000,
    });

    expect(config.timeout).toBe(5000);
    expect(config.idleTimeout).toBe(1000);
  });

  it('passes through retry configuration', () => {
    const config = buildCodexConfig({
      workDir: '/test/dir',
      retry: {
        maxAttempts: 3,
        backoffMs: 1000,
      },
    });

    expect(config.retry).toEqual({
      maxAttempts: 3,
      backoffMs: 1000,
    });
  });

  it('creates valid ProcessConfig structure', () => {
    const config = buildCodexConfig({
      codexPath: '/usr/local/bin/codex',
      workDir: '/test/dir',
      exec: true,
      json: true,
      fullAuto: true,
      env: { TEST: 'value' },
      timeout: 10000,
    });

    // Verify structure matches ProcessConfig interface
    expect(config.executablePath).toBeTruthy();
    expect(Array.isArray(config.args)).toBeTruthy();
    expect(config.workDir).toBeTruthy();
    expect(typeof config.executablePath).toBe('string');
    expect(typeof config.workDir).toBe('string');
  });
});
