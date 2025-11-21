/**
 * Basic GitHub Copilot CLI executor example
 *
 * This example demonstrates:
 * - Creating a Copilot executor
 * - Executing a simple task
 * - Processing normalized output
 * - Clean process termination
 */

import { CopilotExecutor } from '../src/agents/copilot/executor.js';
import type { ExecutionTask } from '../src/engine/types.js';

async function main() {
  console.log('=== Basic Copilot Executor Example ===\n');

  // 1. Check availability
  const executor = new CopilotExecutor({
    workDir: process.cwd(),
  });

  const isAvailable = await executor.checkAvailability();
  if (!isAvailable) {
    console.error('❌ Copilot CLI not available');
    console.error('\nSetup instructions:');
    console.error('1. Run: npx -y @github/copilot');
    console.error('2. In the CLI, run: /login');
    console.error('3. Follow GitHub authentication flow');
    console.error('4. Verify ~/.copilot/mcp-config.json exists');
    process.exit(1);
  }

  console.log('✅ Copilot CLI available\n');

  // 2. Configure executor
  const configuredExecutor = new CopilotExecutor({
    workDir: process.cwd(),
    model: 'gpt-4o',
    allowAllTools: true,
  });

  // 3. Define task
  const task: ExecutionTask = {
    id: 'basic-example',
    type: 'custom',
    prompt: 'Read package.json and list the main dependencies',
    workDir: process.cwd(),
    config: {},
  };

  console.log(`📝 Task: ${task.prompt}\n`);

  // 4. Execute task
  const result = await configuredExecutor.executeTask(task);
  console.log(`✅ Process spawned (PID: ${result.process.pid})\n`);

  // 5. Set up timeout
  const timeout = setTimeout(() => {
    console.warn('\n⚠️  Timeout reached - terminating process');
    if (result.process.status === 'busy') {
      result.process.process.kill('SIGTERM');
    }
  }, 45000); // 45 seconds

  try {
    // 6. Process normalized output
    let sessionId: string | undefined;

    for await (const entry of configuredExecutor.normalizeOutput(
      result.process.streams!.stdout,
      task.workDir
    )) {
      switch (entry.type.kind) {
        case 'system_message':
          // Check for session ID
          const match = entry.content.match(/\[copilot-session\]\s+([a-f0-9-]+)/);
          if (match) {
            sessionId = match[1];
            console.log(`🔑 Session ID: ${sessionId}\n`);
          } else {
            console.log(`[System] ${entry.content}`);
          }
          break;

        case 'assistant_message':
          // Print assistant response
          console.log(entry.content);
          break;

        case 'error':
          console.error(`❌ Error: ${entry.type.error.message}`);
          break;
      }
    }

    console.log('\n✅ Task completed successfully');
    if (sessionId) {
      console.log(`💾 Session ID: ${sessionId}`);
      console.log('   Use this ID to resume the conversation');
    }
  } catch (error) {
    console.error('\n❌ Error during execution:', error);
    throw error;
  } finally {
    clearTimeout(timeout);

    // 7. Clean up process
    if (result.process.status === 'busy') {
      console.log('\n🧹 Cleaning up process...');
      result.process.process.kill('SIGTERM');
    }
  }
}

// Run example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
