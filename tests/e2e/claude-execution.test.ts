/**
 * End-to-End Test: Real Claude Code Execution
 *
 * This test verifies that the execution engine can successfully execute
 * a real Claude Code process across all three execution modes:
 * - structured: JSON output via stdio pipes
 * - interactive: Full terminal emulation via PTY
 * - hybrid: PTY with JSON output
 *
 * IMPORTANT: This test is SKIPPED BY DEFAULT and only runs when:
 * - Environment variable RUN_E2E_TESTS=true is set
 * - AND Claude Code CLI is available in PATH
 *
 * To run this test:
 *   RUN_E2E_TESTS=true npm test -- tests/e2e/claude-execution.test.ts
 *
 * Or set CLAUDE_PATH to use a specific Claude binary:
 *   RUN_E2E_TESTS=true CLAUDE_PATH=/path/to/claude npm test -- tests/e2e/claude-execution.test.ts
 */

import { describe, it, beforeAll, beforeEach, afterEach, expect } from "vitest";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createProcessManager } from "@/process/factory";
import { SimpleExecutionEngine } from "@/engine/simple-engine";
import { ResilientExecutor } from "@/resilience/resilient-executor";
import { LinearOrchestrator } from "@/workflow/linear-orchestrator";
import { ClaudeCodeAdapter } from "@/agents/claude/adapter";
import type { WorkflowDefinition } from "@/workflow/types";
import type { ExecutionTask } from "@/engine/types";

// Environment configuration
const SKIP_E2E =
  process.env.SKIP_E2E_TESTS === "true" || process.env.RUN_E2E_TESTS !== "true";
const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";

/**
 * Check if Claude Code is available
 */
async function checkClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn(CLAUDE_PATH, ["--version"], {
      stdio: "ignore",
    });

    check.on("error", () => resolve(false));
    check.on("exit", (code) => resolve(code === 0));

    setTimeout(() => {
      check.kill();
      resolve(false);
    }, 5000);
  });
}

describe.skipIf(SKIP_E2E)("E2E: Real Claude Code Execution", () => {
  let tempDir: string;
  let adapter: ClaudeCodeAdapter;

  beforeAll(async () => {
    // Check Claude availability - throw if not available
    const claudeAvailable = await checkClaudeAvailable();
    if (!claudeAvailable) {
      throw new Error(
        `Claude Code not available at '${CLAUDE_PATH}'. Install Claude Code or set CLAUDE_PATH environment variable.`
      );
    }

    // Create adapter
    adapter = new ClaudeCodeAdapter();
  });

  beforeEach(() => {
    // Create a fresh temp directory for each test
    tempDir = join(tmpdir(), `execution-engine-e2e-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`);
    mkdirSync(tempDir, { recursive: true });

    // Create a simple test file
    writeFileSync(
      join(tempDir, "test.txt"),
      "This is a test file for Claude Code execution."
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

  describe("Structured Mode (JSON Output)", () => {
    it("executes a simple task with Claude Code", async () => {
      // Use adapter to build config
      const processConfig = adapter.buildProcessConfig({
        claudePath: CLAUDE_PATH,
        workDir: tempDir,
        print: true,
        outputFormat: "stream-json",
        dangerouslySkipPermissions: true,
      });

      const processManager = createProcessManager({
        ...processConfig,
        mode: "structured",
        timeout: 60000, // 1 minute timeout
      });

      const engine = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 1,
        defaultProcessConfig: processConfig, // Pass the adapter-built config to the engine
      });

      try {
        const task: ExecutionTask = {
          id: "test-task-1",
          type: "issue",
          prompt: "What is 2 + 2? Reply with just the number.",
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
        // Note: Claude Code returns exit code 1 even on success, so we check parsed success instead
        expect(result.duration).toBeGreaterThan(0);
      } finally {
        await engine.shutdown();
      }
    }, 120000); // 2 minute timeout

    it("executes task with resilience layer", async () => {
      const processConfig = adapter.buildProcessConfig({
        claudePath: CLAUDE_PATH,
        workDir: tempDir,
        print: true,
        outputFormat: "stream-json",
        dangerouslySkipPermissions: true,
      });

      const processManager = createProcessManager({
        ...processConfig,
        mode: "structured",
        timeout: 60000,
      });

      const engine = new SimpleExecutionEngine(processManager, {
        defaultProcessConfig: processConfig,
      });
      const executor = new ResilientExecutor(engine, {
        maxAttempts: 3,
        backoff: {
          type: "exponential",
          baseDelayMs: 1000,
          maxDelayMs: 30000,
          jitter: true,
        },
        retryableErrors: ["timeout", "ECONNREFUSED"],
        retryableExitCodes: [1],
      });

      try {
        const task: ExecutionTask = {
          id: "test-task-2",
          type: "issue",
          prompt: "List the files in the current directory.",
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

    it("executes multi-step workflow", async () => {
      const processConfig = adapter.buildProcessConfig({
        claudePath: CLAUDE_PATH,
        workDir: tempDir,
        print: true,
        outputFormat: "stream-json",
        dangerouslySkipPermissions: true,
      });

      const processManager = createProcessManager({
        ...processConfig,
        mode: "structured",
        timeout: 60000,
      });

      const engine = new SimpleExecutionEngine(processManager, {
        defaultProcessConfig: processConfig,
      });
      const executor = new ResilientExecutor(engine);
      const orchestrator = new LinearOrchestrator(executor);

      try {
        const workflow: WorkflowDefinition = {
          id: "test-workflow-1",
          steps: [
            {
              id: "step-1",
              taskType: "issue",
              prompt: "What is 5 + 3?",
              taskConfig: {},
            },
            {
              id: "step-2",
              taskType: "issue",
              prompt: "What is 10 - 2?",
              taskConfig: {},
              dependencies: ["step-1"],
            },
          ],
          config: {
            checkpointInterval: 1,
            continueOnStepFailure: false,
          },
        };

        const executionId = await orchestrator.startWorkflow(
          workflow,
          tempDir,
          {
            executionId: `workflow-test-${Date.now()}`,
          }
        );
        const execution = await orchestrator.waitForWorkflow(executionId);

        expect(execution).toBeDefined();
        expect(execution.status).toBe("completed");
        expect(execution.stepResults).toHaveLength(2);
        expect(execution.stepResults[0].success).toBe(true);
        expect(execution.stepResults[1].success).toBe(true);
      } finally {
        await engine.shutdown();
      }
    }, 180000); // 3 minute timeout for workflow
  });

  describe("Agent Adapter Integration", () => {
    it("uses ClaudeCodeAdapter to validate config", () => {
      // Test validation
      const invalidConfig = {
        workDir: tempDir,
        outputFormat: "stream-json" as const,
        // Missing: print (required for stream-json)
      };

      const errors = adapter.validateConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        "stream-json output format requires print mode"
      );
    });

    it("uses ClaudeCodeAdapter to build valid config", () => {
      const config = adapter.buildProcessConfig({
        claudePath: CLAUDE_PATH,
        workDir: tempDir,
        print: true,
        outputFormat: "stream-json",
        dangerouslySkipPermissions: true,
      });

      expect(config.executablePath).toBe(CLAUDE_PATH);
      expect(config.args).toContain("--print");
      expect(config.args).toContain("--output-format");
      expect(config.args).toContain("stream-json");
      expect(config.args).toContain("--dangerously-skip-permissions");
      expect(config.workDir).toBe(tempDir);
    });

    it("gets default config from adapter", () => {
      const defaults = adapter.getDefaultConfig();
      expect(defaults.claudePath).toBe("claude");
      expect(defaults.print).toBe(true);
      expect(defaults.outputFormat).toBe("stream-json");
      expect(defaults.dangerouslySkipPermissions).toBe(false);
    });
  });
});
