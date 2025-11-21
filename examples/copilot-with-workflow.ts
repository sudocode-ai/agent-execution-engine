/**
 * GitHub Copilot CLI with workflow orchestrator example
 *
 * This example demonstrates:
 * - Integrating CopilotExecutor with workflow orchestration
 * - Multi-step workflows with Copilot
 * - Mixing different executors in a workflow
 * - Error handling and resilience
 */

import { CopilotExecutor } from '../src/agents/copilot/executor.js';
import { SimpleProcessManager } from '../src/process/simple-manager.js';
import { SimpleExecutionEngine } from '../src/engine/simple-engine.js';
import { ResilientExecutor } from '../src/resilience/resilient-executor.js';
import { LinearOrchestrator } from '../src/workflow/linear-orchestrator.js';
import type { WorkflowDefinition } from '../src/workflow/types.js';

async function main() {
  console.log('=== Copilot with Workflow Orchestrator Example ===\n');

  // 1. Check Copilot availability
  const copilotExecutor = new CopilotExecutor({
    workDir: process.cwd(),
  });

  const isAvailable = await copilotExecutor.checkAvailability();
  if (!isAvailable) {
    console.error('❌ Copilot CLI not available');
    process.exit(1);
  }

  console.log('✅ Copilot CLI available\n');

  // 2. Set up execution stack
  console.log('🔧 Setting up execution stack...');

  const processManager = new SimpleProcessManager();
  const engine = new SimpleExecutionEngine(processManager, {
    maxConcurrent: 1, // Run tasks sequentially
  });

  const resilientExecutor = new ResilientExecutor(engine, {
    maxAttempts: 2,
    backoffStrategy: 'fixed',
    initialDelay: 1000,
  });

  const orchestrator = new LinearOrchestrator(resilientExecutor);

  console.log('✅ Stack ready\n');

  // 3. Define workflow
  const workflow: WorkflowDefinition = {
    id: 'copilot-analysis-workflow',
    steps: [
      {
        id: 'analyze-structure',
        taskType: 'custom',
        prompt: 'Analyze the project structure and list the main directories',
      },
      {
        id: 'list-dependencies',
        taskType: 'custom',
        prompt: 'Read package.json and list the production dependencies',
        dependsOn: ['analyze-structure'],
      },
      {
        id: 'check-tests',
        taskType: 'custom',
        prompt: 'Look for test files and summarize the testing setup',
        dependsOn: ['analyze-structure'],
      },
      {
        id: 'generate-report',
        taskType: 'custom',
        prompt: `
Based on the previous analysis, create a brief project report covering:
1. Project structure
2. Key dependencies
3. Testing approach
        `.trim(),
        dependsOn: ['list-dependencies', 'check-tests'],
      },
    ],
    config: {
      continueOnStepFailure: false,
      checkpointInterval: 2,
    },
  };

  console.log('📋 Workflow defined with', workflow.steps.length, 'steps\n');

  // 4. Set up event listeners
  orchestrator.onWorkflowStart((executionId) => {
    console.log(`🚀 Workflow started: ${executionId}\n`);
  });

  orchestrator.onStepStart((executionId, stepId) => {
    const step = workflow.steps.find((s) => s.id === stepId);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📝 Step: ${stepId}`);
    if (step) {
      console.log(`   Prompt: ${step.prompt.substring(0, 60)}...`);
    }
    console.log(`${'='.repeat(60)}\n`);
  });

  orchestrator.onStepComplete((executionId, stepId) => {
    console.log(`\n✅ Step completed: ${stepId}\n`);
  });

  orchestrator.onWorkflowComplete((executionId) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Workflow completed: ${executionId}`);
    console.log(`${'='.repeat(60)}\n`);
  });

  orchestrator.onWorkflowError((executionId, error) => {
    console.error(`\n❌ Workflow error: ${error.message}`);
  });

  // 5. Start workflow
  try {
    const executionId = await orchestrator.startWorkflow(
      workflow,
      process.cwd()
    );

    console.log(`⏳ Waiting for workflow to complete...\n`);

    const execution = await orchestrator.waitForWorkflow(executionId);

    // 6. Display results
    console.log('📊 Workflow Results:\n');
    console.log(`   Status: ${execution.status}`);
    console.log(`   Steps completed: ${execution.stepResults.size}`);
    console.log(`   Checkpoints: ${execution.checkpoints.length}`);

    if (execution.error) {
      console.error(`   Error: ${execution.error.message}`);
    }

    // Display step results
    console.log('\n📝 Step Results:');
    for (const [stepId, result] of execution.stepResults.entries()) {
      console.log(`\n   ${stepId}:`);
      console.log(`     Success: ${result.success}`);
      console.log(`     Duration: ${result.duration}ms`);

      if (result.output) {
        const preview =
          result.output.length > 100
            ? result.output.substring(0, 100) + '...'
            : result.output;
        console.log(`     Output: ${preview}`);
      }

      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    }
  } catch (error) {
    console.error('\n❌ Workflow failed:', error);
    process.exit(1);
  } finally {
    // 7. Clean up
    console.log('\n🧹 Shutting down execution stack...');
    await orchestrator.shutdown();
    await resilientExecutor.shutdown();
    await engine.shutdown();
    await processManager.shutdown();
    console.log('✅ Clean shutdown complete');
  }
}

// Run example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
