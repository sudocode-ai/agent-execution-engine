/**
 * GitHub Copilot CLI multi-directory context example
 *
 * This example demonstrates:
 * - Adding multiple directories to Copilot's context
 * - Using system prompts for consistent instructions
 * - Custom tool permissions
 * - Cross-project code analysis
 */

import { CopilotExecutor } from '../src/agents/copilot/executor.js';
import { validateCopilotConfig } from '../src/agents/copilot/config.js';
import type { ExecutionTask } from '../src/engine/types.js';
import { join } from 'path';

async function main() {
  console.log('=== Copilot Multi-Directory Context Example ===\n');

  // 1. Define configuration with multiple directories
  const config = {
    workDir: process.cwd(),
    model: 'gpt-4o',
    allowAllTools: true,
    addDir: [
      join(process.cwd(), 'src'),
      join(process.cwd(), 'tests'),
      join(process.cwd(), 'examples'),
    ],
    systemPrompt: `
You are analyzing a TypeScript project with multiple directories.
Focus on:
- Code quality and best practices
- Type safety
- Test coverage
- Documentation completeness
    `.trim(),
  };

  // 2. Validate configuration
  console.log('📋 Configuration:');
  console.log(`   Work Dir: ${config.workDir}`);
  console.log(`   Model: ${config.model}`);
  console.log(`   Additional Dirs: ${config.addDir.length} directories`);
  config.addDir.forEach((dir) => {
    console.log(`     - ${dir}`);
  });
  console.log();

  const errors = validateCopilotConfig(config);
  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach((err) => {
      console.error(`   - ${err.field}: ${err.message}`);
    });
    process.exit(1);
  }

  console.log('✅ Configuration valid\n');

  // 3. Create executor
  const executor = new CopilotExecutor(config);

  const isAvailable = await executor.checkAvailability();
  if (!isAvailable) {
    console.error('❌ Copilot CLI not available');
    process.exit(1);
  }

  // 4. Execute task that requires multi-directory context
  console.log('📝 Task: Analyze project structure across all directories\n');

  const task: ExecutionTask = {
    id: 'multi-dir-analysis',
    type: 'custom',
    prompt: `
Analyze this TypeScript project across all provided directories:

1. List the main source files in src/
2. What test files exist in tests/?
3. What examples are available in examples/?
4. How is the project organized?

Provide a brief summary of the project structure.
    `.trim(),
    workDir: config.workDir,
    config: {},
  };

  const result = await executor.executeTask(task);
  console.log(`✅ Process spawned (PID: ${result.process.pid})\n`);

  const timeout = setTimeout(() => {
    if (result.process.status === 'busy') {
      result.process.process.kill('SIGTERM');
    }
  }, 60000); // 60 seconds for larger analysis

  try {
    let sessionId: string | undefined;

    for await (const entry of executor.normalizeOutput(
      result.process.streams!.stdout,
      task.workDir
    )) {
      switch (entry.type.kind) {
        case 'system_message':
          const match = entry.content.match(/\[copilot-session\]\s+([a-f0-9-]+)/);
          if (match) {
            sessionId = match[1];
            console.log(`🔑 Session ID: ${sessionId}\n`);
          } else {
            console.log(`[System] ${entry.content}`);
          }
          break;

        case 'assistant_message':
          console.log(entry.content);
          break;

        case 'error':
          console.error(`❌ Error: ${entry.type.error.message}`);
          break;
      }
    }

    console.log('\n✅ Analysis completed');
    console.log('💡 Copilot had access to all specified directories');
    if (sessionId) {
      console.log(`💾 Session ID: ${sessionId}`);
    }
  } finally {
    clearTimeout(timeout);
    if (result.process.status === 'busy') {
      result.process.process.kill('SIGTERM');
    }
  }
}

// Run example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
