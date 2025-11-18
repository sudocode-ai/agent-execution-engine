# Agent Adapters

Agent adapters provide a consistent interface for working with different CLI agents. Each adapter translates agent-specific configuration into the generic `ProcessConfig` format that the execution engine understands.

## Built-in Agents

### Claude Code

The Claude Code adapter provides type-safe configuration for Claude Code CLI.

```typescript
import { ClaudeCodeAdapter, buildClaudeConfig } from 'agent-execution-engine/agents/claude';

const adapter = new ClaudeCodeAdapter();

const config = adapter.buildProcessConfig({
  workDir: '/path/to/project',
  print: true,
  outputFormat: 'stream-json',
  dangerouslySkipPermissions: true,
});

// Or use the builder directly
const config2 = buildClaudeConfig({
  claudePath: 'claude',
  workDir: '/path/to/project',
  print: true,
  outputFormat: 'stream-json',
});
```

## Creating Your Own Agent Adapter

To add support for a new CLI agent, implement the `IAgentAdapter` interface:

```typescript
import type { IAgentAdapter, AgentMetadata, BaseAgentConfig } from 'agent-execution-engine/agents';
import type { ProcessConfig } from 'agent-execution-engine/process';

// 1. Define your agent-specific configuration
interface MyAgentConfig extends BaseAgentConfig {
  apiKey?: string;
  model?: string;
  // ... agent-specific options
}

// 2. Create the adapter class
export class MyAgentAdapter implements IAgentAdapter<MyAgentConfig> {
  readonly metadata: AgentMetadata = {
    name: 'my-agent',
    displayName: 'My Agent',
    version: '>=1.0.0',
    supportedModes: ['structured'],
    supportsStreaming: true,
    supportsStructuredOutput: true,
  };

  buildProcessConfig(config: MyAgentConfig): ProcessConfig {
    const args: string[] = [];
    
    if (config.model) {
      args.push('--model', config.model);
    }
    
    if (config.apiKey) {
      // Add API key to environment
      config.env = {
        ...config.env,
        MY_AGENT_API_KEY: config.apiKey,
      };
    }

    return {
      executablePath: config.executablePath || 'my-agent',
      args,
      workDir: config.workDir,
      env: config.env,
      timeout: config.timeout,
    };
  }

  validateConfig(config: MyAgentConfig): string[] {
    const errors: string[] = [];
    
    if (!config.workDir) {
      errors.push('workDir is required');
    }
    
    if (!config.apiKey) {
      errors.push('apiKey is required');
    }
    
    return errors;
  }

  getDefaultConfig(): Partial<MyAgentConfig> {
    return {
      executablePath: 'my-agent',
      model: 'default',
    };
  }
}
```

## Using the Agent Registry

The agent registry helps manage multiple agent adapters:

```typescript
import { AgentRegistry } from 'agent-execution-engine/agents';
import { ClaudeCodeAdapter } from 'agent-execution-engine/agents/claude';
import { MyAgentAdapter } from './my-agent-adapter';

const registry = new AgentRegistry();

// Register agents
registry.register(new ClaudeCodeAdapter());
registry.register(new MyAgentAdapter());

// Get an agent by name
const claude = registry.get('claude-code');
const myAgent = registry.get('my-agent');

// List all agents
const allAgents = registry.getAll();
console.log('Available agents:', allAgents.map(a => a.metadata.displayName));

// Check capabilities
const adapter = registry.get('claude-code');
if (adapter?.metadata.supportsStructuredOutput) {
  console.log('Agent supports structured output!');
}
```

## Global Registry

For convenience, a global registry is available:

```typescript
import { globalAgentRegistry, ClaudeCodeAdapter } from 'agent-execution-engine';

// Register to global registry
globalAgentRegistry.register(new ClaudeCodeAdapter());

// Use anywhere in your application
const adapter = globalAgentRegistry.get('claude-code');
```

## Agent Capabilities

Each agent declares its capabilities through metadata:

- **name**: Unique identifier (e.g., `'claude-code'`)
- **displayName**: Human-readable name (e.g., `'Claude Code'`)
- **version**: Supported version range
- **supportedModes**: Array of execution modes (`'structured'`, `'interactive'`, `'hybrid'`)
- **supportsStreaming**: Whether agent can stream output
- **supportsStructuredOutput**: Whether agent can output JSON

Use these capabilities to dynamically adjust your execution strategy based on what the agent supports.
