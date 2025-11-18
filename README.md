# agent-execution-engine

Generic execution engine for CLI agents with process management, resilience, and workflow orchestration.

## Overview

This package provides a layered architecture for managing CLI agent execution with built-in resilience, concurrency control, and workflow orchestration. It's designed to be agent-agnostic and can work with any CLI tool (Claude Code, Aider, Gemini CLI, Codex, etc.).

## Architecture

The execution engine consists of 4 core layers plus an agents layer:

```
┌─────────────────────────────────────┐
│  Agents: CLI Agent Adapters         │  Claude Code, Aider, etc.
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

### Agents: CLI Agent Adapters (`/agents`)

Agent-specific adapters for various CLI agents:
- Agent-agnostic interface for building ProcessConfig
- Metadata and capabilities declaration
- Built-in support for Claude Code
- Extensible for adding new agents (Aider, Gemini, Codex, etc.)

**Key exports:**
- `IAgentAdapter` - Interface for creating agent adapters
- `ClaudeCodeAdapter` - Built-in Claude Code adapter
- `AgentRegistry` - Registry for managing multiple agents
- `buildClaudeConfig()` - Claude Code-specific configuration builder

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

## API Reference

See the TypeScript definitions for complete API documentation. All major interfaces are exported:

- `IProcessManager`
- `IExecutionEngine`
- `IResilientExecutor`
- `IWorkflowOrchestrator`
- `IWorkflowStorage`
