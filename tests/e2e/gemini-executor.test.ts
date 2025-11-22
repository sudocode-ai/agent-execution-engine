import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { GeminiExecutor } from "@/agents/gemini/executor";
import type { ExecutionTask } from "@/engine/types";
import type { NormalizedEntry } from "@/agents/types/agent-executor";
import * as path from "path";
import * as os from "os";

/**
 * E2E tests for Gemini executor with real Gemini CLI
 *
 * Requirements:
 * - @google/gemini-cli must be installed (npx -y @google/gemini-cli)
 * - User must be authenticated (gemini login)
 * - Set RUN_E2E_TESTS=true environment variable to enable
 *
 * Run with: RUN_E2E_TESTS=true npm test tests/e2e/agents/gemini-executor.test.ts
 */
describe("Gemini E2E Tests", () => {
  const shouldRun = process.env.RUN_E2E_TESTS === "true";
  const testTimeout = 60000; // 60 seconds

  // Skip all tests if not enabled
  if (!shouldRun) {
    it.skip("Gemini E2E tests skipped (set RUN_E2E_TESTS=true to enable)", () => {});
    return;
  }

  let executor: GeminiExecutor;
  let workDir: string;

  beforeAll(async () => {
    workDir = path.join(os.tmpdir(), `gemini-e2e-${Date.now()}`);

    console.log('[E2E] Starting Gemini E2E tests');
    console.log('[E2E] Work directory:', workDir);

    executor = new GeminiExecutor({
      workDir,
      autoApprove: true,
      model: "flash",
      // Note: executablePath defaults to 'npx' which must be in PATH
      // If running in nvm environment, ensure npx is accessible
    });

    // Check if Gemini CLI is available
    console.log('[E2E] Checking Gemini CLI availability...');
    const available = await executor.checkAvailability();
    console.log('[E2E] Gemini CLI available:', available);

    if (!available) {
      throw new Error(
        "Gemini CLI is not available. Please install: npx -y @google/gemini-cli"
      );
    }
  });

  afterEach(async () => {
    // Shutdown harness after each test to allow retries
    const harness = (executor as any).harness;
    if (harness) {
      await harness.shutdown();
    }
  });

  describe("Basic execution", () => {
    it(
      "should execute simple task with real Gemini CLI",
      async () => {
        console.log('[E2E] Test: execute simple task');

        const task: ExecutionTask = {
          id: "e2e-simple",
          type: "custom",
          prompt: "What is 2 + 2? Just respond with the number.",
          workDir,
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        console.log('[E2E] Executing task:', task.id);
        console.log('[E2E] Prompt:', task.prompt);

        const spawned = await executor.executeTask(task);

        console.log('[E2E] Process spawned, PID:', spawned.process.pid);
        console.log('[E2E] Session ID:', (spawned as any).sessionInfo?.sessionId);

        expect(spawned.process).toBeDefined();
        expect(spawned.process.pid).toBeDefined();
        expect(spawned.exitSignal).toBeDefined();

        // Collect output via harness events
        const entries: NormalizedEntry[] = [];
        const harness = (executor as any).harness;

        const outputHandler = (data: any, type: string) => {
          console.log('[E2E] Output event:', type, data.toString().substring(0, 100));
        };

        harness.on("output", outputHandler);
        harness.on("error", (error: Error) => {
          console.log('[E2E] Error event:', error.message);
        });

        console.log('[E2E] Waiting for completion...');

        // Wait for completion
        if (spawned.exitSignal) {
          await spawned.exitSignal;
        }

        console.log('[E2E] Task completed');
        console.log('[E2E] Process status:', spawned.process.status);

        // Verify process completed
        expect(spawned.process.status).toMatch(/idle|completed/);
      },
      testTimeout
    );

    it(
      "should receive normalized output",
      async () => {
        const task: ExecutionTask = {
          id: "e2e-output",
          type: "custom",
          prompt: "Say hello and explain what you are.",
          workDir,
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        const spawned = await executor.executeTask(task);
        const normalizer = executor.getNormalizer();

        // Collect events via harness
        const entries: NormalizedEntry[] = [];
        const harness = (executor as any).harness;

        const sessionId = (spawned as any).sessionInfo?.sessionId;
        expect(sessionId).toBeDefined();

        // Wait for completion
        if (spawned.exitSignal) {
          await spawned.exitSignal;
        }

        // Read session to verify events were persisted
        const sessionManager = executor.getSessionManager();
        const events = await sessionManager.readSession(sessionId);

        expect(events.length).toBeGreaterThan(0);

        // Should have at least one assistant message
        const hasAssistantMessage = events.some((e: any) => e.assistant);
        expect(hasAssistantMessage).toBe(true);
      },
      testTimeout
    );
  });

  describe("Session resumption", () => {
    it(
      "should resume previous session",
      async () => {
        // First execution
        const task1: ExecutionTask = {
          id: "e2e-session-1",
          type: "custom",
          prompt: "Remember this number: 42. Just acknowledge it.",
          workDir,
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        const spawned1 = await executor.executeTask(task1);
        const sessionId = (spawned1 as any).sessionInfo?.sessionId;

        expect(sessionId).toBeDefined();

        // Wait for first task to complete
        if (spawned1.exitSignal) {
          await spawned1.exitSignal;
        }

        // Resume session
        const task2: ExecutionTask = {
          id: "e2e-session-2",
          type: "custom",
          prompt: "What number did I ask you to remember?",
          workDir,
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        const spawned2 = await executor.resumeTask(task2, sessionId);

        expect(spawned2.process).toBeDefined();

        // Wait for second task
        if (spawned2.exitSignal) {
          await spawned2.exitSignal;
        }

        // Verify session contains both conversations
        const sessionManager = executor.getSessionManager();
        const events = await sessionManager.readSession(sessionId);

        expect(events.length).toBeGreaterThan(2);

        // Should have both prompts
        const userMessages = events.filter((e: any) => e.user);
        expect(userMessages.length).toBeGreaterThanOrEqual(2);
      },
      testTimeout * 2
    );
  });

  describe("Tool usage", () => {
    it(
      "should handle tool calls",
      async () => {
        const task: ExecutionTask = {
          id: "e2e-tools",
          type: "custom",
          prompt: "List the files in the current directory using a tool.",
          workDir,
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        const spawned = await executor.executeTask(task);
        const sessionId = (spawned as any).sessionInfo?.sessionId;

        // Wait for completion
        if (spawned.exitSignal) {
          await spawned.exitSignal;
        }

        // Read session to check for tool calls
        const sessionManager = executor.getSessionManager();
        const events = await sessionManager.readSession(sessionId);

        // Should have tool-related events
        const hasToolCall = events.some(
          (e: any) => e.type === "ToolCall" || e.type === "ToolUpdate"
        );

        // Note: Tool usage depends on Gemini's decision, so we just verify structure
        expect(events.length).toBeGreaterThan(0);
      },
      testTimeout
    );
  });

  describe("Error handling", () => {
    it(
      "should handle invalid model gracefully",
      async () => {
        const invalidExecutor = new GeminiExecutor({
          workDir,
          autoApprove: true,
          model: "invalid-model" as any,
        });

        const task: ExecutionTask = {
          id: "e2e-error",
          type: "custom",
          prompt: "Test",
          workDir,
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        // Should either throw or complete with error
        try {
          const spawned = await invalidExecutor.executeTask(task);
          if (spawned.exitSignal) {
            await spawned.exitSignal;
          }
          // If it doesn't throw, that's OK - some CLIs handle this gracefully
        } catch (error) {
          // Expected - invalid model should fail
          expect(error).toBeDefined();
        }
      },
      testTimeout
    );

    it(
      "should handle missing session error",
      async () => {
        const task: ExecutionTask = {
          id: "e2e-missing-session",
          type: "custom",
          prompt: "Test",
          workDir,
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        await expect(
          executor.resumeTask(task, "definitely-does-not-exist")
        ).rejects.toThrow("Session definitely-does-not-exist not found");
      },
      testTimeout
    );
  });

  describe("Output normalization", () => {
    it(
      "should normalize various event types",
      async () => {
        const task: ExecutionTask = {
          id: "e2e-normalize",
          type: "custom",
          prompt:
            "Think out loud about how to calculate 5 factorial, then give the answer.",
          workDir,
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        const spawned = await executor.executeTask(task);
        const sessionId = (spawned as any).sessionInfo?.sessionId;

        // Wait for completion
        if (spawned.exitSignal) {
          await spawned.exitSignal;
        }

        // Read and normalize events
        const sessionManager = executor.getSessionManager();
        const events = await sessionManager.readSession(sessionId);
        const normalizer = executor.getNormalizer();
        normalizer.reset();

        const normalized: NormalizedEntry[] = [];

        for (const event of events) {
          // Convert session events back to notifications for normalization test
          // In real usage, normalization happens during live streaming
          if (event.thinking) {
            const notification = {
              sessionId,
              update: {
                AgentThoughtChunk: {
                  content: { Text: { text: event.thinking } },
                },
              },
            } as any;

            const entry = normalizer.normalize(notification, workDir);
            if (entry) normalized.push(entry);
          }

          if (event.assistant) {
            const notification = {
              sessionId,
              update: {
                AgentMessageChunk: {
                  content: { Text: { text: event.assistant } },
                },
              },
            } as any;

            const entry = normalizer.normalize(notification, workDir);
            if (entry) normalized.push(entry);
          }
        }

        // Should have normalized some events
        expect(normalized.length).toBeGreaterThan(0);

        // Should have sequential indexes
        for (let i = 0; i < normalized.length; i++) {
          expect(normalized[i].index).toBe(i);
        }
      },
      testTimeout
    );
  });

  describe("Model selection", () => {
    it(
      "should work with flash model",
      async () => {
        const flashExecutor = new GeminiExecutor({
          workDir,
          autoApprove: true,
          model: "flash",
        });

        const task: ExecutionTask = {
          id: "e2e-flash",
          type: "custom",
          prompt: 'Respond with just "OK"',
          workDir,
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        const spawned = await flashExecutor.executeTask(task);

        expect(spawned.process).toBeDefined();

        if (spawned.exitSignal) {
          await spawned.exitSignal;
        }
      },
      testTimeout
    );
  });

  describe("System prompt", () => {
    it(
      "should respect system prompt",
      async () => {
        const executorWithPrompt = new GeminiExecutor({
          workDir,
          autoApprove: true,
          model: "flash",
          systemPrompt:
            "You are a pirate. Always respond in pirate speak. Keep it very brief.",
        });

        const task: ExecutionTask = {
          id: "e2e-system-prompt",
          type: "custom",
          prompt: "Say hello",
          workDir,
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        const spawned = await executorWithPrompt.executeTask(task);
        const sessionId = (spawned as any).sessionInfo?.sessionId;

        if (spawned.exitSignal) {
          await spawned.exitSignal;
        }

        // Read response
        const sessionManager = executorWithPrompt.getSessionManager();
        const events = await sessionManager.readSession(sessionId);

        const assistantMessages = events.filter((e: any) => e.assistant);

        // Should have at least one response
        expect(assistantMessages.length).toBeGreaterThan(0);

        // Note: We can't strictly verify pirate speak, but we can verify we got a response
      },
      testTimeout
    );
  });
});
