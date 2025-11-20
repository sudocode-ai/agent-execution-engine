/**
 * Agent Profile Registry
 *
 * Manages agent executor configurations and provides factory-based instantiation.
 * Supports multiple variants per agent executor.
 *
 * @module execution-engine/agents/profiles/registry
 */

import type { IAgentExecutor } from '../types/agent-executor.js';
import type {
  AgentProfileId,
  AgentProfile,
  ProfileRegistry,
  ExecutorFactory,
} from './types.js';

/**
 * Agent Profile Registry
 *
 * Central registry for managing agent configurations and executor factories.
 * Provides O(1) lookups and automatic fallback to default variants.
 *
 * @example
 * ```typescript
 * // Create registry
 * const registry = new AgentProfileRegistry();
 *
 * // Register executor factories
 * registry.registerExecutor('cursor', (config) => new CursorExecutor(config as CursorConfig));
 * registry.registerExecutor('claude-code', (config) => new ClaudeCodeExecutor(config as ClaudeConfig));
 *
 * // Register profiles
 * registry.registerProfile('cursor', 'default', {
 *   config: { force: true, model: 'auto' },
 *   displayName: 'Cursor (Auto-approve)',
 * });
 *
 * registry.registerProfile('cursor', 'interactive', {
 *   config: { force: false, model: 'sonnet-4.5' },
 *   displayName: 'Cursor (Interactive)',
 * });
 *
 * // Get executor
 * const executor = registry.getExecutor({ executor: 'cursor', variant: 'interactive' });
 * if (executor) {
 *   await executor.executeTask(task);
 * }
 *
 * // Load from JSON
 * const profiles = JSON.parse(fs.readFileSync('profiles.json', 'utf-8'));
 * registry.loadProfiles(profiles);
 * ```
 */
export class AgentProfileRegistry {
  /**
   * Registry of profiles (executor → variant → profile)
   */
  private profiles: ProfileRegistry = { executors: {} };

  /**
   * Executor factories (executor name → factory function)
   */
  private factories = new Map<string, ExecutorFactory>();

  /**
   * Register an executor factory
   *
   * The factory will be called when getExecutor() is invoked for this executor.
   * This decouples profile loading from executor instantiation.
   *
   * @param name - Executor name (e.g., 'cursor', 'claude-code')
   * @param factory - Factory function that creates executor instances
   *
   * @example
   * ```typescript
   * registry.registerExecutor('cursor', (config) => {
   *   return new CursorExecutor(config as CursorConfig);
   * });
   * ```
   */
  registerExecutor(name: string, factory: ExecutorFactory): void {
    this.factories.set(name, factory);
  }

  /**
   * Register a profile for an executor variant
   *
   * Creates or updates a profile configuration. The executor factory must be
   * registered first via registerExecutor().
   *
   * @param executor - Executor name
   * @param variant - Variant name (typically 'default' or custom name)
   * @param profile - Profile configuration
   *
   * @example
   * ```typescript
   * registry.registerProfile('claude-code', 'default', {
   *   config: { print: true, outputFormat: 'stream-json' },
   *   displayName: 'Claude Code',
   *   description: 'Standard configuration',
   * });
   *
   * registry.registerProfile('claude-code', 'plan', {
   *   config: { print: true, outputFormat: 'stream-json', planMode: true },
   *   displayName: 'Claude Code (Plan Mode)',
   *   description: 'Claude with planning enabled',
   * });
   * ```
   */
  registerProfile(executor: string, variant: string, profile: AgentProfile): void {
    if (!this.profiles.executors[executor]) {
      this.profiles.executors[executor] = {};
    }
    this.profiles.executors[executor][variant] = profile;
  }

  /**
   * Get an executor instance by profile ID
   *
   * Creates a new executor instance using the registered factory and configuration.
   * Automatically falls back to 'default' variant if specified variant doesn't exist.
   *
   * @param profileId - Profile identifier (executor + optional variant)
   * @returns Executor instance, or null if not found
   *
   * @example
   * ```typescript
   * // Get specific variant
   * const executor = registry.getExecutor({
   *   executor: 'cursor',
   *   variant: 'interactive'
   * });
   *
   * // Falls back to default if variant not specified
   * const defaultExecutor = registry.getExecutor({
   *   executor: 'cursor'
   * });
   *
   * // Returns null if executor not found
   * const unknown = registry.getExecutor({
   *   executor: 'nonexistent'
   * });
   * // unknown === null
   * ```
   */
  getExecutor(profileId: AgentProfileId): IAgentExecutor | null {
    const factory = this.factories.get(profileId.executor);
    if (!factory) {
      return null;
    }

    const executorProfiles = this.profiles.executors[profileId.executor];
    if (!executorProfiles) {
      return null;
    }

    // Try specified variant first, fall back to 'default'
    const variantName = profileId.variant || 'default';
    let profile = executorProfiles[variantName];

    // Fallback to 'default' if specified variant not found
    if (!profile && variantName !== 'default') {
      profile = executorProfiles['default'];
    }

    if (!profile) {
      return null;
    }

    // Instantiate executor with profile config
    return factory(profile.config);
  }

  /**
   * Load profiles from a registry structure
   *
   * Merges the provided profiles with existing ones. Existing profiles
   * are preserved, new profiles are added, and matching profiles are updated.
   *
   * @param registry - Profile registry structure (typically from JSON)
   *
   * @example
   * ```typescript
   * import fs from 'fs';
   *
   * // Load from file
   * const profilesJson = fs.readFileSync('profiles.json', 'utf-8');
   * const profiles = JSON.parse(profilesJson);
   * registry.loadProfiles(profiles);
   *
   * // Or provide inline
   * registry.loadProfiles({
   *   executors: {
   *     cursor: {
   *       default: {
   *         config: { force: true },
   *         displayName: 'Cursor'
   *       }
   *     }
   *   }
   * });
   * ```
   */
  loadProfiles(registry: ProfileRegistry): void {
    for (const [executorName, variants] of Object.entries(registry.executors)) {
      if (!this.profiles.executors[executorName]) {
        this.profiles.executors[executorName] = {};
      }

      for (const [variantName, profile] of Object.entries(variants)) {
        this.profiles.executors[executorName][variantName] = profile;
      }
    }
  }

  /**
   * Get all profiles
   *
   * Returns a copy of the entire profile registry structure.
   * Useful for serialization, inspection, or UI display.
   *
   * @returns Complete profile registry
   *
   * @example
   * ```typescript
   * const allProfiles = registry.getAllProfiles();
   *
   * // Display available executors
   * for (const [executor, variants] of Object.entries(allProfiles.executors)) {
   *   console.log(`Executor: ${executor}`);
   *   for (const [variant, profile] of Object.entries(variants)) {
   *     console.log(`  - ${variant}: ${profile.displayName}`);
   *   }
   * }
   *
   * // Serialize to JSON
   * const json = JSON.stringify(allProfiles, null, 2);
   * fs.writeFileSync('profiles.json', json);
   * ```
   */
  getAllProfiles(): ProfileRegistry {
    // Return a deep copy to prevent external modification
    return JSON.parse(JSON.stringify(this.profiles));
  }

  /**
   * Get profile configuration without instantiating executor
   *
   * Returns the profile configuration for inspection without creating
   * an executor instance. Useful for UI display or validation.
   *
   * @param profileId - Profile identifier
   * @returns Profile configuration, or null if not found
   *
   * @example
   * ```typescript
   * const profile = registry.getProfile({
   *   executor: 'cursor',
   *   variant: 'interactive'
   * });
   *
   * if (profile) {
   *   console.log(profile.displayName);
   *   console.log(profile.description);
   *   // Don't instantiate, just inspect
   * }
   * ```
   */
  getProfile(profileId: AgentProfileId): AgentProfile | null {
    const executorProfiles = this.profiles.executors[profileId.executor];
    if (!executorProfiles) {
      return null;
    }

    const variantName = profileId.variant || 'default';
    let profile = executorProfiles[variantName];

    // Fallback to 'default' if specified variant not found
    if (!profile && variantName !== 'default') {
      profile = executorProfiles['default'];
    }

    return profile || null;
  }

  /**
   * Check if an executor is registered
   *
   * @param executorName - Executor name to check
   * @returns True if executor factory is registered
   *
   * @example
   * ```typescript
   * if (registry.hasExecutor('cursor')) {
   *   console.log('Cursor is available');
   * }
   * ```
   */
  hasExecutor(executorName: string): boolean {
    return this.factories.has(executorName);
  }

  /**
   * Check if a profile exists
   *
   * @param profileId - Profile to check
   * @returns True if profile exists (with fallback to default)
   *
   * @example
   * ```typescript
   * if (registry.hasProfile({ executor: 'cursor', variant: 'interactive' })) {
   *   console.log('Interactive profile available');
   * }
   * ```
   */
  hasProfile(profileId: AgentProfileId): boolean {
    return this.getProfile(profileId) !== null;
  }

  /**
   * Get all registered executor names
   *
   * @returns Array of executor names that have factories registered
   *
   * @example
   * ```typescript
   * const executors = registry.getExecutorNames();
   * console.log('Available executors:', executors);
   * // ['cursor', 'claude-code', 'gemini']
   * ```
   */
  getExecutorNames(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get all variant names for an executor
   *
   * @param executorName - Executor name
   * @returns Array of variant names, or empty array if executor not found
   *
   * @example
   * ```typescript
   * const variants = registry.getVariantNames('cursor');
   * console.log('Cursor variants:', variants);
   * // ['default', 'interactive']
   * ```
   */
  getVariantNames(executorName: string): string[] {
    const executorProfiles = this.profiles.executors[executorName];
    if (!executorProfiles) {
      return [];
    }
    return Object.keys(executorProfiles);
  }
}

/**
 * Global agent profile registry instance
 *
 * Singleton registry for convenient access throughout the application.
 * Can be used directly or create separate instances for isolated contexts.
 *
 * @example
 * ```typescript
 * import { globalProfileRegistry } from 'agent-execution-engine/agents/profiles';
 *
 * // Use global registry
 * globalProfileRegistry.registerExecutor('cursor', cursorFactory);
 * const executor = globalProfileRegistry.getExecutor({ executor: 'cursor' });
 * ```
 */
export const globalProfileRegistry = new AgentProfileRegistry();
