/**
 * Types for Gemini session management.
 */

/**
 * Normalized session event formats for JSONL storage.
 */
export type SessionEvent =
  | { user: string }
  | { assistant: string }
  | { thinking: string }
  | { type: 'ToolCall'; toolCall: any }
  | { type: 'ToolUpdate'; update: any }
  | { type: 'Plan'; plan: any }
  | { type: 'AvailableCommands'; commands: any[] }
  | { type: 'CurrentMode'; modeId: any };

/**
 * Session manager configuration.
 */
export interface SessionManagerConfig {
  /**
   * Namespace for session storage (e.g., 'gemini-sessions').
   */
  namespace: string;

  /**
   * Base directory for sessions.
   * Defaults to ~/.vibe-kanban/ or ~/.vibe-kanban/dev/ based on NODE_ENV.
   */
  baseDir?: string;
}
