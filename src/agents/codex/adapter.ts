/**
 * OpenAI Codex Agent Adapter
 *
 * Implements the IAgentAdapter interface for OpenAI Codex CLI.
 * Provides agent-specific configuration building and metadata.
 *
 * @module execution-engine/agents/codex
 */

import type { IAgentAdapter, AgentMetadata } from "../types/agent-adapter.js";
import type { ProcessConfig } from "../../process/types.js";
import { buildCodexConfig, type CodexConfig } from "./config-builder.js";

/**
 * OpenAI Codex agent metadata
 */
const CODEX_METADATA: AgentMetadata = {
  name: "codex",
  displayName: "OpenAI Codex",
  version: ">=1.0.0",
  supportedModes: ["structured", "interactive"],
  supportsStreaming: true,
  supportsStructuredOutput: true,
};

/**
 * OpenAI Codex Agent Adapter
 *
 * Provides Codex-specific configuration building and capabilities.
 *
 * @example
 * ```typescript
 * const adapter = new CodexAdapter();
 * const config = adapter.buildProcessConfig({
 *   workDir: '/path/to/project',
 *   exec: true,
 *   json: true,
 *   fullAuto: true,
 * });
 *
 * const processManager = createProcessManager(config);
 * ```
 */
export class CodexAdapter implements IAgentAdapter<CodexConfig> {
  readonly metadata = CODEX_METADATA;

  /**
   * Build ProcessConfig from Codex-specific configuration
   *
   * @param config - Codex configuration
   * @returns Generic ProcessConfig
   */
  buildProcessConfig(config: CodexConfig): ProcessConfig {
    return buildCodexConfig(config);
  }

  /**
   * Validate Codex configuration
   *
   * @param config - Configuration to validate
   * @returns Array of validation errors (empty if valid)
   */
  validateConfig(config: CodexConfig): string[] {
    const errors: string[] = [];

    if (!config.workDir) {
      errors.push("workDir is required");
    }

    // Validate mutually exclusive JSON flags
    if (config.json && config.experimentalJson) {
      errors.push("Cannot use both json and experimentalJson flags");
    }

    // Validate fullAuto conflicts
    if (config.fullAuto && (config.sandbox || config.askForApproval)) {
      errors.push(
        "fullAuto cannot be used with sandbox or askForApproval flags"
      );
    }

    // Validate yolo conflicts
    if (
      config.yolo &&
      (config.sandbox || config.askForApproval || config.fullAuto)
    ) {
      errors.push(
        "yolo flag cannot be used with sandbox, askForApproval, or fullAuto flags"
      );
    }

    // Validate sandbox values
    if (
      config.sandbox &&
      !["read-only", "workspace-write", "danger-full-access"].includes(
        config.sandbox
      )
    ) {
      errors.push(
        "sandbox must be one of: read-only, workspace-write, danger-full-access"
      );
    }

    // Validate askForApproval values
    if (
      config.askForApproval &&
      !["untrusted", "on-failure", "on-request", "never"].includes(
        config.askForApproval
      )
    ) {
      errors.push(
        "askForApproval must be one of: untrusted, on-failure, on-request, never"
      );
    }

    // Validate color values
    if (config.color && !["always", "never", "auto"].includes(config.color)) {
      errors.push("color must be one of: always, never, auto");
    }

    // Validate image paths exist (if provided)
    if (config.image && config.image.length > 0) {
      // Note: In a real implementation, you might want to check if files exist
      // For now, we just validate the array is not empty
    }

    return errors;
  }

  /**
   * Get default Codex configuration
   *
   * @returns Default configuration values
   */
  getDefaultConfig(): Partial<CodexConfig> {
    return {
      codexPath: "codex",
      exec: true, // Use non-interactive mode by default for automation
      json: true, // Enable structured output if needed
      experimentalJson: false,
      fullAuto: true,
      skipGitRepoCheck: false,
      color: "auto",
      search: true,
      yolo: false,
    };
  }
}
