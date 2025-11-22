/**
 * Stream-JSON Harness for Gemini CLI.
 *
 * Uses Gemini's --output-format stream-json mode, which outputs the same
 * format as Claude Code, making it much simpler than ACP protocol.
 */

import { spawn as spawnProcess, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { createInterface } from 'readline';
import type {
  GeminiStreamConfig,
  GeminiClientEvents,
  SessionInfo,
  OutputChunk,
} from './types.js';
import type { SessionManager } from '../session/session-manager.js';
import type { SpawnedChild } from '../../types/agent-executor.js';
import type { ManagedProcess } from '../../../process/types.js';

/**
 * Stream-JSON harness for Gemini CLI.
 *
 * Much simpler than ACP - uses --output-format stream-json which outputs
 * the same JSON format as Claude Code.
 *
 * @example
 * ```typescript
 * const harness = new StreamJsonHarness({
 *   workDir: '/path/to/project',
 *   autoApprove: true
 * });
 *
 * harness.on('output', (chunk) => {
 *   console.log('Output:', chunk.data.toString());
 * });
 *
 * const { process, exitSignal } = await harness.spawn('Hello, Gemini!');
 * await exitSignal;
 * ```
 */
export class StreamJsonHarness extends EventEmitter {
  private config: GeminiStreamConfig;
  private currentProcess: ChildProcess | null = null;
  private sessionManager: SessionManager;

  constructor(config: GeminiStreamConfig, sessionManager: SessionManager) {
    super();

    // Default to 'gemini' binary (matches other executors pattern)
    // Can be overridden via config.executablePath or GEMINI_PATH env var
    this.config = {
      ...config,
      executablePath: config.executablePath || process.env.GEMINI_PATH || 'gemini',
      autoApprove: config.autoApprove ?? true,
    };
    this.sessionManager = sessionManager;
  }

  /**
   * Spawn Gemini CLI process and send initial prompt.
   *
   * Uses --output-format stream-json for simple JSON output parsing.
   */
  async spawn(
    prompt: string,
    existingSessionId?: string
  ): Promise<SpawnedChild> {
    if (this.currentProcess) {
      throw new Error('Process already running. Call shutdown() first.');
    }

    try {
      // Build spawn arguments - use gemini CLI directly
      const args: string[] = ['--output-format', 'stream-json'];

      // Add approval mode
      if (this.config.autoApprove) {
        args.push('--yolo');
      }

      // Add model if specified
      if (this.config.model) {
        args.push('--model', this.config.model);
      }

      console.log('[StreamHarness] Spawning Gemini CLI...');
      console.log('[StreamHarness] Executable:', this.config.executablePath);
      console.log('[StreamHarness] Args:', args);

      // For npm-installed CLI tools (which are node scripts), we need to:
      // 1. Resolve the full path
      // 2. Execute via node (since spawn() can't execute scripts without shell)
      let resolvedPath = this.config.executablePath!;

      if (!resolvedPath.startsWith('/') && !resolvedPath.startsWith('.')) {
        // It's a command name, try to resolve it using PATH
        const pathDirs = (process.env.PATH || '').split(':');
        for (const dir of pathDirs) {
          const candidatePath = `${dir}/${resolvedPath}`;
          try {
            const { accessSync, constants } = require('fs');
            accessSync(candidatePath, constants.X_OK);
            resolvedPath = candidatePath;
            break;
          } catch {
            // Try next directory
          }
        }
      }

      console.log('[StreamHarness] Resolved path:', resolvedPath);

      // Use node to execute the script (works without shell)
      const childProcess = spawnProcess(process.execPath, [resolvedPath, ...args], {
        cwd: this.config.workDir,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.currentProcess = childProcess;

      // Wait for process to start
      await new Promise<void>((resolve, reject) => {
        if (childProcess.pid) {
          resolve();
        } else {
          childProcess.once('spawn', () => resolve());
          childProcess.once('error', reject);
          setTimeout(() => reject(new Error('Process spawn timeout')), 5000);
        }
      });

      if (!childProcess.pid) {
        throw new Error('Failed to get process PID after spawn');
      }

      console.log('[StreamHarness] Process spawned, PID:', childProcess.pid);

      // Parse stdout as JSON lines
      const rl = createInterface({
        input: childProcess.stdout!,
        crlfDelay: Infinity,
      });

      let sessionId = existingSessionId || '';

      rl.on('line', (line) => {
        try {
          const message = JSON.parse(line);

          // Extract session ID from init message
          if (message.type === 'init' && message.session_id) {
            sessionId = message.session_id;
            console.log('[StreamHarness] Session ID:', sessionId);
          }

          // Emit as output event
          this.emit('output', {
            type: 'stdout',
            data: Buffer.from(line + '\n'),
            timestamp: new Date(),
          });

          // Persist to session
          if (sessionId) {
            this.sessionManager.appendRawLine(
              sessionId,
              line
            ).catch((err) => {
              console.error('[StreamHarness] Failed to persist:', err);
            });
          }
        } catch (e) {
          // Not JSON, might be plain text - emit anyway
          this.emit('output', {
            type: 'stdout',
            data: Buffer.from(line + '\n'),
            timestamp: new Date(),
          });
        }
      });

      // Log stderr
      childProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        console.log('[StreamHarness] STDERR:', text.substring(0, 200));
        this.emit('output', {
          type: 'stderr',
          data,
          timestamp: new Date(),
        });
      });

      // Handle exit
      childProcess.on('exit', (code, signal) => {
        console.log('[StreamHarness] Process exited, code:', code, 'signal:', signal);
      });

      // Send prompt via stdin
      console.log('[StreamHarness] Sending prompt...');
      childProcess.stdin?.write(prompt + '\n');
      childProcess.stdin?.end();

      // Create exit signal - maps to Promise<void> as expected by SpawnedChild interface
      const exitSignal = new Promise<void>((resolve) => {
        childProcess.on('exit', () => {
          this.currentProcess = null;
          resolve();
        });
      });

      // Wrap ChildProcess in ManagedProcess format
      const managedProcess: ManagedProcess = {
        id: sessionId || `gemini-${Date.now()}`,
        pid: childProcess.pid!,
        process: childProcess,
        status: 'busy',
        spawnedAt: new Date(),
        lastActivity: new Date(),
        exitCode: null,
        signal: null,
        metrics: {
          totalDuration: 0,
          tasksCompleted: 0,
          successRate: 0,
        },
      };

      return {
        process: managedProcess,
        exitSignal,
      };
    } catch (error) {
      console.error('[StreamHarness] Error during spawn:', error);
      throw error;
    }
  }

  /**
   * Shutdown harness and cleanup resources.
   */
  async shutdown(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }
}

/**
 * Type-safe event emitter for harness.
 */
export interface StreamJsonHarness {
  on<K extends keyof GeminiClientEvents>(
    event: K,
    listener: GeminiClientEvents[K]
  ): this;
  emit<K extends keyof GeminiClientEvents>(
    event: K,
    ...args: Parameters<GeminiClientEvents[K]>
  ): boolean;
}
