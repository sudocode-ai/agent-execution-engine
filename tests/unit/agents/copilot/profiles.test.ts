/**
 * Unit tests for Copilot profile configurations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  copilotProfiles,
  getCopilotProfile,
  getCopilotProfileVariants,
  registerCopilotProfiles,
  CopilotExecutor,
} from '@/agents/copilot/index';
import { AgentProfileRegistry } from '@/agents/profiles/registry';
import type { CopilotConfig } from '@/agents/copilot/config';

describe('Copilot Profiles', () => {
  describe('copilotProfiles', () => {
    it('should have copilot executor entry', () => {
      expect(copilotProfiles.executors.copilot).toBeDefined();
    });

    it('should have default profile', () => {
      const defaultProfile = copilotProfiles.executors.copilot.default;
      expect(defaultProfile).toBeDefined();
      expect(defaultProfile.config.allowAllTools).toBe(true);
      expect(defaultProfile.config.model).toBeUndefined(); // No model specified - uses account default
    });

    it('should have gpt-5 profile', () => {
      const profile = copilotProfiles.executors.copilot['gpt-5'];
      expect(profile).toBeDefined();
      expect(profile.config.model).toBe('gpt-5');
      expect(profile.displayName).toContain('GPT-5');
    });

    it('should have claude-sonnet-4.5 profile', () => {
      const profile = copilotProfiles.executors.copilot['claude-sonnet-4.5'];
      expect(profile).toBeDefined();
      expect(profile.config.model).toBe('claude-sonnet-4.5');
      expect(profile.displayName).toContain('Claude Sonnet 4.5');
    });

    it('should have claude-sonnet-4 profile', () => {
      const profile = copilotProfiles.executors.copilot['claude-sonnet-4'];
      expect(profile).toBeDefined();
      expect(profile.config.model).toBe('claude-sonnet-4');
      expect(profile.displayName).toContain('Claude Sonnet 4');
    });

    it('should have interactive profile with specific tools', () => {
      const profile = copilotProfiles.executors.copilot.interactive;
      expect(profile).toBeDefined();
      expect(profile.config.allowAllTools).toBe(false);
      expect(profile.config.allowTool).toContain('bash');
      expect(profile.config.allowTool).toContain('read_file');
      expect(profile.config.model).toBeUndefined(); // No model specified
    });

    it('should have read-only profile', () => {
      const profile = copilotProfiles.executors.copilot['read-only'];
      expect(profile).toBeDefined();
      expect(profile.config.allowAllTools).toBe(false);
      expect(profile.config.denyTool).toContain('bash');
      expect(profile.config.denyTool).toContain('write_file');
    });

    it('should have no-bash profile', () => {
      const profile = copilotProfiles.executors.copilot['no-bash'];
      expect(profile).toBeDefined();
      expect(profile.config.allowAllTools).toBe(true);
      expect(profile.config.denyTool).toBe('bash');
    });

    it('should have displayName for all profiles', () => {
      const variants = Object.keys(copilotProfiles.executors.copilot);
      variants.forEach((variant) => {
        const profile = copilotProfiles.executors.copilot[variant];
        expect(profile.displayName).toBeTruthy();
        expect(profile.displayName.length).toBeGreaterThan(0);
      });
    });

    it('should have description for all profiles', () => {
      const variants = Object.keys(copilotProfiles.executors.copilot);
      variants.forEach((variant) => {
        const profile = copilotProfiles.executors.copilot[variant];
        expect(profile.description).toBeTruthy();
        expect(profile.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getCopilotProfile', () => {
    it('should return default profile when no variant specified', () => {
      const profile = getCopilotProfile();
      expect(profile).toBeDefined();
      expect(profile?.config.model).toBeUndefined(); // Default uses account default
    });

    it('should return specific profile by variant', () => {
      const profile = getCopilotProfile('claude-sonnet-4.5');
      expect(profile).toBeDefined();
      expect(profile?.config.model).toBe('claude-sonnet-4.5');
    });

    it('should return undefined for non-existent variant', () => {
      const profile = getCopilotProfile('non-existent');
      expect(profile).toBeUndefined();
    });
  });

  describe('getCopilotProfileVariants', () => {
    it('should return all variant names', () => {
      const variants = getCopilotProfileVariants();
      expect(variants.length).toBeGreaterThan(0);
      expect(variants).toContain('default');
      expect(variants).toContain('gpt-5');
      expect(variants).toContain('claude-sonnet-4.5');
      expect(variants).toContain('claude-sonnet-4');
      expect(variants).toContain('interactive');
      expect(variants).toContain('read-only');
      expect(variants).toContain('no-bash');
    });

    it('should have exactly 7 profiles', () => {
      const variants = getCopilotProfileVariants();
      expect(variants.length).toBe(7);
    });
  });

  describe('registerCopilotProfiles', () => {
    let registry: AgentProfileRegistry;

    beforeEach(() => {
      // Create fresh registry for each test
      registry = new AgentProfileRegistry();
    });

    it('should register copilot executor factory', () => {
      // Manually register in our test registry
      registry.registerExecutor('copilot', (config: CopilotConfig) => new CopilotExecutor(config));
      registry.loadProfiles(copilotProfiles);

      expect(registry.hasExecutor('copilot')).toBe(true);
    });

    it('should load all profile variants', () => {
      registry.registerExecutor('copilot', (config: CopilotConfig) => new CopilotExecutor(config));
      registry.loadProfiles(copilotProfiles);

      const variants = getCopilotProfileVariants();
      variants.forEach((variant) => {
        expect(
          registry.hasProfile({ executor: 'copilot', variant })
        ).toBe(true);
      });
    });

    it('should create executor with default profile', () => {
      registry.registerExecutor('copilot', (config: CopilotConfig) => new CopilotExecutor(config));
      registry.loadProfiles(copilotProfiles);

      const executor = registry.getExecutor({ executor: 'copilot' });
      expect(executor).toBeDefined();
      expect(executor).toBeInstanceOf(CopilotExecutor);
    });

    it('should create executor with specific variant', () => {
      registry.registerExecutor('copilot', (config: CopilotConfig) => new CopilotExecutor(config));
      registry.loadProfiles(copilotProfiles);

      const executor = registry.getExecutor({
        executor: 'copilot',
        variant: 'claude-sonnet-4.5',
      });
      expect(executor).toBeDefined();
      expect(executor).toBeInstanceOf(CopilotExecutor);
    });

    it('should fall back to default for non-existent variant', () => {
      registry.registerExecutor('copilot', (config: CopilotConfig) => new CopilotExecutor(config));
      registry.loadProfiles(copilotProfiles);

      const executor = registry.getExecutor({
        executor: 'copilot',
        variant: 'non-existent',
      });
      expect(executor).toBeDefined();
      expect(executor).toBeInstanceOf(CopilotExecutor);
    });

    it('should get profile config without instantiating', () => {
      registry.registerExecutor('copilot', (config: CopilotConfig) => new CopilotExecutor(config));
      registry.loadProfiles(copilotProfiles);

      const profile = registry.getProfile({
        executor: 'copilot',
        variant: 'interactive',
      });
      expect(profile).toBeDefined();
      expect(profile?.config.allowAllTools).toBe(false);
      expect(profile?.displayName).toContain('Interactive');
    });
  });

  describe('Profile Consistency', () => {
    it('should have workDir omitted in all profiles (set by caller)', () => {
      const variants = getCopilotProfileVariants();
      variants.forEach((variant) => {
        const profile = getCopilotProfile(variant);
        // workDir should not be in profile configs - it's set per-task
        expect(profile?.config.workDir).toBeUndefined();
      });
    });

    it('should have model specified only in model-specific profiles', () => {
      // Model-specific profiles
      expect(getCopilotProfile('gpt-5')?.config.model).toBe('gpt-5');
      expect(getCopilotProfile('claude-sonnet-4.5')?.config.model).toBe('claude-sonnet-4.5');
      expect(getCopilotProfile('claude-sonnet-4')?.config.model).toBe('claude-sonnet-4');

      // Default and utility profiles should NOT specify model (use account default)
      expect(getCopilotProfile('default')?.config.model).toBeUndefined();
      expect(getCopilotProfile('interactive')?.config.model).toBeUndefined();
      expect(getCopilotProfile('read-only')?.config.model).toBeUndefined();
      expect(getCopilotProfile('no-bash')?.config.model).toBeUndefined();
    });
  });
});
