/**
 * Configuration and types for Gemini ACP harness.
 */

import type { BaseAgentConfig } from '../../types/agent-adapter.js';
import type { ProcessConfig } from '../../../process/types.js';

/**
 * Configuration for Gemini CLI stream-json harness.
 */
export interface GeminiStreamConfig extends BaseAgentConfig {
  /**
   * Path to Gemini CLI executable.
   *
   * Can be set via:
   * - Direct path: '/usr/local/bin/gemini'
   * - Binary name: 'gemini' (searches PATH)
   * - Environment variable: process.env.GEMINI_PATH
   *
   * @default 'gemini'
   */
  executablePath?: string;

  /**
   * Auto-approve tool calls without prompting.
   * @default true
   */
  autoApprove?: boolean;

  /**
   * Model selection.
   * @default 'default'
   */
  model?: 'default' | 'flash' | 'gemini-2.5-flash-thinking-exp-01-21';
}

/**
 * Events emitted by Gemini stream-json harness.
 */
export interface GeminiClientEvents {
  /**
   * Emitted for agent messages, thoughts, and tool calls.
   */
  output: (chunk: OutputChunk) => void;

  /**
   * Emitted when session completes.
   */
  complete: (sessionId: string, reason: string) => void;

  /**
   * Emitted when error occurs.
   */
  error: (error: Error) => void;
}

/**
 * Output chunk from Gemini agent.
 */
export type OutputChunk = {
  type: 'stdout' | 'stderr';
  data: Buffer;
  timestamp: Date;
};

/**
 * Session information from stream-json initialization.
 */
export interface SessionInfo {
  sessionId: string;
  protocolVersion: string;
}
