import type { Command } from 'commander';

export interface SubmitOptions {
  agent: string;
  prompt: string;
  workDir: string;
  follow: boolean;
  detach: boolean;
  outputFormat: 'pretty' | 'json' | 'markdown';
  resume?: string;
}

export function registerSubmitCommand(program: Command): void {
  program
    .command('submit')
    .description('Submit a task to an agent and monitor execution')
    .requiredOption('--agent <name>', 'Agent to use (claude, cursor, copilot, codex, gemini)')
    .requiredOption('--prompt <text>', 'Task prompt/instruction')
    .requiredOption('--workDir <path>', 'Working directory for the agent')
    .option('--follow', 'Stream output until completion (default: true)', true)
    .option('--detach', 'Submit and return immediately (don\'t follow output)', false)
    .option('--output-format <format>', 'Output format: pretty, json, markdown', 'pretty')
    .option('--resume <sessionId>', 'Resume existing session')
    .action(async (options: SubmitOptions) => {
      // Handle mutually exclusive --follow and --detach
      if (options.detach) {
        options.follow = false;
      }

      // Stub implementation - will be completed in i-5swb
      console.log('Submit command called with options:', options);
      console.log('TODO: Implement submit command logic');
      process.exit(0);
    });
}
