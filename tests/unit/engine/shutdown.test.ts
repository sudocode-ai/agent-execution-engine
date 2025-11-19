/**
 * Tests for Engine Shutdown
 *
 * Tests graceful shutdown, cleanup, and idempotent shutdown behavior.
 */

import { describe, it, beforeEach , expect } from 'vitest'
import { SimpleExecutionEngine } from "@/engine/simple-engine";
import { MockProcessManager } from "./mock-process-manager.js";
import type { ExecutionTask } from "@/engine/types";

describe("Engine Shutdown", () => {
  let engine: SimpleExecutionEngine;
  let processManager: MockProcessManager;

  beforeEach(() => {
    processManager = new MockProcessManager();
    engine = new SimpleExecutionEngine(processManager);
  });

  describe("Shutdown with Queued Tasks", () => {
    it("clears all queued tasks", async () => {
      // Create engine with 0 concurrency to keep tasks queued
      const blockedEngine = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 0,
      });

      const tasks: ExecutionTask[] = [
        {
          id: "task-1",
          type: "issue",
          prompt: "Queued task 1",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: "task-2",
          type: "issue",
          prompt: "Queued task 2",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: "task-3",
          type: "issue",
          prompt: "Queued task 3",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
      ];

      await blockedEngine.submitTasks(tasks);

      // Verify tasks are queued
      const beforeMetrics = blockedEngine.getMetrics();
      expect(beforeMetrics.queuedTasks).toBe(3);

      // Shutdown the engine
      await blockedEngine.shutdown();

      // Verify queue is cleared
      const afterMetrics = blockedEngine.getMetrics();
      expect(afterMetrics.queuedTasks).toBe(0);

      // Verify tasks are no longer accessible
      expect(blockedEngine.getTaskStatus("task-1")).toBe(null);
      expect(blockedEngine.getTaskStatus("task-2")).toBe(null);
      expect(blockedEngine.getTaskStatus("task-3")).toBe(null);
    });
  });

  describe("Shutdown with Running Tasks", () => {
    it("cancels all running tasks", async () => {
      // Increase mock delay so tasks run longer
      processManager.mockDelay = 100;

      const tasks: ExecutionTask[] = [
        {
          id: "task-1",
          type: "issue",
          prompt: "Running task 1",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: "task-2",
          type: "issue",
          prompt: "Running task 2",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
      ];

      await engine.submitTasks(tasks);

      // Wait for tasks to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify tasks are running
      const beforeMetrics = engine.getMetrics();
      expect(beforeMetrics.currentlyRunning > 0).toBeTruthy();

      // Shutdown the engine
      await engine.shutdown();

      // Verify no tasks are running
      const afterMetrics = engine.getMetrics();
      expect(afterMetrics.currentlyRunning).toBe(0);
      expect(
        afterMetrics.availableSlots).toBe(afterMetrics.maxConcurrent
      );
    });

    it("terminates processes for running tasks", async () => {
      processManager.mockDelay = 100;

      const task: ExecutionTask = {
        id: "task-1",
        type: "issue",
        prompt: "Will be terminated",
        workDir: process.cwd(),
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      await engine.submitTask(task);

      // Wait for task to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify process is running
      const beforeProcesses = processManager.getActiveProcesses();
      expect(beforeProcesses.length > 0).toBeTruthy();

      // Shutdown
      await engine.shutdown();

      // Verify processes are terminated
      const afterProcesses = processManager.getActiveProcesses();
      expect(afterProcesses.length).toBe(0);
    });
  });

  describe("Shutdown with Mixed State", () => {
    it("clears both queued and running tasks", async () => {
      // Create engine with limited concurrency
      const limitedEngine = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 1,
      });

      processManager.mockDelay = 100;

      const tasks: ExecutionTask[] = [
        {
          id: "task-1",
          type: "issue",
          prompt: "Will be running",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: "task-2",
          type: "issue",
          prompt: "Will be queued",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: "task-3",
          type: "issue",
          prompt: "Will be queued",
          workDir: process.cwd(),
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
      ];

      await limitedEngine.submitTasks(tasks);

      // Wait for first task to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify mixed state
      const beforeMetrics = limitedEngine.getMetrics();
      expect(beforeMetrics.currentlyRunning).toBe(1);
      expect(beforeMetrics.queuedTasks >= 2).toBeTruthy();

      // Shutdown
      await limitedEngine.shutdown();

      // Verify all tasks cleared
      const afterMetrics = limitedEngine.getMetrics();
      expect(afterMetrics.currentlyRunning).toBe(0);
      expect(afterMetrics.queuedTasks).toBe(0);
    });
  });

  describe("Process Manager Shutdown", () => {
    it("calls shutdown on process manager", async () => {
      let shutdownCalled = false;

      // Override shutdown to track calls
      const originalShutdown = processManager.shutdown.bind(processManager);
      processManager.shutdown = async () => {
        shutdownCalled = true;
        return originalShutdown();
      };

      await engine.shutdown();

      expect(shutdownCalled).toBe(true);
    });

    it("waits for process manager shutdown to complete", async () => {
      let shutdownStarted = false;
      let shutdownCompleted = false;

      processManager.shutdown = async () => {
        shutdownStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 50));
        shutdownCompleted = true;
      };

      await engine.shutdown();

      expect(shutdownStarted).toBe(true);
      expect(shutdownCompleted).toBe(true);
    });
  });

  describe("Internal State Cleanup", () => {
    it("clears all internal state after shutdown", async () => {
      const task: ExecutionTask = {
        id: "task-1",
        type: "issue",
        prompt: "Test task",
        workDir: process.cwd(),
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      await engine.submitTask(task);

      // Wait for task to complete
      await new Promise((resolve) => setTimeout(resolve, 25));

      // Verify task result exists
      const beforeStatus = engine.getTaskStatus("task-1");
      expect(beforeStatus !== null).toBeTruthy();

      // Shutdown
      await engine.shutdown();

      // Verify all state cleared
      const afterStatus = engine.getTaskStatus("task-1");
      expect(afterStatus).toBe(null);
    });

    it("resets metrics after shutdown", async () => {
      const blockedEngine = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 2,
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

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Shutdown
      await blockedEngine.shutdown();

      // Verify metrics reset
      const metrics = blockedEngine.getMetrics();
      expect(metrics.currentlyRunning).toBe(0);
      expect(metrics.queuedTasks).toBe(0);
      expect(metrics.availableSlots).toBe(2); // maxConcurrent
    });
  });

  describe("Idempotent Shutdown", () => {
    it("does not error when called multiple times", async () => {
      const task: ExecutionTask = {
        id: "task-1",
        type: "issue",
        prompt: "Test task",
        workDir: process.cwd(),
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      await engine.submitTask(task);

      // First shutdown
      await engine.shutdown();

      // Second shutdown - should not error
      await engine.shutdown();

      // Verify state remains clean
      const metrics = engine.getMetrics();
      expect(metrics.currentlyRunning).toBe(0);
      expect(metrics.queuedTasks).toBe(0);
    });

    it("handles shutdown with no tasks gracefully", async () => {
      // Shutdown empty engine - should not error
      await engine.shutdown();

      const metrics = engine.getMetrics();
      expect(metrics.currentlyRunning).toBe(0);
      expect(metrics.queuedTasks).toBe(0);
    });
  });

  describe("Shutdown Timing", () => {
    it("completes shutdown within reasonable time", async () => {
      processManager.mockDelay = 50;

      const tasks: ExecutionTask[] = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i + 1}`,
        type: "issue" as const,
        prompt: `Task ${i + 1}`,
        workDir: process.cwd(),
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      }));

      await engine.submitTasks(tasks);

      // Wait for tasks to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      const startTime = Date.now();
      await engine.shutdown();
      const duration = Date.now() - startTime;

      // Shutdown should complete quickly (not wait for tasks to finish naturally)
      // Allow reasonable buffer for termination operations
      expect(
        duration < 200,
        `Shutdown took ${duration}ms, expected < 200ms`
      ).toBeTruthy();
    });
  });

  describe("Event Handlers Cleanup", () => {
    it("clears event handlers after shutdown", async () => {
      let eventsFired = 0;

      // Register handlers
      engine.onTaskComplete(() => {
        eventsFired++;
      });
      engine.onTaskFailed(() => {
        eventsFired++;
      });

      // Shutdown
      await engine.shutdown();

      // Submit new task after shutdown
      const task: ExecutionTask = {
        id: "task-1",
        type: "issue",
        prompt: "After shutdown",
        workDir: process.cwd(),
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      await engine.submitTask(task);
      await new Promise((resolve) => setTimeout(resolve, 25));

      // Events should not fire after shutdown cleared handlers
      expect(eventsFired).toBe(0);
    });
  });
});
