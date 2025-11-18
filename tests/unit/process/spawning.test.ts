/**
 * Tests for Process Spawning
 *
 * Tests the generic process spawning functionality including
 * process creation, configuration handling, and metrics tracking.
 */

import { describe, it, beforeEach , expect } from 'vitest'
import { SimpleProcessManager } from '@/process/simple-manager.ts';
import type { ProcessConfig } from '@/process/types.ts';

describe('Process Spawning', () => {
  let manager: SimpleProcessManager;

  beforeEach(() => {
    manager = new SimpleProcessManager();
  });

  // Note: shutdown() not yet implemented, so no afterEach cleanup

  describe('acquireProcess', () => {
    it('spawns a process successfully', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',  // Use echo for testing
        args: ['test'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      expect(managedProcess).toBeTruthy();
      expect(managedProcess.id).toBeTruthy();
      expect(managedProcess.pid).toBeTruthy();
      expect(managedProcess.status).toBe('busy');
    });

    it('generates unique process ID', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
      };

      const process1 = await manager.acquireProcess(config);
      const process2 = await manager.acquireProcess(config);

      expect(process1.id).not.toBe(process2.id);
      expect(process1.id).toMatch(/^process-[a-z0-9]+$/);
      expect(process2.id).toMatch(/^process-[a-z0-9]+$/);
    });

    it('sets correct initial status', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      expect(managedProcess.status).toBe('busy');
      expect(managedProcess.spawnedAt instanceof Date).toBeTruthy();
      expect(managedProcess.lastActivity instanceof Date).toBeTruthy();
      expect(managedProcess.exitCode).toBe(null);
      expect(managedProcess.signal).toBe(null);
    });

    it('initializes process metrics', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      expect(managedProcess.metrics.totalDuration).toBe(0);
      expect(managedProcess.metrics.tasksCompleted).toBe(0);
      expect(managedProcess.metrics.successRate).toBe(1.0);
    });

    it('provides access to process streams', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      expect(managedProcess.streams.stdout).toBeTruthy();
      expect(managedProcess.streams.stderr).toBeTruthy();
      expect(managedProcess.streams.stdin).toBeTruthy();
      expect(managedProcess.process).toBeTruthy();
    });

    it('tracks process in activeProcesses map', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);
      const retrieved = manager.getProcess(managedProcess.id);

      expect(retrieved).toBeTruthy();
      expect(retrieved?.id).toBe(managedProcess.id);
      expect(retrieved?.pid).toBe(managedProcess.pid);
    });

    it('updates global metrics on spawn', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
      };

      const initialMetrics = manager.getMetrics();
      const initialSpawned = initialMetrics.totalSpawned;
      const initialActive = initialMetrics.currentlyActive;

      await manager.acquireProcess(config);

      const updatedMetrics = manager.getMetrics();
      expect(updatedMetrics.totalSpawned).toBe(initialSpawned + 1);
      expect(updatedMetrics.currentlyActive).toBe(initialActive + 1);
    });

    it('uses correct working directory', async () => {
      const testDir = process.cwd();
      const config: ProcessConfig = {
        executablePath: 'pwd',  // pwd command shows working directory
        args: [],
        workDir: testDir,
      };

      const managedProcess = await manager.acquireProcess(config);

      // Verify the working directory by reading stdout
      const output = await new Promise<string>((resolve) => {
        let data = '';
        managedProcess.streams.stdout.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        managedProcess.process.on('exit', () => {
          resolve(data.trim());
        });
      });

      expect(output).toBe(testDir);
    });

    it('passes environment variables', async () => {
      const config: ProcessConfig = {
        executablePath: 'sh',
        args: ['-c', 'echo $TEST_VAR'],
        workDir: process.cwd(),
        env: {
          TEST_VAR: 'test_value',
        },
      };

      const managedProcess = await manager.acquireProcess(config);

      // Verify environment variable is accessible in the spawned process
      const output = await new Promise<string>((resolve) => {
        let data = '';
        managedProcess.streams.stdout.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        managedProcess.process.on('exit', () => {
          resolve(data.trim());
        });
      });

      expect(output).toBe('test_value');
    });

    it('merges with default config', async () => {
      const managerWithDefaults = new SimpleProcessManager({
        executablePath: 'echo',
        args: ['test'],
      });

      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
      };

      const managedProcess = await managerWithDefaults.acquireProcess(config);
      expect(managedProcess).toBeTruthy();
    });

    it('handles multiple concurrent processes', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
      };

      const processes = await Promise.all([
        manager.acquireProcess(config),
        manager.acquireProcess(config),
        manager.acquireProcess(config),
      ]);

      expect(processes.length).toBe(3);
      expect(manager.getMetrics().currentlyActive).toBe(3);

      // All should have unique IDs
      const ids = processes.map(p => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('Process Configuration', () => {
    it('spawns process with custom args', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['hello', 'world'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      // Verify args are passed correctly
      const output = await new Promise<string>((resolve) => {
        let data = '';
        managedProcess.streams.stdout.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        managedProcess.process.on('exit', () => {
          resolve(data.trim());
        });
      });

      expect(output).toBe('hello world');
    });

    it('spawns process with empty args', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: [],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);
      expect(managedProcess).toBeTruthy();
    });

    it('spawns process with multiple args', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['arg1', 'arg2', 'arg3', 'arg4'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      // Verify all args are passed
      const output = await new Promise<string>((resolve) => {
        let data = '';
        managedProcess.streams.stdout.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        managedProcess.process.on('exit', () => {
          resolve(data.trim());
        });
      });

      expect(output).toBe('arg1 arg2 arg3 arg4');
    });

    it('configures stdio as pipes', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      // Verify all streams are available (piped)
      expect(managedProcess.streams.stdin, 'stdin should be piped').toBeTruthy();
      expect(managedProcess.streams.stdout, 'stdout should be piped').toBeTruthy();
      expect(managedProcess.streams.stderr, 'stderr should be piped').toBeTruthy();
      expect(managedProcess.streams.stdin.writable, 'stdin should be writable').toBeTruthy();
      expect(managedProcess.streams.stdout.readable, 'stdout should be readable').toBeTruthy();
      expect(managedProcess.streams.stderr.readable, 'stderr should be readable').toBeTruthy();
    });

    it('inherits parent environment variables', async () => {
      // Set a parent env var
      const originalPath = process.env.PATH;
      expect(originalPath, 'PATH should exist in parent environment').toBeTruthy();

      const config: ProcessConfig = {
        executablePath: 'sh',
        args: ['-c', 'echo $PATH'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      // Verify parent env var is accessible
      const output = await new Promise<string>((resolve) => {
        let data = '';
        managedProcess.streams.stdout.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        managedProcess.process.on('exit', () => {
          resolve(data.trim());
        });
      });

      expect(output).toBe(originalPath);
    });

    it('merges custom env with parent env', async () => {
      const config: ProcessConfig = {
        executablePath: 'sh',
        args: ['-c', 'echo $PATH:$CUSTOM_VAR'],
        workDir: process.cwd(),
        env: {
          CUSTOM_VAR: 'custom_value',
        },
      };

      const managedProcess = await manager.acquireProcess(config);

      // Verify both parent and custom env vars are accessible
      const output = await new Promise<string>((resolve) => {
        let data = '';
        managedProcess.streams.stdout.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        managedProcess.process.on('exit', () => {
          resolve(data.trim());
        });
      });

      expect(output.includes(process.env.PATH!)).toBeTruthy();
      expect(output.includes('custom_value')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('throws error if process fails to spawn without PID', async () => {
      const config: ProcessConfig = {
        executablePath: '/nonexistent/command',
        args: ['test'],
        workDir: process.cwd(),
      };

      // When spawn fails to get a PID, acquireProcess should throw
      await expect(manager.acquireProcess(config)).rejects.toThrow(
        /Failed to spawn process: no PID assigned/
      );
    });
  });

  describe('ManagedProcess Structure', () => {
    it('returns complete ManagedProcess object', async () => {
      const config: ProcessConfig = {
        executablePath: 'sleep',
        args: ['0.1'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      // Verify all required fields exist
      expect(managedProcess.id, 'Should have id').toBeTruthy();
      expect(managedProcess.pid, 'Should have pid').toBeTruthy();
      expect(managedProcess.status, 'Should have status').toBeTruthy();
      expect(managedProcess.spawnedAt, 'Should have spawnedAt').toBeTruthy();
      expect(managedProcess.lastActivity, 'Should have lastActivity').toBeTruthy();
      expect(managedProcess.process, 'Should have process').toBeTruthy();
      expect(managedProcess.streams, 'Should have streams').toBeTruthy();
      expect(managedProcess.metrics, 'Should have metrics').toBeTruthy();

      // Verify field types
      expect(typeof managedProcess.id).toBe('string');
      expect(typeof managedProcess.pid).toBe('number');
      expect(typeof managedProcess.status).toBe('string');
      expect(managedProcess.spawnedAt instanceof Date).toBeTruthy();
      expect(managedProcess.lastActivity instanceof Date).toBeTruthy();
      expect(typeof managedProcess.process).toBe('object');
      expect(typeof managedProcess.streams).toBe('object');
      expect(typeof managedProcess.metrics).toBe('object');
    });

    it('initializes exit fields correctly', async () => {
      const config: ProcessConfig = {
        executablePath: 'sleep',
        args: ['0.1'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      // Exit fields should be null initially
      expect(managedProcess.exitCode).toBe(null);
      expect(managedProcess.signal).toBe(null);
    });

    it('initializes timestamps correctly', async () => {
      const before = new Date();
      const config: ProcessConfig = {
        executablePath: 'sleep',
        args: ['0.1'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);
      const after = new Date();

      // Timestamps should be between before and after
      expect(managedProcess.spawnedAt >= before).toBeTruthy();
      expect(managedProcess.spawnedAt <= after).toBeTruthy();
      expect(managedProcess.lastActivity >= before).toBeTruthy();
      expect(managedProcess.lastActivity <= after).toBeTruthy();
    });

    it('initializes metrics with correct defaults', async () => {
      const config: ProcessConfig = {
        executablePath: 'sleep',
        args: ['0.1'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      // Verify metrics structure and defaults
      expect(managedProcess.metrics.totalDuration).toBe(0);
      expect(managedProcess.metrics.tasksCompleted).toBe(0);
      expect(managedProcess.metrics.successRate).toBe(1.0);
    });

    it('provides access to underlying ChildProcess', async () => {
      const config: ProcessConfig = {
        executablePath: 'sleep',
        args: ['0.1'],
        workDir: process.cwd(),
      };

      const managedProcess = await manager.acquireProcess(config);

      // Verify ChildProcess methods are available
      expect(typeof managedProcess.process.kill === 'function').toBeTruthy();
      expect(typeof managedProcess.process.on === 'function').toBeTruthy();
      expect(typeof managedProcess.process.once === 'function').toBeTruthy();
      expect(managedProcess.process.stdin).toBeTruthy();
      expect(managedProcess.process.stdout).toBeTruthy();
      expect(managedProcess.process.stderr).toBeTruthy();
    });
  });
});
