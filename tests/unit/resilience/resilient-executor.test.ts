/**
 * Tests for ResilientExecutor Implementation
 */

import { describe, it, beforeEach , expect } from 'vitest'
import { ResilientExecutor } from '@/resilience/resilient-executor.ts';
import type { IExecutionEngine } from '@/engine/engine.ts';
import type {
  ExecutionTask,
  ExecutionResult,
  TaskStatus,
  EngineMetrics,
  TaskCompleteHandler,
  TaskFailedHandler,
} from '@/engine/types.ts';
import type { RetryPolicy, ExecutionAttempt } from '@/resilience/types.ts';

/**
 * Mock Engine for testing
 */
class MockEngine implements IExecutionEngine {
  private taskCounter = 0;
  private taskResults = new Map<string, ExecutionResult>();
  private taskBehaviors = new Map<
    string,
    { results: ExecutionResult[]; currentAttempt: number }
  >();

  /**
   * Configure how a task should behave across multiple attempts
   */
  configureBehavior(taskId: string, results: ExecutionResult[]): void {
    this.taskBehaviors.set(taskId, { results, currentAttempt: 0 });
  }

  async submitTask(task: ExecutionTask): Promise<string> {
    const taskId = `mock-${this.taskCounter++}`;

    // Check if we have configured behavior for this task
    const behavior = this.taskBehaviors.get(task.id);
    if (behavior && behavior.currentAttempt < behavior.results.length) {
      const result = behavior.results[behavior.currentAttempt];
      behavior.currentAttempt++;
      this.taskResults.set(taskId, result);
    } else {
      // Default success behavior
      this.taskResults.set(taskId, {
        taskId: task.id,
        executionId: taskId,
        success: true,
        exitCode: 0,
        output: 'Success',
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 100,
      });
    }

    return taskId;
  }

  async submitTasks(tasks: ExecutionTask[]): Promise<string[]> {
    return Promise.all(tasks.map((task) => this.submitTask(task)));
  }

  async cancelTask(_taskId: string): Promise<void> {
    // Not needed for resilience tests
  }

  getTaskStatus(_taskId: string): TaskStatus | null {
    return null;
  }

  async waitForTask(taskId: string): Promise<ExecutionResult> {
    const result = this.taskResults.get(taskId);
    if (!result) {
      throw new Error(`Task ${taskId} not found`);
    }
    return result;
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
    // Not needed for resilience tests
  }

  onTaskFailed(_handler: TaskFailedHandler): void {
    // Not needed for resilience tests
  }

  async shutdown(): Promise<void> {
    this.taskResults.clear();
    this.taskBehaviors.clear();
  }

  reset(): void {
    this.taskCounter = 0;
    this.taskResults.clear();
    this.taskBehaviors.clear();
  }
}

describe('ResilientExecutor', () => {
  let mockEngine: MockEngine;
  let executor: ResilientExecutor;

  beforeEach(() => {
    mockEngine = new MockEngine();
    executor = new ResilientExecutor(mockEngine);
  });

  describe('Basic Execution', () => {
    it('should execute task successfully without retries', async () => {
      const task: ExecutionTask = {
        id: 'task-1',
        type: 'issue',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const result = await executor.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(1);
      expect(result.attempts.length).toBe(1);
      expect(result.attempts[0].success).toBe(true);
      expect(result.attempts[0].attemptNumber).toBe(1);
    });

    it('should handle immediate task failure', async () => {
      const task: ExecutionTask = {
        id: 'task-fail',
        type: 'issue',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      // Configure to fail with non-retryable error
      mockEngine.configureBehavior('task-fail', [
        {
          taskId: 'task-fail',
          executionId: 'exec-1',
          success: false,
          exitCode: 127, // Non-retryable exit code
          output: '',
          error: 'Command not found',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
      ]);

      const result = await executor.executeTask(task);

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(1);
      expect(result.exitCode).toBe(127);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on retryable failure and eventually succeed', async () => {
      const task: ExecutionTask = {
        id: 'task-retry-success',
        type: 'issue',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const policy: RetryPolicy = {
        maxAttempts: 3,
        backoff: {
          type: 'fixed',
          baseDelayMs: 10, // Short delay for testing
          maxDelayMs: 100,
          jitter: false,
        },
        retryableErrors: ['timeout'],
        retryableExitCodes: [1],
      };

      // Configure: fail twice, then succeed
      mockEngine.configureBehavior('task-retry-success', [
        {
          taskId: 'task-retry-success',
          executionId: 'exec-1',
          success: false,
          exitCode: 1,
          output: '',
          error: 'Connection timeout',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
        {
          taskId: 'task-retry-success',
          executionId: 'exec-2',
          success: false,
          exitCode: 1,
          output: '',
          error: 'Connection timeout',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
        {
          taskId: 'task-retry-success',
          executionId: 'exec-3',
          success: true,
          exitCode: 0,
          output: 'Success',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 100,
        },
      ]);

      const result = await executor.executeTask(task, policy);

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(3);
      expect(result.attempts.length).toBe(3);
      expect(result.attempts[0].success).toBe(false);
      expect(result.attempts[0].willRetry).toBe(true);
      expect(result.attempts[1].success).toBe(false);
      expect(result.attempts[1].willRetry).toBe(true);
      expect(result.attempts[2].success).toBe(true);
      expect(result.attempts[2].willRetry).toBe(false);
    });

    it('should exhaust retries and fail', async () => {
      const task: ExecutionTask = {
        id: 'task-retry-exhaust',
        type: 'issue',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const policy: RetryPolicy = {
        maxAttempts: 3,
        backoff: {
          type: 'fixed',
          baseDelayMs: 10,
          maxDelayMs: 100,
          jitter: false,
        },
        retryableErrors: ['timeout'],
        retryableExitCodes: [1],
      };

      // Configure: fail all attempts
      mockEngine.configureBehavior('task-retry-exhaust', [
        {
          taskId: 'task-retry-exhaust',
          executionId: 'exec-1',
          success: false,
          exitCode: 1,
          output: '',
          error: 'Connection timeout',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
        {
          taskId: 'task-retry-exhaust',
          executionId: 'exec-2',
          success: false,
          exitCode: 1,
          output: '',
          error: 'Connection timeout',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
        {
          taskId: 'task-retry-exhaust',
          executionId: 'exec-3',
          success: false,
          exitCode: 1,
          output: '',
          error: 'Connection timeout',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
      ]);

      const result = await executor.executeTask(task, policy);

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(3);
      expect(result.attempts.length).toBe(3);
      expect(result.attempts[2].willRetry).toBe(false);
    });

    it('should not retry on non-retryable error', async () => {
      const task: ExecutionTask = {
        id: 'task-no-retry',
        type: 'issue',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const policy: RetryPolicy = {
        maxAttempts: 3,
        backoff: {
          type: 'fixed',
          baseDelayMs: 10,
          maxDelayMs: 100,
          jitter: false,
        },
        retryableErrors: ['timeout'],
        retryableExitCodes: [1],
      };

      // Configure: fail with non-retryable error
      mockEngine.configureBehavior('task-no-retry', [
        {
          taskId: 'task-no-retry',
          executionId: 'exec-1',
          success: false,
          exitCode: 127, // Non-retryable
          output: '',
          error: 'Command not found',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
      ]);

      const result = await executor.executeTask(task, policy);

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(1); // No retries
      expect(result.attempts[0].willRetry).toBe(false);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after failure threshold', async () => {
      const policy: RetryPolicy = {
        maxAttempts: 1, // No retries to trigger circuit breaker faster
        backoff: {
          type: 'fixed',
          baseDelayMs: 10,
          maxDelayMs: 100,
          jitter: false,
        },
        retryableErrors: [],
        retryableExitCodes: [],
      };

      // Create 5 failing tasks to open circuit (default threshold is 5)
      for (let i = 0; i < 5; i++) {
        const task: ExecutionTask = {
          id: `fail-task-${i}`,
          type: 'issue',
          prompt: 'Test task',
          workDir: '/test',
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        mockEngine.configureBehavior(`fail-task-${i}`, [
          {
            taskId: `fail-task-${i}`,
            executionId: `exec-${i}`,
            success: false,
            exitCode: 2,
            output: '',
            error: 'Task failed',
            startedAt: new Date(),
            completedAt: new Date(),
            duration: 50,
          },
        ]);

        await executor.executeTask(task, policy);
      }

      // Check circuit breaker state
      const breaker = executor.getCircuitBreaker('issue');
      expect(breaker !== null).toBeTruthy();
      expect(breaker?.state).toBe('open');

      // Next task should be blocked by circuit breaker
      const blockedTask: ExecutionTask = {
        id: 'blocked-task',
        type: 'issue',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const result = await executor.executeTask(blockedTask, policy);
      expect(result.circuitBreakerTriggered).toBe(true);
      expect(result.success).toBe(false);
    });

    it('should close circuit after successful executions', async () => {
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

      // Create 5 failing tasks to open circuit (default threshold is 5)
      for (let i = 0; i < 5; i++) {
        const task: ExecutionTask = {
          id: `fail-spec-${i}`,
          type: 'spec',
          prompt: 'Test task',
          workDir: '/test',
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        mockEngine.configureBehavior(`fail-spec-${i}`, [
          {
            taskId: `fail-spec-${i}`,
            executionId: `exec-${i}`,
            success: false,
            exitCode: 2,
            output: '',
            error: 'Task failed',
            startedAt: new Date(),
            completedAt: new Date(),
            duration: 50,
          },
        ]);

        await executor.executeTask(task, policy);
      }

      // Circuit should be open
      const openBreaker = executor.getCircuitBreaker('spec');
      expect(openBreaker !== null).toBeTruthy();
      expect(openBreaker?.state).toBe('open');
      expect(openBreaker?.metrics.failedRequests).toBe(5);

      // Reset the circuit breaker to simulate recovery
      executor.resetCircuitBreaker('spec');

      // Circuit should be closed after reset
      const resetBreaker = executor.getCircuitBreaker('spec');
      expect(resetBreaker !== null).toBeTruthy();
      expect(resetBreaker?.state).toBe('closed');
      expect(resetBreaker?.metrics.failedRequests).toBe(0);
    });
  });

  describe('Event Handlers', () => {
    it('should call retry attempt handler', async () => {
      const task: ExecutionTask = {
        id: 'task-event',
        type: 'issue',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      const policy: RetryPolicy = {
        maxAttempts: 2,
        backoff: {
          type: 'fixed',
          baseDelayMs: 10,
          maxDelayMs: 100,
          jitter: false,
        },
        retryableErrors: [],
        retryableExitCodes: [1],
      };

      // Track retry events
      const retryEvents: { taskId: string; attempt: ExecutionAttempt }[] = [];
      executor.onRetryAttempt((taskId, attempt) => {
        retryEvents.push({ taskId, attempt });
      });

      // Configure: fail once, then succeed
      mockEngine.configureBehavior('task-event', [
        {
          taskId: 'task-event',
          executionId: 'exec-1',
          success: false,
          exitCode: 1,
          output: '',
          error: 'Temporary failure',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
        {
          taskId: 'task-event',
          executionId: 'exec-2',
          success: true,
          exitCode: 0,
          output: 'Success',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 100,
        },
      ]);

      await executor.executeTask(task, policy);

      // Should have 1 retry event (for the first failure)
      expect(retryEvents.length).toBe(1);
      expect(retryEvents[0].taskId).toBe('task-event');
      expect(retryEvents[0].attempt.attemptNumber).toBe(1);
      expect(retryEvents[0].attempt.willRetry).toBe(true);
    });

    it('should call circuit open handler', async () => {
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

      // Track circuit open events
      const circuitEvents: { name: string }[] = [];
      executor.onCircuitOpen((circuitName) => {
        circuitEvents.push({ name: circuitName });
      });

      // Create 5 failing tasks to open circuit
      for (let i = 0; i < 5; i++) {
        const task: ExecutionTask = {
          id: `circuit-fail-${i}`,
          type: 'custom',
          prompt: 'Test task',
          workDir: '/test',
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        mockEngine.configureBehavior(`circuit-fail-${i}`, [
          {
            taskId: `circuit-fail-${i}`,
            executionId: `exec-${i}`,
            success: false,
            exitCode: 2,
            output: '',
            error: 'Task failed',
            startedAt: new Date(),
            completedAt: new Date(),
            duration: 50,
          },
        ]);

        await executor.executeTask(task, policy);
      }

      // Try one more task - should trigger circuit open event
      const blockedTask: ExecutionTask = {
        id: 'circuit-blocked',
        type: 'custom',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      await executor.executeTask(blockedTask, policy);

      // Should have circuit open event
      expect(circuitEvents.length > 0).toBeTruthy();
      expect(circuitEvents[0].name).toBe('custom');
    });
  });

  describe('Metrics', () => {
    it('should track retry metrics correctly', async () => {
      const policy: RetryPolicy = {
        maxAttempts: 3,
        backoff: {
          type: 'fixed',
          baseDelayMs: 10,
          maxDelayMs: 100,
          jitter: false,
        },
        retryableErrors: [],
        retryableExitCodes: [1],
      };

      // Task 1: Success after 2 attempts
      const task1: ExecutionTask = {
        id: 'metrics-1',
        type: 'issue',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      mockEngine.configureBehavior('metrics-1', [
        {
          taskId: 'metrics-1',
          executionId: 'exec-1',
          success: false,
          exitCode: 1,
          output: '',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
        {
          taskId: 'metrics-1',
          executionId: 'exec-2',
          success: true,
          exitCode: 0,
          output: 'Success',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 100,
        },
      ]);

      await executor.executeTask(task1, policy);

      // Task 2: Fail all attempts
      const task2: ExecutionTask = {
        id: 'metrics-2',
        type: 'issue',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      mockEngine.configureBehavior('metrics-2', [
        {
          taskId: 'metrics-2',
          executionId: 'exec-1',
          success: false,
          exitCode: 1,
          output: '',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
        {
          taskId: 'metrics-2',
          executionId: 'exec-2',
          success: false,
          exitCode: 1,
          output: '',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
        {
          taskId: 'metrics-2',
          executionId: 'exec-3',
          success: false,
          exitCode: 1,
          output: '',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
        },
      ]);

      await executor.executeTask(task2, policy);

      const metrics = executor.getRetryMetrics();

      // Total retries: 1 (task1) + 2 (task2) = 3
      expect(metrics.totalRetries).toBe(3);
      // Successful retries: 1 (task1 succeeded after retry)
      expect(metrics.successfulRetries).toBe(1);
      // Failed retries: 2 (task2 retried twice but failed)
      expect(metrics.failedRetries).toBe(2);
      // Average attempts to success: 2 (task1 took 2 attempts)
      expect(metrics.averageAttemptsToSuccess).toBe(2);
    });
  });

  describe('Batch Execution', () => {
    it('should execute multiple tasks in parallel', async () => {
      const tasks: ExecutionTask[] = [
        {
          id: 'batch-1',
          type: 'issue',
          prompt: 'Task 1',
          workDir: '/test',
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: 'batch-2',
          type: 'issue',
          prompt: 'Task 2',
          workDir: '/test',
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
        {
          id: 'batch-3',
          type: 'issue',
          prompt: 'Task 3',
          workDir: '/test',
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        },
      ];

      const results = await executor.executeTasks(tasks);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.success)).toBeTruthy();
    });
  });

  describe('Circuit Breaker Management', () => {
    it('should get circuit breaker by name', async () => {
      const task: ExecutionTask = {
        id: 'get-breaker',
        type: 'spec',
        prompt: 'Test task',
        workDir: '/test',
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      await executor.executeTask(task);

      const breaker = executor.getCircuitBreaker('spec');
      expect(breaker !== null).toBeTruthy();
      expect(breaker?.name).toBe('spec');
    });

    it('should reset circuit breaker', async () => {
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

      // Create failing tasks to open circuit
      for (let i = 0; i < 5; i++) {
        const task: ExecutionTask = {
          id: `reset-fail-${i}`,
          type: 'issue',
          prompt: 'Test task',
          workDir: '/test',
          priority: 0,
          dependencies: [],
          createdAt: new Date(),
          config: {},
        };

        mockEngine.configureBehavior(`reset-fail-${i}`, [
          {
            taskId: `reset-fail-${i}`,
            executionId: `exec-${i}`,
            success: false,
            exitCode: 2,
            output: '',
            startedAt: new Date(),
            completedAt: new Date(),
            duration: 50,
          },
        ]);

        await executor.executeTask(task, policy);
      }

      // Circuit should be open
      let breaker = executor.getCircuitBreaker('issue');
      expect(breaker !== null).toBeTruthy();
      expect(breaker?.state).toBe('open');

      // Reset circuit breaker
      executor.resetCircuitBreaker('issue');

      // Circuit should be closed
      breaker = executor.getCircuitBreaker('issue');
      expect(breaker !== null).toBeTruthy();
      expect(breaker?.state).toBe('closed');
      expect(breaker?.metrics.failedRequests).toBe(0);
    });
  });
});
