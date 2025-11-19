/**
 * Integration Tests for Resilience Layer with Engine Layer
 *
 * Tests that ResilientExecutor correctly integrates with the Engine Layer API.
 * Uses mock engine to verify integration without requiring actual process execution.
 */

import { describe, it, beforeEach , expect } from 'vitest'
import { ResilientExecutor } from '@/resilience/resilient-executor';
import type { IExecutionEngine } from '@/engine/engine';
import type {
  ExecutionTask,
  ExecutionResult,
  TaskStatus,
  EngineMetrics,
  TaskCompleteHandler,
  TaskFailedHandler,
} from '@/engine/types';
import type { RetryPolicy } from '@/resilience/types';

/**
 * Mock Engine for Integration Testing
 *
 * Simulates engine behavior to test resilience layer integration
 */
class MockIntegrationEngine implements IExecutionEngine {
  private taskCounter = 0;
  private submittedTasks: ExecutionTask[] = [];
  private callCount = 0;
  public failuresBeforeSuccess = 0; // How many times to fail before succeeding

  async submitTask(task: ExecutionTask): Promise<string> {
    this.submittedTasks.push(task);
    return `task-${this.taskCounter++}`;
  }

  async submitTasks(tasks: ExecutionTask[]): Promise<string[]> {
    return Promise.all(tasks.map((t) => this.submitTask(t)));
  }

  async cancelTask(_taskId: string): Promise<void> {
    // Not implemented
  }

  getTaskStatus(_taskId: string): TaskStatus | null {
    return null;
  }

  async waitForTask(taskId: string): Promise<ExecutionResult> {
    // Simulate task execution
    await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay

    const task = this.submittedTasks[this.submittedTasks.length - 1];
    this.callCount++;

    if (this.callCount <= this.failuresBeforeSuccess) {
      // Still failing
      return {
        taskId: task.id,
        executionId: taskId,
        success: false,
        exitCode: 1,
        output: '',
        error: 'Temporary failure',
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 10,
      };
    }

    // Success
    return {
      taskId: task.id,
      executionId: taskId,
      success: true,
      exitCode: 0,
      output: 'Success',
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 10,
    };
  }

  async waitForTasks(taskIds: string[]): Promise<ExecutionResult[]> {
    return Promise.all(taskIds.map((id) => this.waitForTask(id)));
  }

  getMetrics(): EngineMetrics {
    return {
      maxConcurrent: 3,
      currentlyRunning: 0,
      availableSlots: 3,
      queuedTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageDuration: 0,
      successRate: 1,
      throughput: 0,
      totalProcessesSpawned: 0,
      activeProcesses: 0,
    };
  }

  onTaskComplete(_handler: TaskCompleteHandler): void {
    // Not implemented
  }

  onTaskFailed(_handler: TaskFailedHandler): void {
    // Not implemented
  }

  async shutdown(): Promise<void> {
    this.submittedTasks = [];
    this.taskCounter = 0;
    this.callCount = 0;
  }

  getSubmittedTasks(): ExecutionTask[] {
    return this.submittedTasks;
  }

  reset(): void {
    this.callCount = 0;
    this.failuresBeforeSuccess = 0;
  }
}

describe('Resilience Layer Integration with Engine Layer', () => {
  let mockEngine: MockIntegrationEngine;
  let executor: ResilientExecutor;

  beforeEach(() => {
    mockEngine = new MockIntegrationEngine();
    executor = new ResilientExecutor(mockEngine);
  });

  describe('API Integration', () => {
    it('should correctly call engine submitTask and waitForTask', async () => {
      const task: ExecutionTask = {
        id: 'test-task',
        type: 'issue',
        prompt: 'Test prompt',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const result = await executor.executeTask(task);

      // Verify engine methods were called
      const submittedTasks = mockEngine.getSubmittedTasks();
      expect(submittedTasks.length).toBe(1);
      expect(submittedTasks[0].id).toBe('test-task');
      expect(result.success).toBe(true);
    });

    it('should retry through engine on failure', async () => {
      // Configure mock to fail twice, then succeed
      mockEngine.failuresBeforeSuccess = 2;

      const task: ExecutionTask = {
        id: 'retry-task',
        type: 'issue',
        prompt: 'Test prompt',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const policy: RetryPolicy = {
        maxAttempts: 5,
        backoff: {
          type: 'fixed',
          baseDelayMs: 10,
          maxDelayMs: 100,
          jitter: false,
        },
        retryableErrors: [],
        retryableExitCodes: [1],
      };

      const result = await executor.executeTask(task, policy);

      // Verify retries happened
      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(3); // Failed 2 times, succeeded on 3rd
      expect(mockEngine.getSubmittedTasks().length).toBe(3);
    });

    it('should handle circuit breaker with engine', async () => {
      const policy: RetryPolicy = {
        maxAttempts: 1,
        backoff: {
          type: 'fixed',
          baseDelayMs: 10,
          maxDelayMs: 100,
          jitter: false,
        },
        retryableErrors: [],
        retryableExitCodes: [],
      };

      // Make mock always fail
      mockEngine.failuresBeforeSuccess = 1000;

      // Execute 5 failing tasks to open circuit
      for (let i = 0; i < 5; i++) {
        const task: ExecutionTask = {
          id: `fail-${i}`,
          type: 'spec',
          prompt: 'Test',
          workDir: '/test',
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };
        await executor.executeTask(task, policy);
      }

      // Circuit should be open
      const breaker = executor.getCircuitBreaker('spec');
      expect(breaker !== null).toBeTruthy();
      expect(breaker?.state).toBe('open');

      // Next task should be blocked
      const blockedTask: ExecutionTask = {
        id: 'blocked',
        type: 'spec',
        prompt: 'Test',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const result = await executor.executeTask(blockedTask, policy);
      expect(result.circuitBreakerTriggered).toBe(true);
    });

    it('should execute multiple tasks through engine', async () => {
      const tasks: ExecutionTask[] = [
        {
          id: 'task-1',
          type: 'issue',
          prompt: 'Test 1',
          workDir: '/test',
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: 'task-2',
          type: 'issue',
          prompt: 'Test 2',
          workDir: '/test',
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
      ];

      const results = await executor.executeTasks(tasks);

      expect(results.length).toBe(2);
      expect(mockEngine.getSubmittedTasks().length).toBe(2);
      expect(results.every((r) => r.success)).toBeTruthy();
    });
  });

  describe('Integration Points', () => {
    it('should correctly pass task through all layers', async () => {
      const task: ExecutionTask = {
        id: 'integration-task',
        type: 'custom',
        entityId: 'ISSUE-001',
        prompt: 'Test integration',
        workDir: '/test/dir',
        priority: 1,
        dependencies: ['dep-1'],
        createdAt: new Date(),
        config: {
          timeout: 30000,
          maxRetries: 3,
          env: { TEST: 'value' },
        },
        metadata: { custom: 'data' },
      };

      await executor.executeTask(task);

      const submitted = mockEngine.getSubmittedTasks()[0];
      expect(submitted.id).toBe(task.id);
      expect(submitted.type).toBe(task.type);
      expect(submitted.entityId).toBe(task.entityId);
      expect(submitted.prompt).toBe(task.prompt);
      expect(submitted.workDir).toBe(task.workDir);
      expect(submitted.priority).toBe(task.priority);
      expect(submitted.dependencies).toEqual(task.dependencies);
      expect(submitted.config).toEqual(task.config);
      expect(submitted.metadata).toEqual(task.metadata);
    });

    it('should preserve engine result metadata in resilient result', async () => {
      const task: ExecutionTask = {
        id: 'metadata-task',
        type: 'issue',
        prompt: 'Test',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const result = await executor.executeTask(task);

      // Verify result structure includes both engine and resilience data
      expect(result.taskId).toBeTruthy();
      expect(result.executionId).toBeTruthy();
      expect(typeof result.success === 'boolean').toBeTruthy();
      expect(typeof result.exitCode === 'number').toBeTruthy();
      expect(result.startedAt instanceof Date).toBeTruthy();
      expect(result.completedAt instanceof Date).toBeTruthy();
      expect(typeof result.duration === 'number').toBeTruthy();

      // Resilience-specific fields
      expect(Array.isArray(result.attempts)).toBeTruthy();
      expect(typeof result.totalAttempts === 'number').toBeTruthy();
      expect(result.finalAttempt).toBeTruthy();
    });
  });
});
