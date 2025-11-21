/**
 * GitHub Copilot CLI session resumption example
 *
 * This example demonstrates:
 * - Executing an initial task
 * - Capturing the session ID
 * - Resuming the session with a follow-up task
 * - Context preservation across tasks
 */

import { CopilotExecutor } from '../src/agents/copilot/executor.js';
import type { ExecutionTask } from '../src/engine/types.js';

async function extractSessionId(
  executor: CopilotExecutor,
  outputStream: AsyncIterable<Buffer>,
  workDir: string
): Promise<string | null> {
  for await (const entry of executor.normalizeOutput(outputStream, workDir)) {
    if (entry.type.kind === 'system_message') {
      const match = entry.content.match(/\[copilot-session\]\s+([a-f0-9-]+)/);
      if (match) {
        return match[1];
      }
    }

    // Print other content
    if (entry.type.kind === 'assistant_message') {
      console.log(entry.content);
    }
  }

  return null;
}

async function main() {
  console.log('=== Copilot Session Resumption Example ===\n');

  // 1. Check availability
  const executor = new CopilotExecutor({
    workDir: process.cwd(),
  });

  const isAvailable = await executor.checkAvailability();
  if (!isAvailable) {
    console.error('❌ Copilot CLI not available. Run: npx -y @github/copilot');
    process.exit(1);
  }

  // 2. Configure executor
  const configuredExecutor = new CopilotExecutor({
    workDir: process.cwd(),
    model: 'gpt-4o',
    allowAllTools: true,
  });

  // 3. Execute initial task
  console.log('📝 Task 1: Read and explain package.json\n');
  const task1: ExecutionTask = {
    id: 'initial-task',
    type: 'custom',
    prompt: 'Read package.json and explain what this project does',
    workDir: process.cwd(),
    config: {},
  };

  const result1 = await configuredExecutor.executeTask(task1);
  console.log(`✅ Process spawned (PID: ${result1.process.pid})\n`);

  const timeout1 = setTimeout(() => {
    if (result1.process.status === 'busy') {
      result1.process.process.kill('SIGTERM');
    }
  }, 45000);

  let sessionId: string | null = null;

  try {
    // Extract session ID and display output
    sessionId = await extractSessionId(
      configuredExecutor,
      result1.process.streams!.stdout,
      task1.workDir
    );

    if (sessionId) {
      console.log(`\n🔑 Session ID: ${sessionId}\n`);
    } else {
      console.warn('⚠️  No session ID found');
    }
  } finally {
    clearTimeout(timeout1);
    if (result1.process.status === 'busy') {
      result1.process.process.kill('SIGTERM');
    }
  }

  // 4. Resume session with follow-up task
  if (!sessionId) {
    console.error('❌ Cannot resume without session ID');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60) + '\n');
  console.log('📝 Task 2: Follow-up question about dependencies\n');

  const task2: ExecutionTask = {
    id: 'followup-task',
    type: 'custom',
    prompt: 'Which of those dependencies are for testing?',
    workDir: process.cwd(),
    config: {},
  };

  const result2 = await configuredExecutor.resumeTask(task2, sessionId);
  console.log(`✅ Session resumed (PID: ${result2.process.pid})\n`);

  const timeout2 = setTimeout(() => {
    if (result2.process.status === 'busy') {
      result2.process.process.kill('SIGTERM');
    }
  }, 45000);

  try {
    // Process resumed session output
    for await (const entry of configuredExecutor.normalizeOutput(
      result2.process.streams!.stdout,
      task2.workDir
    )) {
      if (entry.type.kind === 'assistant_message') {
        console.log(entry.content);
      } else if (entry.type.kind === 'error') {
        console.error(`❌ Error: ${entry.type.error.message}`);
      }
    }

    console.log('\n✅ Follow-up task completed');
    console.log('💡 Notice: Copilot remembered the context from Task 1');
  } finally {
    clearTimeout(timeout2);
    if (result2.process.status === 'busy') {
      result2.process.process.kill('SIGTERM');
    }
  }
}

// Run example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
