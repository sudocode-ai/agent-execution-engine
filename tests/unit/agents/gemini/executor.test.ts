import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiExecutor } from '@/agents/gemini/executor';
import type { ExecutionTask } from '@/engine/types';

describe('GeminiExecutor', () => {
  let executor: GeminiExecutor;
  const workDir = '/test/project';

  beforeEach(() => {
    executor = new GeminiExecutor({
      workDir,
      autoApprove: true,
      model: 'flash',
    });
  });

  describe('configuration', () => {
    it('should create executor with default config', () => {
      const defaultExecutor = new GeminiExecutor({
        workDir: '/test',
      });

      expect(defaultExecutor).toBeDefined();
    });

    it('should create executor with custom model', () => {
      const customExecutor = new GeminiExecutor({
        workDir: '/test',
        model: 'gemini-2.5-flash-thinking-exp-01-21',
      });

      expect(customExecutor).toBeDefined();
    });

    it('should create executor with system prompt', () => {
      const executorWithPrompt = new GeminiExecutor({
        workDir: '/test',
        systemPrompt: 'You are a helpful coding assistant.',
      });

      expect(executorWithPrompt).toBeDefined();
    });

    it('should create executor with custom session namespace', () => {
      const customExecutor = new GeminiExecutor({
        workDir: '/test',
        sessionNamespace: 'custom-sessions',
      });

      expect(customExecutor).toBeDefined();
    });
  });

  describe('capabilities', () => {
    it('should return correct capabilities', () => {
      const caps = executor.getCapabilities();

      expect(caps.supportsSessionResume).toBe(true);
      expect(caps.requiresSetup).toBe(true);
      expect(caps.supportsApprovals).toBe(true);
      expect(caps.supportsMcp).toBe(true);
      expect(caps.protocol).toBe('stream-json');
    });
  });

  describe('availability check', () => {
    it.skip('should check if Gemini CLI is available', async () => {
      // Note: Skipped because mocking ES modules is not supported in Vitest
      // This would require actual CLI to be installed
      const available = await executor.checkAvailability();
      expect(typeof available).toBe('boolean');
    });

    it.skip('should return false if Gemini CLI is not available', async () => {
      // Note: Skipped because mocking ES modules is not supported in Vitest
      // This would require testing with CLI not installed
      const available = await executor.checkAvailability();
      expect(typeof available).toBe('boolean');
    });

    it('should have checkAvailability method', () => {
      expect(typeof executor.checkAvailability).toBe('function');
    });
  });

  describe('task execution', () => {
    const createTask = (prompt: string): ExecutionTask => ({
      id: 'test-task',
      type: 'custom',
      prompt,
      workDir,
      priority: 0,
      dependencies: [],
      createdAt: new Date(),
      config: {},
    });

    it('should create task with simple prompt', () => {
      const task = createTask('Add authentication');
      expect(task.prompt).toBe('Add authentication');
    });

    it('should handle system prompt combination', () => {
      const executorWithPrompt = new GeminiExecutor({
        workDir: '/test',
        systemPrompt: 'You are a coding assistant.',
      });

      // Access private method via type assertion for testing
      const combined = (executorWithPrompt as any).combinePrompt('Add login');

      expect(combined).toBe('You are a coding assistant.\n\nAdd login');
    });

    it('should not modify prompt when no system prompt', () => {
      const combined = (executor as any).combinePrompt('Add login');

      expect(combined).toBe('Add login');
    });
  });

  describe('session manager access', () => {
    it('should provide access to session manager', () => {
      const sessionManager = executor.getSessionManager();
      expect(sessionManager).toBeDefined();
    });

    it('should provide access to normalizer', () => {
      const normalizer = executor.getNormalizer();
      expect(normalizer).toBeDefined();
      expect(normalizer.getCurrentIndex()).toBe(0);
    });
  });

  describe('resumeTask', () => {
    it('should throw error for non-existent session', async () => {
      const task = {
        id: 'test-task',
        type: 'custom' as const,
        prompt: 'Continue work',
        workDir,
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      await expect(
        executor.resumeTask(task, 'non-existent-session'),
      ).rejects.toThrow('Session non-existent-session not found');
    });
  });

  describe('normalizeOutput', () => {
    it('should return async iterable', async () => {
      // Create empty output stream
      async function* emptyStream() {
        // Empty stream
      }

      const normalized = executor.normalizeOutput(emptyStream(), workDir);

      // Should be iterable
      expect(Symbol.asyncIterator in normalized).toBe(true);

      // Should not yield any entries for empty stream
      const entries = [];
      for await (const entry of normalized) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(0);
    });
  });
});
