/**
 * Signal Handlers
 *
 * Sets up process signal handlers for graceful shutdown.
 */

import type { ShutdownManager } from './shutdown.js';

/**
 * Setup signal handlers for graceful shutdown
 */
export function setupSignalHandlers(shutdownManager: ShutdownManager): void {
  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    console.log('\n[!] Received Ctrl+C, terminating agent...');
    try {
      await shutdownManager.shutdown('SIGTERM');
      process.exit(130); // Standard exit code for SIGINT
    } catch (error) {
      console.error('[ERR] Shutdown failed:', error);
      process.exit(1);
    }
  });

  // Handle SIGTERM (kill command)
  process.on('SIGTERM', async () => {
    console.log('\n[!] Received SIGTERM, terminating agent...');
    try {
      await shutdownManager.shutdown('SIGTERM');
      process.exit(143); // Standard exit code for SIGTERM
    } catch (error) {
      console.error('[ERR] Shutdown failed:', error);
      process.exit(1);
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('[ERR] Uncaught exception:', error);
    try {
      await shutdownManager.shutdown('SIGKILL');
    } catch {
      // Ignore errors during emergency shutdown
    }
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason) => {
    console.error('[ERR] Unhandled rejection:', reason);
    try {
      await shutdownManager.shutdown('SIGKILL');
    } catch {
      // Ignore errors during emergency shutdown
    }
    process.exit(1);
  });
}
