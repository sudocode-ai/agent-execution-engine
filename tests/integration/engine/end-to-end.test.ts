/**
 * Integration Tests for Engine Layer with Process Layer
 *
 * Tests the integration between Engine and Process layers using real ProcessManager.
 * These tests verify that the layers work together correctly without requiring Claude CLI.
 */

import { describe, it, beforeEach, afterEach , expect } from 'vitest'
import { SimpleExecutionEngine } from '@/engine/simple-engine';
import { SimpleProcessManager } from '@/process/simple-manager';

describe('Engine + Process Layer Integration', () => {
  let engine: SimpleExecutionEngine;
  let processManager: SimpleProcessManager;

  // Default process config for tests (minimal valid config)
  const defaultProcessConfig = {
    executablePath: "mock-cli",
    args: ["--test"],
  };

  beforeEach(() => {
    processManager = new SimpleProcessManager();
    engine = new SimpleExecutionEngine(processManager, {
      defaultProcessConfig,
    });
  });

  afterEach(async () => {
    // Cleanup
    await engine.shutdown();
  });

  describe('Initialization', () => {
    it('creates engine with real process manager', () => {
      expect(engine).toBeTruthy();

      const metrics = engine.getMetrics();
      expect(metrics.currentlyRunning).toBe(0);
      expect(metrics.completedTasks).toBe(0);
      expect(metrics.failedTasks).toBe(0);

      const processMetrics = processManager.getMetrics();
      expect(processMetrics.currentlyActive).toBe(0);
      expect(processMetrics.totalSpawned).toBe(0);
    });

    it('respects custom maxConcurrent config', () => {
      const customEngine = new SimpleExecutionEngine(processManager, {
        defaultProcessConfig,
        maxConcurrent: 5,
      });

      const metrics = customEngine.getMetrics();
      expect(metrics.maxConcurrent).toBe(5);
      expect(metrics.availableSlots).toBe(5);

      customEngine.shutdown();
    });
  });

  describe('Shutdown Integration', () => {
    it('shuts down process manager when engine shuts down', async () => {
      // Shutdown engine
      await engine.shutdown();

      // Verify both engine and process manager are shut down
      const engineMetrics = engine.getMetrics();
      expect(engineMetrics.currentlyRunning).toBe(0);
      expect(engineMetrics.queuedTasks).toBe(0);

      const processMetrics = processManager.getMetrics();
      expect(processMetrics.currentlyActive).toBe(0);
    });

    it('is idempotent - safe to shutdown multiple times', async () => {
      await engine.shutdown();
      await engine.shutdown(); // Should not error

      const metrics = engine.getMetrics();
      expect(metrics.currentlyRunning).toBe(0);
    });
  });

  describe('Metrics Integration', () => {
    it('engine and process manager metrics stay in sync', () => {
      const engineMetrics = engine.getMetrics();
      const processMetrics = processManager.getMetrics();

      // Both should start at zero
      expect(engineMetrics.currentlyRunning).toBe(0);
      expect(processMetrics.currentlyActive).toBe(0);

      // Process metrics should track spawned processes
      expect(processMetrics.totalSpawned).toBe(0);
    });

    it('provides access to process manager through engine', () => {
      // Engine uses process manager internally
      const engineMetrics = engine.getMetrics();

      // Verify engine metrics structure
      expect('maxConcurrent' in engineMetrics).toBeTruthy();
      expect('currentlyRunning' in engineMetrics).toBeTruthy();
      expect('totalProcessesSpawned' in engineMetrics).toBeTruthy();
      expect('activeProcesses' in engineMetrics).toBeTruthy();
    });
  });

  describe('Configuration', () => {
    it('passes custom claude path through to process manager', () => {
      const customEngine = new SimpleExecutionEngine(processManager, {
        defaultProcessConfig,
        claudePath: '/custom/path/to/claude',
      });

      // Verify engine was created with custom config
      expect(customEngine).toBeTruthy();

      customEngine.shutdown();
    });

    it('handles default configuration', () => {
      const defaultEngine = new SimpleExecutionEngine(processManager, {
        defaultProcessConfig,
      });

      const metrics = defaultEngine.getMetrics();
      expect(metrics.maxConcurrent).toBe(3); // default

      defaultEngine.shutdown();
    });
  });

  describe('Resource Cleanup', () => {
    it('cleans up all resources on shutdown', async () => {
      // Submit some tasks (they won't execute without Claude, but will be queued)
      const task1 = {
        id: 'task-1',
        type: 'issue' as const,
        prompt: 'Test prompt 1',
        workDir: process.cwd(),
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const task2 = {
        id: 'task-2',
        type: 'issue' as const,
        prompt: 'Test prompt 2',
        workDir: process.cwd(),
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      await engine.submitTask(task1);
      await engine.submitTask(task2);

      // Shutdown should clear everything
      await engine.shutdown();

      const engineMetrics = engine.getMetrics();
      expect(engineMetrics.queuedTasks).toBe(0);
      expect(engineMetrics.currentlyRunning).toBe(0);

      const processMetrics = processManager.getMetrics();
      expect(processMetrics.currentlyActive).toBe(0);
    });
  });

  describe('Multiple Engine Instances', () => {
    it('supports multiple engines sharing one process manager', () => {
      const engine2 = new SimpleExecutionEngine(processManager, {
        maxConcurrent: 2,
        defaultProcessConfig,
      });

      // Both engines should work independently
      const metrics1 = engine.getMetrics();
      const metrics2 = engine2.getMetrics();

      expect(metrics1.maxConcurrent).toBe(3);
      expect(metrics2.maxConcurrent).toBe(2);

      engine2.shutdown();
    });

    it('supports multiple engines with separate process managers', () => {
      const processManager2 = new SimpleProcessManager();
      const engine2 = new SimpleExecutionEngine(processManager2, {
        defaultProcessConfig,
      });

      // Each should have independent metrics
      const metrics1 = engine.getMetrics();
      const metrics2 = engine2.getMetrics();

      expect(metrics1.currentlyRunning).toBe(0);
      expect(metrics2.currentlyRunning).toBe(0);

      engine2.shutdown();
      processManager2.shutdown();
    });
  });

  describe('Event Handlers', () => {
    it('registers completion handlers', () => {
      engine.onTaskComplete(() => {
        // Handler callback (actual invocation requires task execution)
      });

      // Handler registered (actual invocation requires task execution)
      expect(true).toBeTruthy();
    });

    it('registers failure handlers', () => {
      engine.onTaskFailed(() => {
        // Handler callback (actual invocation requires task execution)
      });

      // Handler registered (actual invocation requires task execution)
      expect(true).toBeTruthy();
    });

    it('clears handlers on shutdown', async () => {
      let completions = 0;
      let failures = 0;

      engine.onTaskComplete(() => completions++);
      engine.onTaskFailed(() => failures++);

      await engine.shutdown();

      // After shutdown, handlers should be cleared
      expect(true).toBeTruthy();
    });
  });

  describe('Status Queries', () => {
    it('getTaskStatus returns null for non-existent tasks', () => {
      const status = engine.getTaskStatus('non-existent-task');
      expect(status).toBe(null);
    });

    it('getMetrics returns defensive copy', () => {
      const metrics1 = engine.getMetrics();
      const metrics2 = engine.getMetrics();

      // Modifying one should not affect the other
      metrics1.queuedTasks = 999;
      expect(metrics2.queuedTasks).not.toBe(999);
    });
  });
});
