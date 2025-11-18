/**
 * Process Manager Factory
 *
 * Creates the appropriate process manager based on execution mode.
 *
 * @module execution/process/factory
 */

import type { IProcessManager } from './manager.js';
import type { ProcessConfig } from './types.js';
import { SimpleProcessManager } from './simple-manager.js';
import { PtyProcessManager } from './pty-manager.js';

/**
 * Create a process manager based on execution mode
 *
 * - 'structured' mode → SimpleProcessManager (stdio pipes, JSON output)
 * - 'interactive' mode → PtyProcessManager (PTY, full terminal)
 * - 'hybrid' mode → PtyProcessManager (PTY with JSON parsing)
 *
 * @param config - Process configuration with mode
 * @returns Appropriate process manager instance
 *
 * @example
 * ```typescript
 * // Structured mode (default)
 * const structuredManager = createProcessManager({
 *   executablePath: 'claude',
 *   args: ['--print', '--output-format', 'stream-json'],
 *   workDir: '/path/to/project',
 * });
 *
 * // Interactive mode
 * const interactiveManager = createProcessManager({
 *   executablePath: 'claude',
 *   args: [],
 *   workDir: '/path/to/project',
 *   mode: 'interactive',
 *   terminal: { cols: 80, rows: 24 },
 * });
 *
 * // Hybrid mode
 * const hybridManager = createProcessManager({
 *   executablePath: 'claude',
 *   args: ['--output-format', 'stream-json'],
 *   workDir: '/path/to/project',
 *   mode: 'hybrid',
 *   terminal: { cols: 80, rows: 24 },
 * });
 * ```
 */
export function createProcessManager(config: ProcessConfig): IProcessManager {
  const mode = config.mode || 'structured';

  switch (mode) {
    case 'interactive':
    case 'hybrid':
      return new PtyProcessManager();

    case 'structured':
    default:
      return new SimpleProcessManager();
  }
}
