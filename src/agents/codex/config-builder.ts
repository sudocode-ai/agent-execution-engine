/**
 * OpenAI Codex Configuration Builder
 *
 * Utility for building ProcessConfig specific to OpenAI Codex CLI.
 * Provides type-safe configuration for Codex's flags and options.
 *
 * @module execution-engine/agents/codex
 */

import type { ProcessConfig } from '../../process/types.js';

/**
 * Configuration options specific to OpenAI Codex CLI
 */
export interface CodexConfig {
  /**
   * Path to Codex CLI executable
   * @default 'codex'
   */
  codexPath?: string;

  /**
   * Working directory for the process
   */
  workDir: string;

  /**
   * Use 'codex exec' for non-interactive execution
   * @default true (for automation use cases)
   */
  exec?: boolean;

  /**
   * Emit newline-delimited JSON events
   * @default false
   */
  json?: boolean;

  /**
   * Use experimental JSON output format
   * @default false
   */
  experimentalJson?: boolean;

  /**
   * Write final assistant message to file
   */
  outputLastMessage?: string;

  /**
   * Override configured model (e.g., 'gpt-5-codex', 'gpt-5')
   */
  model?: string;

  /**
   * Sandbox policy: read-only, workspace-write, or danger-full-access
   * @default 'workspace-write'
   */
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';

  /**
   * Approval policy: untrusted, on-failure, on-request, never
   * @default 'on-failure'
   */
  askForApproval?: 'untrusted' | 'on-failure' | 'on-request' | 'never';

  /**
   * Shortcut combining workspace-write sandbox + on-failure approvals
   * @default false
   */
  fullAuto?: boolean;

  /**
   * Allow execution outside Git repositories
   * @default false
   */
  skipGitRepoCheck?: boolean;

  /**
   * Control ANSI color output
   * @default 'auto'
   */
  color?: 'always' | 'never' | 'auto';

  /**
   * Enable web browsing capability
   * @default false
   */
  search?: boolean;

  /**
   * Attach image files to the prompt
   */
  image?: string[];

  /**
   * Load configuration profile from config.toml
   */
  profile?: string;

  /**
   * Additional directories to grant write access (repeatable)
   */
  addDir?: string[];

  /**
   * Disable all safety checks (isolated environments only)
   * @default false
   */
  yolo?: boolean;

  /**
   * Environment variables to pass to the process
   */
  env?: Record<string, string>;

  /**
   * Maximum execution time in milliseconds
   */
  timeout?: number;

  /**
   * Maximum idle time before cleanup (pool only)
   */
  idleTimeout?: number;

  /**
   * Retry configuration for failed spawns
   */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };

  /**
   * Prompt to send to Codex
   */
  prompt?: string;
}

/**
 * Build a generic ProcessConfig from Codex specific configuration
 *
 * @param config - Codex specific configuration
 * @returns Generic ProcessConfig that can be used with any ProcessManager
 *
 * @example
 * ```typescript
 * const config = buildCodexConfig({
 *   workDir: '/path/to/project',
 *   exec: true,
 *   json: true,
 *   fullAuto: true,
 * });
 *
 * const process = await manager.acquireProcess(config);
 * ```
 */
export function buildCodexConfig(config: CodexConfig): ProcessConfig {
  const args: string[] = [];

  // Add 'exec' subcommand for non-interactive mode
  if (config.exec !== false) {
    args.push('exec');

    // Add '-' to explicitly read prompt from stdin
    // This prevents the "Reading prompt from stdin..." blocking message
    if (!config.prompt) {
      args.push('-');
    }
  }

  // Add --json flag for structured output
  if (config.json) {
    args.push('--json');
  }

  // Add --experimental-json flag (alternative to --json)
  if (config.experimentalJson) {
    args.push('--experimental-json');
  }

  // Add --output-last-message flag
  if (config.outputLastMessage) {
    args.push('--output-last-message', config.outputLastMessage);
    // Short form: -o
    // args.push('-o', config.outputLastMessage);
  }

  // Add --model flag
  if (config.model) {
    args.push('--model', config.model);
    // Short form: -m
    // args.push('-m', config.model);
  }

  // Add --sandbox flag
  if (config.sandbox) {
    args.push('--sandbox', config.sandbox);
    // Short form: -s
    // args.push('-s', config.sandbox);
  }

  // Add --ask-for-approval flag
  if (config.askForApproval) {
    args.push('--ask-for-approval', config.askForApproval);
    // Short form: -a
    // args.push('-a', config.askForApproval);
  }

  // Add --full-auto flag (shortcut for workspace-write + on-failure)
  if (config.fullAuto) {
    args.push('--full-auto');
  }

  // Add --skip-git-repo-check flag
  if (config.skipGitRepoCheck) {
    args.push('--skip-git-repo-check');
  }

  // Add --color flag
  if (config.color) {
    args.push('--color', config.color);
  }

  // Add --search flag for web browsing
  if (config.search) {
    args.push('--search');
  }

  // Add --image flag(s) for image attachments
  if (config.image && config.image.length > 0) {
    args.push('--image', config.image.join(','));
    // Short form: -i
    // args.push('-i', config.image.join(','));
  }

  // Add --profile flag
  if (config.profile) {
    args.push('--profile', config.profile);
    // Short form: -p
    // args.push('-p', config.profile);
  }

  // Add --add-dir flag(s) for additional directories
  if (config.addDir && config.addDir.length > 0) {
    config.addDir.forEach((dir) => {
      args.push('--add-dir', dir);
    });
  }

  // Add --yolo flag (disable all safety checks)
  if (config.yolo) {
    args.push('--dangerously-bypass-approvals-and-sandbox');
    // Alternative: --yolo
    // args.push('--yolo');
  }

  // Set working directory using --cd flag (if different from process cwd)
  // Note: We'll use ProcessConfig.workDir instead, but keeping this for reference
  // if (config.workDir) {
  //   args.push('--cd', config.workDir);
  // }

  // Add prompt as the last argument (if provided)
  if (config.prompt) {
    args.push(config.prompt);
  }

  return {
    executablePath: config.codexPath || 'codex',
    args,
    workDir: config.workDir,
    env: config.env,
    timeout: config.timeout,
    idleTimeout: config.idleTimeout,
    retry: config.retry,
  };
}
