/**
 * ACP Session Module
 *
 * Provides the AcpSession class for managing ACP session lifecycle,
 * including session creation, prompting, and cancellation.
 *
 * @module execution-engine/agents/acp/session
 */

import type {
  ClientSideConnection,
  SessionId,
  SessionNotification,
  PromptRequest,
  ContentBlock,
  McpServer,
  SessionModeState,
  SessionModelState,
  AcpSessionMeta,
} from './types.js';
import type { AcpSessionState, AcpSessionInfo, AcpPromptResult } from './types.js';

/**
 * Options for creating an ACP session
 */
export interface AcpSessionOptions {
  /**
   * Working directory for the session
   */
  cwd: string;

  /**
   * MCP servers to connect to
   */
  mcpServers?: McpServer[];

  /**
   * Whether this is a session load (vs new session)
   */
  isLoad?: boolean;

  /**
   * Session ID to load (required if isLoad is true)
   */
  sessionIdToLoad?: string;

  /**
   * Callback for session notifications
   */
  onUpdate?: (notification: SessionNotification) => void | Promise<void>;

  /**
   * Agent-specific metadata to pass to newSession
   * For Claude Code ACP, use ClaudeAcpSessionMeta from '@/agents/claude/acp-types'
   */
  _meta?: AcpSessionMeta;
}

/**
 * AcpSession class
 *
 * Manages the lifecycle of a single ACP session. Provides methods for
 * prompting, cancellation, and mode/model changes.
 */
export class AcpSession {
  readonly #connection: ClientSideConnection;
  readonly #sessionId: SessionId;
  readonly #cwd: string;
  readonly #onUpdate?: (notification: SessionNotification) => void | Promise<void>;
  readonly #createdAt: Date;
  #state: AcpSessionState;
  #lastActivityAt: Date;
  #modes?: SessionModeState;
  #models?: SessionModelState;
  #updates: SessionNotification[] = [];

  private constructor(
    connection: ClientSideConnection,
    sessionId: SessionId,
    cwd: string,
    modes?: SessionModeState | null,
    models?: SessionModelState | null,
    onUpdate?: (notification: SessionNotification) => void | Promise<void>,
  ) {
    this.#connection = connection;
    this.#sessionId = sessionId;
    this.#cwd = cwd;
    this.#onUpdate = onUpdate;
    this.#createdAt = new Date();
    this.#lastActivityAt = new Date();
    this.#state = 'ready';
    this.#modes = modes ?? undefined;
    this.#models = models ?? undefined;
  }

  /**
   * Create a new ACP session
   */
  static async create(
    connection: ClientSideConnection,
    options: AcpSessionOptions,
  ): Promise<AcpSession> {
    if (options.isLoad && options.sessionIdToLoad) {
      // Load existing session
      const response = await connection.loadSession({
        cwd: options.cwd,
        mcpServers: options.mcpServers ?? [],
        sessionId: options.sessionIdToLoad,
      });

      return new AcpSession(
        connection,
        options.sessionIdToLoad,
        options.cwd,
        response.modes,
        response.models,
        options.onUpdate,
      );
    }

    // Create new session with optional _meta for agent-specific config
    // For Claude Code ACP, _meta can include systemPrompt, allowedTools, etc.
    const newSessionRequest: {
      cwd: string;
      mcpServers: McpServer[];
      _meta?: AcpSessionMeta;
    } = {
      cwd: options.cwd,
      mcpServers: options.mcpServers ?? [],
    };

    // Add _meta if provided
    if (options._meta) {
      newSessionRequest._meta = options._meta;
    }

    const response = await connection.newSession(newSessionRequest);

    return new AcpSession(
      connection,
      response.sessionId,
      options.cwd,
      response.modes,
      response.models,
      options.onUpdate,
    );
  }

  /**
   * Session ID
   */
  get sessionId(): SessionId {
    return this.#sessionId;
  }

  /**
   * Current session state
   */
  get state(): AcpSessionState {
    return this.#state;
  }

  /**
   * Working directory
   */
  get cwd(): string {
    return this.#cwd;
  }

  /**
   * Session creation time
   */
  get createdAt(): Date {
    return this.#createdAt;
  }

  /**
   * Last activity time
   */
  get lastActivityAt(): Date {
    return this.#lastActivityAt;
  }

  /**
   * Available modes (if supported)
   */
  get modes(): SessionModeState | undefined {
    return this.#modes;
  }

  /**
   * Available models (if supported)
   */
  get models(): SessionModelState | undefined {
    return this.#models;
  }

  /**
   * All session notifications received
   */
  get updates(): readonly SessionNotification[] {
    return this.#updates;
  }

  /**
   * Get session info
   */
  getInfo(): AcpSessionInfo {
    return {
      sessionId: this.#sessionId,
      state: this.#state,
      cwd: this.#cwd,
      createdAt: this.#createdAt,
      lastActivityAt: this.#lastActivityAt,
    };
  }

  /**
   * Send a prompt to the session
   */
  async prompt(
    prompt: string | ContentBlock[],
  ): Promise<AcpPromptResult> {
    if (this.#state !== 'ready') {
      throw new Error(`Cannot prompt in state: ${this.#state}`);
    }

    this.#state = 'prompting';
    this.#lastActivityAt = new Date();

    const promptContent: ContentBlock[] =
      typeof prompt === 'string'
        ? [{ type: 'text', text: prompt }]
        : prompt;

    const request: PromptRequest = {
      sessionId: this.#sessionId,
      prompt: promptContent,
    };

    const startTime = Date.now();
    const promptUpdates: SessionNotification[] = [];

    try {
      const response = await this.#connection.prompt(request);

      this.#state = response.stopReason === 'cancelled' ? 'cancelled' : 'ready';
      this.#lastActivityAt = new Date();

      return {
        stopReason: response.stopReason,
        updates: promptUpdates,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      this.#state = 'ready';
      throw error;
    }
  }

  /**
   * Record a session update (called by the client)
   */
  recordUpdate(notification: SessionNotification): void {
    this.#updates.push(notification);
    this.#lastActivityAt = new Date();

    // Handle mode updates
    if (notification.update.sessionUpdate === 'current_mode_update') {
      if (this.#modes) {
        this.#modes = {
          ...this.#modes,
          currentModeId: notification.update.currentModeId,
        };
      }
    }

    // Notify callback
    if (this.#onUpdate) {
      Promise.resolve(this.#onUpdate(notification)).catch((err) => {
        console.error('Error in session update callback:', err);
      });
    }
  }

  /**
   * Cancel ongoing operations
   */
  async cancel(): Promise<void> {
    if (this.#state !== 'prompting') {
      return; // Nothing to cancel
    }

    await this.#connection.cancel({
      sessionId: this.#sessionId,
    });

    this.#state = 'cancelled';
    this.#lastActivityAt = new Date();
  }

  /**
   * Set the session mode
   */
  async setMode(modeId: string): Promise<void> {
    await this.#connection.setSessionMode({
      sessionId: this.#sessionId,
      modeId,
    });

    if (this.#modes) {
      this.#modes = {
        ...this.#modes,
        currentModeId: modeId,
      };
    }

    this.#lastActivityAt = new Date();
  }

  /**
   * Set the session model
   */
  async setModel(modelId: string): Promise<void> {
    await this.#connection.setSessionModel({
      sessionId: this.#sessionId,
      modelId,
    });

    if (this.#models) {
      this.#models = {
        ...this.#models,
        currentModelId: modelId,
      };
    }

    this.#lastActivityAt = new Date();
  }

  /**
   * Close the session
   */
  close(): void {
    this.#state = 'closed';
    this.#lastActivityAt = new Date();
  }
}

/**
 * Session manager for handling multiple sessions
 */
export class AcpSessionManager {
  readonly #connection: ClientSideConnection;
  readonly #sessions = new Map<SessionId, AcpSession>();

  constructor(connection: ClientSideConnection) {
    this.#connection = connection;
  }

  /**
   * Create a new session
   */
  async createSession(options: Omit<AcpSessionOptions, 'isLoad' | 'sessionIdToLoad'>): Promise<AcpSession> {
    const session = await AcpSession.create(this.#connection, options);
    this.#sessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Load an existing session
   */
  async loadSession(
    sessionId: string,
    options: Omit<AcpSessionOptions, 'isLoad' | 'sessionIdToLoad'>,
  ): Promise<AcpSession> {
    const session = await AcpSession.create(this.#connection, {
      ...options,
      isLoad: true,
      sessionIdToLoad: sessionId,
    });
    this.#sessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: SessionId): AcpSession | undefined {
    return this.#sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): AcpSession[] {
    return Array.from(this.#sessions.values());
  }

  /**
   * Route a session notification to the correct session
   */
  handleNotification(notification: SessionNotification): void {
    const session = this.#sessions.get(notification.sessionId);
    if (session) {
      session.recordUpdate(notification);
    }
  }

  /**
   * Close a session
   */
  closeSession(sessionId: SessionId): void {
    const session = this.#sessions.get(sessionId);
    if (session) {
      session.close();
      this.#sessions.delete(sessionId);
    }
  }

  /**
   * Close all sessions
   */
  closeAllSessions(): void {
    for (const session of this.#sessions.values()) {
      session.close();
    }
    this.#sessions.clear();
  }
}
