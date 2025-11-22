import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiExecutor } from '@/agents/gemini/executor';
import { GeminiOutputNormalizer } from '@/agents/gemini/normalizer/output-normalizer';
import { SessionManager } from '@/agents/gemini/session/session-manager';
import type { ExecutionTask } from '@/engine/types';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Integration tests for Gemini executor full stack
 * Tests the integration between Executor → Harness → Session → Normalizer
 *
 * These tests use mock/simulated data and do NOT require real Gemini CLI.
 * For E2E tests with real CLI, see tests/e2e/agents/gemini.test.ts
 */
describe('Gemini Integration Tests', () => {
  let testDir: string;
  let executor: GeminiExecutor;

  beforeEach(async () => {
    // Create temp directory for test sessions
    testDir = path.join(os.tmpdir(), `gemini-integration-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Create executor with test directory
    executor = new GeminiExecutor({
      workDir: testDir,
      autoApprove: true,
      model: 'flash',
      sessionNamespace: 'test-sessions',
    });
  });

  describe('Executor → SessionManager integration', () => {
    it('should provide access to session manager', () => {
      const sessionManager = executor.getSessionManager();
      expect(sessionManager).toBeInstanceOf(SessionManager);
    });

    it('should use configured session namespace', () => {
      const sessionManager = executor.getSessionManager();
      // Check internal namespace (access via type assertion for testing)
      expect((sessionManager as any).namespace).toBe('test-sessions');
    });

    it('should check for session existence before resume', async () => {
      const task: ExecutionTask = {
        id: 'test-task',
        type: 'custom',
        prompt: 'Continue work',
        workDir: testDir,
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      // Should throw for non-existent session
      await expect(
        executor.resumeTask(task, 'non-existent-session'),
      ).rejects.toThrow('Session non-existent-session not found');
    });
  });

  describe('Executor → Normalizer integration', () => {
    it('should provide access to normalizer', () => {
      const normalizer = executor.getNormalizer();
      expect(normalizer).toBeInstanceOf(GeminiOutputNormalizer);
    });

    it('should reset normalizer on executeTask', async () => {
      const normalizer = executor.getNormalizer();

      // Manually advance index
      (normalizer as any).index = 10;
      expect(normalizer.getCurrentIndex()).toBe(10);

      // Note: executeTask would reset, but we can't actually execute without CLI
      // Just verify the normalizer exists and has reset capability
      normalizer.reset();
      expect(normalizer.getCurrentIndex()).toBe(0);
    });
  });

  describe('Executor configuration', () => {
    it('should combine system prompt with user prompt', () => {
      const executorWithPrompt = new GeminiExecutor({
        workDir: testDir,
        systemPrompt: 'You are a helpful assistant.',
      });

      // Access private method for testing
      const combined = (executorWithPrompt as any).combinePrompt('Write tests');
      expect(combined).toBe('You are a helpful assistant.\n\nWrite tests');
    });

    it('should not modify prompt when no system prompt', () => {
      const combined = (executor as any).combinePrompt('Write tests');
      expect(combined).toBe('Write tests');
    });

    it('should use correct default values', () => {
      const defaultExecutor = new GeminiExecutor({
        workDir: testDir,
      });

      const sessionManager = defaultExecutor.getSessionManager();
      expect((sessionManager as any).namespace).toBe('gemini-sessions');
    });
  });

  describe('Capabilities and availability', () => {
    it('should declare correct capabilities', () => {
      const caps = executor.getCapabilities();

      expect(caps.supportsSessionResume).toBe(true);
      expect(caps.requiresSetup).toBe(true);
      expect(caps.supportsApprovals).toBe(true);
      expect(caps.supportsMcp).toBe(true);
      expect(caps.protocol).toBe('stream-json');
    });

    it('should have checkAvailability method', () => {
      expect(typeof executor.checkAvailability).toBe('function');
    });
  });

  describe('Output normalization integration', () => {
    it('should create async iterable for normalizeOutput', async () => {
      // Create empty output stream
      async function* emptyStream() {
        // Empty stream
      }

      const normalized = executor.normalizeOutput(emptyStream(), testDir);

      // Should be iterable
      expect(Symbol.asyncIterator in normalized).toBe(true);

      // Should not yield entries for empty stream
      const entries = [];
      for await (const entry of normalized) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(0);
    });

    it('should handle normalizer output format', async () => {
      const normalizer = executor.getNormalizer();

      // Simulate a SessionNotification
      const mockNotification = {
        sessionId: 'test-session',
        update: {
          AgentMessageChunk: {
            content: {
              Text: { text: 'Hello from Gemini' },
            },
          },
        },
      } as any;

      const entry = normalizer.normalize(mockNotification, testDir);

      expect(entry).not.toBeNull();
      expect(entry!.type.kind).toBe('assistant_message');
      expect(entry!.content).toBe('Hello from Gemini');
      expect(entry!.index).toBe(0);
    });
  });

  describe('Session manager integration', () => {
    it('should persist and read events', async () => {
      const sessionManager = executor.getSessionManager();
      const sessionId = `integration-test-session-${Date.now()}`;

      // Append user message
      await sessionManager.appendRawLine(
        sessionId,
        JSON.stringify({ user: 'Test prompt' }),
      );

      // Append assistant message
      await sessionManager.appendRawLine(
        sessionId,
        JSON.stringify({ assistant: 'Test response' }),
      );

      // Read back
      const events = await sessionManager.readSession(sessionId);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ user: 'Test prompt' });
      expect(events[1]).toEqual({ assistant: 'Test response' });
    });

    it('should generate resume prompt with history', async () => {
      const sessionManager = executor.getSessionManager();
      const sessionId = `resume-test-session-${Date.now()}`;

      // Create conversation history
      await sessionManager.appendRawLine(
        sessionId,
        JSON.stringify({ user: 'Create a user model' }),
      );
      await sessionManager.appendRawLine(
        sessionId,
        JSON.stringify({ assistant: 'Created User model with fields' }),
      );

      // Generate resume prompt
      const resumePrompt = await sessionManager.generateResumePrompt(
        sessionId,
        'Add validation',
      );

      expect(resumePrompt).toContain('Resuming Previous Session');
      expect(resumePrompt).toContain('User: Create a user model');
      expect(resumePrompt).toContain('Assistant: Created User model with fields');
      expect(resumePrompt).toContain('New request: Add validation');
    });
  });

  describe('Normalizer with various event types', () => {
    it('should normalize all event types correctly', async () => {
      const normalizer = executor.getNormalizer();
      normalizer.reset();

      // Test different event types
      const events = [
        {
          sessionId: 'test',
          update: {
            AgentThoughtChunk: {
              content: { Text: { text: 'I need to read the file' } },
            },
          },
        },
        {
          sessionId: 'test',
          update: {
            AgentMessageChunk: {
              content: { Text: { text: 'Reading file now' } },
            },
          },
        },
        {
          sessionId: 'test',
          update: {
            ToolCall: {
              id: 'tool-1',
              kind: 'Read',
              title: 'config.json',
              status: 'Running',
            },
          },
        },
        {
          sessionId: 'test',
          update: {
            Plan: {
              entries: [
                { content: 'Step 1: Read config' },
                { content: 'Step 2: Update settings' },
              ],
            },
          },
        },
      ] as any[];

      const normalized = [];
      for (const event of events) {
        const entry = normalizer.normalize(event, testDir);
        if (entry) {
          normalized.push(entry);
        }
      }

      // Verify all events were normalized
      expect(normalized).toHaveLength(4);

      // Verify sequential indexing
      expect(normalized[0].index).toBe(0);
      expect(normalized[1].index).toBe(1);
      expect(normalized[2].index).toBe(2);
      expect(normalized[3].index).toBe(3);

      // Verify event types
      expect(normalized[0].type.kind).toBe('thinking');
      expect(normalized[1].type.kind).toBe('assistant_message');
      expect(normalized[2].type.kind).toBe('tool_use');
      expect(normalized[3].type.kind).toBe('thinking');
    });

    it('should handle tool status mapping correctly', () => {
      const normalizer = executor.getNormalizer();
      normalizer.reset();

      const statusTests = [
        { input: 'Pending', expected: 'created' },
        { input: 'Running', expected: 'running' },
        { input: 'Success', expected: 'success' },
        { input: 'Error', expected: 'failed' },
      ];

      for (const { input, expected } of statusTests) {
        const event = {
          sessionId: 'test',
          update: {
            ToolCall: {
              id: 'tool-1',
              kind: 'Read',
              title: 'file.ts',
              status: input,
            },
          },
        } as any;

        const entry = normalizer.normalize(event, testDir);
        expect(entry).not.toBeNull();

        if (entry!.type.kind === 'tool_use') {
          expect(entry!.type.tool.status).toBe(expected);
        }
      }
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-existent session', async () => {
      const sessionManager = executor.getSessionManager();

      // Try to read non-existent session - should throw
      await expect(
        sessionManager.readSession('non-existent'),
      ).rejects.toThrow('Session not found: non-existent');
    });

    it('should throw error for resumeTask with missing session', async () => {
      const task: ExecutionTask = {
        id: 'test',
        type: 'custom',
        prompt: 'Continue',
        workDir: testDir,
        priority: 0,
        dependencies: [],
        createdAt: new Date(),
        config: {},
      };

      await expect(executor.resumeTask(task, 'missing-session')).rejects.toThrow(
        'Session missing-session not found',
      );
    });
  });
});
