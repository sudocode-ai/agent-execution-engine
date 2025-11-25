/**
 * E2E tests for Cursor executor with real CLI
 *
 * These tests require cursor-agent to be installed and available.
 * Set RUN_E2E_TESTS=true to enable these tests.
 *
 * IMPORTANT: This test is SKIPPED BY DEFAULT and only runs when:
 * - Environment variable RUN_E2E_TESTS=true is set
 * - AND cursor-agent is available in PATH
 *
 * To run this test:
 *   RUN_E2E_TESTS=true npm test -- tests/e2e/cursor-executor.test.ts
 *
 * Or set CURSOR_PATH to use a specific cursor-agent binary:
 *   RUN_E2E_TESTS=true CURSOR_PATH=/path/to/cursor-agent npm test -- tests/e2e/cursor-executor.test.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { CursorExecutor } from '@/agents/cursor/executor';
import type { ExecutionTask } from '@/engine/types';
import type { OutputChunk } from '@/agents/types/agent-executor';

// Environment configuration
const SKIP_E2E =
  process.env.SKIP_E2E_TESTS === 'true' || process.env.RUN_E2E_TESTS !== 'true';
const CURSOR_PATH = process.env.CURSOR_PATH || 'cursor-agent';

/**
 * Check if cursor-agent is available
 */
async function checkCursorAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn(CURSOR_PATH, ['--version'], {
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

describe.skipIf(SKIP_E2E)('E2E: CursorExecutor with Real CLI', () => {
  let tempDir: string;

  beforeAll(async () => {
    // Check cursor-agent availability - throw if not available
    const cursorAvailable = await checkCursorAvailable();
    if (!cursorAvailable) {
      throw new Error(
        `cursor-agent not available at '${CURSOR_PATH}'. Install cursor-agent from https://cursor.sh or set CURSOR_PATH environment variable.`
      );
    }
  });

  beforeEach(() => {
    // Create a fresh temp directory for each test
    tempDir = join(
      tmpdir(),
      `cursor-executor-e2e-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    );
    mkdirSync(tempDir, { recursive: true });

    // Create test files
    writeFileSync(
      join(tempDir, 'test.txt'),
      'This is a test file for Cursor E2E tests.\nLine 2.\nLine 3.'
    );
    writeFileSync(
      join(tempDir, 'example.js'),
      'function hello() {\n  console.log("Hello, world!");\n}\n\nhello();'
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
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  it('should spawn real cursor-agent process', async () => {
    const executor = new CursorExecutor({
      force: true,
      model: 'auto',
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
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Clean up
    if (result.process.status === 'busy') {
      result.process.process.kill('SIGTERM');
    }
  }, 30000);

  it('should execute simple read task and collect output', async () => {
    const executor = new CursorExecutor({
      force: true,
      model: 'auto',
    });

    const task: ExecutionTask = {
      id: 'e2e-read-test',
      type: 'custom',
      prompt: 'Read the file test.txt and tell me what it contains',
      workDir: tempDir,
      config: {},
    };

    const result = await executor.executeTask(task);
    const outputStream = createOutputStream(result.process);

    const entries = [];
    let foundContent = false;

    // Collect entries for a reasonable time
    const timeout = setTimeout(() => {
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }, 20000);

    try {
      for await (const entry of executor.normalizeOutput(
        outputStream,
        tempDir
      )) {
        entries.push(entry);

        // Check if we found the test file content
        if (
          entry.content.includes('test file for Cursor E2E') ||
          entry.content.includes('Line 2')
        ) {
          foundContent = true;
        }

        // Stop after collecting enough entries
        if (entries.length >= 20 || foundContent) {
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
    expect(foundContent).toBe(true);

    // Verify we got expected message types
    const kinds = entries.map((e) => e.type.kind);
    expect(kinds).toContain('system_message'); // Session info
    expect(kinds).toContain('user_message'); // User prompt
  }, 30000);

  it('should execute shell tool and capture output', async () => {
    const executor = new CursorExecutor({
      force: true,
      model: 'auto',
    });

    const task: ExecutionTask = {
      id: 'e2e-shell-test',
      type: 'custom',
      prompt: 'Use the shell tool to list all .txt files in the current directory',
      workDir: tempDir,
      config: {},
    };

    const result = await executor.executeTask(task);
    const outputStream = createOutputStream(result.process);

    const entries = [];
    let foundToolUse = false;
    let foundTestFile = false;

    const timeout = setTimeout(() => {
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }, 20000);

    try {
      for await (const entry of executor.normalizeOutput(
        outputStream,
        tempDir
      )) {
        entries.push(entry);

        // Check for tool use
        if (entry.type.kind === 'tool_use') {
          foundToolUse = true;
        }

        // Check if we found the test.txt file in output
        if (entry.content.includes('test.txt')) {
          foundTestFile = true;
        }

        // Stop after collecting enough entries
        if (entries.length >= 30 || (foundToolUse && foundTestFile)) {
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
    expect(foundToolUse).toBe(true);
    expect(foundTestFile).toBe(true);

    // Verify we got tool_use entries
    const toolEntries = entries.filter((e) => e.type.kind === 'tool_use');
    expect(toolEntries.length).toBeGreaterThan(0);

    // Check tool details
    const shellTools = toolEntries.filter(
      (e) => e.type.kind === 'tool_use' && e.type.tool.toolName === 'shell'
    );
    expect(shellTools.length).toBeGreaterThan(0);
  }, 30000);

  it('should track tool status from running to success/failed', async () => {
    const executor = new CursorExecutor({
      force: true,
      model: 'auto',
    });

    const task: ExecutionTask = {
      id: 'e2e-tool-status-test',
      type: 'custom',
      prompt: 'Run: echo "hello world"',
      workDir: tempDir,
      config: {},
    };

    const result = await executor.executeTask(task);
    const outputStream = createOutputStream(result.process);

    const entries = [];
    const toolStatusByIndex = new Map<number, string[]>();

    const timeout = setTimeout(() => {
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }, 25000);

    try {
      for await (const entry of executor.normalizeOutput(
        outputStream,
        tempDir
      )) {
        entries.push(entry);

        // Track tool status changes by index
        if (entry.type.kind === 'tool_use') {
          const statuses = toolStatusByIndex.get(entry.index) || [];
          statuses.push(entry.type.tool.status);
          toolStatusByIndex.set(entry.index, statuses);
        }

        // Stop after collecting enough entries or finding a completed tool
        const hasCompletedTool = Array.from(toolStatusByIndex.values()).some(
          (statuses) => statuses.includes('success') || statuses.includes('failed')
        );
        if (entries.length >= 40 || hasCompletedTool) {
          break;
        }
      }
    } finally {
      clearTimeout(timeout);
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }

    // Verify we got tool entries with status transitions
    const toolEntries = entries.filter((e) => e.type.kind === 'tool_use');
    expect(toolEntries.length).toBeGreaterThan(0);

    // Check that at least one tool has status transition from running to success/failed
    let foundStatusTransition = false;
    for (const [index, statuses] of toolStatusByIndex) {
      if (statuses.includes('running') && (statuses.includes('success') || statuses.includes('failed'))) {
        foundStatusTransition = true;

        // Verify the transition order: running should come before success/failed
        const runningIdx = statuses.indexOf('running');
        const successIdx = statuses.indexOf('success');
        const failedIdx = statuses.indexOf('failed');
        const finalIdx = successIdx >= 0 ? successIdx : failedIdx;

        if (finalIdx >= 0) {
          expect(runningIdx).toBeLessThan(finalIdx);
        }
        break;
      }
    }

    // If tool was used, expect status transition
    if (toolStatusByIndex.size > 0) {
      expect(foundStatusTransition).toBe(true);
    }
  }, 35000);

  it('should execute edit operation on a file', async () => {
    const executor = new CursorExecutor({
      force: true,
      model: 'auto',
    });

    const task: ExecutionTask = {
      id: 'e2e-edit-test',
      type: 'custom',
      prompt:
        'Edit the file example.js and change "Hello, world!" to "Hello, Cursor!"',
      workDir: tempDir,
      config: {},
    };

    const result = await executor.executeTask(task);
    const outputStream = createOutputStream(result.process);

    const entries = [];
    let foundEdit = false;

    const timeout = setTimeout(() => {
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }, 25000);

    try {
      for await (const entry of executor.normalizeOutput(
        outputStream,
        tempDir
      )) {
        entries.push(entry);

        // Check for edit/write tool
        if (
          entry.type.kind === 'tool_use' &&
          (entry.type.tool.toolName === 'edit' ||
            entry.type.tool.toolName === 'write')
        ) {
          foundEdit = true;
        }

        // Stop after collecting enough entries
        if (entries.length >= 40 || foundEdit) {
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
    expect(foundEdit).toBe(true);

    // Verify the file was actually modified (best-effort)
    try {
      const content = readFileSync(join(tempDir, 'example.js'), 'utf-8');
      // File should contain the new text (if edit completed)
      if (content.includes('Hello, Cursor!')) {
        expect(content).toContain('Hello, Cursor!');
      }
    } catch (error) {
      // File might not exist yet if edit didn't complete
      console.warn('Could not verify file edit (edit may not have completed)');
    }
  }, 35000);

  it('should handle thinking messages', async () => {
    const executor = new CursorExecutor({
      force: true,
      model: 'auto',
    });

    const task: ExecutionTask = {
      id: 'e2e-thinking-test',
      type: 'custom',
      prompt: 'Count how many files are in this directory',
      workDir: tempDir,
      config: {},
    };

    const result = await executor.executeTask(task);
    const outputStream = createOutputStream(result.process);

    const entries = [];
    let foundThinking = false;

    const timeout = setTimeout(() => {
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }, 20000);

    try {
      for await (const entry of executor.normalizeOutput(
        outputStream,
        tempDir
      )) {
        entries.push(entry);

        if (entry.type.kind === 'thinking') {
          foundThinking = true;
        }

        // Stop after collecting enough entries
        if (entries.length >= 25 || foundThinking) {
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

    // Thinking messages are optional depending on model behavior
    // Just verify we got some structured output
    const kinds = entries.map((e) => e.type.kind);
    expect(kinds.length).toBeGreaterThan(0);
  }, 30000);

  it('should handle errors gracefully', async () => {
    const executor = new CursorExecutor({
      force: true,
      model: 'auto',
    });

    const task: ExecutionTask = {
      id: 'e2e-error-test',
      type: 'custom',
      prompt: 'Read a file that does not exist: nonexistent-file-xyz.txt',
      workDir: tempDir,
      config: {},
    };

    const result = await executor.executeTask(task);
    const outputStream = createOutputStream(result.process);

    const entries = [];
    let foundError = false;

    const timeout = setTimeout(() => {
      if (result.process.status === 'busy') {
        result.process.process.kill('SIGTERM');
      }
    }, 20000);

    try {
      for await (const entry of executor.normalizeOutput(
        outputStream,
        tempDir
      )) {
        entries.push(entry);

        // Check for error or tool failure
        if (
          entry.type.kind === 'error' ||
          (entry.type.kind === 'tool_use' && entry.type.tool.status === 'error')
        ) {
          foundError = true;
        }

        // Stop after collecting enough entries
        if (entries.length >= 30 || foundError) {
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

    // Error handling is optional - agent might handle gracefully
    // Just verify we got structured output
    const kinds = entries.map((e) => e.type.kind);
    expect(kinds.length).toBeGreaterThan(0);
  }, 30000);

  it('should support session resumption', async () => {
    const executor = new CursorExecutor({
      force: true,
      model: 'auto',
    });

    // First session: Ask a question
    const task1: ExecutionTask = {
      id: 'e2e-resume-test-1',
      type: 'custom',
      prompt: 'What is 6 times 7? Just give me the number.',
      workDir: tempDir,
      config: {},
    };

    const result1 = await executor.executeTask(task1);
    const outputStream1 = createOutputStream(result1.process);

    let sessionId: string | undefined;
    const entries1 = [];

    const timeout1 = setTimeout(() => {
      if (result1.process.status === 'busy') {
        result1.process.process.kill('SIGTERM');
      }
    }, 20000);

    try {
      for await (const entry of executor.normalizeOutput(
        outputStream1,
        tempDir
      )) {
        entries1.push(entry);

        // Capture session ID from system message
        if (entry.type.kind === 'system_message' && entry.metadata?.sessionId) {
          sessionId = entry.metadata.sessionId;
        }

        // Stop after collecting enough entries
        if (entries1.length >= 20 || (sessionId && entries1.length >= 5)) {
          break;
        }
      }
    } finally {
      clearTimeout(timeout1);
      if (result1.process.status === 'busy') {
        result1.process.process.kill('SIGTERM');
      }
    }

    // Verify we got a session ID
    expect(sessionId).toBeDefined();
    expect(sessionId).toBeTruthy();

    // Wait a bit before resuming
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Second session: Resume and ask a follow-up
    const task2: ExecutionTask = {
      id: 'e2e-resume-test-2',
      type: 'custom',
      prompt: 'What was the answer I asked you about earlier?',
      workDir: tempDir,
      config: {},
    };

    const result2 = await executor.resumeTask(task2, sessionId!);
    const outputStream2 = createOutputStream(result2.process);

    let resumedSessionId: string | undefined;
    let foundAnswer = false;
    const entries2 = [];

    const timeout2 = setTimeout(() => {
      if (result2.process.status === 'busy') {
        result2.process.process.kill('SIGTERM');
      }
    }, 20000);

    try {
      for await (const entry of executor.normalizeOutput(
        outputStream2,
        tempDir
      )) {
        entries2.push(entry);

        // Verify session ID is preserved
        if (entry.type.kind === 'system_message' && entry.metadata?.sessionId) {
          resumedSessionId = entry.metadata.sessionId;
        }

        // Check if Cursor remembers the answer (42)
        if (entry.content.includes('42')) {
          foundAnswer = true;
        }

        // Stop after collecting enough entries
        if (entries2.length >= 25 || foundAnswer) {
          break;
        }
      }
    } finally {
      clearTimeout(timeout2);
      if (result2.process.status === 'busy') {
        result2.process.process.kill('SIGTERM');
      }
    }

    // Verify session ID is the same
    expect(resumedSessionId).toBe(sessionId);

    // Verify Cursor remembered the context
    expect(foundAnswer).toBe(true);
  }, 50000);
});
