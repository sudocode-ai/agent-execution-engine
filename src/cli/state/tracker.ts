/**
 * State Tracker
 *
 * Tracks active CLI state and accumulated entries.
 */

import type { NormalizedEntry } from '../../agents/types/agent-executor.js';
import type { CliState } from './types.js';

/**
 * Tracks CLI state for active task
 */
export class StateTracker {
  private state: CliState | null = null;

  /**
   * Initialize state for new task
   */
  initialize(taskId: string, processId: string, agentName: string, workDir: string): void {
    this.state = {
      taskId,
      processId,
      agentName,
      workDir,
      startTime: new Date(),
      entries: [],
    };
  }

  /**
   * Add a normalized entry to state
   */
  addEntry(entry: NormalizedEntry): void {
    if (!this.state) {
      throw new Error('State not initialized. Call initialize() first.');
    }
    this.state.entries.push(entry);
  }

  /**
   * Get current state
   */
  getState(): CliState | null {
    return this.state;
  }

  /**
   * Get all accumulated entries
   */
  getEntries(): NormalizedEntry[] {
    return this.state?.entries ?? [];
  }

  /**
   * Get task ID
   */
  getTaskId(): string | null {
    return this.state?.taskId ?? null;
  }

  /**
   * Get process ID
   */
  getProcessId(): string | null {
    return this.state?.processId ?? null;
  }

  /**
   * Get task duration in milliseconds
   */
  getDuration(): number {
    if (!this.state) {
      return 0;
    }
    return Date.now() - this.state.startTime.getTime();
  }

  /**
   * Count tools used in accumulated entries
   */
  countToolsUsed(): number {
    const entries = this.getEntries();
    return entries.filter((e) => e.type.kind === 'tool_use').length;
  }

  /**
   * Count files changed in accumulated entries
   */
  countFilesChanged(): number {
    const entries = this.getEntries();
    const filePaths = new Set<string>();

    for (const entry of entries) {
      if (entry.type.kind === 'tool_use') {
        const { action } = entry.type.tool;
        if (action.kind === 'file_write' || action.kind === 'file_edit') {
          filePaths.add(action.path);
        }
      }
    }

    return filePaths.size;
  }

  /**
   * Clear state
   */
  clear(): void {
    this.state = null;
  }
}
