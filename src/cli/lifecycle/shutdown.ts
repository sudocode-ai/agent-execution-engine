/**
 * Shutdown Manager
 *
 * Manages graceful shutdown of agent processes when CLI exits.
 */

import type { IProcessManager } from '../../process/manager.js';
import type { ShutdownOptions, ShutdownResult } from './types.js';

/**
 * Manages graceful shutdown of agent processes
 */
export class ShutdownManager {
  private processId: string | null = null;
  private processManager: IProcessManager | null = null;
  private shutdownInProgress = false;
  private options: Required<ShutdownOptions>;

  constructor(options: ShutdownOptions = {}) {
    this.options = {
      gracefulTimeoutMs: options.gracefulTimeoutMs ?? 5000,
      verbose: options.verbose ?? true,
    };
  }

  /**
   * Register a process for shutdown management
   */
  register(processId: string, processManager: IProcessManager): void {
    this.processId = processId;
    this.processManager = processManager;
  }

  /**
   * Perform graceful shutdown of registered process
   */
  async shutdown(signal: NodeJS.Signals = 'SIGTERM'): Promise<ShutdownResult> {
    const startTime = Date.now();

    // Prevent multiple simultaneous shutdowns
    if (this.shutdownInProgress) {
      return {
        success: true,
        method: 'already-exited',
        durationMs: 0,
      };
    }

    this.shutdownInProgress = true;

    try {
      // No process registered
      if (!this.processId || !this.processManager) {
        return {
          success: true,
          method: 'no-process',
          durationMs: Date.now() - startTime,
        };
      }

      // Check if process still exists
      const process = this.processManager.getProcess(this.processId);
      if (!process || process.status === 'completed' || process.status === 'crashed') {
        return {
          success: true,
          method: 'already-exited',
          durationMs: Date.now() - startTime,
        };
      }

      // Log shutdown start
      if (this.options.verbose) {
        console.log('\n[i] Waiting for agent to exit gracefully...');
      }

      // Send termination signal
      await this.processManager.terminateProcess(this.processId, signal);

      // Wait for graceful exit with timeout
      const exitedGracefully = await this.waitForExit(this.options.gracefulTimeoutMs);

      if (exitedGracefully) {
        if (this.options.verbose) {
          console.log('[OK] Agent terminated successfully');
        }
        return {
          success: true,
          method: 'graceful',
          durationMs: Date.now() - startTime,
        };
      }

      // Force kill after timeout
      if (this.options.verbose) {
        console.warn('[!] Timeout exceeded, force killing agent...');
      }

      await this.processManager.terminateProcess(this.processId, 'SIGKILL');

      // Wait a bit for force kill
      await this.waitForExit(1000);

      return {
        success: true,
        method: 'forced',
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        method: 'graceful',
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // Cleanup
      try {
        if (this.processManager) {
          await this.processManager.shutdown();
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Wait for process to exit
   */
  private async waitForExit(timeoutMs: number): Promise<boolean> {
    if (!this.processId || !this.processManager) {
      return true;
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const process = this.processManager.getProcess(this.processId);

      if (!process || process.status === 'completed' || process.status === 'crashed') {
        return true;
      }

      // Check every 100ms
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return false;
  }
}
