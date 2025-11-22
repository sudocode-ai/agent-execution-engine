/**
 * Session Manager for Gemini CLI.
 *
 * Handles persistent JSONL storage, session forking, and history replay.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionManagerConfig, SessionEvent } from './types.js';

/**
 * Session manager for persistent conversation storage.
 *
 * @example
 * ```typescript
 * const manager = new SessionManager({ namespace: 'gemini-sessions' });
 *
 * // Append events
 * await manager.appendRawLine('session-123', '{"user":"Hello"}');
 * await manager.appendRawLine('session-123', '{"assistant":"Hi there!"}');
 *
 * // Read history
 * const history = await manager.readSessionRaw('session-123');
 *
 * // Fork session
 * await manager.forkSession('session-123', 'session-456');
 * ```
 */
export class SessionManager {
  private baseDir: string;
  private namespace: string;

  constructor(config: SessionManagerConfig) {
    this.namespace = config.namespace;

    if (config.baseDir) {
      this.baseDir = config.baseDir;
    } else {
      // Default to ~/.vibe-kanban/ or ~/.vibe-kanban/dev/
      const homeDir = os.homedir();
      const isDev = process.env.NODE_ENV === 'development';
      this.baseDir = path.join(
        homeDir,
        '.vibe-kanban',
        isDev ? 'dev' : '',
        this.namespace
      );
    }
  }

  /**
   * Get full path to session file.
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.baseDir, `${sessionId}.jsonl`);
  }

  /**
   * Ensure session directory exists.
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error) {
      // Ignore error if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Normalize and parse ACP event from raw JSON.
   *
   * Returns null for events that should be skipped.
   */
  private normalizeEvent(rawJson: string): SessionEvent | null {
    try {
      const parsed = JSON.parse(rawJson);

      // Handle notification wrapper from SDK
      if (parsed.notification) {
        const update = parsed.notification.update;

        // AgentMessageChunk -> assistant
        if (update.AgentMessageChunk) {
          const content = update.AgentMessageChunk.content;
          if (content.Text) {
            return { assistant: content.Text.text };
          }
          return null; // Skip non-text content
        }

        // AgentThoughtChunk -> thinking
        if (update.AgentThoughtChunk) {
          const content = update.AgentThoughtChunk.content;
          if (content.Text) {
            return { thinking: content.Text.text };
          }
          return null;
        }

        // ToolCall -> store full
        if (update.ToolCall) {
          return { type: 'ToolCall', toolCall: update.ToolCall };
        }

        // ToolCallUpdate -> store full
        if (update.ToolCallUpdate) {
          return { type: 'ToolUpdate', update: update.ToolCallUpdate };
        }

        // Plan -> store full
        if (update.Plan) {
          return { type: 'Plan', plan: update.Plan };
        }

        // AvailableCommandsUpdate -> store
        if (update.AvailableCommandsUpdate) {
          return {
            type: 'AvailableCommands',
            commands: update.AvailableCommandsUpdate.available_commands,
          };
        }

        // CurrentModeUpdate -> store
        if (update.CurrentModeUpdate) {
          return {
            type: 'CurrentMode',
            modeId: update.CurrentModeUpdate.current_mode_id,
          };
        }

        // Skip other events (Done, Error, etc.)
        return null;
      }

      // Direct event format (for user prompts, etc.)
      if (parsed.user) {
        return { user: parsed.user };
      }

      if (parsed.assistant) {
        return { assistant: parsed.assistant };
      }

      if (parsed.thinking) {
        return { thinking: parsed.thinking };
      }

      // Already normalized tool/plan events
      if (parsed.type) {
        return parsed as SessionEvent;
      }

      return null;
    } catch (error) {
      console.error('Failed to normalize event:', error);
      return null;
    }
  }

  /**
   * Append normalized ACP event to session log.
   *
   * Normalizes the event according to storage rules and appends to JSONL file.
   *
   * @param sessionId - Session identifier
   * @param rawJson - Raw JSON string (from SDK or user)
   */
  async appendRawLine(sessionId: string, rawJson: string): Promise<void> {
    await this.ensureDirectory();

    // Normalize event
    const normalized = this.normalizeEvent(rawJson);
    if (!normalized) {
      return; // Skip events that shouldn't be stored
    }

    // Append to file
    const sessionPath = this.getSessionPath(sessionId);
    const line = JSON.stringify(normalized) + '\n';
    await fs.appendFile(sessionPath, line, 'utf-8');
  }

  /**
   * Read raw session history (JSONL format).
   *
   * @param sessionId - Session identifier
   * @returns Raw JSONL content
   * @throws Error if session file doesn't exist
   */
  async readSessionRaw(sessionId: string): Promise<string> {
    const sessionPath = this.getSessionPath(sessionId);
    try {
      return await fs.readFile(sessionPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Session not found: ${sessionId}`);
      }
      throw error;
    }
  }

  /**
   * Parse session history into array of events.
   *
   * @param sessionId - Session identifier
   * @returns Array of parsed session events
   */
  async readSession(sessionId: string): Promise<SessionEvent[]> {
    const raw = await this.readSessionRaw(sessionId);
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  }

  /**
   * Fork existing session to new session ID.
   *
   * Copies the session JSONL file to a new file with the new session ID.
   *
   * @param oldId - Existing session ID
   * @param newId - New session ID
   */
  async forkSession(oldId: string, newId: string): Promise<void> {
    const oldPath = this.getSessionPath(oldId);
    const newPath = this.getSessionPath(newId);

    await this.ensureDirectory();
    await fs.copyFile(oldPath, newPath);
  }

  /**
   * Delete session file.
   *
   * @param sessionId - Session identifier
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(sessionId);
    try {
      await fs.unlink(sessionPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Already deleted, ignore
        return;
      }
      throw error;
    }
  }

  /**
   * Check if session exists.
   *
   * @param sessionId - Session identifier
   * @returns True if session file exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    try {
      await fs.access(this.getSessionPath(sessionId));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate resume prompt with session context.
   *
   * Creates a context-aware prompt by prepending recent history.
   *
   * @param sessionId - Session identifier
   * @param currentPrompt - New user prompt
   * @param maxHistoryLines - Maximum number of history lines to include (default: 20)
   * @returns Augmented prompt with context
   */
  async generateResumePrompt(
    sessionId: string,
    currentPrompt: string,
    maxHistoryLines = 20
  ): Promise<string> {
    try {
      const events = await this.readSession(sessionId);

      // Take last N events for context
      const recentEvents = events.slice(-maxHistoryLines);

      // Build context summary
      const contextLines: string[] = [
        '# Resuming Previous Session\n',
        'Previous conversation:',
      ];

      for (const event of recentEvents) {
        if ('user' in event) {
          contextLines.push(`User: ${event.user}`);
        } else if ('assistant' in event) {
          contextLines.push(`Assistant: ${event.assistant}`);
        } else if ('thinking' in event) {
          contextLines.push(`[Thinking: ${event.thinking}]`);
        } else if (event.type === 'ToolCall') {
          contextLines.push(
            `[Tool: ${event.toolCall.kind} ${event.toolCall.title || ''}]`
          );
        }
      }

      contextLines.push('');
      contextLines.push('---');
      contextLines.push('');
      contextLines.push(`New request: ${currentPrompt}`);

      return contextLines.join('\n');
    } catch (error) {
      // If session doesn't exist, just return the current prompt
      return currentPrompt;
    }
  }
}
