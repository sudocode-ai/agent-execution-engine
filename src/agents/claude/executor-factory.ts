/**
 * Claude Executor Factory
 *
 * Provides automatic selection between SDK and CLI executors with fallback logic.
 *
 * @module agents/claude/executor-factory
 */

import { ClaudeCodeExecutor } from "./executor.js";
import { ClaudeSDKExecutor, type ClaudeSDKConfig } from "./sdk-executor.js";
import type { ClaudeCodeConfig } from "./types/config.js";
import type { IAgentExecutor } from "../types/agent-executor.js";

/**
 * Executor preference for factory
 */
export type ExecutorPreference = "sdk" | "cli" | "auto";

/**
 * Combined config that works with both executors
 */
export interface ClaudeExecutorConfig extends ClaudeCodeConfig {
  /**
   * Model to use (SDK only, ignored for CLI)
   */
  model?: string;
}

/**
 * Options for createClaudeExecutor factory
 */
export interface CreateClaudeExecutorOptions {
  /**
   * Executor preference:
   * - "sdk": Use SDK executor, throw if unavailable
   * - "cli": Use CLI executor, throw if unavailable
   * - "auto": Try SDK first, fall back to CLI (default)
   */
  prefer?: ExecutorPreference;

  /**
   * Whether to log which executor was selected
   * @default false
   */
  verbose?: boolean;
}

/**
 * Result from createClaudeExecutor
 */
export interface CreateClaudeExecutorResult {
  /**
   * The created executor instance
   */
  executor: IAgentExecutor;

  /**
   * Which executor type was selected
   */
  type: "sdk" | "cli";

  /**
   * Whether this was a fallback selection
   */
  isFallback: boolean;
}

/**
 * Check if Claude Agent SDK is available
 */
async function checkSDKAvailable(): Promise<boolean> {
  try {
    const sdkModule = "@anthropic-ai/claude-agent-sdk";
    await import(/* webpackIgnore: true */ sdkModule);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a Claude executor with automatic fallback
 *
 * By default, tries to use the SDK executor first (simpler, in-process),
 * then falls back to CLI executor if SDK is not installed.
 *
 * @example
 * ```typescript
 * // Auto-select best available executor
 * const { executor, type } = await createClaudeExecutor({
 *   workDir: '/path/to/project',
 *   dangerouslySkipPermissions: true,
 * });
 * console.log(`Using ${type} executor`);
 *
 * // Force SDK (throws if unavailable)
 * const { executor } = await createClaudeExecutor(config, { prefer: 'sdk' });
 *
 * // Force CLI
 * const { executor } = await createClaudeExecutor(config, { prefer: 'cli' });
 * ```
 *
 * @param config - Executor configuration
 * @param options - Factory options
 * @returns Executor instance and metadata
 */
export async function createClaudeExecutor(
  config: ClaudeExecutorConfig,
  options: CreateClaudeExecutorOptions = {}
): Promise<CreateClaudeExecutorResult> {
  const { prefer = "auto", verbose = false } = options;

  // Force CLI
  if (prefer === "cli") {
    const cliExecutor = new ClaudeCodeExecutor(config);
    const available = await cliExecutor.checkAvailability();
    if (!available) {
      throw new Error(
        "Claude CLI not available. Install Claude Code or set executablePath in config."
      );
    }
    if (verbose) {
      console.log("[claude-executor] Using CLI executor (requested)");
    }
    return { executor: cliExecutor, type: "cli", isFallback: false };
  }

  // Force SDK
  if (prefer === "sdk") {
    const sdkAvailable = await checkSDKAvailable();
    if (!sdkAvailable) {
      throw new Error(
        "Claude Agent SDK not available. Install with: npm install @anthropic-ai/claude-agent-sdk"
      );
    }
    const sdkConfig: ClaudeSDKConfig = {
      workDir: config.workDir,
      model: config.model,
      dangerouslySkipPermissions: config.dangerouslySkipPermissions,
    };
    const sdkExecutor = new ClaudeSDKExecutor(sdkConfig);
    if (verbose) {
      console.log("[claude-executor] Using SDK executor (requested)");
    }
    return { executor: sdkExecutor, type: "sdk", isFallback: false };
  }

  // Auto: Try SDK first, fall back to CLI
  const sdkAvailable = await checkSDKAvailable();
  if (sdkAvailable) {
    const sdkConfig: ClaudeSDKConfig = {
      workDir: config.workDir,
      model: config.model,
      dangerouslySkipPermissions: config.dangerouslySkipPermissions,
    };
    const sdkExecutor = new ClaudeSDKExecutor(sdkConfig);
    if (verbose) {
      console.log("[claude-executor] Using SDK executor (auto-selected)");
    }
    return { executor: sdkExecutor, type: "sdk", isFallback: false };
  }

  // Fall back to CLI
  const cliExecutor = new ClaudeCodeExecutor(config);
  const cliAvailable = await cliExecutor.checkAvailability();
  if (!cliAvailable) {
    throw new Error(
      "Neither Claude SDK nor CLI is available. " +
        "Install SDK: npm install @anthropic-ai/claude-agent-sdk, " +
        "or install Claude Code CLI."
    );
  }

  if (verbose) {
    console.log("[claude-executor] Using CLI executor (SDK unavailable, fallback)");
  }
  return { executor: cliExecutor, type: "cli", isFallback: true };
}

/**
 * Synchronous version that returns executor directly (for simple cases)
 *
 * Note: This doesn't check availability - use createClaudeExecutor for that.
 *
 * @example
 * ```typescript
 * // Quick creation when you know SDK is available
 * const executor = getClaudeExecutor(config, 'sdk');
 * ```
 */
export function getClaudeExecutor(
  config: ClaudeExecutorConfig,
  type: "sdk" | "cli"
): IAgentExecutor {
  if (type === "sdk") {
    const sdkConfig: ClaudeSDKConfig = {
      workDir: config.workDir,
      model: config.model,
      dangerouslySkipPermissions: config.dangerouslySkipPermissions,
    };
    return new ClaudeSDKExecutor(sdkConfig);
  }
  return new ClaudeCodeExecutor(config);
}
