/**
 * Agent Executor Interface
 *
 * Unified execution contract for all CLI coding agents (Cursor, Codex, Claude Code, Gemini, etc.).
 * This interface abstracts away protocol differences and provides a consistent API for spawning
 * processes, handling output, and managing agent capabilities.
 *
 * Inspired by vibe-kanban's StandardCodingAgentExecutor trait system.
 *
 * @module execution-engine/agents/types/agent-executor
 */

import type { ManagedProcess } from '../../process/types.js';
import type { ExecutionTask } from '../../engine/types.js';

/**
 * Protocol type used by the agent for communication
 *
 * - acp: Agent Client Protocol (used by Gemini, Qwen)
 * - jsonrpc: JSON-RPC 2.0 (used by Codex app-server mode)
 * - stream-json: Stream JSON with control messages (used by Claude Code)
 * - jsonl: Simple JSON Lines format (used by Cursor)
 * - custom: Custom protocol implementation
 */
export type ProtocolType = 'acp' | 'jsonrpc' | 'stream-json' | 'jsonl' | 'custom';

/**
 * Agent capabilities and feature support declaration
 *
 * Used for feature detection and UI adaptation. Agents declare what they support
 * rather than relying on runtime feature detection.
 */
export interface AgentCapabilities {
  /**
   * Whether the agent supports resuming previous sessions
   * (equivalent to spawn_follow_up in vibe-kanban)
   */
  supportsSessionResume: boolean;

  /**
   * Whether the agent requires setup before first use
   * (e.g., login, installation, configuration)
   */
  requiresSetup: boolean;

  /**
   * Whether the agent has an interactive approval system for tool use
   */
  supportsApprovals: boolean;

  /**
   * Whether the agent supports Model Context Protocol (MCP) servers
   */
  supportsMcp: boolean;

  /**
   * Communication protocol used by this agent
   */
  protocol: ProtocolType;

  /**
   * Whether the agent supports sending messages mid-execution
   *
   * When true, the agent can receive additional user messages while
   * actively processing a task. This enables mid-execution guidance
   * where users can provide context or instructions during execution.
   */
  supportsMidExecutionMessages: boolean;
}

/**
 * Raw output chunk from agent process
 *
 * Represents a single chunk of data from stdout or stderr.
 * Used as input to the normalization pipeline.
 */
export interface OutputChunk {
  /** Stream type */
  type: 'stdout' | 'stderr';

  /** Raw data bytes */
  data: Buffer;

  /** When this chunk was received */
  timestamp: Date;
}

/**
 * Spawned child process with optional exit signal
 *
 * Returned by executeTask() and resumeTask(). Contains the managed process
 * handle and an optional completion signal for protocols that emit explicit
 * completion events (like ACP).
 */
export interface SpawnedChild {
  /**
   * The managed process instance
   * Reuses existing ManagedProcess type from process layer for integration
   */
  process: ManagedProcess;

  /**
   * Optional promise that resolves when the agent signals completion
   *
   * Useful for protocols like ACP that emit completion events before
   * the process actually exits. Allows the engine to detect task completion
   * without waiting for process termination.
   */
  exitSignal?: Promise<void>;
}

/**
 * Standardized metadata for normalized entries
 *
 * Common metadata fields that all agents should populate (when available).
 * Ensures consistent metadata format across different agent implementations.
 */
export interface NormalizedEntryMetadata {
  /**
   * Session ID for the current execution
   *
   * Used for resuming sessions. Not all agents support session resumption.
   * - Claude Code: Always available (e.g., "sess-abc-123")
   * - Cursor: Available (e.g., "sess-xyz-789")
   * - Copilot: Available after discovery (e.g., "uuid-format")
   * - Codex: Not supported (null)
   */
  sessionId?: string | null;

  /**
   * Model name used for this execution
   *
   * - Claude Code: e.g., "claude-sonnet-4"
   * - Cursor: e.g., "claude-sonnet-4.5", "gpt-4o"
   * - Copilot: e.g., "gpt-4o", "claude-sonnet-4"
   * - Codex: e.g., "gpt-5-codex"
   */
  model?: string | null;

  /**
   * Agent-specific custom metadata
   *
   * Escape hatch for agent-specific data that doesn't fit the standard fields.
   * Examples:
   * - Permission modes
   * - MCP server status
   * - Custom configuration
   */
  [key: string]: unknown;
}

/**
 * Normalized output entry
 *
 * Unified output format that all agents convert to. Enables consistent
 * UI rendering regardless of which agent produced the output.
 */
export interface NormalizedEntry {
  /** Sequential entry number (0-indexed) */
  index: number;

  /** When this entry was created (if available) */
  timestamp?: Date;

  /** Entry type (discriminated union) */
  type: NormalizedEntryType;

  /** Main content in markdown format */
  content: string;

  /** Standardized metadata (common fields across all agents) */
  metadata?: NormalizedEntryMetadata;
}

/**
 * Entry type discriminated union
 *
 * Uses discriminated unions for type-safe handling and exhaustiveness checking.
 */
export type NormalizedEntryType =
  | { kind: 'system_message' }
  | { kind: 'user_message' }
  | { kind: 'assistant_message' }
  | { kind: 'thinking'; reasoning?: string }
  | { kind: 'tool_use'; tool: ToolUseEntry }
  | { kind: 'error'; error: ErrorEntry };

/**
 * Tool use entry details
 */
export interface ToolUseEntry {
  /** Tool name (e.g., "Bash", "Edit", "mcp:filesystem:read") */
  toolName: string;

  /** What action the tool is performing */
  action: ActionType;

  /** Current status of the tool execution */
  status: 'created' | 'running' | 'success' | 'failed';

  /** Result after tool completion (if available) */
  result?: ToolResult;
}

/**
 * Action type discriminated union
 */
export type ActionType =
  | { kind: 'file_read'; path: string }
  | { kind: 'file_write'; path: string }
  | { kind: 'file_edit'; path: string; changes: FileChange[] }
  | { kind: 'command_run'; command: string; result?: CommandResult }
  | { kind: 'search'; query: string }
  | { kind: 'tool'; toolName: string; args?: unknown; result?: unknown };

/**
 * File change representation
 */
export interface FileChange {
  /** Change type */
  type: 'edit' | 'delete';

  /** Unified diff format for displaying changes */
  unifiedDiff?: string;
}

/**
 * Command execution result
 */
export interface CommandResult {
  /** Exit code */
  exitCode: number;

  /** Standard output */
  stdout?: string;

  /** Standard error */
  stderr?: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /** Whether the tool succeeded */
  success: boolean;

  /** Result data (tool-specific format) */
  data?: unknown;

  /** Error message if failed */
  error?: string;
}

/**
 * Error entry details
 */
export interface ErrorEntry {
  /** Error message */
  message: string;

  /** Error code (if available) */
  code?: string;

  /** Stack trace (if available) */
  stack?: string;
}

/**
 * Agent Executor Interface
 *
 * Core interface that all CLI agent executors must implement.
 * Provides a unified API for task execution, output normalization,
 * and capability declaration.
 *
 * @example
 * ```typescript
 * class CursorExecutor implements IAgentExecutor {
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
 *       supportsSessionResume: true,
 *       requiresSetup: true,
 *       supportsApprovals: false,
 *       supportsMcp: true,
 *       protocol: 'jsonl',
 *     };
 *   }
 * }
 * ```
 */
export interface IAgentExecutor {
  /**
   * Execute a new task with this agent
   *
   * Spawns a new process, sends the prompt, and returns a managed process handle.
   * Output can be consumed via the normalizeOutput() method.
   *
   * Equivalent to spawn() in vibe-kanban's StandardCodingAgentExecutor.
   *
   * @param task - Task configuration including prompt and working directory
   * @returns Spawned process with optional exit signal
   * @throws {Error} If agent is not available or spawn fails
   *
   * @example
   * ```typescript
   * const executor = registry.getExecutor({ executor: 'cursor' });
   * const spawned = await executor.executeTask({
   *   id: 'task-1',
   *   type: 'issue',
   *   prompt: 'Add login feature',
   *   workDir: '/path/to/project',
   *   priority: 0,
   *   dependencies: [],
   *   createdAt: new Date(),
   *   config: {},
   * });
   *
   * // Process output
   * for await (const entry of executor.normalizeOutput(outputStream, '/path/to/project')) {
   *   console.log(entry);
   * }
   * ```
   */
  executeTask(task: ExecutionTask): Promise<SpawnedChild>;

  /**
   * Resume a previous task session
   *
   * Continues an existing conversation/session with the agent.
   * Not all agents support this (check capabilities.supportsSessionResume).
   *
   * Equivalent to spawn_follow_up() in vibe-kanban's StandardCodingAgentExecutor.
   *
   * @param task - Task configuration for the follow-up
   * @param sessionId - Previous session identifier
   * @returns Spawned process with optional exit signal
   * @throws {Error} If agent doesn't support session resume or sessionId is invalid
   *
   * @example
   * ```typescript
   * const executor = registry.getExecutor({ executor: 'claude-code' });
   *
   * if (executor.getCapabilities().supportsSessionResume) {
   *   const spawned = await executor.resumeTask(task, 'session-abc-123');
   * }
   * ```
   */
  resumeTask(task: ExecutionTask, sessionId: string): Promise<SpawnedChild>;

  /**
   * Normalize agent-specific output to unified format
   *
   * Converts raw output chunks from the agent into normalized entries that
   * can be rendered consistently across all agents. This is the "translation layer"
   * that makes different agent protocols look the same to consumers.
   *
   * Equivalent to normalize_logs() in vibe-kanban's StandardCodingAgentExecutor.
   *
   * @param outputStream - Raw output chunks from the agent process
   * @param workDir - Working directory for resolving relative paths
   * @returns Async iterable of normalized entries
   *
   * @example
   * ```typescript
   * // Create output stream from ManagedProcess
   * const outputStream = createOutputChunks(spawned.process);
   *
   * // Normalize to unified format
   * for await (const entry of executor.normalizeOutput(outputStream, '/path/to/project')) {
   *   if (entry.type.kind === 'tool_use') {
   *     console.log(`Tool: ${entry.type.tool.toolName}`);
   *   } else if (entry.type.kind === 'assistant_message') {
   *     console.log(`Assistant: ${entry.content}`);
   *   }
   * }
   * ```
   */
  normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>,
    workDir: string,
  ): AsyncIterable<NormalizedEntry>;

  /**
   * Get agent capabilities
   *
   * Returns a declaration of what features this agent supports.
   * Used for feature detection and UI adaptation.
   *
   * @returns Agent capabilities
   *
   * @example
   * ```typescript
   * const executor = registry.getExecutor({ executor: 'cursor' });
   * const caps = executor.getCapabilities();
   *
   * if (caps.supportsSessionResume) {
   *   // Show "Continue from previous" button in UI
   * }
   *
   * if (caps.requiresSetup) {
   *   const available = await executor.checkAvailability();
   *   if (!available) {
   *     // Show setup instructions
   *   }
   * }
   * ```
   */
  getCapabilities(): AgentCapabilities;

  /**
   * Check if agent is available and properly configured
   *
   * Verifies that the agent CLI is installed and ready to use.
   * Implementation can check for executable in PATH, config files, etc.
   *
   * Equivalent to check_availability() in vibe-kanban's StandardCodingAgentExecutor.
   *
   * @returns Promise that resolves to true if agent is available
   *
   * @example
   * ```typescript
   * const executor = registry.getExecutor({ executor: 'gemini' });
   *
   * if (!await executor.checkAvailability()) {
   *   console.error('Gemini CLI not found. Please run: npm install -g @google/generative-ai-cli');
   * }
   * ```
   */
  checkAvailability(): Promise<boolean>;

  /**
   * Set approval service for interactive tool approvals (optional)
   *
   * Not all agents need approval services. This method is optional and only
   * relevant for agents that support interactive approvals (check capabilities).
   *
   * Equivalent to use_approvals() in vibe-kanban's StandardCodingAgentExecutor.
   *
   * @param service - Approval service implementation
   *
   * @example
   * ```typescript
   * const executor = new ClaudeCodeExecutor(config);
   *
   * if (executor.getCapabilities().supportsApprovals) {
   *   executor.setApprovalService?.(new InteractiveApprovalService());
   * }
   * ```
   */
  setApprovalService?(service: IApprovalService): void;

  /**
   * Send an additional message to a running task (optional)
   *
   * Allows sending mid-execution guidance to the agent while it's actively
   * processing a task. Not all agents support this - check capabilities first.
   *
   * @param process - The managed process from executeTask() or resumeTask()
   * @param message - Message content to send to the agent
   * @returns Promise that resolves when message is sent
   * @throws Error if agent doesn't support mid-execution messaging or process is invalid
   *
   * @example
   * ```typescript
   * const executor = registry.getExecutor({ executor: 'claude-code' });
   *
   * if (executor.getCapabilities().supportsMidExecutionMessages) {
   *   const spawned = await executor.executeTask(task);
   *
   *   // Later, while task is running:
   *   await executor.sendMessage?.(spawned.process, 'Also add unit tests');
   * }
   * ```
   */
  sendMessage?(process: ManagedProcess, message: string): Promise<void>;

  /**
   * Interrupt a running task (optional)
   *
   * Sends an interrupt signal to stop the current operation. The exact behavior
   * depends on the agent implementation - it may be a graceful stop (finish current
   * tool) or an immediate abort.
   *
   * @param process - The managed process to interrupt
   * @returns Promise that resolves when interrupt is processed
   * @throws Error if process is invalid or not running
   *
   * @example
   * ```typescript
   * const executor = registry.getExecutor({ executor: 'claude-code' });
   * const spawned = await executor.executeTask(task);
   *
   * // User wants to cancel:
   * await executor.interrupt?.(spawned.process);
   * ```
   */
  interrupt?(process: ManagedProcess): Promise<void>;
}

/**
 * Approval service interface
 *
 * Handles interactive tool approval requests from agents.
 * Implementations can show UI, apply rules, or auto-approve.
 */
export interface IApprovalService {
  /**
   * Request approval for a tool use
   *
   * @param request - Approval request details
   * @returns Promise that resolves to approval decision
   *
   * @example
   * ```typescript
   * // Auto-approve service (for CI/CD)
   * class AutoApprovalService implements IApprovalService {
   *   async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
   *     return { status: 'approved' };
   *   }
   * }
   *
   * // Rule-based service
   * class RuleBasedApprovalService implements IApprovalService {
   *   async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
   *     if (request.toolName === 'Read') return { status: 'approved' };
   *     if (request.toolName === 'Bash') return { status: 'denied', reason: 'No shell access' };
   *     return { status: 'denied', reason: 'Unknown tool' };
   *   }
   * }
   * ```
   */
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision>;
}

/**
 * Tool approval request
 */
export interface ApprovalRequest {
  /** Unique request ID for tracking */
  requestId: string;

  /** Tool name (e.g., "Bash", "Edit", "mcp:server:tool") */
  toolName: string;

  /** Tool arguments (agent-specific format) */
  toolInput: unknown;

  /** Optional context explaining why the tool is needed */
  context?: string;
}

/**
 * Approval decision result
 */
export type ApprovalDecision =
  | { status: 'approved' }
  | { status: 'denied'; reason?: string }
  | { status: 'timeout' };
