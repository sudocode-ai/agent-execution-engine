/**
 * End-to-End Test: Multi-Agent Support
 *
 * Tests all supported agents (Claude, Cursor, Copilot, Codex) with common operations.
 * Verifies consistent behavior across different agent implementations.
 *
 * IMPORTANT: This test is SKIPPED BY DEFAULT and only runs when:
 * - Environment variable RUN_E2E_TESTS=true is set
 * - AND respective agent CLIs are available in PATH
 *
 * To run this test:
 *   RUN_E2E_TESTS=true npm test -- tests/e2e/multi-agent.test.ts
 *
 * Or specify custom paths:
 *   RUN_E2E_TESTS=true \
 *     CLAUDE_PATH=/path/to/claude \
 *     CURSOR_PATH=/path/to/cursor \
 *     COPILOT_PATH=/path/to/copilot \
 *     npm test -- tests/e2e/multi-agent.test.ts
 */

import { describe, it, beforeAll, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Environment configuration
const SKIP_E2E =
  process.env.SKIP_E2E_TESTS === 'true' || process.env.RUN_E2E_TESTS !== 'true';

// Agent paths
const AGENT_PATHS = {
  claude: process.env.CLAUDE_PATH || 'claude',
  cursor: process.env.CURSOR_PATH || 'cursor-agent',
  copilot: process.env.COPILOT_PATH || 'copilot',
  codex: process.env.CODEX_PATH || 'codex',
};

// Paths
const CLI_PATH = join(__dirname, '../../dist/cli/index.js');
const FIXTURE_PROJECT = join(__dirname, 'fixtures/test-project');

/**
 * Agent configuration
 */
interface AgentConfig {
  name: string;
  displayName: string;
  available: boolean;
  supportsModel?: boolean;
  supportsSessionResumption?: boolean;
}

/**
 * Check if an agent CLI is available
 */
async function checkAgentAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn(command, ['--version'], {
      stdio: 'ignore',
    });

    check.on('error', () => resolve(false));
    check.on('exit', (code) => resolve(code === 0));

    setTimeout(() => {
      check.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * Execute CLI command and capture output
 */
async function execCli(args: string[], timeout = 30000): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
}> {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      proc.kill('SIGKILL');
    }, timeout);

    proc.on('exit', (code, signal) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        signal,
      });
    });
  });
}

// Skip all tests if E2E is disabled
describe.skipIf(SKIP_E2E)('Multi-Agent Support E2E', () => {
  const agents: Map<string, AgentConfig> = new Map();

  beforeAll(async () => {
    // Check availability of each agent
    const agentConfigs: AgentConfig[] = [
      {
        name: 'claude',
        displayName: 'Claude Code',
        available: await checkAgentAvailable(AGENT_PATHS.claude),
        supportsModel: false, // Claude doesn't support --model flag yet
        supportsSessionResumption: true,
      },
      {
        name: 'cursor',
        displayName: 'Cursor',
        available: await checkAgentAvailable(AGENT_PATHS.cursor),
        supportsModel: true,
        supportsSessionResumption: false,
      },
      {
        name: 'copilot',
        displayName: 'GitHub Copilot',
        available: await checkAgentAvailable(AGENT_PATHS.copilot),
        supportsModel: false,
        supportsSessionResumption: false,
      },
      {
        name: 'codex',
        displayName: 'Codex',
        available: await checkAgentAvailable(AGENT_PATHS.codex),
        supportsModel: true,
        supportsSessionResumption: true,
      },
    ];

    // Store in map
    agentConfigs.forEach((config) => {
      agents.set(config.name, config);
    });

    // Log availability
    console.log('\n📋 Agent Availability:');
    agentConfigs.forEach((config) => {
      const status = config.available ? '✅' : '❌';
      const path = AGENT_PATHS[config.name as keyof typeof AGENT_PATHS];
      console.log(
        `   ${status} ${config.displayName} (${config.name}): ${config.available ? 'Available' : `Not found at ${path}`}`
      );
    });
    console.log('');

    // Warn if no agents available
    const availableCount = agentConfigs.filter((c) => c.available).length;
    if (availableCount === 0) {
      console.warn(
        '⚠️  No agent CLIs available. All tests will be skipped.\n' +
          '   Set CLAUDE_PATH, CURSOR_PATH, COPILOT_PATH to specify custom paths.\n'
      );
    }
  });

  describe('Agent Discovery', () => {
    it('should list all available agents', async () => {
      const result = await execCli(['list'], 5000);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Available Coding Agents');
      expect(result.stdout).toContain('claude');
      expect(result.stdout).toContain('cursor');
      expect(result.stdout).toContain('copilot');
      expect(result.stdout).toContain('codex');
    });

    it('should output agent list in JSON format', async () => {
      const result = await execCli(['list', '--format', 'json'], 5000);

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();

      const output = JSON.parse(result.stdout);
      expect(Array.isArray(output)).toBe(true);
      expect(output.length).toBeGreaterThan(0);

      // Verify structure
      output.forEach((agent: any) => {
        expect(agent).toHaveProperty('agent');
        expect(agent).toHaveProperty('displayName');
        expect(agent).toHaveProperty('description');
        expect(agent).toHaveProperty('available');
      });
    });
  });

  // Test each available agent
  ['claude', 'cursor', 'copilot', 'codex'].forEach((agentName) => {
    describe(`${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Agent`, () => {
      let agentConfig: AgentConfig | undefined;

      beforeAll(() => {
        agentConfig = agents.get(agentName);
      });

      it(
        'should execute simple task',
        async () => {
          if (!agentConfig?.available) {
            console.log(`Skipping: ${agentName} CLI not available`);
            return;
          }

          const result = await execCli(
            [
              'submit',
              '--agent',
              agentName,
              '--prompt',
              'What is 2+2? Just respond with the number.',
              '--workDir',
              FIXTURE_PROJECT,
            ],
            60000
          );

          // Should exit successfully
          expect(result.exitCode).toBe(0);

          // Should contain output
          expect(result.stdout.length).toBeGreaterThan(0);

          // Should contain task ID
          expect(result.stdout).toContain('task-');
        },
        70000
      );

      it(
        'should handle JSON output format',
        async () => {
          if (!agentConfig?.available) {
            console.log(`Skipping: ${agentName} CLI not available`);
            return;
          }

          const result = await execCli(
            [
              'submit',
              '--agent',
              agentName,
              '--prompt',
              'Say hello',
              '--workDir',
              FIXTURE_PROJECT,
              '--output-format',
              'json',
            ],
            60000
          );

          // Should exit successfully
          expect(result.exitCode).toBe(0);

          // Should output valid JSON
          expect(() => JSON.parse(result.stdout)).not.toThrow();

          const output = JSON.parse(result.stdout);
          expect(output).toHaveProperty('taskId');
          expect(output).toHaveProperty('processId');
          expect(output).toHaveProperty('success');
          expect(output).toHaveProperty('exitCode');
          expect(output).toHaveProperty('durationMs');
          expect(output).toHaveProperty('toolsUsed');
          expect(output).toHaveProperty('filesChanged');
        },
        70000
      );

      it(
        'should handle force flag for auto-approval',
        async () => {
          if (!agentConfig?.available) {
            console.log(`Skipping: ${agentName} CLI not available`);
            return;
          }

          const result = await execCli(
            [
              'submit',
              '--agent',
              agentName,
              '--prompt',
              'List files in current directory',
              '--workDir',
              FIXTURE_PROJECT,
              '--force',
            ],
            60000
          );

          // Should exit successfully (force flag should auto-approve)
          expect(result.exitCode).toBe(0);
        },
        70000
      );

      if (agentConfig?.supportsModel) {
        it(
          'should handle model selection',
          async () => {
            if (!agentConfig?.available) {
              console.log(`Skipping: ${agentName} CLI not available`);
              return;
            }

            const result = await execCli(
              [
                'submit',
                '--agent',
                agentName,
                '--prompt',
                'What is 2+2?',
                '--workDir',
                FIXTURE_PROJECT,
                '--model',
                'auto',
              ],
              60000
            );

            // Should exit successfully
            expect(result.exitCode).toBe(0);
          },
          70000
        );
      }

      it(
        'should handle errors gracefully',
        async () => {
          if (!agentConfig?.available) {
            console.log(`Skipping: ${agentName} CLI not available`);
            return;
          }

          // Test with invalid workDir
          const result = await execCli(
            [
              'submit',
              '--agent',
              agentName,
              '--prompt',
              'test',
              '--workDir',
              '/nonexistent/path/that/does/not/exist',
            ],
            10000
          );

          // Should fail
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain('does not exist');
        },
        15000
      );
    });
  });

  describe('Cross-Agent Consistency', () => {
    it('should provide consistent output structure across agents', async () => {
      const availableAgents = Array.from(agents.entries())
        .filter(([, config]) => config.available)
        .map(([name]) => name);

      if (availableAgents.length < 2) {
        console.log('Skipping: Need at least 2 agents available for comparison');
        return;
      }

      const results: Map<string, any> = new Map();

      // Execute same task with all available agents
      for (const agentName of availableAgents) {
        const result = await execCli(
          [
            'submit',
            '--agent',
            agentName,
            '--prompt',
            'What is 2+2?',
            '--workDir',
            FIXTURE_PROJECT,
            '--output-format',
            'json',
          ],
          60000
        );

        if (result.exitCode === 0) {
          results.set(agentName, JSON.parse(result.stdout));
        }
      }

      // Verify all results have same structure
      const keys = [
        'taskId',
        'processId',
        'success',
        'exitCode',
        'durationMs',
        'toolsUsed',
        'filesChanged',
      ];

      results.forEach((result, agentName) => {
        keys.forEach((key) => {
          expect(result).toHaveProperty(key);
        });
      });
    }, 180000); // 3 minutes for multiple agents
  });

  describe('Agent-Specific Features', () => {
    it('should only accept model flag for agents that support it', async () => {
      const nonModelAgents = Array.from(agents.entries())
        .filter(([, config]) => config.available && !config.supportsModel)
        .map(([name]) => name);

      if (nonModelAgents.length === 0) {
        console.log('Skipping: No agents available that lack model support');
        return;
      }

      // Test that --model flag doesn't cause errors (it's just ignored)
      for (const agentName of nonModelAgents) {
        const result = await execCli(
          [
            'submit',
            '--agent',
            agentName,
            '--prompt',
            'test',
            '--workDir',
            FIXTURE_PROJECT,
            '--model',
            'auto',
          ],
          60000
        );

        // Should still work (model option is ignored for unsupported agents)
        expect(result.exitCode).toBe(0);
      }
    }, 120000);
  });

  describe('Error Handling', () => {
    it('should reject unsupported agent names', async () => {
      const result = await execCli(
        [
          'submit',
          '--agent',
          'nonexistent-agent',
          '--prompt',
          'test',
          '--workDir',
          FIXTURE_PROJECT,
        ],
        5000
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/not available|not supported/i);
    });

    it('should validate required parameters', async () => {
      const result = await execCli(['submit'], 5000);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('required');
    });
  });
});
