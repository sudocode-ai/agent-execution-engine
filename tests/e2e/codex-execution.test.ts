/**
 * End-to-End Test: Real OpenAI Codex Execution
 *
 * This test verifies that the execution engine can successfully execute
 * a real OpenAI Codex process in structured mode (JSON output).
 *
 * IMPORTANT: This test is SKIPPED BY DEFAULT and only runs when:
 * - Environment variable RUN_E2E_TESTS=true is set
 * - AND OpenAI Codex CLI is available in PATH
 *
 * To run this test:
 *   RUN_E2E_TESTS=true npm test -- tests/e2e/codex-execution.test.ts
 *
 * Or set CODEX_PATH to use a specific Codex binary:
 *   RUN_E2E_TESTS=true CODEX_PATH=/path/to/codex npm test -- tests/e2e/codex-execution.test.ts
 */

import { describe, it, beforeAll, beforeEach, afterEach, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProcessManager } from '@/process/factory';
import { SimpleExecutionEngine } from '@/engine/simple-engine';
import { ResilientExecutor } from '@/resilience/resilient-executor';
import { LinearOrchestrator } from '@/workflow/linear-orchestrator';
import { CodexAdapter } from '@/agents/codex/adapter';
import type { WorkflowDefinition } from '@/workflow/types';
import type { ExecutionTask } from '@/engine/types';

// Environment configuration
const SKIP_E2E =
  process.env.SKIP_E2E_TESTS === 'true' || process.env.RUN_E2E_TESTS !== 'true';
const CODEX_PATH = process.env.CODEX_PATH || 'codex';

/**
 * Check if OpenAI Codex is available
 */
async function checkCodexAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn(CODEX_PATH, ['--version'], {
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

describe.skipIf(SKIP_E2E)('E2E: Real OpenAI Codex Execution', () => {
  let tempDir: string;
  let adapter: CodexAdapter;

  beforeAll(async () => {
    // Check Codex availability - throw if not available
    const codexAvailable = await checkCodexAvailable();
    if (!codexAvailable) {
      throw new Error(
        `OpenAI Codex not available at '${CODEX_PATH}'. Install Codex CLI or set CODEX_PATH environment variable.`
      );
    }

    // Create adapter
    adapter = new CodexAdapter();
  });

  beforeEach(() => {
    // Create a fresh temp directory for each test
    tempDir = join(
      tmpdir(),
      `execution-engine-codex-e2e-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    );
    mkdirSync(tempDir, { recursive: true });

    // Create a simple test file
    writeFileSync(
      join(tempDir, 'test.txt'),
      'This is a test file for Codex execution.'
    );
  });

  afterEach(async () => {
    // Give processes time to clean up
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Structured Mode (JSON Output)', () => {
    it('executes a simple task with Codex', async () => {
      // Use adapter to build config
      const processConfig = adapter.buildProcessConfig({
        codexPath: CODEX_PATH,
        workDir: tempDir,
        exec: true,
        json: true,
        fullAuto: true,
        skipGitRepoCheck: true,
      });

      const processManager = createProcessManager({
        ...processConfig,
        mode: 'structured',
        timeout: 60000, // 1 minute timeout
      });

      const engine = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 1,
        defaultProcessConfig: processConfig,
      });

      try {
        const task: ExecutionTask = {
          id: 'test-task-1',
          type: 'issue',
          prompt: 'What is 2 + 2? Reply with just the number.',
          workDir: tempDir,
          priority: 0,
          dependencies: [],
          config: {},
          createdAt: new Date(),
        };

        const taskId = await engine.submitTask(task);
        const result = await engine.waitForTask(taskId);

        // Verify basic execution
        expect(result).toBeDefined();
        expect(result.taskId).toBe(taskId);
        expect(result.success).toBe(true);
        expect(result.output).toBeDefined();
        expect(result.duration).toBeGreaterThan(0);
      } finally {
        await engine.shutdown();
      }
    }, 120000); // 2 minute timeout

    it('executes task with resilience layer', async () => {
      const processConfig = adapter.buildProcessConfig({
        codexPath: CODEX_PATH,
        workDir: tempDir,
        exec: true,
        json: true,
        fullAuto: true,
        skipGitRepoCheck: true,
      });

      const processManager = createProcessManager({
        ...processConfig,
        mode: 'structured',
        timeout: 60000,
      });

      const engine = new SimpleExecutionEngine(processManager, {
        defaultProcessConfig: processConfig,
      });
      const executor = new ResilientExecutor(engine, {
        maxAttempts: 3,
        backoff: {
          type: 'exponential',
          baseDelayMs: 1000,
          maxDelayMs: 30000,
          jitter: true,
        },
        retryableErrors: ['timeout', 'ECONNREFUSED'],
        retryableExitCodes: [1],
      });

      try {
        const task: ExecutionTask = {
          id: 'test-task-2',
          type: 'issue',
          prompt: 'List the files in the current directory.',
          workDir: tempDir,
          priority: 0,
          dependencies: [],
          config: {},
          createdAt: new Date(),
        };

        const result = await executor.executeTask(task);

        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        expect(result.totalAttempts).toBeGreaterThanOrEqual(1);
        expect(result.totalAttempts).toBeLessThanOrEqual(3);
      } finally {
        await engine.shutdown();
      }
    }, 120000);

    it('executes multi-step workflow', async () => {
      const processConfig = adapter.buildProcessConfig({
        codexPath: CODEX_PATH,
        workDir: tempDir,
        exec: true,
        json: true,
        fullAuto: true,
        skipGitRepoCheck: true,
      });

      const processManager = createProcessManager({
        ...processConfig,
        mode: 'structured',
        timeout: 60000,
      });

      const engine = new SimpleExecutionEngine(processManager, {
        defaultProcessConfig: processConfig,
      });
      const executor = new ResilientExecutor(engine);
      const orchestrator = new LinearOrchestrator(executor);

      try {
        const workflow: WorkflowDefinition = {
          id: 'test-workflow-1',
          steps: [
            {
              id: 'step-1',
              taskType: 'issue',
              prompt: 'What is 5 + 3?',
              taskConfig: {},
            },
            {
              id: 'step-2',
              taskType: 'issue',
              prompt: 'What is 10 - 2?',
              taskConfig: {},
              dependencies: ['step-1'],
            },
          ],
          config: {
            checkpointInterval: 1,
            continueOnStepFailure: false,
          },
        };

        const executionId = await orchestrator.startWorkflow(workflow, tempDir, {
          executionId: `workflow-test-${Date.now()}`,
        });
        const execution = await orchestrator.waitForWorkflow(executionId);

        expect(execution).toBeDefined();
        expect(execution.status).toBe('completed');
        expect(execution.stepResults).toHaveLength(2);
        expect(execution.stepResults[0].success).toBe(true);
        expect(execution.stepResults[1].success).toBe(true);
      } finally {
        await engine.shutdown();
      }
    }, 180000); // 3 minute timeout for workflow
  });

  describe('Tool Status Tracking', () => {
    /**
     * NOTE: Codex tool status tracking is not yet implemented.
     *
     * The CodexExecutor currently has a TODO in normalizeOutput() to implement
     * proper Codex event parsing. All output is currently emitted as assistant_message.
     *
     * Once Codex JSON event schema documentation is available, this test should be
     * updated to verify:
     * 1. Tool use entries are created with status: 'running'
     * 2. Tool completion events update status to 'success' or 'failed'
     * 3. Tool results are properly captured
     *
     * See: src/agents/codex/executor.ts:177 for the TODO
     */
    it.skip('should track tool status from running to success/failed (NOT YET IMPLEMENTED)', async () => {
      // This test is skipped until Codex normalizer is fully implemented
      // with proper tool_use event parsing similar to Claude and Cursor normalizers

      const processConfig = adapter.buildProcessConfig({
        codexPath: CODEX_PATH,
        workDir: tempDir,
        exec: true,
        json: true,
        fullAuto: true,
        skipGitRepoCheck: true,
      });

      const processManager = createProcessManager({
        ...processConfig,
        mode: 'structured',
        timeout: 60000,
      });

      const engine = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 1,
        defaultProcessConfig: processConfig,
      });

      try {
        const task: ExecutionTask = {
          id: 'test-tool-status',
          type: 'issue',
          prompt: 'List the files in the current directory using ls command',
          workDir: tempDir,
          priority: 0,
          dependencies: [],
          config: {},
          createdAt: new Date(),
        };

        const taskId = await engine.submitTask(task);
        const result = await engine.waitForTask(taskId);

        // When implemented, verify:
        // 1. result.output contains tool_use entries
        // 2. Tool entries transition from running -> success/failed
        // 3. Tool results contain command output

        expect(result).toBeDefined();
        expect(result.success).toBe(true);

        // TODO: Add assertions for tool status tracking once implemented
        // const toolEntries = parseToolEntries(result.output);
        // expect(toolEntries.some(t => t.status === 'success' || t.status === 'failed')).toBe(true);
      } finally {
        await engine.shutdown();
      }
    }, 120000);
  });

  describe('Agent Adapter Integration', () => {
    it('uses CodexAdapter to validate config', () => {
      // Test validation
      const invalidConfig = {
        workDir: tempDir,
        json: true,
        experimentalJson: true, // Conflict with json
      };

      const errors = adapter.validateConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Cannot use both json and experimentalJson flags');
    });

    it('uses CodexAdapter to build valid config', () => {
      const config = adapter.buildProcessConfig({
        codexPath: CODEX_PATH,
        workDir: tempDir,
        exec: true,
        json: true,
        fullAuto: true,
        skipGitRepoCheck: true,
      });

      expect(config.executablePath).toBe(CODEX_PATH);
      expect(config.args).toContain('exec');
      expect(config.args).toContain('--json');
      expect(config.args).toContain('--full-auto');
      expect(config.args).toContain('--skip-git-repo-check');
      expect(config.workDir).toBe(tempDir);
    });

    it('gets default config from adapter', () => {
      const defaults = adapter.getDefaultConfig();
      expect(defaults.codexPath).toBe('codex');
      expect(defaults.exec).toBe(true);
      expect(defaults.json).toBe(true);
      expect(defaults.fullAuto).toBe(true);
      expect(defaults.skipGitRepoCheck).toBe(false);
      expect(defaults.yolo).toBe(false);
    });

    it('validates conflicting flags', () => {
      // Test fullAuto + sandbox conflict
      const errors1 = adapter.validateConfig({
        workDir: tempDir,
        fullAuto: true,
        sandbox: 'workspace-write',
      });
      expect(errors1).toHaveLength(1);
      expect(errors1[0]).toContain('fullAuto cannot be used with sandbox');

      // Test yolo + fullAuto conflict
      const errors2 = adapter.validateConfig({
        workDir: tempDir,
        yolo: true,
        fullAuto: true,
      });
      expect(errors2).toHaveLength(1);
      expect(errors2[0]).toContain('yolo flag cannot be used with');
    });

    it('validates sandbox and approval values', () => {
      // Valid sandbox values
      const validSandbox = ['read-only', 'workspace-write', 'danger-full-access'];
      validSandbox.forEach((value) => {
        const errors = adapter.validateConfig({
          workDir: tempDir,
          sandbox: value as any,
        });
        expect(errors).toEqual([]);
      });

      // Valid approval values
      const validApproval = ['untrusted', 'on-failure', 'on-request', 'never'];
      validApproval.forEach((value) => {
        const errors = adapter.validateConfig({
          workDir: tempDir,
          askForApproval: value as any,
        });
        expect(errors).toEqual([]);
      });
    });
  });
});
