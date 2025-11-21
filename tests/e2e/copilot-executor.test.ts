/**
 * E2E tests for Copilot executor with real CLI
 *
 * These tests require @github/copilot to be installed and authenticated.
 * Set RUN_E2E_TESTS=true to enable these tests.
 *
 * IMPORTANT: This test is SKIPPED BY DEFAULT and only runs when:
 * - Environment variable RUN_E2E_TESTS=true is set
 * - AND GitHub Copilot CLI is available (npx @github/copilot)
 * - AND user is authenticated (has ~/.copilot/config.json or ~/.copilot/mcp-config.json)
 *
 * To run this test:
 *   RUN_E2E_TESTS=true npm test -- tests/e2e/copilot-executor.test.ts
 *
 * Setup instructions:
 *   1. Run: npx -y @github/copilot
 *   2. In the CLI: /login
 *   3. Follow GitHub authentication flow
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, accessSync } from 'node:fs';
import { homedir } from 'node:os';
import { CopilotExecutor } from '@/agents/copilot/executor';
import type { ExecutionTask } from '@/engine/types';
import type { OutputChunk } from '@/agents/types/agent-executor';

// Environment configuration
const SKIP_E2E =
  process.env.SKIP_E2E_TESTS === 'true' || process.env.RUN_E2E_TESTS !== 'true';

/**
 * Check if Copilot CLI is available and user is authenticated
 */
async function checkCopilotAvailable(): Promise<boolean> {
  // Check if config exists (indicates authentication)
  // Try main config first, then fallback to MCP config
  try {
    const configPath = join(homedir(), '.copilot', 'config.json');
    accessSync(configPath);
  } catch {
    // Fallback to MCP config
    try {
      const mcpConfigPath = join(homedir(), '.copilot', 'mcp-config.json');
      accessSync(mcpConfigPath);
    } catch {
      return false;
    }
  }

  // Check if CLI is available - use installed 'copilot' command
  return new Promise((resolve) => {
    const check = spawn('copilot', ['--version'], {
      stdio: 'ignore',
    });

    check.on('error', () => resolve(false));
    check.on('exit', (code) => resolve(code === 0));

    setTimeout(() => {
      check.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * Create async iterable from process stdout
 */
async function* createOutputStream(
  process: import('@/process/types').ManagedProcess
): AsyncIterable<OutputChunk> {
  for await (const chunk of process.streams!.stdout) {
    yield {
      data: chunk as Buffer,
      type: 'stdout' as const,
      timestamp: new Date(),
    };
  }
}

describe.skipIf(SKIP_E2E)('E2E: CopilotExecutor with Real CLI', () => {
  let tempDir: string;

  beforeAll(async () => {
    // Check Copilot availability - throw if not available
    const copilotAvailable = await checkCopilotAvailable();
    if (!copilotAvailable) {
      throw new Error(
        `GitHub Copilot CLI not available or not authenticated.\n\n` +
        `Setup instructions:\n` +
        `1. Run: npx -y @github/copilot\n` +
        `2. In the CLI, run: /login\n` +
        `3. Follow GitHub authentication flow\n` +
        `4. Verify ~/.copilot/config.json or ~/.copilot/mcp-config.json exists`
      );
    }
  }, 30000);

  beforeEach(() => {
    // Create a fresh temp directory for each test
    tempDir = join(
      tmpdir(),
      `copilot-executor-e2e-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    );
    mkdirSync(tempDir, { recursive: true });

    // Create test files
    writeFileSync(
      join(tempDir, 'test.txt'),
      'This is a test file for Copilot E2E tests.\nLine 2.\nLine 3.'
    );
    writeFileSync(
      join(tempDir, 'example.js'),
      'function greet(name) {\n  console.log("Hello, " + name);\n}\n\ngreet("World");'
    );
  });

  afterEach(async () => {
    // Clean up temp directory
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to clean up temp directory:', error);
      }
    }

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  it('should spawn real Copilot CLI process', async () => {
    const executor = new CopilotExecutor({
      allowAllTools: true,
      // No model specified - uses account default
    });

    const task: ExecutionTask = {
      id: 'e2e-spawn-test',
      type: 'custom',
      prompt: 'Say hello',
      workDir: tempDir,
      config: {},
    };

    const result = await executor.executeTask(task);

    expect(result.process).toBeDefined();
    expect(result.process.pid).toBeGreaterThan(0);
    expect(result.process.status).toBe('busy');

    // Let it run briefly
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Clean up
    if (result.process.status === 'busy') {
      result.process.process.kill('SIGTERM');
    }
  }, 60000);

  it('should execute simple read task and collect output', async () => {
    const executor = new CopilotExecutor({
      workDir: tempDir,
      allowAllTools: true,
      // No model specified - uses account default
    });

    const task: ExecutionTask = {
      id: 'e2e-read-test',
      type: 'custom',
      prompt: 'Read the file test.txt and tell me what it says',
      workDir: tempDir,
      config: {},
    };

    const result = await executor.executeTask(task);
    const outputStream = createOutputStream(result.process);

    const entries = [];
    let foundContent = false;
    let foundSessionId = false;

    // Collect entries for a reasonable time
    const timeout = setTimeout(() => {
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }, 45000);

    try {
      for await (const entry of executor.normalizeOutput(
        outputStream,
        tempDir
      )) {
        entries.push(entry);

        // Check for session ID marker
        if (entry.type.kind === 'system_message' && entry.content.includes('Session ID')) {
          foundSessionId = true;
        }

        // Check if we found the test file content
        if (
          entry.content.includes('test file for Copilot E2E') ||
          entry.content.includes('Line 2')
        ) {
          foundContent = true;
        }

        // Stop after collecting enough entries or finding content
        if (entries.length >= 30 || (foundContent && foundSessionId)) {
          break;
        }
      }
    } finally {
      clearTimeout(timeout);
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }

    expect(entries.length).toBeGreaterThan(0);

    // Copilot output is plain text, so we expect assistant_message entries
    const assistantMessages = entries.filter((e) => e.type.kind === 'assistant_message');
    expect(assistantMessages.length).toBeGreaterThan(0);

    // Session ID should be emitted as system message
    // Note: Session discovery is async and may arrive after initial output
    const systemMessages = entries.filter((e) => e.type.kind === 'system_message');
    if (systemMessages.length > 0) {
      expect(foundSessionId).toBe(true);
    }
  }, 60000);

  it('should handle multiple prompts in session', async () => {
    const executor = new CopilotExecutor({
      workDir: tempDir,
      allowAllTools: true,
      // No model specified - uses account default
    });

    const task: ExecutionTask = {
      id: 'e2e-multi-test',
      type: 'custom',
      prompt: 'List all JavaScript files in the current directory',
      workDir: tempDir,
      config: {},
    };

    const result = await executor.executeTask(task);
    const outputStream = createOutputStream(result.process);

    const entries = [];
    let foundFile = false;

    const timeout = setTimeout(() => {
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }, 45000);

    try {
      for await (const entry of executor.normalizeOutput(
        outputStream,
        tempDir
      )) {
        entries.push(entry);

        // Check if example.js was mentioned
        if (entry.content.includes('example.js')) {
          foundFile = true;
        }

        // Stop after finding the file or collecting enough entries
        if (entries.length >= 30 || foundFile) {
          break;
        }
      }
    } finally {
      clearTimeout(timeout);
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }

    expect(entries.length).toBeGreaterThan(0);

    // Verify we got plain text assistant messages
    const kinds = entries.map((e) => e.type.kind);
    expect(kinds).toContain('assistant_message');
  }, 60000);

  it('should verify capabilities are correct', () => {
    const executor = new CopilotExecutor({
      allowAllTools: true,
    });

    const caps = executor.getCapabilities();

    expect(caps.supportsSessionResume).toBe(true);
    expect(caps.requiresSetup).toBe(true);
    expect(caps.supportsApprovals).toBe(false);
    expect(caps.supportsMcp).toBe(true);
    expect(caps.protocol).toBe('custom');
  });

  it('should verify availability check works', async () => {
    const executor = new CopilotExecutor({
      allowAllTools: true,
    });

    const available = await executor.checkAvailability();

    // Should be true since we passed the beforeAll check
    expect(available).toBe(true);
  });
});
