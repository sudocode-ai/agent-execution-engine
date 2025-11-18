/**
 * Tests for Step Execution Logic
 */

import { describe, it, beforeEach , expect } from 'vitest'
import { LinearOrchestrator } from '@/workflow/linear-orchestrator.ts';
import type { IResilientExecutor } from '@/resilience/executor.ts';
import type { ResilientExecutionResult } from '@/resilience/types.ts';
import type { WorkflowStep, WorkflowExecution } from '@/workflow/types.ts';

/**
 * Mock Resilient Executor for testing
 */
class MockResilientExecutor implements Partial<IResilientExecutor> {
  public executedTasks: any[] = [];
  public mockResult: Partial<ResilientExecutionResult> = {
    taskId: 'task-1',
    executionId: 'exec-1',
    success: true,
    exitCode: 0,
    output: 'Test output',
    startedAt: new Date(),
    completedAt: new Date(),
    duration: 100,
    attempts: [],
    totalAttempts: 1,
    finalAttempt: {
      attemptNumber: 1,
      success: true,
      startedAt: new Date(),
      willRetry: false,
    },
  };

  async executeTask(task: any, retryPolicy?: any): Promise<any> {
    this.executedTasks.push({ task, retryPolicy });
    return this.mockResult;
  }

  executeTasks = async () => [];
  getCircuitBreaker = () => null;
  resetCircuitBreaker = () => {};
  getRetryMetrics = () => ({
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    averageAttemptsToSuccess: 0,
    circuitBreakers: new Map(),
  });
  onRetryAttempt = () => {};
  onCircuitOpen = () => {};
}

describe('Step Execution Logic', () => {
  let mockExecutor: MockResilientExecutor;
  let orchestrator: LinearOrchestrator;

  beforeEach(() => {
    mockExecutor = new MockResilientExecutor();
    orchestrator = new LinearOrchestrator(mockExecutor as any);
  });

  describe('_executeStep', () => {
    it('should render template and execute task', async () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Fix issue {{issueId}}',
      };

      const execution: WorkflowExecution = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: {
          id: 'wf-1',
          steps: [step],
        },
        status: 'running',
        currentStepIndex: 0,
        context: { issueId: 'ISSUE-001' },
        stepResults: [],
        startedAt: new Date(),
      };

      const result = await (orchestrator as any)._executeStep(
        step,
        execution,
        '/test/dir'
      );

      // Verify result
      expect(result.success).toBe(true);
      expect(result.output).toBe('Test output');

      // Verify executor was called
      expect(mockExecutor.executedTasks.length).toBe(1);

      const executedTask = mockExecutor.executedTasks[0].task;
      expect(executedTask.prompt).toBe('Fix issue ISSUE-001');
      expect(executedTask.type).toBe('issue');
      expect(executedTask.workDir).toBe('/test/dir');
    });

    it('should pass retry policy to executor', async () => {
      const retryPolicy = {
        maxAttempts: 3,
        backoff: {
          type: 'exponential' as const,
          baseDelayMs: 100,
          maxDelayMs: 1000,
          jitter: false,
        },
        retryableErrors: [],
        retryableExitCodes: [1],
      };

      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        retryPolicy,
      };

      const execution: WorkflowExecution = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: {
          id: 'wf-1',
          steps: [step],
        },
        status: 'running',
        currentStepIndex: 0,
        context: {},
        stepResults: [],
        startedAt: new Date(),
      };

      await (orchestrator as any)._executeStep(step, execution, '/test');

      const executedRetryPolicy = mockExecutor.executedTasks[0].retryPolicy;
      expect(executedRetryPolicy).toEqual(retryPolicy);
    });

    it('should include task config in execution task', async () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        taskConfig: {
          timeout: 30000,
          env: { TEST: 'value' },
        },
      };

      const execution: WorkflowExecution = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: {
          id: 'wf-1',
          steps: [step],
        },
        status: 'running',
        currentStepIndex: 0,
        context: {},
        stepResults: [],
        startedAt: new Date(),
      };

      await (orchestrator as any)._executeStep(step, execution, '/test');

      const executedTask = mockExecutor.executedTasks[0].task;
      expect(executedTask.config).toEqual(step.taskConfig);
    });

    it('should handle variables in template', async () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Process {{name}} with value {{value}}',
      };

      const execution: WorkflowExecution = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: {
          id: 'wf-1',
          steps: [step],
        },
        status: 'running',
        currentStepIndex: 0,
        context: { name: 'test', value: '42' },
        stepResults: [],
        startedAt: new Date(),
      };

      await (orchestrator as any)._executeStep(step, execution, '/test');

      const executedTask = mockExecutor.executedTasks[0].task;
      expect(executedTask.prompt).toBe('Process test with value 42');
    });
  });

  describe('_applyOutputMapping', () => {
    it('should map simple output values to context', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        outputMapping: {
          result: 'output',
        },
      };

      const result: ResilientExecutionResult = {
        taskId: 'task-1',
        executionId: 'exec-1',
        success: true,
        exitCode: 0,
        output: 'Analysis complete',
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 100,
        attempts: [],
        totalAttempts: 1,
        finalAttempt: {
          attemptNumber: 1,
          success: true,
          startedAt: new Date(),
          willRetry: false,
        },
      };

      const context: any = {};

      (orchestrator as any)._applyOutputMapping(step, result, context);

      expect(context.result).toBe('Analysis complete');
    });

    it('should map nested values to context', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        outputMapping: {
          files: 'metadata.filesChanged',
          count: 'metadata.count',
        },
      };

      const result: any = {
        taskId: 'task-1',
        success: true,
        output: 'Done',
        metadata: {
          filesChanged: ['file1.ts', 'file2.ts'],
          count: 2,
        },
      };

      const context: any = {};

      (orchestrator as any)._applyOutputMapping(step, result, context);

      expect(context.files).toEqual(['file1.ts', 'file2.ts']);
      expect(context.count).toBe(2);
    });

    it('should handle missing output mapping', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        // No outputMapping
      };

      const result: any = {
        success: true,
        output: 'Done',
      };

      const context: any = {};

      // Should not throw
      (orchestrator as any)._applyOutputMapping(step, result, context);

      expect(context).toEqual({});
    });

    it('should handle multiple mappings', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        outputMapping: {
          output1: 'output',
          success: 'success',
          code: 'exitCode',
        },
      };

      const result: any = {
        success: true,
        exitCode: 0,
        output: 'Test output',
      };

      const context: any = {};

      (orchestrator as any)._applyOutputMapping(step, result, context);

      expect(context.output1).toBe('Test output');
      expect(context.success).toBe(true);
      expect(context.code).toBe(0);
    });
  });

  describe('_areDependenciesMet', () => {
    it('should return true when no dependencies', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        // No dependencies
      };

      const execution: WorkflowExecution = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: {
          id: 'wf-1',
          steps: [step],
        },
        status: 'running',
        currentStepIndex: 0,
        context: {},
        stepResults: [],
        startedAt: new Date(),
      };

      const result = (orchestrator as any)._areDependenciesMet(step, execution);

      expect(result).toBe(true);
    });

    it('should return true when all dependencies met', () => {
      const step1: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test 1',
      };

      const step2: WorkflowStep = {
        id: 'step-2',
        taskType: 'issue',
        prompt: 'Test 2',
        dependencies: ['step-1'],
      };

      const execution: WorkflowExecution = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: {
          id: 'wf-1',
          steps: [step1, step2],
        },
        status: 'running',
        currentStepIndex: 1,
        context: {},
        stepResults: [
          {
            taskId: 'task-1',
            executionId: 'exec-1',
            success: true,
            exitCode: 0,
            output: 'Done',
            startedAt: new Date(),
            completedAt: new Date(),
            duration: 100,
            attempts: [],
            totalAttempts: 1,
            finalAttempt: {
              attemptNumber: 1,
              success: true,
              startedAt: new Date(),
              willRetry: false,
            },
          },
        ],
        startedAt: new Date(),
      };

      const result = (orchestrator as any)._areDependenciesMet(step2, execution);

      expect(result).toBe(true);
    });

    it('should return false when dependency not executed', () => {
      const step1: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test 1',
      };

      const step2: WorkflowStep = {
        id: 'step-2',
        taskType: 'issue',
        prompt: 'Test 2',
        dependencies: ['step-1'],
      };

      const execution: WorkflowExecution = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: {
          id: 'wf-1',
          steps: [step1, step2],
        },
        status: 'running',
        currentStepIndex: 1,
        context: {},
        stepResults: [], // No results yet
        startedAt: new Date(),
      };

      const result = (orchestrator as any)._areDependenciesMet(step2, execution);

      expect(result).toBe(false);
    });

    it('should return false when dependency failed', () => {
      const step1: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test 1',
      };

      const step2: WorkflowStep = {
        id: 'step-2',
        taskType: 'issue',
        prompt: 'Test 2',
        dependencies: ['step-1'],
      };

      const execution: WorkflowExecution = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: {
          id: 'wf-1',
          steps: [step1, step2],
        },
        status: 'running',
        currentStepIndex: 1,
        context: {},
        stepResults: [
          {
            taskId: 'task-1',
            executionId: 'exec-1',
            success: false, // Failed
            exitCode: 1,
            output: '',
            error: 'Failed',
            startedAt: new Date(),
            completedAt: new Date(),
            duration: 100,
            attempts: [],
            totalAttempts: 1,
            finalAttempt: {
              attemptNumber: 1,
              success: false,
              startedAt: new Date(),
              willRetry: false,
            },
          },
        ],
        startedAt: new Date(),
      };

      const result = (orchestrator as any)._areDependenciesMet(step2, execution);

      expect(result).toBe(false);
    });

    it('should return false when dependency not found in workflow', () => {
      const step: WorkflowStep = {
        id: 'step-2',
        taskType: 'issue',
        prompt: 'Test',
        dependencies: ['non-existent-step'],
      };

      const execution: WorkflowExecution = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: {
          id: 'wf-1',
          steps: [step],
        },
        status: 'running',
        currentStepIndex: 0,
        context: {},
        stepResults: [],
        startedAt: new Date(),
      };

      const result = (orchestrator as any)._areDependenciesMet(step, execution);

      expect(result).toBe(false);
    });
  });

  describe('_shouldExecuteStep', () => {
    it('should return true when no condition', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        // No condition
      };

      const context = {};

      const result = (orchestrator as any)._shouldExecuteStep(step, context);

      expect(result).toBe(true);
    });

    it('should evaluate condition to true', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        condition: '{{isEnabled}}',
      };

      const context = { isEnabled: true };

      const result = (orchestrator as any)._shouldExecuteStep(step, context);

      expect(result).toBe(true);
    });

    it('should evaluate condition to false', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        condition: '{{isEnabled}}',
      };

      const context = { isEnabled: false };

      const result = (orchestrator as any)._shouldExecuteStep(step, context);

      expect(result).toBe(false);
    });

    it('should evaluate string "true" as true', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        condition: '{{value}}',
      };

      const context = { value: 'true' };

      const result = (orchestrator as any)._shouldExecuteStep(step, context);

      expect(result).toBe(true);
    });

    it('should evaluate missing variable as false', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        condition: '{{missing}}',
      };

      const context = {};

      const result = (orchestrator as any)._shouldExecuteStep(step, context);

      expect(result).toBe(false);
    });

    it('should evaluate non-empty string as true', () => {
      const step: WorkflowStep = {
        id: 'step-1',
        taskType: 'issue',
        prompt: 'Test',
        condition: '{{value}}',
      };

      const context = { value: 'enabled' };

      const result = (orchestrator as any)._shouldExecuteStep(step, context);

      expect(result).toBe(true);
    });
  });
});
