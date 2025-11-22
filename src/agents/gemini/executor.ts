/**
 * Gemini CLI Executor
 *
 * Main executor class that integrates Gemini CLI with the execution engine.
 * Uses stream-json output format for simple and reliable communication.
 */

import { BaseAgentExecutor } from '../base/base-executor.js';
import { StreamJsonHarness } from './harness/stream-harness.js';
import { SessionManager } from './session/session-manager.js';
import { GeminiOutputNormalizer } from './normalizer/output-normalizer.js';
import type { GeminiConfig } from './config.js';
import type {
  AgentCapabilities,
  OutputChunk,
  SpawnedChild,
  NormalizedEntry,
} from '../types/agent-executor.js';
import type { ExecutionTask } from '../../engine/types.js';
import type { GeminiStreamConfig } from './harness/types.js';

/**
 * Gemini CLI Executor
 *
 * Integrates Gemini CLI with the execution engine using ACP protocol.
 *
 * @example
 * ```typescript
 * const executor = new GeminiExecutor({
 *   workDir: '/path/to/project',
 *   autoApprove: true,
 *   model: 'flash',
 * });
 *
 * const spawned = await executor.executeTask({
 *   id: 'task-1',
 *   type: 'custom',
 *   prompt: 'Add authentication',
 *   workDir: '/path/to/project',
 *   priority: 0,
 *   dependencies: [],
 *   createdAt: new Date(),
 *   config: {},
 * });
 *
 * // Normalize output
 * for await (const entry of executor.normalizeOutput(outputStream, workDir)) {
 *   console.log(entry.type.kind, entry.content);
 * }
 * ```
 */
export class GeminiExecutor extends BaseAgentExecutor {
  private config: GeminiConfig;
  private harness: StreamJsonHarness;
  private sessionManager: SessionManager;
  private normalizer: GeminiOutputNormalizer;

  constructor(config: GeminiConfig) {
    super();
    this.config = config;

    // Create session manager
    this.sessionManager = new SessionManager({
      namespace: config.sessionNamespace || 'gemini-sessions',
    });

    // Build harness config
    const resolvedPath = config.executablePath || process.env.GEMINI_PATH || 'gemini';
    console.log('[GeminiExecutor] Config executablePath:', config.executablePath);
    console.log('[GeminiExecutor] GEMINI_PATH env:', process.env.GEMINI_PATH);
    console.log('[GeminiExecutor] Using executable:', resolvedPath);

    const harnessConfig: GeminiStreamConfig = {
      workDir: config.workDir,
      executablePath: resolvedPath,
      autoApprove: config.autoApprove ?? true,
      model: config.model,
    };

    // Create stream-json harness
    this.harness = new StreamJsonHarness(harnessConfig, this.sessionManager);

    // Create normalizer
    this.normalizer = new GeminiOutputNormalizer();
  }

  /**
   * Execute a new task with Gemini CLI
   */
  async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
    // Combine prompt with system prompt if present
    const finalPrompt = this.combinePrompt(task.prompt);

    // Reset normalizer for new session
    this.normalizer.reset();

    // Spawn via harness (creates new session)
    return await this.harness.spawn(finalPrompt);
  }

  /**
   * Resume a previous task session
   */
  async resumeTask(task: ExecutionTask, sessionId: string): Promise<SpawnedChild> {
    // Check if session exists
    if (!(await this.sessionManager.sessionExists(sessionId))) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Combine prompt with system prompt
    const finalPrompt = this.combinePrompt(task.prompt);

    // Reset normalizer for resumed session
    this.normalizer.reset();

    // Spawn via harness with existing session ID
    return await this.harness.spawn(finalPrompt, sessionId);
  }

  /**
   * Normalize Gemini CLI output to unified format
   */
  async *normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>,
    workDir: string,
  ): AsyncIterable<NormalizedEntry> {
    // Note: Gemini CLI uses ACP protocol, which emits events via the harness.
    // This method is for compatibility with the executor interface, but in practice,
    // consumers should listen to harness events directly for real-time output.

    // For now, this is a pass-through that assumes the harness will emit
    // SessionNotification events which we normalize

    // TODO: In a real implementation, this would:
    // 1. Parse ACP messages from the output stream
    // 2. Convert to SessionNotification format
    // 3. Normalize using GeminiOutputNormalizer

    // For MVP, we'll just return empty since harness handles output
    return;

    // Future implementation:
    // for await (const chunk of outputStream) {
    //   const text = chunk.data.toString();
    //   // Parse ACP JSON-RPC messages
    //   const notification = this.parseAcpMessage(text);
    //   if (notification) {
    //     const entry = this.normalizer.normalize(notification, workDir);
    //     if (entry) {
    //       yield entry;
    //     }
    //   }
    // }
  }

  /**
   * Get Gemini CLI capabilities
   */
  getCapabilities(): AgentCapabilities {
    return {
      supportsSessionResume: true,
      requiresSetup: true, // Requires gemini-cli authentication
      supportsApprovals: true,
      supportsMcp: true,
      protocol: 'stream-json',
    };
  }

  /**
   * Check if Gemini CLI is available and configured
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      const geminiPath = this.config.executablePath || process.env.GEMINI_PATH || 'gemini';

      // Check if gemini CLI is available
      return new Promise((resolve) => {
        const child = spawn(geminiPath, ['--version'], {
          stdio: 'ignore',
        });

        child.on('error', () => resolve(false));
        child.on('exit', (code) => resolve(code === 0));

        // Timeout after 5 seconds
        setTimeout(() => {
          child.kill();
          resolve(false);
        }, 5000);
      });
    } catch {
      return false;
    }
  }

  /**
   * Combine system prompt with user prompt
   * @private
   */
  private combinePrompt(userPrompt: string): string {
    if (this.config.systemPrompt) {
      return `${this.config.systemPrompt}\n\n${userPrompt}`;
    }
    return userPrompt;
  }

  /**
   * Get the session manager instance
   *
   * Useful for external consumers who want to access session history.
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get the output normalizer instance
   *
   * Useful for external consumers who want to normalize events directly.
   */
  getNormalizer(): GeminiOutputNormalizer {
    return this.normalizer;
  }
}
