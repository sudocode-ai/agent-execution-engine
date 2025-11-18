/**
 * Agent Registry
 *
 * Central registry for managing CLI agent adapters.
 *
 * @module execution-engine/agents
 */

import type { IAgentAdapter, IAgentRegistry } from "./types/agent-adapter.js";

/**
 * Default implementation of IAgentRegistry
 *
 * Manages a collection of agent adapters and provides lookup by name.
 *
 * @example
 * ```typescript
 * import { AgentRegistry } from 'agent-execution-engine/agents';
 * import { ClaudeCodeAdapter } from 'agent-execution-engine/agents/claude';
 *
 * const registry = new AgentRegistry();
 * registry.register(new ClaudeCodeAdapter());
 *
 * const adapter = registry.get('claude-code');
 * const config = adapter.buildProcessConfig({ workDir: '/path' });
 * ```
 */
export class AgentRegistry implements IAgentRegistry {
  private agents = new Map<string, IAgentAdapter>();

  /**
   * Register an agent adapter
   *
   * @param adapter - Agent adapter to register
   * @throws Error if an agent with the same name is already registered
   */
  register(adapter: IAgentAdapter): void {
    if (this.agents.has(adapter.metadata.name)) {
      throw new Error(`Agent '${adapter.metadata.name}' is already registered`);
    }
    this.agents.set(adapter.metadata.name, adapter);
  }

  /**
   * Get an agent adapter by name
   *
   * @param name - Agent name (e.g., 'claude-code')
   * @returns Agent adapter or undefined if not found
   */
  get(name: string): IAgentAdapter | undefined {
    return this.agents.get(name);
  }

  /**
   * Get all registered agents
   *
   * @returns Array of all registered agent adapters
   */
  getAll(): IAgentAdapter[] {
    return Array.from(this.agents.values());
  }

  /**
   * Check if an agent is registered
   *
   * @param name - Agent name to check
   * @returns True if agent is registered
   */
  has(name: string): boolean {
    return this.agents.has(name);
  }

  /**
   * Unregister an agent adapter
   *
   * @param name - Agent name to unregister
   * @returns True if agent was removed
   */
  unregister(name: string): boolean {
    return this.agents.delete(name);
  }

  /**
   * Clear all registered agents
   */
  clear(): void {
    this.agents.clear();
  }
}

/**
 * Global agent registry instance
 *
 * Convenience singleton for common use cases. You can also create
 * your own AgentRegistry instances if needed.
 */
export const globalAgentRegistry = new AgentRegistry();
