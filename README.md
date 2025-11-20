# agent-execution-engine

Generic execution engine for CLI agents with process management, resilience, and workflow orchestration.

## Overview

This package provides a layered architecture for managing CLI agent execution with built-in resilience, concurrency control, and workflow orchestration. It's designed to be agent-agnostic and can work with any CLI tool (Claude Code, Gemini CLI, Codex, etc.).

## Architecture

The execution engine consists of 4 core layers plus an agents layer:

```
┌─────────────────────────────────────┐
│  Agents: CLI Agent Adapters         │  Claude Code, Codex, Gemini CLI, etc.
├─────────────────────────────────────┤
│  Layer 4: Workflow Orchestration    │  Multi-step workflows, checkpointing
├─────────────────────────────────────┤
│  Layer 3: Resilience                │  Retry logic, circuit breakers
├─────────────────────────────────────┤
│  Layer 2: Execution Engine          │  Task queueing, concurrency control
├─────────────────────────────────────┤
│  Layer 1: Process Management        │  Process lifecycle, I/O handling
└─────────────────────────────────────┘
```

### Layer 1: Process Management (`/process`)

Manages CLI process lifecycle with support for multiple execution modes:
- **Simple mode**: Standard stdin/stdout pipes
- **PTY mode**: Full terminal emulation for interactive CLIs
- **Hybrid mode**: Both terminal and structured output

**Key exports:**
- `IProcessManager` - Abstract interface for process management
- `SimpleProcessManager` - One process per task implementation
- `PtyProcessManager` - PTY-based terminal emulation (requires `node-pty`)
- `createProcessManager()` - Factory function for creating process managers

### Layer 2: Execution Engine (`/engine`)

Task queueing and concurrency control:
- FIFO queue with priority support
- Configurable concurrency limits
- Task dependency management
- Real-time metrics and monitoring

**Key exports:**
- `IExecutionEngine` - Abstract interface for execution engines
- `SimpleExecutionEngine` - Queue-based implementation with concurrency control

### Layer 3: Resilience (`/resilience`)

Fault tolerance and retry logic:
- Exponential, linear, and fixed backoff strategies
- Circuit breakers to prevent cascading failures
- Configurable retry policies
- Comprehensive error classification

**Key exports:**
- `IResilientExecutor` - Abstract interface for resilient execution
- `ResilientExecutor` - Implementation with retry and circuit breaker support
- Retry utilities: `calculateBackoff`, `isRetryableError`, etc.
- Circuit breaker: `CircuitBreakerManager`

### Layer 4: Workflow Orchestration (`/workflow`)

Multi-step workflow execution:
- Sequential step execution
- Context passing between steps
- Checkpoint/resume capability
- Conditional step execution
- Template rendering with variable substitution

**Key exports:**
- `IWorkflowOrchestrator` - Abstract interface for workflow orchestration
- `LinearOrchestrator` - Sequential workflow executor
- `IWorkflowStorage` - Abstract interface for checkpoint storage
- `InMemoryWorkflowStorage` - In-memory checkpoint implementation

### Agents: CLI Agent Adapters and Executors (`/agents`)

**Two approaches for working with agents:**

1. **Agent Adapters** (`IAgentAdapter`) - Simple configuration builders
   - Agent-agnostic interface for building ProcessConfig
   - Metadata and capabilities declaration
   - Built-in support for Claude Code and Codex

2. **Agent Executors** (`IAgentExecutor`) - Unified execution interface
   - Complete abstraction layer for agent execution
   - Normalized output format for consistent UI rendering
   - Profile-based configuration management
   - Interactive approval service support
   - Session management and resumption

**Key exports:**
- `IAgentAdapter` - Interface for creating agent adapters (simple approach)
- `ClaudeCodeAdapter` - Built-in Claude Code adapter
- `AgentRegistry` - Registry for managing multiple agent adapters
- `IAgentExecutor` - Unified executor interface (advanced approach)
- `BaseAgentExecutor` - Abstract base class for custom executors
- `AgentProfileRegistry` - Profile-based configuration system
- `IApprovalService` - Interactive tool approval interface

## Installation

```bash
npm install agent-execution-engine
```

**Optional Dependencies:**
- `node-pty` - Required for PTY/interactive modes only

## Usage

### Basic Example: Simple Task Execution

```typescript
import {
  createProcessManager,
  SimpleExecutionEngine,
  type ExecutionTask,
} from 'agent-execution-engine';

// 1. Create process manager
const processManager = createProcessManager({
  executablePath: 'claude',
  args: ['--print', '--output-format', 'stream-json'],
  workDir: '/path/to/project',
  mode: 'structured', // or 'interactive', 'hybrid'
});

// 2. Create execution engine
const engine = new SimpleExecutionEngine(processManager, {
  maxConcurrent: 3, // Run up to 3 tasks concurrently
});

// 3. Submit a task
const task: ExecutionTask = {
  id: 'task-1',
  type: 'issue',
  prompt: 'Fix the login bug',
  workDir: '/path/to/project',
  priority: 0,
  dependencies: [],
  config: {},
  createdAt: new Date(),
};

const taskId = await engine.submitTask(task);

// 4. Wait for result
const result = await engine.waitForTask(taskId);
console.log('Task completed:', result.success);
console.log('Output:', result.output);
```

### Advanced Example: Resilient Execution with Retry

```typescript
import {
  createProcessManager,
  SimpleExecutionEngine,
  ResilientExecutor,
} from 'agent-execution-engine';

const processManager = createProcessManager({
  executablePath: 'claude',
  args: ['--print'],
  workDir: '/path/to/project',
});

const engine = new SimpleExecutionEngine(processManager);

// Wrap engine with resilient executor
const resilientExecutor = new ResilientExecutor(engine, {
  maxAttempts: 3,
  backoffStrategy: 'exponential',
  initialDelay: 1000,
  maxDelay: 30000,
  jitter: true,
});

// Execute task with automatic retries
const result = await resilientExecutor.executeTask(task);
console.log(`Completed after ${result.totalAttempts} attempts`);
```

### Workflow Example: Multi-Step Execution

```typescript
import {
  createProcessManager,
  SimpleExecutionEngine,
  ResilientExecutor,
  LinearOrchestrator,
  type WorkflowDefinition,
} from 'agent-execution-engine';

const processManager = createProcessManager({
  executablePath: 'claude',
  args: ['--print'],
  workDir: '/path/to/project',
});

const engine = new SimpleExecutionEngine(processManager);
const executor = new ResilientExecutor(engine);
const orchestrator = new LinearOrchestrator(executor);

// Define multi-step workflow
const workflow: WorkflowDefinition = {
  id: 'build-and-test',
  steps: [
    {
      id: 'step-1',
      taskType: 'issue',
      prompt: 'Run tests',
      taskConfig: {},
    },
    {
      id: 'step-2',
      taskType: 'issue',
      prompt: 'Build the project',
      taskConfig: {},
      dependsOn: ['step-1'], // Runs after step-1
    },
  ],
  config: {
    checkpointInterval: 1,
    continueOnStepFailure: false,
  },
};

// Execute workflow
const executionId = await orchestrator.startWorkflow(
  workflow,
  '/path/to/project'
);

// Wait for completion
const execution = await orchestrator.waitForWorkflow(executionId);
console.log('Workflow status:', execution.status);
```

### Agent Adapter Example: Using Claude Code

```typescript
import {
  ClaudeCodeAdapter,
  SimpleExecutionEngine,
  createProcessManager,
} from 'agent-execution-engine';

// Use Claude Code adapter for type-safe configuration
const claudeAdapter = new ClaudeCodeAdapter();

// Build ProcessConfig from Claude-specific options
const processConfig = claudeAdapter.buildProcessConfig({
  workDir: '/path/to/project',
  print: true,
  outputFormat: 'stream-json',
  dangerouslySkipPermissions: true,
});

const processManager = createProcessManager(processConfig);
const engine = new SimpleExecutionEngine(processManager);

// Now you can submit tasks...
```

### Agent Registry Example: Supporting Multiple Agents

```typescript
import {
  AgentRegistry,
  ClaudeCodeAdapter,
  type IAgentAdapter,
} from 'agent-execution-engine/agents';

// Create registry and register agents
const registry = new AgentRegistry();
registry.register(new ClaudeCodeAdapter());

// Get adapter by name
const adapter = registry.get('claude-code');
if (adapter) {
  console.log('Agent:', adapter.metadata.displayName);
  console.log('Supports streaming:', adapter.metadata.supportsStreaming);

  const config = adapter.buildProcessConfig({
    workDir: '/path/to/project',
    print: true,
    outputFormat: 'stream-json',
  });
}

// Create your own agent adapter
class AiderAdapter implements IAgentAdapter {
  metadata = {
    name: 'aider',
    displayName: 'Aider',
    supportedModes: ['structured'],
    supportsStreaming: true,
    supportsStructuredOutput: false,
  };

  buildProcessConfig(config: any) {
    return {
      executablePath: 'aider',
      args: ['--yes', '--auto-commits'],
      workDir: config.workDir,
    };
  }
}

registry.register(new AiderAdapter());
```

### PTY/Interactive Mode Example

```typescript
import { createProcessManager } from 'agent-execution-engine/process';

const processManager = createProcessManager({
  executablePath: 'claude',
  args: [],
  workDir: '/path/to/project',
  mode: 'interactive', // PTY mode
  terminal: {
    cols: 80,
    rows: 24,
  },
});

const process = await processManager.acquireProcess(config);

// Send input to the interactive terminal
await processManager.sendInput(process.id, 'help\n');

// Listen to terminal output
processManager.onOutput(process.id, (data, type) => {
  console.log('Terminal output:', data.toString());
});
```

## Agent Executors

The execution engine provides a unified interface for different CLI agents through the `IAgentExecutor` interface. This advanced approach abstracts away protocol differences between agents and provides:

- **Normalized output** - Consistent data structures across all agents
- **Session management** - Resume previous sessions where supported
- **Interactive approvals** - Control tool usage with approval services
- **Profile system** - Multiple configurations per agent (e.g., "claude:plan", "cursor:interactive")

### Quick Start with Agent Executors

```typescript
import {
  AgentProfileRegistry,
  BaseAgentExecutor,
  type IAgentExecutor,
  type ExecutionTask,
  type AgentCapabilities,
} from 'agent-execution-engine/agents';

// 1. Create a custom executor (or use built-in ones)
class MyAgentExecutor extends BaseAgentExecutor {
  async executeTask(task: ExecutionTask) {
    // Spawn process using existing infrastructure
    const process = await this.spawnWithManager({
      executablePath: 'my-agent',
      args: ['--task', task.id],
      workDir: task.workDir,
      mode: 'structured',
    });

    // Send prompt
    process.streams!.stdin.write(task.prompt + '\n');
    process.streams!.stdin.end();

    return { process };
  }

  async resumeTask(task: ExecutionTask, sessionId: string) {
    // Resume logic (if supported)
    throw new Error('Resume not supported');
  }

  async *normalizeOutput(stream, workDir) {
    // Parse agent output → normalized format
    for await (const chunk of stream) {
      const line = chunk.data.toString();
      yield {
        index: 0,
        type: { kind: 'assistant_message' },
        content: line,
      };
    }
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsSessionResume: false,
      requiresSetup: false,
      supportsApprovals: false,
      supportsMcp: false,
      protocol: 'custom',
    };
  }
}

// 2. Register with profile system
const registry = new AgentProfileRegistry();

registry.registerExecutor('my-agent', (config) => {
  return new MyAgentExecutor(config);
});

registry.registerProfile('my-agent', 'default', {
  config: { workDir: '/tmp' },
  displayName: 'My Agent',
  description: 'Default configuration',
});

// 3. Get executor and use it
const executor = registry.getExecutor({
  executor: 'my-agent',
  variant: 'default'
});

const spawned = await executor.executeTask({
  id: 'task-1',
  type: 'issue',
  prompt: 'Build a feature',
  workDir: '/path/to/project',
  config: {},
});
```

### Profile System

Load agent profiles from JSON for easy configuration management:

```typescript
import { AgentProfileRegistry } from 'agent-execution-engine/agents';

const registry = new AgentProfileRegistry();

// Register executor factories
registry.registerExecutor('claude-code', (config) =>
  new ClaudeCodeExecutor(config)
);

registry.registerExecutor('cursor', (config) =>
  new CursorExecutor(config)
);

// Load profiles from JSON
registry.loadProfiles({
  executors: {
    'claude-code': {
      default: {
        config: { print: true, outputFormat: 'stream-json' },
        displayName: 'Claude Code',
        description: 'Standard configuration'
      },
      plan: {
        config: {
          print: true,
          outputFormat: 'stream-json',
          planMode: true
        },
        displayName: 'Claude Code (Plan Mode)',
        description: 'Planning-focused configuration'
      }
    },
    cursor: {
      default: {
        config: { force: true, model: 'auto' },
        displayName: 'Cursor (Auto-approve)',
        description: 'Cursor with auto-approval enabled'
      },
      interactive: {
        config: { force: false, model: 'sonnet-4.5' },
        displayName: 'Cursor (Interactive)',
        description: 'Manual approval for each tool use'
      }
    }
  }
});

// Get specific variant
const claudePlanExecutor = registry.getExecutor({
  executor: 'claude-code',
  variant: 'plan'
});

const cursorInteractiveExecutor = registry.getExecutor({
  executor: 'cursor',
  variant: 'interactive'
});
```

### Approval Services

Control tool usage with custom approval logic:

```typescript
import {
  type IApprovalService,
  type ApprovalRequest,
  type ApprovalDecision,
} from 'agent-execution-engine/agents';

// Auto-approve all tools (for CI/CD)
class AutoApprovalService implements IApprovalService {
  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    return { status: 'approved' };
  }
}

// Rule-based approval (approve reads, deny writes)
class RuleBasedApprovalService implements IApprovalService {
  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    if (request.toolName === 'Read') {
      return { status: 'approved' };
    }
    if (request.toolName === 'Write' || request.toolName === 'Bash') {
      return { status: 'denied', reason: 'Write operations not allowed' };
    }
    return { status: 'denied', reason: 'Unknown tool' };
  }
}

// Interactive approval (prompt user)
class InteractiveApprovalService implements IApprovalService {
  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    // Show UI dialog, wait for user response
    const approved = await showApprovalDialog(
      `Allow ${request.toolName}?`,
      request.context
    );

    return approved
      ? { status: 'approved' }
      : { status: 'denied', reason: 'User denied' };
  }
}

// Set approval service on executor
const executor = registry.getExecutor({ executor: 'claude-code' });
executor.setApprovalService(new RuleBasedApprovalService());
```

### Normalized Output

All agent executors produce a consistent output format:

```typescript
import type { NormalizedEntry } from 'agent-execution-engine/agents';

const executor = registry.getExecutor({ executor: 'claude-code' });
const spawned = await executor.executeTask(task);

// Create output stream
const outputStream = executor.createOutputChunks(spawned.process);

// Normalize to unified format
const normalizedStream = executor.normalizeOutput(
  outputStream,
  task.workDir
);

// Process normalized entries
for await (const entry of normalizedStream) {
  switch (entry.type.kind) {
    case 'assistant_message':
      console.log('Assistant:', entry.content);
      break;

    case 'thinking':
      console.log('Thinking:', entry.type.reasoning);
      break;

    case 'tool_use':
      const tool = entry.type.tool;
      console.log(`Tool: ${tool.toolName}`);

      if (tool.action.kind === 'file_edit') {
        console.log(`Editing: ${tool.action.path}`);
        console.log('Changes:', tool.action.changes);
      }
      break;

    case 'error':
      console.error('Error:', entry.type.error.message);
      break;
  }
}
```

### Integration with Existing Layers

Agent executors integrate seamlessly with the execution engine:

```typescript
import {
  createProcessManager,
  SimpleExecutionEngine,
  ResilientExecutor,
  LinearOrchestrator,
  AgentProfileRegistry,
} from 'agent-execution-engine';

// Set up the full stack
const processManager = createProcessManager({ /* ... */ });
const engine = new SimpleExecutionEngine(processManager);
const resilientExecutor = new ResilientExecutor(engine, {
  maxAttempts: 3,
  backoffStrategy: 'exponential',
});
const orchestrator = new LinearOrchestrator(resilientExecutor);

// Set up agent profiles
const agentRegistry = new AgentProfileRegistry();
agentRegistry.registerExecutor('claude-code', /* ... */);
agentRegistry.loadProfiles(/* ... */);

// Use profiles in workflows
const workflow = {
  id: 'build-feature',
  steps: [
    {
      id: 'plan',
      taskType: 'spec',
      prompt: 'Plan the feature architecture',
      // Specify which agent profile to use
      agentProfile: { executor: 'claude-code', variant: 'plan' }
    },
    {
      id: 'implement',
      taskType: 'issue',
      prompt: 'Implement the planned feature',
      dependsOn: ['plan'],
      // Use different agent for implementation
      agentProfile: { executor: 'cursor', variant: 'default' }
    }
  ]
};

await orchestrator.startWorkflow(workflow, '/path/to/project');
```

## API Reference

See the TypeScript definitions for complete API documentation. All major interfaces are exported:

- `IProcessManager`
- `IExecutionEngine`
- `IResilientExecutor`
- `IWorkflowOrchestrator`
- `IWorkflowStorage`
- `IAgentExecutor`
- `IAgentAdapter`
- `IApprovalService`
