# Execution Engine - Development Guide

This document provides context for AI assistants (Claude) working on the execution-engine package.

## Project Overview

`agent-execution-engine` is a **generic execution engine** for CLI agents with process management, resilience, and workflow orchestration. It's designed to be **agent-agnostic** and works with any CLI tool (Claude Code, Aider, Gemini CLI, Codex, etc.).

## Architecture

### 5-Layer Design

```
┌─────────────────────────────────────┐
│  Agents: CLI Agent Adapters         │  Agent-specific config builders
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

### Directory Structure

```
execution-engine/
├── src/
│   ├── process/           # Layer 1: Process Management
│   │   ├── manager.ts     # IProcessManager interface
│   │   ├── simple-manager.ts  # SimpleProcessManager implementation
│   │   ├── pty-manager.ts     # PtyProcessManager (terminal emulation)
│   │   ├── factory.ts     # createProcessManager() factory
│   │   ├── types.ts       # ProcessConfig, ManagedProcess, etc.
│   │   └── utils.ts       # Utility functions (generateId, etc.)
│   │
│   ├── engine/            # Layer 2: Execution Engine
│   │   ├── engine.ts      # IExecutionEngine interface
│   │   ├── simple-engine.ts   # SimpleExecutionEngine implementation
│   │   ├── types.ts       # ExecutionTask, TaskResult, etc.
│   │   └── utils.ts       # Queue management utilities
│   │
│   ├── resilience/        # Layer 3: Resilience
│   │   ├── executor.ts    # IResilientExecutor interface
│   │   ├── resilient-executor.ts  # ResilientExecutor implementation
│   │   ├── retry.ts       # Retry strategies (exponential, linear, fixed)
│   │   ├── circuit-breaker.ts     # Circuit breaker pattern
│   │   └── types.ts       # RetryPolicy, BackoffStrategy, etc.
│   │
│   ├── workflow/          # Layer 4: Workflow Orchestration
│   │   ├── orchestrator.ts        # IWorkflowOrchestrator interface
│   │   ├── linear-orchestrator.ts # LinearOrchestrator implementation
│   │   ├── types.ts       # WorkflowDefinition, WorkflowStep, etc.
│   │   └── utils.ts       # Template rendering, variable substitution
│   │
│   └── agents/            # Agents: CLI Agent Adapters
│       ├── types/
│       │   └── agent-adapter.ts   # IAgentAdapter interface
│       ├── claude/
│       │   ├── adapter.ts         # ClaudeCodeAdapter
│       │   └── config-builder.ts  # buildClaudeConfig()
│       └── registry.ts    # AgentRegistry, globalAgentRegistry
│
├── tests/
│   └── unit/
│       ├── process/       # Process layer tests
│       ├── engine/        # Engine layer tests
│       ├── resilience/    # Resilience layer tests
│       └── workflow/      # Workflow layer tests
│
├── dist/                  # Compiled output (generated)
├── package.json           # Package configuration
├── tsconfig.json          # TypeScript config for source
├── tsconfig.test.json     # TypeScript config for tests
├── vitest.config.ts       # Test configuration
├── README.md              # User-facing documentation
├── AGENTS.md              # Agent adapter development guide
└── CLAUDE.md              # This file (AI assistant context)
```

## Core Interfaces

### Layer 1: Process Management

**IProcessManager** - Manages CLI process lifecycle
```typescript
interface IProcessManager {
  // Lifecycle
  acquireProcess(config: ProcessConfig): Promise<ManagedProcess>;
  releaseProcess(processId: string): Promise<void>;
  terminateProcess(processId: string, signal?: NodeJS.Signals): Promise<void>;
  shutdown(): Promise<void>;

  // I/O
  sendInput(processId: string, input: string | Buffer): Promise<void>;
  onOutput(processId: string, handler: OutputHandler): void;
  onError(processId: string, handler: ErrorHandler): void;

  // Monitoring
  getProcess(processId: string): ManagedProcess | null;
  getActiveProcesses(): ManagedProcess[];
  getMetrics(): ProcessMetrics;
}
```

**Key Types**:
- `ProcessConfig` - Process configuration (executable, args, workDir, env, mode)
- `ManagedProcess` - Running process state (id, status, startTime, process handle)
- `ExecutionMode` - 'structured' (pipes), 'interactive' (PTY), 'hybrid' (PTY + JSON)

### Layer 2: Execution Engine

**IExecutionEngine** - Task queueing and concurrency control
```typescript
interface IExecutionEngine {
  // Task Management
  submitTask(task: ExecutionTask): Promise<string>;
  cancelTask(taskId: string): Promise<boolean>;
  getTaskStatus(taskId: string): TaskStatus | null;
  waitForTask(taskId: string): Promise<TaskResult>;

  // Lifecycle
  shutdown(): Promise<void>;
  getMetrics(): EngineMetrics;
}
```

**Key Types**:
- `ExecutionTask` - Task definition (id, type, prompt, workDir, dependencies)
- `TaskResult` - Task outcome (success, output, error, duration, attempts)
- `TaskStatus` - 'pending', 'running', 'completed', 'failed', 'cancelled'

### Layer 3: Resilience

**IResilientExecutor** - Retry and circuit breaker patterns
```typescript
interface IResilientExecutor {
  executeTask(task: ExecutionTask): Promise<TaskResult>;
  shutdown(): Promise<void>;
}
```

**Key Types**:
- `RetryPolicy` - Retry configuration (maxAttempts, backoffStrategy, delays)
- `BackoffStrategy` - 'exponential', 'linear', 'fixed'
- `CircuitBreakerConfig` - Failure threshold, timeout, half-open state

### Layer 4: Workflow Orchestration

**IWorkflowOrchestrator** - Multi-step workflow execution
```typescript
interface IWorkflowOrchestrator {
  // Execution
  startWorkflow(workflow: WorkflowDefinition, workDir: string): Promise<string>;
  pauseWorkflow(executionId: string): Promise<void>;
  resumeWorkflow(executionId: string): Promise<void>;
  cancelWorkflow(executionId: string): Promise<void>;

  // Monitoring
  getWorkflowExecution(executionId: string): WorkflowExecution | null;
  waitForWorkflow(executionId: string): Promise<WorkflowExecution>;

  // Events
  onWorkflowStart(handler: (executionId: string) => void): void;
  onWorkflowComplete(handler: (executionId: string) => void): void;
  onWorkflowError(handler: (executionId: string, error: Error) => void): void;
  onStepStart(handler: (executionId: string, stepId: string) => void): void;
  onStepComplete(handler: (executionId: string, stepId: string) => void): void;
}
```

**Key Types**:
- `WorkflowDefinition` - Workflow configuration (id, steps, config, metadata)
- `WorkflowStep` - Individual step (id, taskType, prompt, dependencies)
- `WorkflowExecution` - Runtime state (id, status, currentStep, results, checkpoints)

### Agents: Agent Adapters

**IAgentAdapter** - Agent-specific configuration builder
```typescript
interface IAgentAdapter<TConfig extends BaseAgentConfig = BaseAgentConfig> {
  readonly metadata: AgentMetadata;
  buildProcessConfig(config: TConfig): ProcessConfig;
  validateConfig?(config: TConfig): string[];
  getDefaultConfig?(): Partial<TConfig>;
}
```

**Key Types**:
- `AgentMetadata` - Agent capabilities (name, version, supportedModes, supportsStreaming)
- `BaseAgentConfig` - Common config (workDir, executablePath, env, timeout)
- `ClaudeCodeConfig` - Claude-specific config (print, outputFormat, permissions)

## Testing

### Test Structure

Tests are organized by layer in `tests/unit/`:
- **process/** - Process management tests (I/O, lifecycle, termination, monitoring)
- **engine/** - Engine tests (queue, concurrency, retry, dependencies)
- **resilience/** - Resilience tests (retry strategies, circuit breaker)
- **workflow/** - Workflow tests (orchestration, checkpointing, step execution)

### Test Configuration

**Path Aliases**: Tests use `@/` alias for imports
```typescript
// ✅ Correct
import { SimpleExecutionEngine } from '@/engine/simple-engine';

// ❌ Wrong (do not use .ts extension with alias)
import { SimpleExecutionEngine } from '@/engine/simple-engine.ts';
```

**Relative Imports**: For test utilities and mocks, use `.js` extension
```typescript
// ✅ Correct
import { MockProcessManager } from './mock-process-manager.js';

// ❌ Wrong
import { MockProcessManager } from './mock-process-manager.ts';
```

### TypeScript Configuration

- **tsconfig.json** - Source code compilation (excludes tests)
- **tsconfig.test.json** - Test compilation (includes tests, enables `@/` path alias)

### Running Tests

```bash
npm test                # Run tests in watch mode
npm test -- --run       # Run tests once
npm run typecheck       # TypeScript type checking (source only)
npx tsc -p tsconfig.test.json --noEmit  # Type check tests
```

## Dependencies

### Production Dependencies
- `node-pty` - PTY (pseudo-terminal) support for interactive mode

### Dev Dependencies
- `typescript` - TypeScript compiler
- `vitest` - Testing framework
- `@types/node` - Node.js type definitions

## Package Exports

The package exports multiple entry points for tree-shaking:

```typescript
// Main entry (all layers + convenience exports)
import { createProcessManager, SimpleExecutionEngine } from 'agent-execution-engine';

// Layer-specific imports
import { IProcessManager } from 'agent-execution-engine/process';
import { IExecutionEngine } from 'agent-execution-engine/engine';
import { IResilientExecutor } from 'agent-execution-engine/resilience';
import { IWorkflowOrchestrator } from 'agent-execution-engine/workflow';

// Agent adapters
import { ClaudeCodeAdapter } from 'agent-execution-engine/agents/claude';
import { AgentRegistry } from 'agent-execution-engine/agents';
```

## Design Principles

### 1. Agent-Agnostic Design

The execution engine is **completely generic** and works with any CLI agent. Agent-specific logic is isolated in **agent adapters**:

```typescript
// Generic process config
const processConfig: ProcessConfig = {
  executablePath: 'my-cli-tool',
  args: ['--flag', 'value'],
  workDir: '/path/to/project',
  mode: 'structured',
};

// Agent-specific config builder (optional)
const adapter = new ClaudeCodeAdapter();
const claudeConfig = adapter.buildProcessConfig({
  workDir: '/path/to/project',
  print: true,
  outputFormat: 'stream-json',
});
```

### 2. Interface-Based Abstraction

Each layer defines a clear interface:
- **IProcessManager** - Process lifecycle management
- **IExecutionEngine** - Task queueing and execution
- **IResilientExecutor** - Retry and fault tolerance
- **IWorkflowOrchestrator** - Multi-step workflows
- **IAgentAdapter** - Agent configuration building

This allows:
- **Multiple implementations** (SimpleProcessManager vs PtyProcessManager)
- **Easy mocking** for tests
- **Extensibility** without modifying core code

### 3. Layer Independence

Each layer depends only on the layer below it:
```
Workflow → Resilience → Engine → Process
```

Upper layers can be used without lower layers (e.g., use Process layer directly without Engine).

### 4. Event-Driven Architecture

Components use **event handlers** for extensibility:
```typescript
// Process output events
processManager.onOutput(processId, (data, type) => {
  console.log('Output:', data.toString());
});

// Workflow lifecycle events
orchestrator.onWorkflowStart((executionId) => {
  console.log('Workflow started:', executionId);
});
```

## Common Patterns

### Creating a Process Manager

```typescript
import { createProcessManager } from 'agent-execution-engine/process';

// Simple mode (pipes)
const processManager = createProcessManager({
  executablePath: 'claude',
  args: ['--print', '--output-format', 'stream-json'],
  workDir: '/path/to/project',
  mode: 'structured',
});

// Interactive mode (PTY)
const ptyManager = createProcessManager({
  executablePath: 'claude',
  args: [],
  workDir: '/path/to/project',
  mode: 'interactive',
  terminal: { cols: 80, rows: 24 },
});
```

### Building an Execution Stack

```typescript
import {
  createProcessManager,
  SimpleExecutionEngine,
  ResilientExecutor,
  LinearOrchestrator,
} from 'agent-execution-engine';

// 1. Create process manager
const processManager = createProcessManager(config);

// 2. Create execution engine with concurrency control
const engine = new SimpleExecutionEngine(processManager, {
  maxConcurrent: 3,
});

// 3. Wrap with resilience layer
const executor = new ResilientExecutor(engine, {
  maxAttempts: 3,
  backoffStrategy: 'exponential',
  initialDelay: 1000,
});

// 4. Create workflow orchestrator
const orchestrator = new LinearOrchestrator(executor);

// 5. Execute workflow
const executionId = await orchestrator.startWorkflow(workflow, workDir);
```

### Using Agent Adapters

```typescript
import { ClaudeCodeAdapter } from 'agent-execution-engine/agents/claude';

const adapter = new ClaudeCodeAdapter();

// Validate config
const errors = adapter.validateConfig({
  workDir: '/path/to/project',
  outputFormat: 'stream-json',
  // Missing: print (required for stream-json)
});
// errors = ['stream-json output format requires print mode to be enabled']

// Build ProcessConfig
const processConfig = adapter.buildProcessConfig({
  workDir: '/path/to/project',
  print: true,
  outputFormat: 'stream-json',
});
```

### Output Processing Hook

The execution engine provides an `onOutput` hook for processing output:

```typescript
const engine = new SimpleExecutionEngine(processManager, {
  maxConcurrent: 1,
  onOutput: (data, type) => {
    // - Parse Claude stream-json and consume downstream

    if (type === 'stdout') {
      console.log('Output:', data.toString());
    }
  },
});
```

**Important**: The `onOutput` hook is for **integration code only**. The execution engine itself does not parse or process output - that's the responsibility of the consuming application (e.g., server package).

## Development Guidelines

### When Adding New Features

1. **Determine the layer**: Which layer does this feature belong to?
   - Process management? → `src/process/`
   - Task execution? → `src/engine/`
   - Fault tolerance? → `src/resilience/`
   - Multi-step workflows? → `src/workflow/`
   - Agent-specific? → `src/agents/`

2. **Check for agent-specific logic**: Does this feature depend on a specific CLI agent?
   - ✅ YES → Add to agent adapter in `src/agents/`
   - ❌ NO → Add to core layers (keep generic)

3. **Update interfaces first**: Modify the interface before implementation
   - Update `IProcessManager`, `IExecutionEngine`, etc.
   - Ensures consistency across implementations

4. **Write tests**: Add tests in corresponding `tests/unit/` directory
   - Use `@/` alias for imports from `src/`
   - Use `.js` extension for relative imports
   - Mock dependencies from other layers

5. **Update documentation**:
   - Update README.md with usage examples
   - Update AGENTS.md if adding agent adapter features
   - Update this file (CLAUDE.md) if changing architecture

### When Fixing Bugs

1. **Reproduce with a test**: Add a failing test first
2. **Fix the implementation**: Make the test pass
3. **Verify no regressions**: Run full test suite
4. **Update types if needed**: Ensure TypeScript types are accurate

### Code Style

- **Use TypeScript strict mode** - All code must type-check with strict settings
- **Prefer interfaces over classes** - Define contracts with interfaces
- **Use async/await** - No raw promises in public APIs
- **Handle errors explicitly** - Don't swallow errors silently
- **Document public APIs** - JSDoc comments for exported functions/classes
- **Keep functions focused** - Single responsibility principle

### Import Conventions

**Source files** (`src/**/*.ts`):
```typescript
// ✅ Use .js extension for relative imports
import { foo } from './utils.js';
import type { Bar } from './types.js';

// ✅ Use full package paths for cross-layer imports
import type { IProcessManager } from '../process/manager.js';
```

**Test files** (`tests/**/*.test.ts`):
```typescript
// ✅ Use @/ alias for src imports (no extension)
import { SimpleExecutionEngine } from '@/engine/simple-engine';

// ✅ Use .js extension for relative imports (mocks, test utils)
import { MockProcessManager } from './mock-process-manager.js';
```

## Troubleshooting

### TypeScript Errors in Tests

If you see "Cannot find module '@/...'" errors:
- Verify you're using `tsconfig.test.json` (includes path alias)
- Check that imports don't have `.ts` extension: `@/engine/simple-engine` ✅, not `@/engine/simple-engine.ts` ❌
- Run: `npx tsc -p tsconfig.test.json --noEmit`

### Tests Failing in CI but Passing Locally

- Process spawning tests are sensitive to timing
- Increase timeout if needed: `testTimeout: 10000` in vitest.config.ts
- Check for race conditions in concurrent tests

### Build Errors

- Run `npm run clean && npm run build` to clear stale artifacts
- Check for circular dependencies between layers

## Questions?

If you're working on this codebase and have questions:

1. **Check the tests** - Tests serve as usage examples
2. **Check README.md** - User-facing documentation with examples
3. **Check AGENTS.md** - Guide for creating agent adapters
4. **Review interfaces** - Layer interfaces define contracts (e.g., `IProcessManager`)
