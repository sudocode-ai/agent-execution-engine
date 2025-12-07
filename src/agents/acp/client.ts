/**
 * ACP Client Module
 *
 * Provides the DefaultAcpClient implementation that handles file system
 * and terminal operations for ACP agents.
 *
 * @module execution-engine/agents/acp/client
 */

import { promises as fs } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import type {
  Client,
  SessionNotification,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  KillTerminalCommandRequest,
  KillTerminalCommandResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ClientCapabilities,
  IAcpClient,
  AcpClientOptions,
} from './types.js';

/**
 * Terminal instance state
 */
interface TerminalInstance {
  id: string;
  sessionId: string;
  process: ChildProcess;
  output: string;
  truncated: boolean;
  exitCode: number | null;
  signal: string | null;
  outputByteLimit: number;
  waitingForExit: Array<{
    resolve: (value: WaitForTerminalExitResponse) => void;
    reject: (error: Error) => void;
  }>;
}

/**
 * DefaultAcpClient
 *
 * A full-featured ACP Client implementation that provides:
 * - File system operations (read/write)
 * - Terminal operations (create, output, kill, release, wait)
 * - Permission handling (auto-approve or custom handler)
 */
export class DefaultAcpClient implements IAcpClient {
  readonly #options: AcpClientOptions;
  readonly #terminals = new Map<string, TerminalInstance>();
  #nextTerminalId = 0;

  constructor(options: AcpClientOptions = {}) {
    this.#options = options;
  }

  /**
   * Client capabilities
   */
  get capabilities(): ClientCapabilities {
    return this.#options.capabilities ?? {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    };
  }

  /**
   * Whether auto-approve mode is enabled
   */
  get autoApprove(): boolean {
    return this.#options.autoApprove ?? false;
  }

  /**
   * Handle permission request
   */
  async requestPermission(
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    // Check for custom handler first
    if (this.#options.onPermissionRequest) {
      return this.#options.onPermissionRequest(request);
    }

    // Auto-approve mode
    if (this.autoApprove) {
      // Find the allow_once option
      const allowOnce = request.options.find((opt) => opt.kind === 'allow_once');
      if (allowOnce) {
        return {
          outcome: {
            outcome: 'selected',
            optionId: allowOnce.optionId,
          },
        };
      }
    }

    // Default: reject
    const rejectOnce = request.options.find((opt) => opt.kind === 'reject_once');
    if (rejectOnce) {
      return {
        outcome: {
          outcome: 'selected',
          optionId: rejectOnce.optionId,
        },
      };
    }

    // No reject option available, cancel
    return {
      outcome: {
        outcome: 'cancelled',
      },
    };
  }

  /**
   * Handle session update notification
   */
  async sessionUpdate(notification: SessionNotification): Promise<void> {
    if (this.#options.onSessionUpdate) {
      await this.#options.onSessionUpdate(notification);
    }
  }

  /**
   * Read text from a file
   */
  async readTextFile(
    request: ReadTextFileRequest,
  ): Promise<ReadTextFileResponse> {
    // Check for custom handler
    if (this.#options.onReadTextFile) {
      return this.#options.onReadTextFile(request);
    }

    // Default implementation using fs
    try {
      let content = await fs.readFile(request.path, 'utf-8');

      // Apply line filtering if specified
      if (request.line !== undefined && request.line !== null) {
        const lines = content.split('\n');
        const startLine = request.line - 1; // Convert to 0-indexed
        const limit = request.limit ?? lines.length;
        const selectedLines = lines.slice(startLine, startLine + limit);
        content = selectedLines.join('\n');
      } else if (request.limit !== undefined && request.limit !== null) {
        const lines = content.split('\n');
        content = lines.slice(0, request.limit).join('\n');
      }

      return { content };
    } catch (error) {
      throw new Error(
        `Failed to read file: ${request.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Write text to a file
   */
  async writeTextFile(
    request: WriteTextFileRequest,
  ): Promise<WriteTextFileResponse> {
    // Check for custom handler
    if (this.#options.onWriteTextFile) {
      return this.#options.onWriteTextFile(request);
    }

    // Default implementation using fs
    try {
      await fs.writeFile(request.path, request.content, 'utf-8');
      return {};
    } catch (error) {
      throw new Error(
        `Failed to write file: ${request.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create a new terminal and execute a command
   */
  async createTerminal(
    request: CreateTerminalRequest,
  ): Promise<CreateTerminalResponse> {
    // Check for custom handler
    if (this.#options.onCreateTerminal) {
      return this.#options.onCreateTerminal(request);
    }

    // Default implementation
    const terminalId = `term-${++this.#nextTerminalId}`;

    // Build environment - filter out undefined values from process.env
    const env: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    for (const envVar of request.env ?? []) {
      env[envVar.name] = envVar.value;
    }

    // Spawn the process
    const child = spawn(request.command, request.args ?? [], {
      cwd: request.cwd ?? process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const terminal: TerminalInstance = {
      id: terminalId,
      sessionId: request.sessionId,
      process: child,
      output: '',
      truncated: false,
      exitCode: null,
      signal: null,
      outputByteLimit: request.outputByteLimit ?? 1024 * 1024, // Default 1MB
      waitingForExit: [],
    };

    // Collect output
    const appendOutput = (data: Buffer) => {
      terminal.output += data.toString();

      // Apply truncation if needed
      if (terminal.output.length > terminal.outputByteLimit) {
        terminal.output = terminal.output.slice(-terminal.outputByteLimit);
        terminal.truncated = true;
      }
    };

    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);

    // Handle exit
    child.on('exit', (code, signal) => {
      terminal.exitCode = code;
      terminal.signal = signal;

      // Resolve all waiting promises
      for (const waiter of terminal.waitingForExit) {
        waiter.resolve({
          exitCode: code,
          signal: signal ?? undefined,
        });
      }
      terminal.waitingForExit = [];
    });

    child.on('error', (error) => {
      terminal.exitCode = -1;
      terminal.signal = null;

      // Reject all waiting promises
      for (const waiter of terminal.waitingForExit) {
        waiter.reject(error);
      }
      terminal.waitingForExit = [];
    });

    this.#terminals.set(terminalId, terminal);

    return { terminalId };
  }

  /**
   * Get terminal output
   */
  async terminalOutput(
    request: TerminalOutputRequest,
  ): Promise<TerminalOutputResponse> {
    // Check for custom handler
    if (this.#options.onTerminalOutput) {
      return this.#options.onTerminalOutput(request);
    }

    const terminal = this.#terminals.get(request.terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${request.terminalId}`);
    }

    return {
      output: terminal.output,
      truncated: terminal.truncated,
      exitStatus:
        terminal.exitCode !== null
          ? {
              exitCode: terminal.exitCode,
              signal: terminal.signal ?? undefined,
            }
          : undefined,
    };
  }

  /**
   * Release a terminal
   */
  async releaseTerminal(
    request: ReleaseTerminalRequest,
  ): Promise<ReleaseTerminalResponse> {
    // Check for custom handler
    if (this.#options.onReleaseTerminal) {
      return this.#options.onReleaseTerminal(request);
    }

    const terminal = this.#terminals.get(request.terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${request.terminalId}`);
    }

    // Kill the process if still running
    if (terminal.exitCode === null) {
      terminal.process.kill('SIGTERM');
    }

    // Clean up
    this.#terminals.delete(request.terminalId);

    return {};
  }

  /**
   * Wait for terminal command to exit
   */
  async waitForTerminalExit(
    request: WaitForTerminalExitRequest,
  ): Promise<WaitForTerminalExitResponse> {
    // Check for custom handler
    if (this.#options.onWaitForTerminalExit) {
      return this.#options.onWaitForTerminalExit(request);
    }

    const terminal = this.#terminals.get(request.terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${request.terminalId}`);
    }

    // Already exited
    if (terminal.exitCode !== null) {
      return {
        exitCode: terminal.exitCode,
        signal: terminal.signal ?? undefined,
      };
    }

    // Wait for exit
    return new Promise((resolve, reject) => {
      terminal.waitingForExit.push({ resolve, reject });
    });
  }

  /**
   * Kill terminal command
   */
  async killTerminal(
    request: KillTerminalCommandRequest,
  ): Promise<KillTerminalCommandResponse> {
    // Check for custom handler
    if (this.#options.onKillTerminal) {
      return this.#options.onKillTerminal(request);
    }

    const terminal = this.#terminals.get(request.terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${request.terminalId}`);
    }

    // Kill the process if still running
    if (terminal.exitCode === null) {
      terminal.process.kill('SIGTERM');
    }

    return {};
  }

  /**
   * Clean up all terminals
   */
  async cleanup(): Promise<void> {
    for (const [terminalId] of this.#terminals) {
      try {
        await this.releaseTerminal({ terminalId, sessionId: '' });
      } catch {
        // Ignore errors during cleanup
      }
    }
  }
}

/**
 * Create a simple auto-approving client
 */
export function createAutoApproveClient(
  onSessionUpdate?: (notification: SessionNotification) => void | Promise<void>,
): DefaultAcpClient {
  return new DefaultAcpClient({
    autoApprove: true,
    onSessionUpdate,
    capabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  });
}

/**
 * Create a client with custom permission handling
 */
export function createPermissionClient(
  onPermissionRequest: (
    request: RequestPermissionRequest,
  ) => Promise<RequestPermissionResponse>,
  onSessionUpdate?: (notification: SessionNotification) => void | Promise<void>,
): DefaultAcpClient {
  return new DefaultAcpClient({
    onPermissionRequest,
    onSessionUpdate,
    capabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  });
}

/**
 * Create a read-only client (no file writes, no terminal)
 */
export function createReadOnlyClient(
  onSessionUpdate?: (notification: SessionNotification) => void | Promise<void>,
): DefaultAcpClient {
  return new DefaultAcpClient({
    autoApprove: false,
    onSessionUpdate,
    capabilities: {
      fs: { readTextFile: true, writeTextFile: false },
      terminal: false,
    },
    // Block all write operations
    onWriteTextFile: async () => {
      throw new Error('Write operations are not permitted in read-only mode');
    },
    onCreateTerminal: async () => {
      throw new Error('Terminal operations are not permitted in read-only mode');
    },
  });
}
