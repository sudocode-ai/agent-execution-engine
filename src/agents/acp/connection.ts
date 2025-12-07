/**
 * ACP Connection Module
 *
 * Provides connection wrappers for ACP protocol communication.
 * Handles spawning CLI agents and converting between Node.js streams
 * and Web Streams API used by the ACP SDK.
 *
 * @module execution-engine/agents/acp/connection
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import {
  ClientSideConnection,
  ndJsonStream,
  type Agent,
  type Client,
  type Stream,
} from './types.js';

/**
 * Options for spawning an ACP agent process
 */
export interface SpawnAcpAgentOptions {
  /**
   * Path to the agent executable
   */
  executablePath: string;

  /**
   * Command-line arguments to pass to the agent
   */
  args?: string[];

  /**
   * Working directory for the agent process
   */
  cwd?: string;

  /**
   * Environment variables for the agent process
   */
  env?: Record<string, string>;
}

/**
 * Result of spawning an ACP agent
 */
export interface SpawnedAcpAgent {
  /**
   * The ACP connection to the agent
   */
  connection: ClientSideConnection;

  /**
   * The underlying child process
   */
  process: ChildProcess;

  /**
   * Promise that resolves when the connection closes
   */
  closed: Promise<void>;

  /**
   * Abort signal that aborts when the connection closes
   */
  signal: AbortSignal;

  /**
   * Kill the agent process
   */
  kill: (signal?: NodeJS.Signals) => void;
}

/**
 * Converts Node.js Readable stream to Web ReadableStream
 */
export function nodeReadableToWebReadable(
  nodeReadable: Readable,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeReadable.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeReadable.on('end', () => {
        controller.close();
      });
      nodeReadable.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeReadable.destroy();
    },
  });
}

/**
 * Converts Node.js Writable stream to Web WritableStream
 */
export function nodeWritableToWebWritable(
  nodeWritable: Writable,
): WritableStream<Uint8Array> {
  return new WritableStream({
    write(chunk) {
      return new Promise((resolve, reject) => {
        const success = nodeWritable.write(chunk, (err) => {
          if (err) {
            reject(err);
          }
        });
        if (success) {
          resolve();
        } else {
          nodeWritable.once('drain', resolve);
        }
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        nodeWritable.end((err: Error | undefined) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
    abort(reason) {
      nodeWritable.destroy(reason instanceof Error ? reason : new Error(String(reason)));
    },
  });
}

/**
 * Creates an ACP Stream from Node.js child process stdio
 *
 * @param stdin - The process stdin (writable)
 * @param stdout - The process stdout (readable)
 * @returns An ACP Stream for bidirectional communication
 */
export function createStreamFromStdio(
  stdin: Writable,
  stdout: Readable,
): Stream {
  const webWritable = nodeWritableToWebWritable(stdin);
  const webReadable = nodeReadableToWebReadable(stdout);

  return ndJsonStream(webWritable, webReadable);
}

/**
 * Spawns an ACP agent process and establishes a connection
 *
 * @param options - Spawn options
 * @param createClient - Factory function to create the Client handler
 * @returns The spawned agent with connection
 *
 * @example
 * ```typescript
 * const { connection, process, closed } = await spawnAcpAgent(
 *   {
 *     executablePath: 'claude',
 *     args: ['--acp'],
 *     cwd: '/path/to/project',
 *   },
 *   (agent) => ({
 *     requestPermission: async (req) => ({ outcome: { outcome: 'selected', optionId: 'allow_once' } }),
 *     sessionUpdate: async (notification) => console.log('Update:', notification),
 *   }),
 * );
 *
 * // Initialize the connection
 * const initResponse = await connection.initialize({
 *   protocolVersion: 1,
 *   clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
 * });
 *
 * // Create a session and send prompts...
 * ```
 */
export function spawnAcpAgent(
  options: SpawnAcpAgentOptions,
  createClient: (agent: Agent) => Client,
): SpawnedAcpAgent {
  const { executablePath, args = [], cwd, env } = options;

  // Spawn the agent process
  const childProcess = spawn(executablePath, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Handle process errors
  childProcess.on('error', (err) => {
    console.error('ACP agent process error:', err);
  });

  // Create the ACP stream from stdio
  const stream = createStreamFromStdio(
    childProcess.stdin!,
    childProcess.stdout!,
  );

  // Create the client-side connection
  const connection = new ClientSideConnection(createClient, stream);

  // Handle stderr for debugging
  childProcess.stderr?.on('data', (data: Buffer) => {
    // Log stderr but don't treat it as an error
    // Agents may use stderr for debug output
    console.debug('[ACP Agent stderr]:', data.toString());
  });

  return {
    connection,
    process: childProcess,
    closed: connection.closed,
    signal: connection.signal,
    kill: (signal?: NodeJS.Signals) => {
      childProcess.kill(signal ?? 'SIGTERM');
    },
  };
}

/**
 * Creates an ACP connection from an existing Stream
 *
 * Useful for testing or when the agent is running in-process
 * (e.g., Claude SDK).
 *
 * @param stream - The ACP stream
 * @param createClient - Factory function to create the Client handler
 * @returns The ACP connection
 *
 * @example
 * ```typescript
 * // For testing with mock streams
 * const stream = createMockStream();
 * const connection = createConnectionFromStream(stream, (agent) => myClient);
 * ```
 */
export function createConnectionFromStream(
  stream: Stream,
  createClient: (agent: Agent) => Client,
): ClientSideConnection {
  return new ClientSideConnection(createClient, stream);
}

/**
 * AcpConnection class
 *
 * A higher-level wrapper around ClientSideConnection that provides
 * a simpler API for common operations.
 */
export class AcpConnection {
  readonly #connection: ClientSideConnection;
  readonly #process?: ChildProcess;

  private constructor(
    connection: ClientSideConnection,
    childProcess?: ChildProcess,
  ) {
    this.#connection = connection;
    this.#process = childProcess;
  }

  /**
   * Spawn an ACP agent process and create a connection
   */
  static spawn(
    options: SpawnAcpAgentOptions,
    createClient: (agent: Agent) => Client,
  ): AcpConnection {
    const spawned = spawnAcpAgent(options, createClient);
    return new AcpConnection(spawned.connection, spawned.process);
  }

  /**
   * Create a connection from an existing stream
   */
  static fromStream(
    stream: Stream,
    createClient: (agent: Agent) => Client,
  ): AcpConnection {
    const connection = createConnectionFromStream(stream, createClient);
    return new AcpConnection(connection);
  }

  /**
   * The underlying ClientSideConnection
   */
  get connection(): ClientSideConnection {
    return this.#connection;
  }

  /**
   * The underlying child process (if spawned)
   */
  get process(): ChildProcess | undefined {
    return this.#process;
  }

  /**
   * AbortSignal that aborts when the connection closes
   */
  get signal(): AbortSignal {
    return this.#connection.signal;
  }

  /**
   * Promise that resolves when the connection closes
   */
  get closed(): Promise<void> {
    return this.#connection.closed;
  }

  /**
   * Whether the connection is closed
   */
  get isClosed(): boolean {
    return this.#connection.signal.aborted;
  }

  /**
   * Kill the agent process (if spawned)
   */
  kill(signal?: NodeJS.Signals): void {
    if (this.#process) {
      this.#process.kill(signal ?? 'SIGTERM');
    }
  }

  /**
   * Initialize the connection with the agent
   */
  async initialize(
    ...args: Parameters<ClientSideConnection['initialize']>
  ): ReturnType<ClientSideConnection['initialize']> {
    return this.#connection.initialize(...args);
  }

  /**
   * Create a new session
   */
  async newSession(
    ...args: Parameters<ClientSideConnection['newSession']>
  ): ReturnType<ClientSideConnection['newSession']> {
    return this.#connection.newSession(...args);
  }

  /**
   * Load an existing session
   */
  async loadSession(
    ...args: Parameters<ClientSideConnection['loadSession']>
  ): ReturnType<ClientSideConnection['loadSession']> {
    return this.#connection.loadSession(...args);
  }

  /**
   * Send a prompt to a session
   */
  async prompt(
    ...args: Parameters<ClientSideConnection['prompt']>
  ): ReturnType<ClientSideConnection['prompt']> {
    return this.#connection.prompt(...args);
  }

  /**
   * Cancel a session
   */
  async cancel(
    ...args: Parameters<ClientSideConnection['cancel']>
  ): ReturnType<ClientSideConnection['cancel']> {
    return this.#connection.cancel(...args);
  }

  /**
   * Set the session mode
   */
  async setSessionMode(
    ...args: Parameters<ClientSideConnection['setSessionMode']>
  ): ReturnType<ClientSideConnection['setSessionMode']> {
    return this.#connection.setSessionMode(...args);
  }

  /**
   * Set the session model
   */
  async setSessionModel(
    ...args: Parameters<ClientSideConnection['setSessionModel']>
  ): ReturnType<ClientSideConnection['setSessionModel']> {
    return this.#connection.setSessionModel(...args);
  }

  /**
   * Authenticate with the agent
   */
  async authenticate(
    ...args: Parameters<ClientSideConnection['authenticate']>
  ): ReturnType<ClientSideConnection['authenticate']> {
    return this.#connection.authenticate(...args);
  }
}
