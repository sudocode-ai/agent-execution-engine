/**
 * Integration tests for Cursor executor
 *
 * These tests require cursor-agent to be installed and available in PATH.
 * Tests will be skipped if cursor-agent is not found.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { CursorExecutor } from '@/agents/cursor/executor';
import type { ExecutionTask } from '@/engine/types';
import type { NormalizedEntry } from '@/agents/types/agent-executor';
import { createOutputChunks } from '@/agents/base/base-executor';

describe('CursorExecutor Integration', () => {
  let cursorAvailable = false;
  let executor: CursorExecutor;

  beforeAll(async () => {
    executor = new CursorExecutor({
      force: true,
      model: 'auto',
    });

    // Check if cursor-agent is available
    cursorAvailable = await executor.checkAvailability();

    if (!cursorAvailable) {
      console.warn(
        '⚠️  Skipping Cursor integration tests: cursor-agent not found in PATH'
      );
      console.warn('   Install from: https://cursor.sh');
    }
  });

  describe('checkAvailability', () => {
    it('should detect cursor-agent availability', async () => {
      const available = await executor.checkAvailability();

      // Just check that it returns a boolean
      expect(typeof available).toBe('boolean');

      if (available) {
        console.log('✅ cursor-agent found in PATH');
      }
    });
  });

  describe('executeTask', () => {
    it.skipIf(!cursorAvailable)(
      'should spawn cursor-agent process',
      async () => {
        const task: ExecutionTask = {
          id: 'test-1',
          type: 'custom',
          prompt: 'Say hello',
          workDir: process.cwd(),
          config: {},
        };

        const spawned = await executor.executeTask(task);

        expect(spawned.process).toBeDefined();
        expect(spawned.process.pid).toBeDefined();
        expect(spawned.process.status).toBe('busy');

        // Terminate the process
        spawned.process.kill();
      },
      10000
    );

    it.skipIf(!cursorAvailable)(
      'should collect normalized output',
      async () => {
        const task: ExecutionTask = {
          id: 'test-2',
          type: 'custom',
          prompt: 'What is 2+2?',
          workDir: process.cwd(),
          config: {},
        };

        const spawned = await executor.executeTask(task);
        const outputStream = createOutputChunks(spawned.process);

        const entries: NormalizedEntry[] = [];

        // Collect first few entries (don't wait for completion)
        let count = 0;
        for await (const entry of executor.normalizeOutput(
          outputStream,
          process.cwd()
        )) {
          entries.push(entry);
          count++;

          // Stop after collecting a reasonable number of entries
          if (count >= 10) {
            spawned.process.kill();
            break;
          }
        }

        // Verify we got some output
        expect(entries.length).toBeGreaterThan(0);

        // Verify output structure
        entries.forEach((entry) => {
          expect(entry).toHaveProperty('index');
          expect(entry).toHaveProperty('timestamp');
          expect(entry).toHaveProperty('type');
          expect(entry).toHaveProperty('content');
          expect(entry.type).toHaveProperty('kind');
        });

        console.log(`Collected ${entries.length} entries`);
        console.log('Entry types:', [
          ...new Set(entries.map((e) => e.type.kind)),
        ]);
      },
      30000
    );
  });

  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const caps = executor.getCapabilities();

      expect(caps).toEqual({
        supportsSessionResume: true,
        requiresSetup: true,
        supportsApprovals: false,
        supportsMcp: true,
        protocol: 'jsonl',
        supportsMidExecutionMessages: false,
      });
    });
  });

  describe('Configuration', () => {
    it('should support custom executable path', () => {
      const customExecutor = new CursorExecutor({
        executablePath: '/custom/path/cursor-agent',
        force: true,
      });

      expect(customExecutor).toBeDefined();
    });

    it('should support custom model', () => {
      const customExecutor = new CursorExecutor({
        model: 'sonnet-4.5',
        force: true,
      });

      expect(customExecutor).toBeDefined();
    });

    it('should support append prompt', () => {
      const customExecutor = new CursorExecutor({
        appendPrompt: '\n\nPlease be concise.',
        force: true,
      });

      expect(customExecutor).toBeDefined();
    });
  });
});
