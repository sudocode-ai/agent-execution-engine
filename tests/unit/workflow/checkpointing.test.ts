/**
 * Tests for Checkpointing and Resumption
 */

import { randomUUID } from "crypto";
import { describe, it, beforeEach, expect } from "vitest";
import { LinearOrchestrator } from '@/workflow/linear-orchestrator';
import { InMemoryWorkflowStorage } from '@/workflow/memory-storage';
import type { IResilientExecutor } from '@/resilience/executor';
import type { ResilientExecutionResult } from '@/resilience/types';
import type {
  WorkflowDefinition,
  WorkflowCheckpoint,
} from '@/workflow/types';

/**
 * Mock Resilient Executor for testing
 */
class MockResilientExecutor implements Partial<IResilientExecutor> {
  public executedTasks: any[] = [];
  public mockResults: ResilientExecutionResult[] = [];
  public currentResultIndex = 0;
  public executionDelay = 0;

  constructor(results?: Partial<ResilientExecutionResult>[], delay = 0) {
    this.executionDelay = delay;
    if (results) {
      this.mockResults = results.map((r, i) => ({
        taskId: r.taskId || `task-${i + 1}`,
        executionId: r.executionId || `exec-${i + 1}`,
        success: r.success ?? true,
        exitCode: r.exitCode ?? 0,
        output: r.output || `Output ${i + 1}`,
        startedAt: r.startedAt || new Date(),
        completedAt: r.completedAt || new Date(),
        duration: r.duration || 100,
        attempts: r.attempts || [],
        totalAttempts: r.totalAttempts || 1,
        finalAttempt: r.finalAttempt || {
          attemptNumber: 1,
          success: true,
          startedAt: new Date(),
          willRetry: false,
        },
      }));
    }
  }

  async executeTask(task: any, retryPolicy?: any): Promise<any> {
    this.executedTasks.push({ task, retryPolicy });

    // Add delay if configured
    if (this.executionDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.executionDelay));
    }

    if (this.mockResults.length > 0) {
      const result = this.mockResults[this.currentResultIndex];
      this.currentResultIndex++;
      return result;
    }

    // Default result
    return {
      taskId: "task-1",
      executionId: "exec-1",
      success: true,
      exitCode: 0,
      output: "Test output",
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

/**
 * Helper to wait for workflow completion
 */
async function waitFor(
  predicate: () => boolean,
  timeout = 5000
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timeout waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("Checkpointing and Resumption", () => {
  let mockExecutor: MockResilientExecutor;
  let storage: InMemoryWorkflowStorage;
  let orchestrator: LinearOrchestrator;

  beforeEach(() => {
    mockExecutor = new MockResilientExecutor();
    storage = new InMemoryWorkflowStorage();
    orchestrator = new LinearOrchestrator(mockExecutor as any, storage);
  });

  describe("checkpoint creation", () => {
    it("should create checkpoint at specified interval", async () => {
      const workflow: WorkflowDefinition = {
        id: "test-workflow",
        steps: [
          { id: "step-1", taskType: "issue", prompt: "Step 1" },
          { id: "step-2", taskType: "issue", prompt: "Step 2" },
          { id: "step-3", taskType: "issue", prompt: "Step 3" },
        ],
      };

      const executionId = randomUUID();
      await orchestrator.startWorkflow(workflow, "/test", {
        executionId,
        checkpointInterval: 2,
      });

      await waitFor(() => {
        const execution = orchestrator.getExecution(executionId);
        return execution?.status === "completed";
      });

      const checkpoints = await storage.listCheckpoints();
      expect(checkpoints.length > 0).toBeTruthy();
      expect(checkpoints[0].executionId).toBe(executionId);
    });

    it("should include complete execution state in checkpoint", async () => {
      const workflow: WorkflowDefinition = {
        id: "test-workflow",
        steps: [
          {
            id: "step-1",
            taskType: "issue",
            prompt: "Step 1",
            outputMapping: { result1: "output" },
          },
          { id: "step-2", taskType: "issue", prompt: "Step 2" },
        ],
      };

      const executionId = randomUUID();
      await orchestrator.startWorkflow(workflow, "/test", {
        executionId,
        checkpointInterval: 1,
        initialContext: { testKey: "testValue" },
      });

      await waitFor(() => {
        const execution = orchestrator.getExecution(executionId);
        return execution?.status === "completed";
      });

      const checkpoint = await storage.loadCheckpoint(executionId);
      expect(checkpoint).toBeTruthy();
      expect(checkpoint?.workflowId).toBe("test-workflow");
      expect(checkpoint?.executionId).toBe(executionId);
      expect(checkpoint?.state?.currentStepIndex).toBeTruthy();
      expect(checkpoint?.state?.stepResults?.length).toBeTruthy();
      expect(checkpoint?.state.context).toBeTruthy();
      expect(checkpoint?.createdAt).toBeTruthy();
    });

    it("should emit checkpoint event", async () => {
      let checkpointEmitted = false;
      let emittedCheckpoint: WorkflowCheckpoint | undefined;

      orchestrator.onCheckpoint((checkpoint) => {
        checkpointEmitted = true;
        emittedCheckpoint = checkpoint;
      });

      const workflow: WorkflowDefinition = {
        id: "test-workflow",
        steps: [
          { id: "step-1", taskType: "issue", prompt: "Step 1" },
          { id: "step-2", taskType: "issue", prompt: "Step 2" },
        ],
      };

      const executionId = randomUUID();
      await orchestrator.startWorkflow(workflow, "/test", {
        executionId,
        checkpointInterval: 1,
      });

      await waitFor(() => checkpointEmitted);

      expect(checkpointEmitted).toBe(true);
      expect(emittedCheckpoint).toBeTruthy();
      expect(emittedCheckpoint?.executionId).toBe(executionId);
    });

    it("should not create checkpoint when interval not reached", async () => {
      const workflow: WorkflowDefinition = {
        id: "test-workflow",
        steps: [
          { id: "step-1", taskType: "issue", prompt: "Step 1" },
          { id: "step-2", taskType: "issue", prompt: "Step 2" },
        ],
      };

      const executionId = randomUUID();
      await orchestrator.startWorkflow(
        workflow,
        "/test",
        { executionId, checkpointInterval: 5 } // Interval higher than step count
      );

      await waitFor(() => {
        const execution = orchestrator.getExecution(executionId);
        return execution?.status === "completed";
      });

      const checkpoints = await storage.listCheckpoints();
      // Should not create checkpoint since we only have 2 steps and interval is 5
      expect(checkpoints.length).toBe(0);
    });
  });

  describe("workflow resumption", () => {
    it("should resume workflow from checkpoint", async () => {
      // Use slow executor to allow time for pause
      mockExecutor = new MockResilientExecutor(undefined, 50);
      orchestrator = new LinearOrchestrator(mockExecutor as any, storage);

      const workflow: WorkflowDefinition = {
        id: "test-workflow",
        steps: [
          { id: "step-1", taskType: "issue", prompt: "Step 1" },
          { id: "step-2", taskType: "issue", prompt: "Step 2" },
          { id: "step-3", taskType: "issue", prompt: "Step 3" },
        ],
      };

      const executionId = randomUUID();
      await orchestrator.startWorkflow(workflow, "/test", {
        executionId,
        checkpointInterval: 1,
      });

      // Wait for first checkpoint
      await waitFor(() => storage.size() > 0, 2000);

      // Pause workflow
      await orchestrator.pauseWorkflow(executionId);

      // Wait a bit to ensure pause takes effect
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Resume workflow
      await orchestrator.resumeWorkflow(executionId, { checkpointInterval: 1 });

      // Wait for completion
      await waitFor(() => {
        const execution = orchestrator.getExecution(executionId);
        return execution?.status === "completed";
      }, 3000);

      const execution = orchestrator.getExecution(executionId);
      expect(execution?.status).toBe("completed");
      expect(execution?.stepResults.length === 3).toBeTruthy();
    });

    it("should continue from correct step index after resume", async () => {
      mockExecutor = new MockResilientExecutor(undefined, 50);
      orchestrator = new LinearOrchestrator(mockExecutor as any, storage);

      const workflow: WorkflowDefinition = {
        id: "test-workflow",
        steps: [
          { id: "step-1", taskType: "issue", prompt: "Step 1" },
          { id: "step-2", taskType: "issue", prompt: "Step 2" },
          { id: "step-3", taskType: "issue", prompt: "Step 3" },
        ],
      };

      const executionId = randomUUID();
      await orchestrator.startWorkflow(workflow, "/test", {
        executionId,
        checkpointInterval: 1,
      });

      // Wait for at least one checkpoint
      await waitFor(() => storage.size() > 0, 2000);

      // Pause workflow
      await orchestrator.pauseWorkflow(executionId);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check checkpoint state
      const checkpoint = await storage.loadCheckpoint(executionId);
      const resultsAtPause = checkpoint?.state.stepResults.length || 0;

      // Track tasks executed before resume
      const tasksBeforeResume = mockExecutor.executedTasks.length;

      // Resume workflow
      await orchestrator.resumeWorkflow(executionId);

      // Wait for completion
      await waitFor(() => {
        const execution = orchestrator.getExecution(executionId);
        return execution?.status === "completed";
      }, 3000);

      const execution = orchestrator.getExecution(executionId);

      // Verify all steps completed
      expect(execution?.stepResults.length).toBe(3);

      // Verify we didn't re-execute completed steps
      const tasksAfterResume = mockExecutor.executedTasks.length;
      const newTasksExecuted = tasksAfterResume - tasksBeforeResume;

      // Should only execute remaining steps
      expect(newTasksExecuted <= 3 - resultsAtPause).toBeTruthy();
    });

    it("should preserve context across resume", async () => {
      mockExecutor = new MockResilientExecutor(
        [
          { success: true, output: "Result from step 1" },
          { success: true, output: "Result from step 2" },
        ],
        50
      );
      orchestrator = new LinearOrchestrator(mockExecutor as any, storage);

      const workflow: WorkflowDefinition = {
        id: "test-workflow",
        steps: [
          {
            id: "step-1",
            taskType: "issue",
            prompt: "Step 1",
            outputMapping: { result1: "output" },
          },
          {
            id: "step-2",
            taskType: "issue",
            prompt: "Step 2 with {{result1}}",
          },
        ],
      };

      const executionId = randomUUID();
      await orchestrator.startWorkflow(workflow, "/test", {
        executionId,
        checkpointInterval: 1,
      });

      // Wait for checkpoint after step 1
      await waitFor(() => {
        const checkpoint = storage._checkpoints.get(executionId);
        return Boolean(checkpoint && checkpoint.state.stepResults.length >= 1);
      }, 2000);

      // Pause and resume
      await orchestrator.pauseWorkflow(executionId);
      await new Promise((resolve) => setTimeout(resolve, 100));

      await orchestrator.resumeWorkflow(executionId);

      await waitFor(() => {
        const execution = orchestrator.getExecution(executionId);
        return execution?.status === "completed";
      }, 3000);

      const execution = orchestrator.getExecution(executionId);
      expect(execution?.context.result1).toBe("Result from step 1");
    });

    it("should emit resume event", async () => {
      let resumeEmitted = false;
      let emittedExecutionId: string | undefined;

      orchestrator.onResume((executionId, _checkpoint) => {
        resumeEmitted = true;
        emittedExecutionId = executionId;
      });

      mockExecutor = new MockResilientExecutor(undefined, 50);
      orchestrator = new LinearOrchestrator(mockExecutor as any, storage);

      // Re-register handler after recreating orchestrator
      orchestrator.onResume((executionId) => {
        resumeEmitted = true;
        emittedExecutionId = executionId;
      });

      const workflow: WorkflowDefinition = {
        id: "test-workflow",
        steps: [
          { id: "step-1", taskType: "issue", prompt: "Step 1" },
          { id: "step-2", taskType: "issue", prompt: "Step 2" },
        ],
      };

      const executionId = randomUUID();
      await orchestrator.startWorkflow(workflow, "/test", {
        executionId,
        checkpointInterval: 1,
      });

      await waitFor(() => storage.size() > 0, 2000);
      await orchestrator.pauseWorkflow(executionId);
      await new Promise((resolve) => setTimeout(resolve, 100));

      await orchestrator.resumeWorkflow(executionId);

      expect(resumeEmitted).toBe(true);
      expect(emittedExecutionId).toBe(executionId);
    });

    it("should throw error when resuming without storage", async () => {
      const noStorageOrchestrator = new LinearOrchestrator(mockExecutor as any);

      await expect(async () => {
        await noStorageOrchestrator.resumeWorkflow("test-id");
      }).rejects.toThrow("Cannot resume workflow: no storage configured");
    });

    it("should throw error when checkpoint not found", async () => {
      await expect(async () => {
        await orchestrator.resumeWorkflow("non-existent-id");
      }).rejects.toThrow("No checkpoint found for execution non-existent-id");
    });
  });

  describe("InMemoryWorkflowStorage", () => {
    it("should store and retrieve checkpoints", async () => {
      const checkpoint: WorkflowCheckpoint = {
        workflowId: "test-workflow",
        executionId: "exec-1",
        definition: {
          id: "test-workflow",
          steps: [],
        },
        state: {
          status: "running",
          currentStepIndex: 1,
          context: { test: "value" },
          stepResults: [],
          startedAt: new Date(),
        },
        createdAt: new Date(),
      };

      await storage.saveCheckpoint(checkpoint);

      const retrieved = await storage.loadCheckpoint("exec-1");
      expect(retrieved).toBeTruthy();
      expect(retrieved?.executionId).toBe("exec-1");
      expect(retrieved?.workflowId).toBe("test-workflow");
    });

    it("should list checkpoints", async () => {
      const checkpoint1: WorkflowCheckpoint = {
        workflowId: "workflow-1",
        executionId: "exec-1",
        definition: { id: "workflow-1", steps: [] },
        state: {
          status: "running",
          currentStepIndex: 0,
          context: {},
          stepResults: [],
          startedAt: new Date(),
        },
        createdAt: new Date(),
      };

      const checkpoint2: WorkflowCheckpoint = {
        workflowId: "workflow-2",
        executionId: "exec-2",
        definition: { id: "workflow-2", steps: [] },
        state: {
          status: "running",
          currentStepIndex: 0,
          context: {},
          stepResults: [],
          startedAt: new Date(),
        },
        createdAt: new Date(),
      };

      await storage.saveCheckpoint(checkpoint1);
      await storage.saveCheckpoint(checkpoint2);

      const all = await storage.listCheckpoints();
      expect(all.length).toBe(2);

      const filtered = await storage.listCheckpoints("workflow-1");
      expect(filtered.length).toBe(1);
      expect(filtered[0].workflowId).toBe("workflow-1");
    });

    it("should delete checkpoints", async () => {
      const checkpoint: WorkflowCheckpoint = {
        workflowId: "test-workflow",
        executionId: "exec-1",
        definition: { id: "test-workflow", steps: [] },
        state: {
          status: "running",
          currentStepIndex: 0,
          context: {},
          stepResults: [],
          startedAt: new Date(),
        },
        createdAt: new Date(),
      };

      await storage.saveCheckpoint(checkpoint);
      expect(storage.size()).toBe(1);

      await storage.deleteCheckpoint("exec-1");
      expect(storage.size()).toBe(0);

      const retrieved = await storage.loadCheckpoint("exec-1");
      expect(retrieved).toBe(null);
    });

    it("should clear all checkpoints", () => {
      storage._checkpoints.set("exec-1", {} as any);
      storage._checkpoints.set("exec-2", {} as any);
      expect(storage.size()).toBe(2);

      storage.clear();
      expect(storage.size()).toBe(0);
    });
  });
});
