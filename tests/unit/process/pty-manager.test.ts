/**
 * Tests for PtyProcessManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PtyProcessManager } from '@/process/pty-manager';
import type { ProcessConfig } from '@/process/types';

describe('PtyProcessManager', () => {
  let manager: PtyProcessManager;

  beforeEach(() => {
    manager = new PtyProcessManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('acquireProcess', () => {
    it('should spawn a PTY process', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['Hello, World!'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);

      expect(managedProcess).toBeDefined();
      expect(managedProcess.pid).toBeGreaterThan(0);
      expect(managedProcess.status).toBe('busy');
      expect(managedProcess.id).toMatch(/^pty-/);
      expect(managedProcess.ptyProcess).toBeDefined();
    });

    it('should use default terminal config when not specified', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);

      expect(managedProcess).toBeDefined();
      // Defaults should be cols: 80, rows: 24, name: 'xterm-256color'
    });

    it('should use custom terminal config when specified', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
        mode: 'interactive',
        terminal: {
          cols: 120,
          rows: 40,
          name: 'xterm',
        },
      };

      const managedProcess = await manager.acquireProcess(config);

      expect(managedProcess).toBeDefined();
    });

    it('should spawn even with invalid command (PTY behavior)', async () => {
      // Note: PTY spawns successfully even with nonexistent commands
      // The error shows up on the first attempt to interact with the process
      const config: ProcessConfig = {
        executablePath: '/nonexistent/command',
        args: [],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);
      expect(managedProcess).toBeDefined();
      expect(managedProcess.pid).toBeGreaterThan(0);
    });

    it('should track process in activeProcesses', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);
      const retrieved = manager.getProcess(managedProcess.id);

      expect(retrieved).toBe(managedProcess);
    });

    it('should update metrics on spawn', async () => {
      const initialMetrics = manager.getMetrics();

      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      await manager.acquireProcess(config);
      const metricsAfter = manager.getMetrics();

      expect(metricsAfter.totalSpawned).toBe(initialMetrics.totalSpawned + 1);
      expect(metricsAfter.currentlyActive).toBe(initialMetrics.currentlyActive + 1);
    });
  });

  describe('PTY I/O', () => {
    it('should receive output from PTY via onData', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test output'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);
      const output: string[] = [];

      managedProcess.onData((data) => {
        output.push(data);
      });

      // Wait for output
      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      expect(output.join('')).toContain('test output');
    });

    it('should send input to PTY via write()', async () => {
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

      const config: ProcessConfig = {
        executablePath: shell,
        args: [],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);
      let output = '';

      managedProcess.onData((data) => {
        output += data;
      });

      // Send command
      managedProcess.write('echo "hello from PTY"\r');
      managedProcess.write('exit\r');

      // Wait for exit
      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      expect(output).toContain('hello from PTY');
    });

    it('should update lastActivity on data', async () => {
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

      const config: ProcessConfig = {
        executablePath: shell,
        args: [],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);
      const initialActivity = managedProcess.lastActivity;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      let dataReceived = false;
      managedProcess.onData(() => {
        dataReceived = true;
      });

      // Send command that will produce output
      managedProcess.write('echo test\r');

      // Wait for data
      await new Promise((resolve) => {
        const checkData = setInterval(() => {
          if (dataReceived) {
            clearInterval(checkData);
            resolve(undefined);
          }
        }, 50);
      });

      // Clean up
      managedProcess.write('exit\r');

      expect(managedProcess.lastActivity.getTime()).toBeGreaterThan(
        initialActivity.getTime()
      );
    });
  });

  describe('Process lifecycle', () => {
    it('should handle process exit gracefully', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);

      const exitPromise = new Promise<{ exitCode: number; signal?: number }>(
        (resolve) => {
          managedProcess.onExit((exitCode, signal) => {
            resolve({ exitCode, signal });
          });
        }
      );

      const exit = await exitPromise;

      expect(exit.exitCode).toBe(0);
      expect(managedProcess.exitCode).toBe(0);
      expect(managedProcess.status).toBe('completed');
    });

    it('should update metrics on successful completion', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);

      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      const metrics = manager.getMetrics();
      expect(metrics.totalCompleted).toBeGreaterThan(0);
      expect(metrics.currentlyActive).toBe(0);
    });

    it('should update metrics on failure', async () => {
      const config: ProcessConfig = {
        executablePath: 'sh',
        args: ['-c', 'exit 1'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);

      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      expect(managedProcess.status).toBe('crashed');
      const metrics = manager.getMetrics();
      expect(metrics.totalFailed).toBeGreaterThan(0);
    });

    it('should schedule cleanup after exit', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);

      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      // Process should still be in activeProcesses immediately after exit
      expect(manager.getProcess(managedProcess.id)).not.toBeNull();

      // Wait for cleanup timer (5 seconds + buffer)
      await new Promise((resolve) => setTimeout(resolve, 5500));

      // Process should be removed after cleanup
      expect(manager.getProcess(managedProcess.id)).toBeNull();
    }, 10000); // Increase timeout for this test
  });

  describe('terminateProcess', () => {
    it('should terminate a running process', async () => {
      const config: ProcessConfig = {
        executablePath: 'sleep',
        args: ['10'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);

      // Terminate immediately
      await manager.terminateProcess(managedProcess.id);

      // After termination, status could be 'terminating' or already 'completed'/'crashed'
      // depending on timing
      expect(['terminating', 'completed', 'crashed']).toContain(
        managedProcess.status
      );
      expect(managedProcess.exitCode).not.toBeNull();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);

      await manager.terminateProcess(managedProcess.id);
      await manager.terminateProcess(managedProcess.id);
      await manager.terminateProcess(managedProcess.id);

      // Should not throw
    });

    it('should do nothing if process not found', async () => {
      await manager.terminateProcess('nonexistent-id');
      // Should not throw
    });
  });

  describe('sendInput', () => {
    it('should send input via sendInput method', async () => {
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

      const config: ProcessConfig = {
        executablePath: shell,
        args: [],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);
      let output = '';

      managedProcess.onData((data) => {
        output += data;
      });

      await manager.sendInput(managedProcess.id, 'echo "via sendInput"\r');
      await manager.sendInput(managedProcess.id, 'exit\r');

      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      expect(output).toContain('via sendInput');
    });

    it('should throw error if process not found', async () => {
      await expect(
        manager.sendInput('nonexistent-id', 'test')
      ).rejects.toThrow('Process nonexistent-id not found');
    });
  });

  describe('onOutput', () => {
    it('should register output handler', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test output'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);
      const outputs: Buffer[] = [];

      manager.onOutput(managedProcess.id, (data, stream) => {
        outputs.push(data);
        expect(stream).toBe('stdout'); // PTY always emits stdout
      });

      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      expect(outputs.length).toBeGreaterThan(0);
      expect(Buffer.concat(outputs).toString()).toContain('test output');
    });

    it('should throw error if process not found', () => {
      expect(() => {
        manager.onOutput('nonexistent-id', () => {});
      }).toThrow('Process nonexistent-id not found');
    });
  });

  describe('onError', () => {
    it('should call error handler on non-zero exit', async () => {
      const config: ProcessConfig = {
        executablePath: 'sh',
        args: ['-c', 'exit 1'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);
      const errors: Error[] = [];

      manager.onError(managedProcess.id, (error) => {
        errors.push(error);
      });

      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain('exited with code 1');
    });

    it('should throw error if process not found', () => {
      expect(() => {
        manager.onError('nonexistent-id', () => {});
      }).toThrow('Process nonexistent-id not found');
    });
  });

  describe('getActiveProcesses', () => {
    it('should return all active processes', async () => {
      const config: ProcessConfig = {
        executablePath: 'sleep',
        args: ['5'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const process1 = await manager.acquireProcess(config);
      const process2 = await manager.acquireProcess(config);

      const active = manager.getActiveProcesses();

      expect(active.length).toBe(2);
      expect(active).toContainEqual(process1);
      expect(active).toContainEqual(process2);
    });
  });

  describe('shutdown', () => {
    it('should terminate all active processes', async () => {
      const config: ProcessConfig = {
        executablePath: 'sleep',
        args: ['10'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      await manager.acquireProcess(config);
      await manager.acquireProcess(config);

      expect(manager.getActiveProcesses().length).toBe(2);

      await manager.shutdown();

      // All processes should be terminated
      const active = manager.getActiveProcesses();
      active.forEach((p) => {
        expect(p.exitCode).not.toBeNull();
      });
    });

    it('should clear all cleanup timers', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
        mode: 'interactive',
      };

      const managedProcess = await manager.acquireProcess(config);

      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      await manager.shutdown();

      // Cleanup timers should be cleared (no way to verify directly, but should not throw)
    });
  });

  describe('timeout handling', () => {
    it('should terminate process after timeout', async () => {
      const config: ProcessConfig = {
        executablePath: 'sleep',
        args: ['10'],
        workDir: process.cwd(),
        mode: 'interactive',
        timeout: 1000, // 1 second timeout
      };

      const managedProcess = await manager.acquireProcess(config);

      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      // Process should have been killed by timeout
      // Status could be 'terminating', 'completed', or 'crashed' depending on timing
      expect(managedProcess.exitCode).not.toBeNull();
      expect(['terminating', 'completed', 'crashed']).toContain(
        managedProcess.status
      );
    }, 5000);

    it('should clear timeout on early exit', async () => {
      const config: ProcessConfig = {
        executablePath: 'echo',
        args: ['test'],
        workDir: process.cwd(),
        mode: 'interactive',
        timeout: 5000, // 5 second timeout
      };

      const managedProcess = await manager.acquireProcess(config);

      await new Promise((resolve) => {
        managedProcess.onExit(() => resolve(undefined));
      });

      // Process should have exited normally before timeout
      expect(managedProcess.status).toBe('completed');
    });
  });
});
