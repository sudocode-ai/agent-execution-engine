import { describe, it, expect } from 'vitest';
import { program } from '@/cli/index';

describe('CLI Entry Point', () => {
  describe('Program Configuration', () => {
    it('should have correct name', () => {
      expect(program.name()).toBe('aee');
    });

    it('should have a description', () => {
      const description = program.description();
      expect(description).toContain('Agent Execution Engine');
      expect(description).toContain('CLI for interacting with coding agents');
    });

    it('should have a version', () => {
      const version = program.version();
      expect(version).toMatch(/^\d+\.\d+\.\d+/); // Semver format
    });
  });

  describe('Commands', () => {
    it('should register submit command', () => {
      const commands = program.commands;
      const submitCommand = commands.find((cmd) => cmd.name() === 'submit');
      expect(submitCommand).toBeDefined();
    });

    it('submit command should have correct description', () => {
      const commands = program.commands;
      const submitCommand = commands.find((cmd) => cmd.name() === 'submit');
      expect(submitCommand?.description()).toContain('Submit a task to an agent');
    });
  });
});

describe('Submit Command', () => {
  const submitCommand = program.commands.find((cmd) => cmd.name() === 'submit')!;

  describe('Options', () => {
    it('should have --agent required option', () => {
      const options = submitCommand.options;
      const agentOption = options.find((opt) => opt.long === '--agent');
      expect(agentOption).toBeDefined();
      expect(agentOption?.required).toBe(true);
      expect(agentOption?.description).toContain('Agent to use');
    });

    it('should have --prompt required option', () => {
      const options = submitCommand.options;
      const promptOption = options.find((opt) => opt.long === '--prompt');
      expect(promptOption).toBeDefined();
      expect(promptOption?.required).toBe(true);
      expect(promptOption?.description).toContain('Task prompt');
    });

    it('should have --workDir required option', () => {
      const options = submitCommand.options;
      const workDirOption = options.find((opt) => opt.long === '--workDir');
      expect(workDirOption).toBeDefined();
      expect(workDirOption?.required).toBe(true);
      expect(workDirOption?.description).toContain('Working directory');
    });

    it('should have --model option (optional)', () => {
      const options = submitCommand.options;
      const modelOption = options.find((opt) => opt.long === '--model');
      expect(modelOption).toBeDefined();
      expect(modelOption?.mandatory).toBe(false);
    });

    it('should have --detach option with default false', () => {
      const options = submitCommand.options;
      const detachOption = options.find((opt) => opt.long === '--detach');
      expect(detachOption).toBeDefined();
      expect(detachOption?.defaultValue).toBe(false);
    });

    it('should have --output-format option with default "pretty"', () => {
      const options = submitCommand.options;
      const formatOption = options.find((opt) => opt.long === '--output-format');
      expect(formatOption).toBeDefined();
      expect(formatOption?.defaultValue).toBe('pretty');
    });

    it('should have --force option with default true', () => {
      const options = submitCommand.options;
      const forceOption = options.find((opt) => opt.long === '--force');
      expect(forceOption).toBeDefined();
      expect(forceOption?.defaultValue).toBe(true);
    });
  });

  describe('Option Descriptions', () => {
    it('should have appropriate descriptions for all options', () => {
      const options = submitCommand.options;

      options.forEach((option) => {
        expect(option.description).toBeTruthy();
        expect(option.description.length).toBeGreaterThan(5);
      });
    });

    it('should list supported agents in --agent description', () => {
      const options = submitCommand.options;
      const agentOption = options.find((opt) => opt.long === '--agent');
      const description = agentOption?.description || '';

      expect(description).toContain('claude');
      expect(description).toContain('cursor');
      expect(description).toContain('copilot');
    });

    it('should list output formats in --output-format description', () => {
      const options = submitCommand.options;
      const formatOption = options.find((opt) => opt.long === '--output-format');
      const description = formatOption?.description || '';

      expect(description).toContain('pretty');
      expect(description).toContain('json');
      expect(description).toContain('markdown');
    });
  });
});

describe('Command Structure', () => {
  it('should export program for testing', () => {
    expect(program).toBeDefined();
    expect(program.name).toBeDefined();
    expect(program.version).toBeDefined();
    expect(program.commands).toBeDefined();
  });

  it('should have all required command properties', () => {
    const submitCommand = program.commands.find((cmd) => cmd.name() === 'submit')!;

    expect(submitCommand.name()).toBe('submit');
    expect(submitCommand.description()).toBeTruthy();
    expect(submitCommand.options.length).toBeGreaterThan(0);
  });

  it('should have proper option flags', () => {
    const submitCommand = program.commands.find((cmd) => cmd.name() === 'submit')!;
    const options = submitCommand.options;

    // Check that all options have proper flags
    options.forEach((option) => {
      expect(option.long).toMatch(/^--[a-zA-Z-]+$/);
    });
  });
});
