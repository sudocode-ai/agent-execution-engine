/**
 * ACP Executor Module
 *
 * Provides the AcpExecutor class that implements IAgentExecutor for
 * ACP-compatible agents. This executor handles CLI agents that communicate
 * via the Agent Client Protocol.
 *
 * @module execution-engine/agents/acp/executor
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type {
  IAgentExecutor,
  AgentCapabilities,
  OutputChunk,
  SpawnedChild,
  NormalizedEntry,
  IApprovalService,
} from '../types/agent-executor.js';
import type { ExecutionTask } from '../../engine/types.js';
import type { ManagedProcess } from '../../process/types.js';
import type {
  Agent,
  ClientSideConnection,
  SessionNotification,
  ClientCapabilities,
  InitializeResponse,
  ContentBlock,
} from './types.js';
import { spawnAcpAgent, createStreamFromStdio, type SpawnedAcpAgent } from './connection.js';
import { DefaultAcpClient } from './client.js';
import { AcpNormalizer } from './normalizer.js';
import { AcpSession } from './session.js';

/**
 * Configuration for the ACP executor
 */
export interface AcpExecutorConfig {
  /**
   * Path to the agent executable
   */
  executablePath: string;

  /**
   * Arguments to pass to the agent
   */
  args?: string[];

  /**
   * Client capabilities to advertise
   */
  clientCapabilities?: ClientCapabilities;

  /**
   * Whether to auto-approve all permission requests
   * @default false
   */
  autoApprove?: boolean;

  /**
   * Agent name for metadata
   */
  agentName?: string;

  /**
   * Whether the agent supports session resumption
   * @default true
   */
  supportsSessionResume?: boolean;

  /**
   * Whether the agent requires setup
   * @default false
   */
  requiresSetup?: boolean;

  /**
   * Whether the agent supports MCP
   * @default true
   */
  supportsMcp?: boolean;
}

/**
 * Active session state
 */
interface ActiveSession {
  session: AcpSession;
  spawned: SpawnedAcpAgent;
  updates: SessionNotification[];
  normalizer: AcpNormalizer;
}

/**
 * AcpExecutor
 *
 * Executor for ACP-compatible CLI agents. Spawns the agent process,
 * establishes ACP connection, and manages sessions.
 */
export class AcpExecutor implements IAgentExecutor {
  readonly #config: Required<AcpExecutorConfig>;
  #approvalService?: IApprovalService;
  #activeSessions = new Map<string, ActiveSession>();

  constructor(config: AcpExecutorConfig) {
    this.#config = {
      executablePath: config.executablePath,
      args: config.args ?? [],
      clientCapabilities: config.clientCapabilities ?? {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      autoApprove: config.autoApprove ?? false,
      agentName: config.agentName ?? 'acp-agent',
      supportsSessionResume: config.supportsSessionResume ?? true,
      requiresSetup: config.requiresSetup ?? false,
      supportsMcp: config.supportsMcp ?? true,
    };
  }

  /**
   * Execute a new task
   */
  async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
    // Create the ACP client
    const client = new DefaultAcpClient({
      autoApprove: this.#config.autoApprove,
      capabilities: this.#config.clientCapabilities,
      onPermissionRequest: async (request) => {
        // Use approval service if available
        if (this.#approvalService) {
          const decision = await this.#approvalService.requestApproval({
            requestId: request.toolCall.toolCallId,
            toolName: request.toolCall.title ?? 'unknown',
            toolInput: request.toolCall.rawInput,
          });

          if (decision.status === 'approved') {
            const allowOnce = request.options.find((opt) => opt.kind === 'allow_once');
            const optionId = allowOnce?.optionId ?? request.options[0]?.optionId;
            if (!optionId) {
              return { outcome: { outcome: 'cancelled' } };
            }
            return {
              outcome: {
                outcome: 'selected',
                optionId,
              },
            };
          }

          const rejectOnce = request.options.find((opt) => opt.kind === 'reject_once');
          const rejectOptionId = rejectOnce?.optionId ?? request.options[0]?.optionId;
          if (!rejectOptionId) {
            return { outcome: { outcome: 'cancelled' } };
          }
          return {
            outcome: {
              outcome: 'selected',
              optionId: rejectOptionId,
            },
          };
        }

        // Auto-approve mode
        if (this.#config.autoApprove) {
          const allowOnce = request.options.find((opt) => opt.kind === 'allow_once');
          const autoApproveId = allowOnce?.optionId ?? request.options[0]?.optionId;
          if (!autoApproveId) {
            return { outcome: { outcome: 'cancelled' } };
          }
          return {
            outcome: {
              outcome: 'selected',
              optionId: autoApproveId,
            },
          };
        }

        // Default: reject
        const rejectOnce = request.options.find((opt) => opt.kind === 'reject_once');
        const defaultRejectId = rejectOnce?.optionId ?? request.options[0]?.optionId;
        if (!defaultRejectId) {
          return { outcome: { outcome: 'cancelled' } };
        }
        return {
          outcome: {
            outcome: 'selected',
            optionId: defaultRejectId,
          },
        };
      },
    });

    // Track updates for normalization
    const updates: SessionNotification[] = [];
    const normalizer = new AcpNormalizer({
      coalesceChunks: true,
      includeThoughts: true,
      includePlans: true,
    });

    // Spawn the ACP agent
    const spawned = spawnAcpAgent(
      {
        executablePath: this.#config.executablePath,
        args: this.#config.args,
        cwd: task.workDir,
        env: task.config?.env as Record<string, string> | undefined,
      },
      () => ({
        requestPermission: client.requestPermission.bind(client),
        sessionUpdate: async (notification) => {
          updates.push(notification);
          await client.sessionUpdate(notification);
        },
        readTextFile: client.readTextFile.bind(client),
        writeTextFile: client.writeTextFile.bind(client),
        createTerminal: client.createTerminal.bind(client),
        terminalOutput: client.terminalOutput.bind(client),
        releaseTerminal: client.releaseTerminal.bind(client),
        waitForTerminalExit: client.waitForTerminalExit.bind(client),
        killTerminal: client.killTerminal.bind(client),
      }),
    );

    // Initialize the connection
    const initResponse = await spawned.connection.initialize({
      protocolVersion: 1,
      clientCapabilities: this.#config.clientCapabilities,
      clientInfo: {
        name: 'agent-execution-engine',
        version: '0.1.0',
      },
    });

    // Create session
    const session = await AcpSession.create(spawned.connection, {
      cwd: task.workDir,
      mcpServers: [],
      onUpdate: (notification) => {
        updates.push(notification);
      },
    });

    // Store active session
    this.#activeSessions.set(session.sessionId, {
      session,
      spawned,
      updates,
      normalizer,
    });

    // Create ManagedProcess wrapper
    const managedProcess = this.#wrapProcess(spawned.process);

    // Create exit signal that resolves when prompt completes
    const exitSignal = (async () => {
      try {
        // Send the prompt
        const prompt: ContentBlock[] = [{ type: 'text', text: task.prompt }];
        await session.prompt(prompt);
      } finally {
        // Cleanup
        this.#activeSessions.delete(session.sessionId);
      }
    })();

    return {
      process: managedProcess,
      exitSignal,
    };
  }

  /**
   * Resume a previous task session
   */
  async resumeTask(task: ExecutionTask, sessionId: string): Promise<SpawnedChild> {
    if (!this.#config.supportsSessionResume) {
      throw new Error('This agent does not support session resumption');
    }

    // Similar to executeTask but loads existing session
    const client = new DefaultAcpClient({
      autoApprove: this.#config.autoApprove,
      capabilities: this.#config.clientCapabilities,
    });

    const updates: SessionNotification[] = [];
    const normalizer = new AcpNormalizer({
      sessionId,
      coalesceChunks: true,
    });

    const spawned = spawnAcpAgent(
      {
        executablePath: this.#config.executablePath,
        args: this.#config.args,
        cwd: task.workDir,
      },
      () => ({
        requestPermission: client.requestPermission.bind(client),
        sessionUpdate: async (notification) => {
          updates.push(notification);
          await client.sessionUpdate(notification);
        },
        readTextFile: client.readTextFile.bind(client),
        writeTextFile: client.writeTextFile.bind(client),
        createTerminal: client.createTerminal.bind(client),
        terminalOutput: client.terminalOutput.bind(client),
        releaseTerminal: client.releaseTerminal.bind(client),
        waitForTerminalExit: client.waitForTerminalExit.bind(client),
        killTerminal: client.killTerminal.bind(client),
      }),
    );

    await spawned.connection.initialize({
      protocolVersion: 1,
      clientCapabilities: this.#config.clientCapabilities,
    });

    // Load existing session
    const session = await AcpSession.create(spawned.connection, {
      cwd: task.workDir,
      mcpServers: [],
      isLoad: true,
      sessionIdToLoad: sessionId,
    });

    this.#activeSessions.set(session.sessionId, {
      session,
      spawned,
      updates,
      normalizer,
    });

    const managedProcess = this.#wrapProcess(spawned.process);

    const exitSignal = (async () => {
      try {
        const prompt: ContentBlock[] = [{ type: 'text', text: task.prompt }];
        await session.prompt(prompt);
      } finally {
        this.#activeSessions.delete(session.sessionId);
      }
    })();

    return {
      process: managedProcess,
      exitSignal,
    };
  }

  /**
   * Normalize agent output
   *
   * For ACP agents, this converts SessionNotifications to NormalizedEntry.
   * Since ACP uses a different streaming model, we adapt the output chunks
   * to use the collected notifications.
   */
  async *normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>,
    workDir: string,
  ): AsyncIterable<NormalizedEntry> {
    // For ACP, we use the collected notifications rather than raw output
    // This is a fallback for when direct notification access isn't available

    const normalizer = new AcpNormalizer({
      coalesceChunks: true,
    });

    // Parse NDJSON from output stream
    let buffer = '';
    for await (const chunk of outputStream) {
      if (chunk.type !== 'stdout') {
        continue;
      }

      buffer += chunk.data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const message = JSON.parse(trimmed);
          if (message.method === 'session/update' && message.params) {
            const notification = message.params as SessionNotification;
            const entries = normalizer.normalize(notification);
            for (const entry of entries) {
              yield entry;
            }
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    }

    // Flush remaining
    for (const entry of normalizer.flush()) {
      yield entry;
    }
  }

  /**
   * Get agent capabilities
   */
  getCapabilities(): AgentCapabilities {
    return {
      supportsSessionResume: this.#config.supportsSessionResume,
      requiresSetup: this.#config.requiresSetup,
      supportsApprovals: true,
      supportsMcp: this.#config.supportsMcp,
      protocol: 'acp',
      supportsMidExecutionMessages: true,
    };
  }

  /**
   * Check availability
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`which ${this.#config.executablePath}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set approval service
   */
  setApprovalService(service: IApprovalService): void {
    this.#approvalService = service;
  }

  /**
   * Send a message to a running task
   */
  async sendMessage(process: ManagedProcess, message: string): Promise<void> {
    // Find the session for this process
    for (const [sessionId, activeSession] of this.#activeSessions) {
      if (activeSession.spawned.process.pid === process.pid) {
        const prompt: ContentBlock[] = [{ type: 'text', text: message }];
        await activeSession.session.prompt(prompt);
        return;
      }
    }

    throw new Error('No active session found for this process');
  }

  /**
   * Interrupt a running task
   */
  async interrupt(process: ManagedProcess): Promise<void> {
    // Find the session for this process
    for (const [sessionId, activeSession] of this.#activeSessions) {
      if (activeSession.spawned.process.pid === process.pid) {
        await activeSession.session.cancel();
        return;
      }
    }

    throw new Error('No active session found for this process');
  }

  /**
   * Wrap a ChildProcess into ManagedProcess
   */
  #wrapProcess(child: ChildProcess): ManagedProcess {
    const now = new Date();

    return {
      id: `acp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pid: child.pid!,
      status: 'busy',
      spawnedAt: now,
      lastActivity: now,
      exitCode: null,
      signal: null,
      process: child,
      streams: {
        stdout: child.stdout!,
        stderr: child.stderr!,
        stdin: child.stdin!,
      },
      metrics: {
        totalDuration: 0,
        tasksCompleted: 0,
        successRate: 1,
      },
    };
  }
}
