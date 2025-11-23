import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShutdownManager } from '@/cli/lifecycle/shutdown';
import type { IProcessManager } from '@/process/manager';
import type { ManagedProcess } from '@/process/types';

describe('ShutdownManager', () => {
  let shutdownManager: ShutdownManager;
  let mockProcessManager: IProcessManager;
  let mockProcess: ManagedProcess;

  beforeEach(() => {
    // Create mock process
    mockProcess = {
      id: 'test-process-123',
      status: 'running',
      startTime: new Date(),
      process: {} as any,
    };

    // Create mock process manager
    mockProcessManager = {
      getProcess: vi.fn(() => mockProcess),
      terminateProcess: vi.fn(),
      shutdown: vi.fn(),
      acquireProcess: vi.fn(),
      releaseProcess: vi.fn(),
      sendInput: vi.fn(),
      onOutput: vi.fn(),
      onError: vi.fn(),
      getActiveProcesses: vi.fn(),
      getMetrics: vi.fn(),
    };

    shutdownManager = new ShutdownManager({
      gracefulTimeoutMs: 1000, // Short timeout for tests
      verbose: false,
    });
  });

  describe('shutdown with no registered process', () => {
    it('should return success with no-process method', async () => {
      const result = await shutdownManager.shutdown();

      expect(result.success).toBe(true);
      expect(result.method).toBe('no-process');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('shutdown with registered process', () => {
    beforeEach(() => {
      shutdownManager.register('test-process-123', mockProcessManager);
    });

    it('should gracefully shutdown a running process', async () => {
      // Mock process exiting gracefully
      let callCount = 0;
      vi.mocked(mockProcessManager.getProcess).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: process is running
          return mockProcess;
        }
        // Subsequent calls: process has completed
        return { ...mockProcess, status: 'completed' };
      });

      const result = await shutdownManager.shutdown('SIGTERM');

      expect(result.success).toBe(true);
      expect(result.method).toBe('graceful');
      expect(mockProcessManager.terminateProcess).toHaveBeenCalledWith(
        'test-process-123',
        'SIGTERM',
      );
      expect(mockProcessManager.shutdown).toHaveBeenCalled();
    });

    it('should force kill if graceful shutdown times out', async () => {
      // Mock process never terminating during timeout
      vi.mocked(mockProcessManager.getProcess).mockReturnValue(mockProcess);

      const result = await shutdownManager.shutdown('SIGTERM');

      expect(result.success).toBe(true);
      expect(result.method).toBe('forced');
      expect(mockProcessManager.terminateProcess).toHaveBeenCalledWith(
        'test-process-123',
        'SIGTERM',
      );
      expect(mockProcessManager.terminateProcess).toHaveBeenCalledWith(
        'test-process-123',
        'SIGKILL',
      );
      expect(mockProcessManager.shutdown).toHaveBeenCalled();
    });

    it('should handle already-exited process', async () => {
      mockProcess.status = 'completed';

      const result = await shutdownManager.shutdown();

      expect(result.success).toBe(true);
      expect(result.method).toBe('already-exited');
      expect(mockProcessManager.terminateProcess).not.toHaveBeenCalled();
      expect(mockProcessManager.shutdown).toHaveBeenCalled();
    });

    it('should handle process that does not exist', async () => {
      vi.mocked(mockProcessManager.getProcess).mockReturnValue(null);

      const result = await shutdownManager.shutdown();

      expect(result.success).toBe(true);
      expect(result.method).toBe('already-exited');
      expect(mockProcessManager.terminateProcess).not.toHaveBeenCalled();
      expect(mockProcessManager.shutdown).toHaveBeenCalled();
    });

    it('should prevent multiple simultaneous shutdowns', async () => {
      // Mock process that takes time to exit
      vi.mocked(mockProcessManager.getProcess).mockReturnValue(mockProcess);

      // Start two shutdowns concurrently
      const [result1, result2] = await Promise.all([
        shutdownManager.shutdown(),
        shutdownManager.shutdown(),
      ]);

      // First shutdown should be forced (timeout)
      expect(result1.success).toBe(true);
      expect(result1.method).toBe('forced');

      // Second shutdown should be already-exited
      expect(result2.success).toBe(true);
      expect(result2.method).toBe('already-exited');
      expect(result2.durationMs).toBe(0);
    });

    it('should handle termination errors', async () => {
      vi.mocked(mockProcessManager.terminateProcess).mockRejectedValue(
        new Error('Termination failed'),
      );

      const result = await shutdownManager.shutdown();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Termination failed');
    });

    it('should cleanup process manager even if shutdown fails', async () => {
      vi.mocked(mockProcessManager.terminateProcess).mockRejectedValue(
        new Error('Termination failed'),
      );

      await shutdownManager.shutdown();

      expect(mockProcessManager.shutdown).toHaveBeenCalled();
    });

    it('should ignore cleanup errors', async () => {
      vi.mocked(mockProcessManager.shutdown).mockRejectedValue(
        new Error('Cleanup failed'),
      );

      // Mock process exiting gracefully
      vi.mocked(mockProcessManager.getProcess).mockReturnValueOnce(mockProcess);
      vi.mocked(mockProcessManager.getProcess).mockReturnValue({
        ...mockProcess,
        status: 'completed',
      });

      const result = await shutdownManager.shutdown();

      // Should still succeed despite cleanup error
      expect(result.success).toBe(true);
      expect(result.method).toBe('graceful');
    });
  });

  describe('verbose mode', () => {
    it('should log shutdown messages when verbose is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseManager = new ShutdownManager({ verbose: true });

      verboseManager.register('test-process-123', mockProcessManager);

      // Mock process exiting gracefully
      vi.mocked(mockProcessManager.getProcess).mockReturnValueOnce(mockProcess);
      vi.mocked(mockProcessManager.getProcess).mockReturnValue({
        ...mockProcess,
        status: 'completed',
      });

      await verboseManager.shutdown();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Waiting for agent'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('terminated successfully'));

      consoleSpy.mockRestore();
    });

    it('should log force kill warning when timeout is exceeded', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const verboseManager = new ShutdownManager({ verbose: true, gracefulTimeoutMs: 100 });

      verboseManager.register('test-process-123', mockProcessManager);

      // Mock process never terminating
      vi.mocked(mockProcessManager.getProcess).mockReturnValue(mockProcess);

      await verboseManager.shutdown();

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('force killing'));

      consoleWarnSpy.mockRestore();
    });
  });
});
