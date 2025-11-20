/**
 * Unit tests for AgentProfileRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentProfileRegistry } from '@/agents/profiles/registry';
import type {
  AgentProfileId,
  AgentProfile,
  ProfileRegistry,
  ExecutorFactory,
} from '@/agents/profiles/types';
import type { IAgentExecutor, AgentCapabilities } from '@/agents/types/agent-executor';
import type { ExecutionTask } from '@/engine/types';

// Mock executor for testing
class MockExecutor implements IAgentExecutor {
  constructor(public config: any) {}

  async executeTask(_task: ExecutionTask) {
    throw new Error('Not implemented');
  }

  async resumeTask(_task: ExecutionTask, _sessionId: string) {
    throw new Error('Not implemented');
  }

  async *normalizeOutput() {
    // Empty generator
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsSessionResume: false,
      requiresSetup: false,
      supportsApprovals: false,
      supportsMcp: false,
      protocol: 'custom',
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }
}

describe('AgentProfileRegistry', () => {
  let registry: AgentProfileRegistry;

  beforeEach(() => {
    registry = new AgentProfileRegistry();
  });

  describe('registerExecutor', () => {
    it('should register an executor factory', () => {
      const factory: ExecutorFactory = (config) => new MockExecutor(config);

      registry.registerExecutor('test-executor', factory);

      expect(registry.hasExecutor('test-executor')).toBe(true);
    });

    it('should allow registering multiple executors', () => {
      registry.registerExecutor('executor1', (c) => new MockExecutor(c));
      registry.registerExecutor('executor2', (c) => new MockExecutor(c));

      expect(registry.hasExecutor('executor1')).toBe(true);
      expect(registry.hasExecutor('executor2')).toBe(true);
    });
  });

  describe('registerProfile', () => {
    it('should register a profile for an executor', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'default', {
        config: { foo: 'bar' },
        displayName: 'Test Default',
      });

      const profile = registry.getProfile({ executor: 'test' });
      expect(profile).toBeDefined();
      expect(profile?.displayName).toBe('Test Default');
    });

    it('should support multiple variants for the same executor', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'default', {
        config: { variant: 'default' },
        displayName: 'Default',
      });

      registry.registerProfile('test', 'custom', {
        config: { variant: 'custom' },
        displayName: 'Custom',
      });

      const defaultProfile = registry.getProfile({ executor: 'test', variant: 'default' });
      const customProfile = registry.getProfile({ executor: 'test', variant: 'custom' });

      expect(defaultProfile?.displayName).toBe('Default');
      expect(customProfile?.displayName).toBe('Custom');
    });

    it('should overwrite existing profile when re-registered', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'default', {
        config: { version: 1 },
        displayName: 'Version 1',
      });

      registry.registerProfile('test', 'default', {
        config: { version: 2 },
        displayName: 'Version 2',
      });

      const profile = registry.getProfile({ executor: 'test' });
      expect(profile?.displayName).toBe('Version 2');
    });
  });

  describe('getExecutor', () => {
    it('should return null if executor not registered', () => {
      const executor = registry.getExecutor({ executor: 'nonexistent' });
      expect(executor).toBeNull();
    });

    it('should return null if factory registered but no profiles exist', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));
      const executor = registry.getExecutor({ executor: 'test' });
      expect(executor).toBeNull();
    });

    it('should create executor instance with correct config', () => {
      const factorySpy = vi.fn((config) => new MockExecutor(config));
      registry.registerExecutor('test', factorySpy);

      registry.registerProfile('test', 'default', {
        config: { foo: 'bar', baz: 123 },
        displayName: 'Test',
      });

      const executor = registry.getExecutor({ executor: 'test' });

      expect(executor).toBeDefined();
      expect(factorySpy).toHaveBeenCalledWith({ foo: 'bar', baz: 123 });
    });

    it('should fall back to default variant when variant not specified', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'default', {
        config: { variant: 'default' },
        displayName: 'Default',
      });

      const executor = registry.getExecutor({ executor: 'test' });

      expect(executor).toBeDefined();
      expect((executor as MockExecutor).config.variant).toBe('default');
    });

    it('should return specific variant when requested', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'default', {
        config: { variant: 'default' },
        displayName: 'Default',
      });

      registry.registerProfile('test', 'custom', {
        config: { variant: 'custom' },
        displayName: 'Custom',
      });

      const executor = registry.getExecutor({ executor: 'test', variant: 'custom' });

      expect(executor).toBeDefined();
      expect((executor as MockExecutor).config.variant).toBe('custom');
    });

    it('should fall back to default if specified variant does not exist', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'default', {
        config: { variant: 'default' },
        displayName: 'Default',
      });

      const executor = registry.getExecutor({ executor: 'test', variant: 'nonexistent' });

      expect(executor).toBeDefined();
      expect((executor as MockExecutor).config.variant).toBe('default');
    });

    it('should return null if variant does not exist and no default', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'custom', {
        config: { variant: 'custom' },
        displayName: 'Custom',
      });

      const executor = registry.getExecutor({ executor: 'test' });
      expect(executor).toBeNull();
    });
  });

  describe('loadProfiles', () => {
    it('should load profiles from registry structure', () => {
      registry.registerExecutor('executor1', (c) => new MockExecutor(c));
      registry.registerExecutor('executor2', (c) => new MockExecutor(c));

      const profiles: ProfileRegistry = {
        executors: {
          executor1: {
            default: {
              config: { value: 1 },
              displayName: 'Executor 1',
            },
          },
          executor2: {
            default: {
              config: { value: 2 },
              displayName: 'Executor 2',
            },
          },
        },
      };

      registry.loadProfiles(profiles);

      const profile1 = registry.getProfile({ executor: 'executor1' });
      const profile2 = registry.getProfile({ executor: 'executor2' });

      expect(profile1?.displayName).toBe('Executor 1');
      expect(profile2?.displayName).toBe('Executor 2');
    });

    it('should merge with existing profiles', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      // Register initial profile
      registry.registerProfile('test', 'default', {
        config: { version: 1 },
        displayName: 'Version 1',
      });

      // Load additional variant
      registry.loadProfiles({
        executors: {
          test: {
            custom: {
              config: { version: 2 },
              displayName: 'Custom',
            },
          },
        },
      });

      const defaultProfile = registry.getProfile({ executor: 'test', variant: 'default' });
      const customProfile = registry.getProfile({ executor: 'test', variant: 'custom' });

      expect(defaultProfile?.displayName).toBe('Version 1');
      expect(customProfile?.displayName).toBe('Custom');
    });

    it('should update existing profiles when loading', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'default', {
        config: { version: 1 },
        displayName: 'Version 1',
      });

      registry.loadProfiles({
        executors: {
          test: {
            default: {
              config: { version: 2 },
              displayName: 'Version 2',
            },
          },
        },
      });

      const profile = registry.getProfile({ executor: 'test' });
      expect(profile?.displayName).toBe('Version 2');
    });
  });

  describe('getAllProfiles', () => {
    it('should return empty registry when no profiles registered', () => {
      const profiles = registry.getAllProfiles();
      expect(profiles.executors).toEqual({});
    });

    it('should return all registered profiles', () => {
      registry.registerExecutor('test1', (c) => new MockExecutor(c));
      registry.registerExecutor('test2', (c) => new MockExecutor(c));

      registry.registerProfile('test1', 'default', {
        config: { value: 1 },
        displayName: 'Test 1',
      });

      registry.registerProfile('test2', 'default', {
        config: { value: 2 },
        displayName: 'Test 2',
      });

      const profiles = registry.getAllProfiles();

      expect(profiles.executors.test1.default.displayName).toBe('Test 1');
      expect(profiles.executors.test2.default.displayName).toBe('Test 2');
    });

    it('should return a deep copy to prevent external modification', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));
      registry.registerProfile('test', 'default', {
        config: { value: 1 },
        displayName: 'Original',
      });

      const profiles = registry.getAllProfiles();
      profiles.executors.test.default.displayName = 'Modified';

      const profilesAgain = registry.getAllProfiles();
      expect(profilesAgain.executors.test.default.displayName).toBe('Original');
    });
  });

  describe('getProfile', () => {
    it('should return null if executor does not exist', () => {
      const profile = registry.getProfile({ executor: 'nonexistent' });
      expect(profile).toBeNull();
    });

    it('should return profile without instantiating executor', () => {
      const factorySpy = vi.fn((c) => new MockExecutor(c));
      registry.registerExecutor('test', factorySpy);

      registry.registerProfile('test', 'default', {
        config: { foo: 'bar' },
        displayName: 'Test',
        description: 'Test description',
      });

      const profile = registry.getProfile({ executor: 'test' });

      expect(profile).toBeDefined();
      expect(profile?.displayName).toBe('Test');
      expect(profile?.description).toBe('Test description');
      expect(factorySpy).not.toHaveBeenCalled(); // Factory not invoked
    });

    it('should support variant parameter', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'default', {
        config: { variant: 'default' },
        displayName: 'Default',
      });

      registry.registerProfile('test', 'custom', {
        config: { variant: 'custom' },
        displayName: 'Custom',
      });

      const customProfile = registry.getProfile({ executor: 'test', variant: 'custom' });
      expect(customProfile?.displayName).toBe('Custom');
    });

    it('should fall back to default variant', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'default', {
        config: {},
        displayName: 'Default',
      });

      const profile = registry.getProfile({ executor: 'test', variant: 'nonexistent' });
      expect(profile?.displayName).toBe('Default');
    });
  });

  describe('hasExecutor', () => {
    it('should return false for unregistered executor', () => {
      expect(registry.hasExecutor('nonexistent')).toBe(false);
    });

    it('should return true for registered executor', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));
      expect(registry.hasExecutor('test')).toBe(true);
    });
  });

  describe('hasProfile', () => {
    it('should return false if profile does not exist', () => {
      expect(registry.hasProfile({ executor: 'nonexistent' })).toBe(false);
    });

    it('should return true if profile exists', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));
      registry.registerProfile('test', 'default', {
        config: {},
        displayName: 'Test',
      });

      expect(registry.hasProfile({ executor: 'test' })).toBe(true);
    });

    it('should return true with fallback to default', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));
      registry.registerProfile('test', 'default', {
        config: {},
        displayName: 'Test',
      });

      expect(registry.hasProfile({ executor: 'test', variant: 'nonexistent' })).toBe(true);
    });

    it('should return false if no default and variant does not exist', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));
      registry.registerProfile('test', 'custom', {
        config: {},
        displayName: 'Test',
      });

      expect(registry.hasProfile({ executor: 'test' })).toBe(false);
    });
  });

  describe('getExecutorNames', () => {
    it('should return empty array when no executors registered', () => {
      expect(registry.getExecutorNames()).toEqual([]);
    });

    it('should return all registered executor names', () => {
      registry.registerExecutor('executor1', (c) => new MockExecutor(c));
      registry.registerExecutor('executor2', (c) => new MockExecutor(c));
      registry.registerExecutor('executor3', (c) => new MockExecutor(c));

      const names = registry.getExecutorNames();
      expect(names).toContain('executor1');
      expect(names).toContain('executor2');
      expect(names).toContain('executor3');
      expect(names).toHaveLength(3);
    });
  });

  describe('getVariantNames', () => {
    it('should return empty array for nonexistent executor', () => {
      expect(registry.getVariantNames('nonexistent')).toEqual([]);
    });

    it('should return empty array if executor has no profiles', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));
      expect(registry.getVariantNames('test')).toEqual([]);
    });

    it('should return all variant names for executor', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      registry.registerProfile('test', 'default', {
        config: {},
        displayName: 'Default',
      });

      registry.registerProfile('test', 'variant1', {
        config: {},
        displayName: 'Variant 1',
      });

      registry.registerProfile('test', 'variant2', {
        config: {},
        displayName: 'Variant 2',
      });

      const variants = registry.getVariantNames('test');
      expect(variants).toContain('default');
      expect(variants).toContain('variant1');
      expect(variants).toContain('variant2');
      expect(variants).toHaveLength(3);
    });
  });

  describe('integration scenarios', () => {
    it('should support complete workflow: register, load, retrieve', () => {
      // 1. Register factories
      registry.registerExecutor('cursor', (c) => new MockExecutor(c));
      registry.registerExecutor('claude', (c) => new MockExecutor(c));

      // 2. Load profiles from JSON
      const profiles: ProfileRegistry = {
        executors: {
          cursor: {
            default: {
              config: { force: true, model: 'auto' },
              displayName: 'Cursor (Auto-approve)',
              description: 'Cursor with auto-approval',
            },
            interactive: {
              config: { force: false, model: 'sonnet-4.5' },
              displayName: 'Cursor (Interactive)',
              description: 'Manual approvals',
            },
          },
          claude: {
            default: {
              config: { print: true, outputFormat: 'stream-json' },
              displayName: 'Claude Code',
              description: 'Standard configuration',
            },
          },
        },
      };

      registry.loadProfiles(profiles);

      // 3. Retrieve executors
      const cursorDefault = registry.getExecutor({ executor: 'cursor' });
      const cursorInteractive = registry.getExecutor({ executor: 'cursor', variant: 'interactive' });
      const claude = registry.getExecutor({ executor: 'claude' });

      expect(cursorDefault).toBeDefined();
      expect(cursorInteractive).toBeDefined();
      expect(claude).toBeDefined();

      expect((cursorDefault as MockExecutor).config.force).toBe(true);
      expect((cursorInteractive as MockExecutor).config.force).toBe(false);
      expect((claude as MockExecutor).config.print).toBe(true);
    });

    it('should support partial profile loading and updates', () => {
      registry.registerExecutor('test', (c) => new MockExecutor(c));

      // Initial load
      registry.loadProfiles({
        executors: {
          test: {
            default: {
              config: { version: 1 },
              displayName: 'V1',
            },
          },
        },
      });

      // Add new variant
      registry.loadProfiles({
        executors: {
          test: {
            custom: {
              config: { version: 2 },
              displayName: 'V2',
            },
          },
        },
      });

      // Update existing
      registry.loadProfiles({
        executors: {
          test: {
            default: {
              config: { version: 3 },
              displayName: 'V3',
            },
          },
        },
      });

      const defaultProfile = registry.getProfile({ executor: 'test' });
      const customProfile = registry.getProfile({ executor: 'test', variant: 'custom' });

      expect(defaultProfile?.displayName).toBe('V3');
      expect(customProfile?.displayName).toBe('V2');
    });
  });
});
