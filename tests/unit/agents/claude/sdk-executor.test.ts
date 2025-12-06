/**
 * ClaudeSDKExecutor Tests
 *
 * Tests for SDK-based Claude executor.
 * The SDK is mocked since it's an optional dependency.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClaudeSDKExecutor } from "@/agents/claude/sdk-executor";
import type { ExecutionTask } from "@/engine/types";

// Mock the SDK module
const mockInterrupt = vi.fn().mockResolvedValue(undefined);

// Create a mock iterator that doesn't complete immediately
function createMockQueryIterator() {
  let resolveNext: ((value: IteratorResult<unknown>) => void) | null = null;
  let completed = false;

  const iterator = {
    next: vi.fn().mockImplementation(() => {
      if (completed) {
        return Promise.resolve({ done: true, value: undefined });
      }
      // Return a promise that won't resolve until we want it to
      return new Promise((resolve) => {
        resolveNext = resolve;
      });
    }),
    return: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    throw: vi.fn(),
    [Symbol.asyncIterator]: function () {
      return this;
    },
    interrupt: mockInterrupt,
    // Helper to complete the iterator
    _complete: () => {
      completed = true;
      if (resolveNext) {
        resolveNext({ done: true, value: undefined });
      }
    },
  };

  return iterator;
}

let mockQueryIterator: ReturnType<typeof createMockQueryIterator>;

const mockQuery = vi.fn().mockImplementation(() => {
  mockQueryIterator = createMockQueryIterator();
  return mockQueryIterator;
});

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
}));

describe("ClaudeSDKExecutor", () => {
  let executor: ClaudeSDKExecutor;

  beforeEach(() => {
    vi.clearAllMocks();

    executor = new ClaudeSDKExecutor({
      workDir: "/test/project",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create executor with config", () => {
      const exec = new ClaudeSDKExecutor({
        workDir: "/test",
      });

      expect(exec).toBeInstanceOf(ClaudeSDKExecutor);
    });

    it("should create executor with extended config", () => {
      const exec = new ClaudeSDKExecutor({
        workDir: "/test",
        model: "claude-opus-4-5-20251101",
        dangerouslySkipPermissions: true,
      });

      expect(exec).toBeInstanceOf(ClaudeSDKExecutor);
    });
  });

  describe("getCapabilities", () => {
    it("should return correct capabilities", () => {
      const caps = executor.getCapabilities();

      expect(caps).toEqual({
        supportsSessionResume: true,
        requiresSetup: false,
        supportsApprovals: true,
        supportsMcp: true,
        protocol: "stream-json",
        supportsMidExecutionMessages: true,
      });
    });
  });

  describe("checkAvailability", () => {
    it("should return true when SDK is available", async () => {
      const available = await executor.checkAvailability();
      expect(available).toBe(true);
    });

    it("should cache availability result", async () => {
      await executor.checkAvailability();
      await executor.checkAvailability();

      // SDK import only happens once
      expect(await executor.checkAvailability()).toBe(true);
    });
  });

  describe("executeTask", () => {
    const task: ExecutionTask = {
      id: "test-1",
      type: "custom",
      prompt: "Build a feature",
      workDir: "/test/project",
      config: {},
    };

    it("should call SDK query with prompt", async () => {
      const spawned = await executor.executeTask(task);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(spawned.process).toBeDefined();
      expect(spawned.process.status).toBe("busy");
    });

    it("should pass workDir to SDK options", async () => {
      await executor.executeTask(task);

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.workDir).toBe("/test/project");
    });

    it("should set permissionMode to default", async () => {
      await executor.executeTask(task);

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.permissionMode).toBe("default");
    });

    it("should set permissionMode to bypass when dangerouslySkipPermissions is true", async () => {
      const unsafeExecutor = new ClaudeSDKExecutor({
        workDir: "/test",
        dangerouslySkipPermissions: true,
      });

      await unsafeExecutor.executeTask(task);

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.permissionMode).toBe("bypassPermissions");
    });

    it("should pass model to SDK options", async () => {
      const modelExecutor = new ClaudeSDKExecutor({
        workDir: "/test",
        model: "claude-opus-4-5-20251101",
      });

      await modelExecutor.executeTask(task);

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.model).toBe("claude-opus-4-5-20251101");
    });

    it("should create virtual streams", async () => {
      const spawned = await executor.executeTask(task);

      expect(spawned.process.streams).toBeDefined();
      expect(spawned.process.streams?.stdout).toBeDefined();
      expect(spawned.process.streams?.stderr).toBeDefined();
      expect(spawned.process.streams?.stdin).toBeDefined();
    });

    it("should generate unique process ID", async () => {
      const spawned1 = await executor.executeTask(task);
      const spawned2 = await executor.executeTask(task);

      expect(spawned1.process.id).not.toBe(spawned2.process.id);
    });
  });

  describe("resumeTask", () => {
    const task: ExecutionTask = {
      id: "test-2",
      type: "custom",
      prompt: "Continue work",
      workDir: "/test/project",
      config: {},
    };

    it("should pass resume session ID to SDK options", async () => {
      await executor.resumeTask(task, "sess-abc123");

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.resume).toBe("sess-abc123");
    });

    it("should pass workDir to SDK options", async () => {
      await executor.resumeTask(task, "sess-abc123");

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.workDir).toBe("/test/project");
    });
  });

  describe("sendMessage", () => {
    const task: ExecutionTask = {
      id: "test-3",
      type: "custom",
      prompt: "Initial prompt",
      workDir: "/test/project",
      config: {},
    };

    it("should push message to queue", async () => {
      const spawned = await executor.executeTask(task);

      // Should not throw
      await executor.sendMessage(spawned.process, "Additional guidance");
    });

    it("should throw if process has no message queue", async () => {
      const fakeProcess = {
        id: "fake",
        pid: 123,
        status: "busy" as const,
        spawnedAt: new Date(),
        lastActivity: new Date(),
        exitCode: null,
        signal: null,
        process: null,
        streams: null,
        metrics: { totalDuration: 0, tasksCompleted: 0, successRate: 0 },
      };

      await expect(
        executor.sendMessage(fakeProcess, "Test")
      ).rejects.toThrow("Process does not have message queue");
    });
  });

  describe("interrupt", () => {
    const task: ExecutionTask = {
      id: "test-4",
      type: "custom",
      prompt: "Long task",
      workDir: "/test/project",
      config: {},
    };

    it("should call SDK interrupt method", async () => {
      const spawned = await executor.executeTask(task);

      await executor.interrupt(spawned.process);

      expect(mockInterrupt).toHaveBeenCalled();
    });

    it("should update process status to idle", async () => {
      const spawned = await executor.executeTask(task);

      await executor.interrupt(spawned.process);

      expect(spawned.process.status).toBe("idle");
    });

    it("should close message queue", async () => {
      const spawned = await executor.executeTask(task);

      await executor.interrupt(spawned.process);

      // Sending another message should fail
      await expect(
        executor.sendMessage(spawned.process, "After interrupt")
      ).rejects.toThrow("Message queue is closed");
    });
  });

  describe("normalizeOutput", () => {
    it("should normalize system messages", async () => {
      const outputStream = (async function* () {
        yield {
          type: "stdout" as const,
          data: Buffer.from(
            '{"type":"system","subtype":"init","session_id":"sess-123"}\n'
          ),
          timestamp: new Date(),
        };
      })();

      const entries = [];
      for await (const entry of executor.normalizeOutput(
        outputStream,
        "/test"
      )) {
        entries.push(entry);
      }

      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].type.kind).toBe("system_message");
    });

    it("should normalize assistant messages", async () => {
      const outputStream = (async function* () {
        yield {
          type: "stdout" as const,
          data: Buffer.from(
            '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]}}\n'
          ),
          timestamp: new Date(),
        };
      })();

      const entries = [];
      for await (const entry of executor.normalizeOutput(
        outputStream,
        "/test"
      )) {
        entries.push(entry);
      }

      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].type.kind).toBe("assistant_message");
    });

    it("should handle non-JSON lines gracefully", async () => {
      const outputStream = (async function* () {
        yield {
          type: "stdout" as const,
          data: Buffer.from("Plain text output\n"),
          timestamp: new Date(),
        };
      })();

      const entries = [];
      for await (const entry of executor.normalizeOutput(
        outputStream,
        "/test"
      )) {
        entries.push(entry);
      }

      // Should still produce an entry (as system message)
      expect(entries.length).toBe(1);
      expect(entries[0].content).toBe("Plain text output");
    });

    it("should handle multiple messages in one chunk", async () => {
      const outputStream = (async function* () {
        yield {
          type: "stdout" as const,
          data: Buffer.from(
            '{"type":"system","subtype":"init","session_id":"sess-1"}\n{"type":"user","message":{"role":"user","content":"Test"}}\n'
          ),
          timestamp: new Date(),
        };
      })();

      const entries = [];
      for await (const entry of executor.normalizeOutput(
        outputStream,
        "/test"
      )) {
        entries.push(entry);
      }

      expect(entries.length).toBe(2);
    });
  });
});
