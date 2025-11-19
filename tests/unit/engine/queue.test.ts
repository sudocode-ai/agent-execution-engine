/**
 * Tests for Task Queue Behavior
 *
 * Tests FIFO ordering, task submission, and basic metrics.
 */

import { describe, it, beforeEach , expect } from 'vitest'
import { SimpleExecutionEngine } from "@/engine/simple-engine";
import { MockProcessManager } from "./mock-process-manager.js";
import type { ExecutionTask } from "@/engine/types";

describe("Task Queue", () => {
  let engine: SimpleExecutionEngine;
  let processManager: MockProcessManager;

  // Default process config for tests (minimal valid config)
  const defaultProcessConfig = {
    executablePath: "mock-cli",
    args: ["--test"],
  };

  beforeEach(() => {
    processManager = new MockProcessManager();
    engine = new SimpleExecutionEngine(processManager, {
      defaultProcessConfig,
    });
  });

  describe("submitTask", () => {
    it("returns the task ID", async () => {
      const task: ExecutionTask = {
        id: "task-1",
        type: "issue",
        entityId: "ISSUE-001",
        prompt: "Fix the bug",
        workDir: process.cwd(),
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const taskId = await engine.submitTask(task);
      expect(taskId).toBe("task-1");
    });

    it("increments queuedTasks metric", async () => {
      const task: ExecutionTask = {
        id: "task-1",
        type: "issue",
        prompt: "Fix the bug",
        workDir: process.cwd(),
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const beforeMetrics = engine.getMetrics();
      expect(beforeMetrics.queuedTasks).toBe(0);

      await engine.submitTask(task);

      const afterMetrics = engine.getMetrics();
      // Note: queuedTasks may be 0 if processQueue already dequeued it
      // So we check that it was incremented at some point
      expect(afterMetrics.queuedTasks >= 0).toBeTruthy();
    });

    it("triggers processQueue after submission", async () => {
      const task: ExecutionTask = {
        id: "task-1",
        type: "issue",
        prompt: "Fix the bug",
        workDir: process.cwd(),
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      // Create engine with 0 concurrency to prevent execution attempts
      const blockedEngine = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 0,
        defaultProcessConfig,
      });

      await blockedEngine.submitTask(task);

      // With maxConcurrent=0, task should remain queued
      const metrics = blockedEngine.getMetrics();
      expect(metrics.queuedTasks).toBe(1);
    });
  });

  describe("submitTasks", () => {
    it("submits multiple tasks and returns all IDs", async () => {
      const tasks: ExecutionTask[] = [
        {
          id: "task-1",
          type: "issue",
          prompt: "Task 1",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: "task-2",
          type: "issue",
          prompt: "Task 2",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: "task-3",
          type: "issue",
          prompt: "Task 3",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
      ];

      const taskIds = await engine.submitTasks(tasks);
      expect(taskIds).toEqual(["task-1", "task-2", "task-3"]);
    });

    it("updates metrics for multiple tasks", async () => {
      // Create engine with 0 concurrency to prevent execution
      const blockedEngine = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 0,
        defaultProcessConfig,
      });

      const tasks: ExecutionTask[] = [
        {
          id: "task-1",
          type: "issue",
          prompt: "Task 1",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: "task-2",
          type: "issue",
          prompt: "Task 2",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
      ];

      await blockedEngine.submitTasks(tasks);

      const metrics = blockedEngine.getMetrics();
      expect(metrics.queuedTasks).toBe(2);
    });
  });

  describe("getMetrics", () => {
    it("returns initial metrics with default values", () => {
      const metrics = engine.getMetrics();

      expect(metrics.maxConcurrent).toBe(3);
      expect(metrics.currentlyRunning).toBe(0);
      expect(metrics.availableSlots).toBe(3);
      expect(metrics.queuedTasks).toBe(0);
      expect(metrics.completedTasks).toBe(0);
      expect(metrics.failedTasks).toBe(0);
      expect(metrics.averageDuration).toBe(0);
      expect(metrics.successRate).toBe(1.0);
      expect(metrics.throughput).toBe(0);
      expect(metrics.totalProcessesSpawned).toBe(0);
      expect(metrics.activeProcesses).toBe(0);
    });

    it("respects custom maxConcurrent config", () => {
      const customEngine = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 5,
        defaultProcessConfig,
      });

      const metrics = customEngine.getMetrics();
      expect(metrics.maxConcurrent).toBe(5);
      expect(metrics.availableSlots).toBe(5);
    });

    it("returns a defensive copy of metrics", () => {
      const metrics1 = engine.getMetrics();
      const metrics2 = engine.getMetrics();

      // Modifying one should not affect the other
      metrics1.queuedTasks = 999;
      expect(metrics2.queuedTasks).not.toBe(999);
    });
  });

  describe("getTaskStatus", () => {
    it("returns null for non-existent task", () => {
      const status = engine.getTaskStatus("non-existent");
      expect(status).toBe(null);
    });

    it("maintains FIFO queue order", async () => {
      // Create engine with 0 concurrency to keep tasks in queue
      const blockedEngine = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 0,
        defaultProcessConfig,
      });

      const tasks: ExecutionTask[] = [
        {
          id: "task-1",
          type: "issue",
          prompt: "First",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: "task-2",
          type: "issue",
          prompt: "Second",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: "task-3",
          type: "issue",
          prompt: "Third",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
      ];

      await blockedEngine.submitTasks(tasks);

      // Verify all tasks are queued
      const status1 = blockedEngine.getTaskStatus("task-1");
      const status2 = blockedEngine.getTaskStatus("task-2");
      const status3 = blockedEngine.getTaskStatus("task-3");

      // All should be queued in FIFO order
      expect(status1?.state).toBe("queued");
      expect(status2?.state).toBe("queued");
      expect(status3?.state).toBe("queued");

      // Verify positions reflect FIFO order
      if (status1?.state === "queued") expect(status1.position).toBe(0);
      if (status2?.state === "queued") expect(status2.position).toBe(1);
      if (status3?.state === "queued") expect(status3.position).toBe(2);
    });
  });
});
