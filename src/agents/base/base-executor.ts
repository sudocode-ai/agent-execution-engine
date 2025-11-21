/**
 * Base Agent Executor
 *
 * Abstract base class providing shared functionality for all agent executors.
 * Integrates with existing process management infrastructure and provides
 * common utilities for approval handling, process wrapping, and stream management.
 *
 * @module execution-engine/agents/base
 */

import type { ChildProcess } from 'child_process';
import type { Readable, Writable } from 'stream';
import type {
  IAgentExecutor,
  AgentCapabilities,
  OutputChunk,
  SpawnedChild,
  NormalizedEntry,
  IApprovalService,
  ApprovalRequest,
  ApprovalDecision,
} from '../types/agent-executor.js';
import type { ExecutionTask } from '../../engine/types.js';
import type { ManagedProcess } from '../../process/types.js';

/**
 * Base Agent Executor Abstract Class
 *
 * Provides common functionality that all concrete agent executors inherit.
 * Subclasses must implement the abstract methods for agent-specific behavior.
 *
 * **Integration Points**:
 * - Uses `ManagedProcess` from existing process layer
 * - Converts between Node.js `ChildProcess` and `ManagedProcess`
 * - Provides approval service delegation
 * - Creates output chunk streams from process streams
 *
 * @example
 * ```typescript
 * class CursorExecutor extends BaseAgentExecutor {
 *   async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
 *     const processConfig: ProcessConfig = {
 *       executablePath: 'cursor-agent',
 *       args: ['-p', '--output-format=stream-json', '--force'],
 *       workDir: task.workDir,
 *       mode: 'structured',
 *     };
 *
 *     const manager = createProcessManager(processConfig);
 *     const process = await manager.acquireProcess(processConfig);
 *
 *     // Send prompt
 *     process.streams!.stdin.write(task.prompt + '\n');
 *     process.streams!.stdin.end();
 *
 *     return { process };
 *   }
 *
 *   async resumeTask(task: ExecutionTask, sessionId: string): Promise<SpawnedChild> {
 *     throw new Error('Cursor does not support session resume');
 *   }
 *
 *   async *normalizeOutput(stream, workDir) {
 *     for await (const chunk of stream) {
 *       const line = chunk.data.toString();
 *       const entry = this.parseCursorJson(line);
 *       if (entry) yield entry;
 *     }
 *   }
 *
 *   getCapabilities(): AgentCapabilities {
 *     return {
 *       supportsSessionResume: false,
 *       requiresSetup: true,
 *       supportsApprovals: false,
 *       supportsMcp: true,
 *       protocol: 'jsonl',
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseAgentExecutor implements IAgentExecutor {
  /**
   * Optional approval service for interactive tool approvals
   * If not set, all approval requests are auto-approved
   */
  protected approvalService?: IApprovalService;

  /**
   * Execute a new task with this agent
   *
   * Subclasses must implement agent-specific task execution logic.
   *
   * @param task - Task configuration
   * @returns Spawned process with optional exit signal
   */
  abstract executeTask(task: ExecutionTask): Promise<SpawnedChild>;

  /**
   * Resume a previous task session
   *
   * Subclasses must implement agent-specific session resumption logic.
   *
   * @param task - Task configuration
   * @param sessionId - Previous session identifier
   * @returns Spawned process with optional exit signal
   */
  abstract resumeTask(task: ExecutionTask, sessionId: string): Promise<SpawnedChild>;

  /**
   * Normalize agent-specific output to unified format
   *
   * Subclasses must implement agent-specific output parsing logic.
   *
   * @param outputStream - Raw output chunks from agent
   * @param workDir - Working directory for resolving paths
   * @returns Normalized entries for consistent UI rendering
   */
  abstract normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>,
    workDir: string,
  ): AsyncIterable<NormalizedEntry>;

  /**
   * Get agent capabilities
   *
   * Subclasses must declare what features they support.
   *
   * @returns Agent capabilities
   */
  abstract getCapabilities(): AgentCapabilities;

  /**
   * Set approval service for interactive tool approvals
   *
   * Only relevant for agents that support approvals.
   * If not set, all approvals are auto-approved.
   *
   * @param service - Approval service implementation
   *
   * @example
   * ```typescript
   * const executor = new ClaudeCodeExecutor(config);
   * executor.setApprovalService(new RuleBasedApprovalService());
   * ```
   */
  setApprovalService(service: IApprovalService): void {
    this.approvalService = service;
  }

  /**
   * Check if agent is available and properly configured
   *
   * Default implementation always returns true.
   * Subclasses can override to check for executable in PATH,
   * config files, authentication, etc.
   *
   * @returns Promise that resolves to true if agent is available
   *
   * @example
   * ```typescript
   * class GeminiExecutor extends BaseAgentExecutor {
   *   async checkAvailability(): Promise<boolean> {
   *     // Check if gemini CLI is installed
   *     try {
   *       await exec('which gemini');
   *       return true;
   *     } catch {
   *       return false;
   *     }
   *   }
   * }
   * ```
   */
  async checkAvailability(): Promise<boolean> {
    return true;
  }

  /**
   * Request approval for a tool use
   *
   * Protected helper method for subclasses to request approvals.
   * If no approval service is set, automatically approves all requests.
   *
   * @param request - Approval request details
   * @returns Approval decision
   *
   * @example
   * ```typescript
   * class ClaudeCodeExecutor extends BaseAgentExecutor {
   *   async handleControlRequest(request: ControlRequest) {
   *     if (request.type === 'can_use_tool') {
   *       const decision = await this.requestApproval({
   *         requestId: request.requestId,
   *         toolName: request.toolName,
   *         toolInput: request.input,
   *         context: request.reasoning,
   *       });
   *
   *       return decision.status === 'approved'
   *         ? { result: 'allow' }
   *         : { result: 'deny', message: decision.reason };
   *     }
   *   }
   * }
   * ```
   */
  protected async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    if (!this.approvalService) {
      // No approval service = auto-approve
      return { status: 'approved' };
    }
    return this.approvalService.requestApproval(request);
  }

  /**
   * Wrap a Node.js ChildProcess to ManagedProcess
   *
   * Protected helper to convert standard Node.js ChildProcess to the
   * ManagedProcess type used by the existing process layer.
   *
   * **Integration Point**: Creates `ManagedProcess` instances that are
   * compatible with the existing process management infrastructure.
   *
   * @param child - Node.js ChildProcess
   * @returns ManagedProcess instance
   *
   * @example
   * ```typescript
   * class CustomExecutor extends BaseAgentExecutor {
   *   async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
   *     const child = spawn('custom-agent', ['--task', task.id], {
   *       cwd: task.workDir,
   *     });
   *
   *     const process = this.wrapChildProcess(child);
   *     return { process };
   *   }
   * }
   * ```
   */
  protected wrapChildProcess(child: ChildProcess): ManagedProcess {
    const now = new Date();

    return {
      id: this.generateId(),
      pid: child.pid!,
      status: 'busy',
      spawnedAt: now,
      lastActivity: now,
      exitCode: null,
      signal: null,
      process: child,
      streams: {
        stdout: child.stdout as Readable,
        stderr: child.stderr as Readable,
        stdin: child.stdin as Writable,
      },
      metrics: {
        totalDuration: 0,
        tasksCompleted: 0,
        successRate: 1,
      },
    };
  }

  /**
   * Create output chunk stream from ManagedProcess
   *
   * Protected helper to create an async iterable of OutputChunks from
   * a ManagedProcess's stdout and stderr streams.
   *
   * **Integration Point**: Converts `ManagedProcess.streams` to `OutputChunk`
   * format that can be consumed by `normalizeOutput()`.
   *
   * @param process - Managed process with streams
   * @returns Async iterable of output chunks
   *
   * @example
   * ```typescript
   * class CustomExecutor extends BaseAgentExecutor {
   *   async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
   *     const process = await this.spawnProcess(config);
   *
   *     // Create output stream for normalization
   *     const outputStream = this.createOutputChunks(process);
   *
   *     // Normalize in background
   *     this.processOutput(outputStream, task.workDir);
   *
   *     return { process };
   *   }
   * }
   * ```
   */
  protected async *createOutputChunks(
    process: ManagedProcess,
  ): AsyncIterable<OutputChunk> {
    if (!process.streams) {
      throw new Error('Process does not have streams available');
    }

    const { stdout, stderr } = process.streams;

    // Create promises for each stream
    const stdoutChunks = this.streamToChunks(stdout, 'stdout');
    const stderrChunks = this.streamToChunks(stderr, 'stderr');

    // Merge both streams
    yield* this.mergeStreams(stdoutChunks, stderrChunks);
  }

  /**
   * Convert a readable stream to output chunks
   *
   * @private
   */
  private async *streamToChunks(
    stream: Readable,
    type: 'stdout' | 'stderr',
  ): AsyncIterable<OutputChunk> {
    for await (const chunk of stream) {
      yield {
        type,
        data: Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
        timestamp: new Date(),
      };
    }
  }

  /**
   * Merge multiple async iterables into one
   *
   * Simple sequential merge - processes all chunks from both streams
   *
   * @private
   */
  private async *mergeStreams(
    ...streams: AsyncIterable<OutputChunk>[]
  ): AsyncIterable<OutputChunk> {
    for (const stream of streams) {
      for await (const chunk of stream) {
        yield chunk;
      }
    }
  }

  /**
   * Generate a unique process ID
   *
   * @private
   */
  private generateId(): string {
    return `proc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
