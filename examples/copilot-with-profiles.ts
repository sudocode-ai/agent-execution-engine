/**
 * GitHub Copilot CLI with profile system example
 *
 * This example demonstrates:
 * - Registering Copilot profiles
 * - Using the global profile registry
 * - Switching between different profile variants
 * - Custom profile configurations
 */

import { registerCopilotProfiles, getCopilotProfileVariants } from '../src/agents/copilot/index.js';
import { globalProfileRegistry } from '../src/agents/profiles/registry.js';
import type { ExecutionTask } from '../src/engine/types.js';

async function main() {
  console.log('=== Copilot Profile System Example ===\n');

  // 1. Register Copilot profiles with global registry
  console.log('📋 Registering Copilot profiles...');
  registerCopilotProfiles();
  console.log('✅ Profiles registered\n');

  // 2. List available profiles
  console.log('📝 Available Copilot variants:');
  const variants = getCopilotProfileVariants();
  variants.forEach((variant) => {
    const profile = globalProfileRegistry.getProfile({
      executor: 'copilot',
      variant,
    });
    if (profile) {
      console.log(`  - ${variant}: ${profile.displayName}`);
      console.log(`    ${profile.description}`);
    }
  });
  console.log();

  // 3. Check availability
  console.log('🔍 Checking Copilot availability...');
  const testExecutor = globalProfileRegistry.getExecutor({
    executor: 'copilot',
    variant: 'default',
  });

  if (!testExecutor) {
    console.error('❌ Failed to create executor from profile');
    process.exit(1);
  }

  const isAvailable = await testExecutor.checkAvailability();
  if (!isAvailable) {
    console.error('❌ Copilot CLI not available. Run: npx -y @github/copilot');
    process.exit(1);
  }

  console.log('✅ Copilot CLI available\n');

  // 4. Example 1: Use default profile
  console.log('=' .repeat(60));
  console.log('Example 1: Default Profile (GPT-4o with auto-approve)');
  console.log('='.repeat(60) + '\n');

  const defaultExecutor = globalProfileRegistry.getExecutor({
    executor: 'copilot',
  });

  if (!defaultExecutor) {
    console.error('❌ Failed to get default executor');
    process.exit(1);
  }

  // Add workDir to config since profiles don't include it
  (defaultExecutor as any).config.workDir = process.cwd();

  const task1: ExecutionTask = {
    id: 'default-example',
    type: 'custom',
    prompt: 'List the files in the current directory',
    workDir: process.cwd(),
    config: {},
  };

  console.log(`📝 Task: ${task1.prompt}\n`);

  const result1 = await defaultExecutor.executeTask(task1);
  console.log(`✅ Process spawned (PID: ${result1.process.pid})`);
  console.log('   (Would process output here...)\n');

  // Clean up
  if (result1.process.status === 'busy') {
    result1.process.process.kill('SIGTERM');
  }

  // 5. Example 2: Use Claude Sonnet 4.5 profile
  console.log('='.repeat(60));
  console.log('Example 2: Claude Sonnet 4.5 Profile');
  console.log('='.repeat(60) + '\n');

  const claudeExecutor = globalProfileRegistry.getExecutor({
    executor: 'copilot',
    variant: 'claude-sonnet-4.5',
  });

  if (!claudeExecutor) {
    console.error('❌ Failed to get Claude executor');
    process.exit(1);
  }

  (claudeExecutor as any).config.workDir = process.cwd();

  const task2: ExecutionTask = {
    id: 'claude-example',
    type: 'custom',
    prompt: 'What TypeScript files are in this project?',
    workDir: process.cwd(),
    config: {},
  };

  console.log(`📝 Task: ${task2.prompt}`);
  console.log(`   Model: Claude Sonnet 4.5\n`);

  const result2 = await claudeExecutor.executeTask(task2);
  console.log(`✅ Process spawned (PID: ${result2.process.pid})`);
  console.log('   (Would process output here...)\n');

  // Clean up
  if (result2.process.status === 'busy') {
    result2.process.process.kill('SIGTERM');
  }

  // 6. Example 3: Use read-only profile
  console.log('='.repeat(60));
  console.log('Example 3: Read-Only Profile (No write permissions)');
  console.log('='.repeat(60) + '\n');

  const readOnlyExecutor = globalProfileRegistry.getExecutor({
    executor: 'copilot',
    variant: 'read-only',
  });

  if (!readOnlyExecutor) {
    console.error('❌ Failed to get read-only executor');
    process.exit(1);
  }

  (readOnlyExecutor as any).config.workDir = process.cwd();

  const task3: ExecutionTask = {
    id: 'readonly-example',
    type: 'custom',
    prompt: 'Read package.json and summarize the project',
    workDir: process.cwd(),
    config: {},
  };

  console.log(`📝 Task: ${task3.prompt}`);
  console.log(`   Restrictions: Read-only operations only\n`);

  const result3 = await readOnlyExecutor.executeTask(task3);
  console.log(`✅ Process spawned (PID: ${result3.process.pid})`);
  console.log('   (Would process output here...)\n');

  // Clean up
  if (result3.process.status === 'busy') {
    result3.process.process.kill('SIGTERM');
  }

  // 7. Inspect profile configuration
  console.log('='.repeat(60));
  console.log('Profile Configuration Inspection');
  console.log('='.repeat(60) + '\n');

  const interactiveProfile = globalProfileRegistry.getProfile({
    executor: 'copilot',
    variant: 'interactive',
  });

  if (interactiveProfile) {
    console.log('Interactive Profile:');
    console.log(`  Display Name: ${interactiveProfile.displayName}`);
    console.log(`  Description: ${interactiveProfile.description}`);
    console.log('  Config:');
    console.log(`    Allow All Tools: ${interactiveProfile.config.allowAllTools}`);
    console.log(`    Allow Tool: ${interactiveProfile.config.allowTool}`);
    console.log(`    Model: ${interactiveProfile.config.model}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ All examples completed successfully');
  console.log('='.repeat(60));

  // 8. Summary
  console.log('\n💡 Key Takeaways:');
  console.log('   - Use registerCopilotProfiles() to register all profiles');
  console.log('   - Access executors via globalProfileRegistry.getExecutor()');
  console.log('   - Switch variants easily: { executor: "copilot", variant: "gpt-4o" }');
  console.log('   - Profiles are reusable configurations');
  console.log('   - WorkDir is set per-task, not in profile');
}

// Run example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
