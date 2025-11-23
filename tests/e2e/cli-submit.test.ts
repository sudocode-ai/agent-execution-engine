/**
 * End-to-End Test: CLI Submit Command
 *
 * Tests the `aee submit` command with real Claude Code CLI.
 * Verifies command-line argument parsing, output streaming, signal handling, etc.
 *
 * IMPORTANT: This test is SKIPPED BY DEFAULT and only runs when:
 * - Environment variable RUN_E2E_TESTS=true is set
 * - AND Claude Code CLI is available in PATH
 *
 * To run this test:
 *   RUN_E2E_TESTS=true npm test -- tests/e2e/cli-submit.test.ts
 *
 * Or set CLAUDE_PATH to use a specific Claude binary:
 *   RUN_E2E_TESTS=true CLAUDE_PATH=/path/to/claude npm test -- tests/e2e/cli-submit.test.ts
 */

import { describe, it, beforeAll, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Environment configuration
const SKIP_E2E =
  process.env.SKIP_E2E_TESTS === 'true' || process.env.RUN_E2E_TESTS !== 'true';
const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';

// Paths
const CLI_PATH = join(__dirname, '../../dist/cli/index.js');
const FIXTURE_PROJECT = join(__dirname, 'fixtures/test-project');

/**
 * Check if Claude Code is available
 */
async function checkClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn(CLAUDE_PATH, ['--version'], {
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
        // Disable colors for easier testing
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

/**
 * Spawn CLI command for signal testing
 */
function spawnCli(args: string[]): ChildProcess {
  return spawn('node', [CLI_PATH, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Skip all tests if E2E is disabled
describe.skipIf(SKIP_E2E)('CLI Submit Command E2E', () => {
  let claudeAvailable = false;

  beforeAll(async () => {
    claudeAvailable = await checkClaudeAvailable();
    if (!claudeAvailable) {
      console.warn(
        `\n⚠️  Claude Code CLI not available (tried: ${CLAUDE_PATH})` +
          `\n   Skipping E2E tests. Set CLAUDE_PATH to specify a custom path.` +
          `\n   Or install Claude Code CLI: https://docs.anthropic.com/claude/cli\n`
      );
    }
  });

  describe('Basic Usage', () => {
    it('should show help when --help is provided', async () => {
      if (!claudeAvailable) {
        console.log('Skipping: Claude CLI not available');
        return;
      }

      const result = await execCli(['submit', '--help'], 5000);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('--agent');
      expect(result.stdout).toContain('--prompt');
      expect(result.stdout).toContain('--workDir');
      expect(result.stdout).toContain('--detach');
      expect(result.stdout).toContain('--output-format');
    });

    it('should validate required arguments', async () => {
      if (!claudeAvailable) {
        console.log('Skipping: Claude CLI not available');
        return;
      }


      const result = await execCli(['submit'], 5000);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('required');
    });

    it('should validate agent is supported', async () => {
      if (!claudeAvailable) {
        console.log('Skipping: Claude CLI not available');
        return;
      }

      const result = await execCli(
        [
          'submit',
          '--agent',
          'nonexistent',
          '--prompt',
          'test',
          '--workDir',
          FIXTURE_PROJECT,
        ],
        5000
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not supported');
    });

    it('should validate workDir exists', async () => {
      if (!claudeAvailable) {
        console.log('Skipping: Claude CLI not available');
        return;
      }

      const result = await execCli(
        [
          'submit',
          '--agent',
          'claude',
          '--prompt',
          'test',
          '--workDir',
          '/nonexistent/path',
        ],
        5000
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('does not exist');
    });
  });

  describe('Submit with Follow (Default)', () => {
    it(
      'should submit task and stream output until completion',
      async () => {
        if (!claudeAvailable) {
          console.log('Skipping: Claude CLI not available');
          return;
        }

        const result = await execCli(
          [
            'submit',
            '--agent',
            'claude',
            '--prompt',
            'What is 2+2? Just respond with the number.',
            '--workDir',
            FIXTURE_PROJECT,
          ],
          60000 // 60 second timeout
        );

        // Should exit successfully
        expect(result.exitCode).toBe(0);

        // Should contain output (task ID, process ID shown in header)
        expect(result.stdout.length).toBeGreaterThan(0);

        // Should contain summary (shown at end)
        expect(result.stdout).toContain('task-');
      },
      70000 // 70 second test timeout
    );

    it(
      'should handle --output-format json',
      async () => {
        if (!claudeAvailable) {
          console.log('Skipping: Claude CLI not available');
          return;
        }

        const result = await execCli(
          [
            'submit',
            '--agent',
            'claude',
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
  });

  describe('Signal Handling', () => {
    it(
      'should handle SIGINT (Ctrl+C) gracefully',
      async () => {
        if (!claudeAvailable) {
          console.log('Skipping: Claude CLI not available');
          return;
        }

        const proc = spawnCli([
          'submit',
          '--agent',
          'claude',
          '--prompt',
          'Count to 100 slowly',
          '--workDir',
          FIXTURE_PROJECT,
        ]);

        let stdout = '';
        let stderr = '';

        proc.stdout!.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr!.on('data', (data) => {
          stderr += data.toString();
        });

        // Wait 2 seconds then send SIGINT
        await sleep(2000);
        proc.kill('SIGINT');

        // Wait for process to exit
        const exitCode = await new Promise<number | null>((resolve) => {
          proc.on('exit', (code) => resolve(code));
          setTimeout(() => resolve(null), 10000); // 10 second timeout
        });

        // Should exit (either gracefully or force killed)
        expect(exitCode).not.toBeNull();

        // Process should have received some output before being killed
        expect(stdout.length).toBeGreaterThan(0);
      },
      15000
    );
  });

  describe('Detached Mode', () => {
    it(
      'should return task/process IDs immediately with --detach',
      async () => {
        if (!claudeAvailable) {
          console.log('Skipping: Claude CLI not available');
          return;
        }

        const startTime = Date.now();
        const result = await execCli(
          [
            'submit',
            '--agent',
            'claude',
            '--prompt',
            'What is 2+2?',
            '--workDir',
            FIXTURE_PROJECT,
            '--detach',
          ],
          10000
        );
        const duration = Date.now() - startTime;

        // Should return quickly (< 5 seconds)
        expect(duration).toBeLessThan(5000);

        // Should exit successfully
        expect(result.exitCode).toBe(0);

        // Should output JSON with task and process IDs
        expect(() => JSON.parse(result.stdout)).not.toThrow();

        const output = JSON.parse(result.stdout);
        expect(output).toHaveProperty('taskId');
        expect(output).toHaveProperty('processId');
      },
      15000
    );
  });
});
