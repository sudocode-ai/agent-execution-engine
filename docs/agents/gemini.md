# Gemini CLI Integration Guide

This guide covers everything you need to know about using the Google Gemini CLI executor in the agent-execution-engine framework.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation & Authentication](#installation--authentication)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Features](#features)
- [Session Management](#session-management)
- [Output Normalization](#output-normalization)
- [Model Selection](#model-selection)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Comparison with Other Agents](#comparison-with-other-agents)

## Prerequisites

- Node.js 18+ or 20+
- npm or npx
- Google account
- `agent-execution-engine` package installed
- `@agentclientprotocol/sdk` (automatically installed as dependency)

## Installation & Authentication

### 1. Install Gemini CLI

```bash
# Test installation (downloads via npx)
npx -y @google/gemini-cli --version

# Or install globally for faster access
npm install -g @google/gemini-cli
```

### 2. Authenticate

```bash
# Authenticate with your Google account
npx @google/gemini-cli login

# Or if installed globally
gemini login
```

### 3. Test the Connection

```bash
# Test with a simple prompt
echo "Hello, Gemini!" | npx @google/gemini-cli --experimental-acp

# You should see a response from Gemini
```

### 4. Verify Availability in Code

```typescript
import { GeminiExecutor } from 'agent-execution-engine/agents/gemini';

const executor = new GeminiExecutor({
  workDir: process.cwd(),
});

const isAvailable = await executor.checkAvailability();
console.log('Gemini available:', isAvailable);
```

## Quick Start

### Basic Task Execution

```typescript
import { GeminiExecutor } from 'agent-execution-engine/agents/gemini';

// Create executor
const executor = new GeminiExecutor({
  workDir: '/path/to/project',
  model: 'flash',        // Fast, efficient model
  autoApprove: true,     // Auto-approve tool requests
});

// Define task
const task = {
  id: 'analyze-code',
  type: 'custom',
  prompt: 'Analyze the main.ts file and suggest improvements',
  workDir: '/path/to/project',
  priority: 0,
  dependencies: [],
  createdAt: new Date(),
  config: {},
};

// Execute
const spawned = await executor.executeTask(task);

// Wait for completion
await spawned.exitSignal;

// Read session history
const sessionManager = executor.getSessionManager();
const sessionId = spawned.sessionInfo.sessionId;
const events = await sessionManager.readSession(sessionId);

console.log('Conversation events:', events);
```

### With Output Normalization

```typescript
const spawned = await executor.executeTask(task);

// Listen to harness events for real-time output
const harness = (executor as any).harness;

harness.on('output', (data: any, type: string) => {
  if (type === 'stdout') {
    console.log('Raw output:', data.toString());
  }
});

harness.on('error', (error: Error) => {
  console.error('Error:', error);
});

// Wait for completion
await spawned.exitSignal;
```

## Configuration

### GeminiConfig Interface

```typescript
interface GeminiConfig extends BaseAgentConfig {
  // Working directory (required)
  workDir: string;

  // Model selection
  model?: 'default' | 'flash' | 'gemini-2.5-flash-thinking-exp-01-21';

  // Auto-approve tool requests (default: true)
  autoApprove?: boolean;

  // Session namespace for persistence (default: 'gemini-sessions')
  sessionNamespace?: string;

  // System prompt prepended to all prompts
  systemPrompt?: string;

  // Path to Gemini CLI executable (default: 'npx')
  executablePath?: string;

  // Additional CLI parameters
  additionalParams?: string[];

  // Environment variables
  env?: Record<string, string>;

  // Timeout in milliseconds
  timeout?: number;
}
```

### Configuration Examples

**Minimal Configuration:**
```typescript
const executor = new GeminiExecutor({
  workDir: process.cwd(),
});
```

**With Model Selection:**
```typescript
const executor = new GeminiExecutor({
  workDir: '/project',
  model: 'flash',  // Faster responses
});
```

**With System Prompt:**
```typescript
const executor = new GeminiExecutor({
  workDir: '/project',
  systemPrompt: 'You are an expert TypeScript developer. Always follow best practices.',
});
```

**With Custom Session Namespace:**
```typescript
const executor = new GeminiExecutor({
  workDir: '/project',
  sessionNamespace: 'my-app-sessions',
});
```

**Full Configuration:**
```typescript
const executor = new GeminiExecutor({
  workDir: '/path/to/project',
  model: 'gemini-2.5-flash-thinking-exp-01-21',
  autoApprove: false,  // Manual approval required
  sessionNamespace: 'production-sessions',
  systemPrompt: 'You are a senior software architect.',
  additionalParams: ['--verbose'],
  env: {
    GEMINI_DEBUG: 'true',
  },
  timeout: 300000,  // 5 minutes
});
```

## Features

### ACP Protocol

Gemini CLI uses the Agent Client Protocol (ACP) for communication:

- **Structured Events**: Messages, thoughts, tool calls, and plans
- **Real-time Streaming**: Incremental updates via SDK callbacks
- **Type Safety**: Full TypeScript types from `@agentclientprotocol/sdk`

### Session Persistence

All conversations are automatically persisted to JSONL files:

```typescript
const sessionManager = executor.getSessionManager();

// Read session history
const events = await sessionManager.readSession(sessionId);

// Events include: user messages, assistant responses, thinking, tool calls
events.forEach((event) => {
  if (event.user) console.log('User:', event.user);
  if (event.assistant) console.log('Assistant:', event.assistant);
  if (event.thinking) console.log('Thinking:', event.thinking);
});
```

### Auto-Approval Mode

Control whether Gemini can use tools without asking:

```typescript
// Auto-approve all tools (default)
const executor = new GeminiExecutor({
  workDir: '/project',
  autoApprove: true,
});

// Require manual approval
const executor = new GeminiExecutor({
  workDir: '/project',
  autoApprove: false,
});

// Use approval service
executor.setApprovalService({
  async requestApproval(request) {
    if (request.toolName === 'Read') {
      return { status: 'approved' };
    }
    return { status: 'denied', reason: 'Tool not allowed' };
  },
});
```

### Tool Support

Gemini CLI supports various tools:

- **Read**: Read file contents
- **Edit**: Modify files with diffs
- **Execute**: Run shell commands
- **Search**: Search codebase
- **Fetch**: HTTP requests

All tools are automatically normalized to the unified `ActionType` format.

## Session Management

### Basic Session Resumption

```typescript
// First conversation
const spawned1 = await executor.executeTask({
  id: 'task-1',
  type: 'custom',
  prompt: 'Create a User model with name and email fields',
  workDir: '/project',
  priority: 0,
  dependencies: [],
  createdAt: new Date(),
  config: {},
});

await spawned1.exitSignal;
const sessionId = spawned1.sessionInfo.sessionId;

// Resume conversation
const spawned2 = await executor.resumeTask({
  id: 'task-2',
  type: 'custom',
  prompt: 'Now add password hashing to the User model',
  workDir: '/project',
  priority: 0,
  dependencies: [],
  createdAt: new Date(),
  config: {},
}, sessionId);

await spawned2.exitSignal;
```

### Advanced Session Management

```typescript
const sessionManager = executor.getSessionManager();

// Check if session exists
const exists = await sessionManager.sessionExists(sessionId);

// Read session history
const events = await sessionManager.readSession(sessionId);

// Generate resume prompt with context
const resumePrompt = await sessionManager.generateResumePrompt(
  sessionId,
  'Add validation to the model'
);

// Fork a session
await sessionManager.forkSession('original-session', 'new-session');

// Delete a session
await sessionManager.deleteSession(sessionId);
```

### Session Storage Location

Sessions are stored in:
- Development: `~/.vibe-kanban/dev/{namespace}/`
- Production: `~/.vibe-kanban/{namespace}/`

Where `{namespace}` is the `sessionNamespace` config option (default: `gemini-sessions`).

## Output Normalization

### Event Types

Gemini events are normalized to the unified `NormalizedEntry` format:

```typescript
type NormalizedEntryType =
  | { kind: 'assistant_message' }
  | { kind: 'thinking'; reasoning?: string }
  | { kind: 'tool_use'; tool: ToolUseEntry }
  | { kind: 'error'; error: ErrorEntry };
```

### Manual Normalization

```typescript
const normalizer = executor.getNormalizer();

// Normalize SDK notification
const notification = {
  sessionId: 'test',
  update: {
    AgentMessageChunk: {
      content: { Text: { text: 'Hello!' } },
    },
  },
};

const entry = normalizer.normalize(notification, workDir);

if (entry) {
  console.log(entry.type.kind);  // 'assistant_message'
  console.log(entry.content);     // 'Hello!'
  console.log(entry.index);       // Sequential index
}
```

### Tool Action Mapping

| Gemini Tool | ActionType |
|-------------|-----------|
| Read | `{ kind: 'file_read', path }` |
| Edit | `{ kind: 'file_edit', path, changes }` |
| Execute | `{ kind: 'command_run', command }` |
| Search | `{ kind: 'search', query }` |
| Other | `{ kind: 'tool', toolName }` |

### Tool Status Mapping

| Gemini Status | Normalized Status |
|---------------|-------------------|
| Pending | created |
| Running | running |
| Success | success |
| Error | failed |

## Model Selection

### Available Models

```typescript
type GeminiModel =
  | 'default'                          // Latest stable model
  | 'flash'                            // Fast, efficient model
  | 'gemini-2.5-flash-thinking-exp-01-21';  // Experimental with thinking
```

### Model Comparison

| Model | Speed | Context | Best For |
|-------|-------|---------|----------|
| **default** | Medium | Large | General tasks |
| **flash** | Fast | Medium | Quick iterations, simple tasks |
| **thinking-exp** | Slow | Large | Complex reasoning, planning |

### Switching Models

```typescript
// Fast model for simple tasks
const flashExecutor = new GeminiExecutor({
  workDir: '/project',
  model: 'flash',
});

// Thinking model for complex tasks
const thinkingExecutor = new GeminiExecutor({
  workDir: '/project',
  model: 'gemini-2.5-flash-thinking-exp-01-21',
  systemPrompt: 'Think step-by-step through complex problems.',
});
```

## Best Practices

### 1. Use System Prompts for Consistency

```typescript
const executor = new GeminiExecutor({
  workDir: '/project',
  systemPrompt: `
You are an expert software engineer specializing in TypeScript and Node.js.

Guidelines:
- Always write type-safe code
- Follow functional programming principles
- Include comprehensive error handling
- Write clear, self-documenting code
`,
});
```

### 2. Session Management Strategy

- Use descriptive session IDs: `${projectId}-${taskType}-${timestamp}`
- Fork sessions for experimental work
- Clean up old sessions periodically
- Store session IDs in your database for long-term tracking

### 3. Error Handling

```typescript
try {
  const spawned = await executor.executeTask(task);
  await spawned.exitSignal;
} catch (error) {
  if (error.message.includes('Session not found')) {
    console.error('Invalid session ID');
  } else if (error.message.includes('not available')) {
    console.error('Gemini CLI not installed or authenticated');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### 4. Monitoring and Logging

```typescript
const harness = (executor as any).harness;

// Log all events
harness.on('output', (data, type) => {
  logger.info('Gemini output', { type, data: data.toString() });
});

harness.on('error', (error) => {
  logger.error('Gemini error', { error });
});

// Track session metrics
const sessionManager = executor.getSessionManager();
const events = await sessionManager.readSession(sessionId);
const stats = {
  totalMessages: events.filter(e => e.user || e.assistant).length,
  toolCalls: events.filter(e => e.type === 'ToolCall').length,
  thinkingEvents: events.filter(e => e.thinking).length,
};
```

### 5. Resource Cleanup

```typescript
// Always wait for completion
await spawned.exitSignal;

// Or handle timeouts
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Timeout')), 60000)
);

try {
  await Promise.race([spawned.exitSignal, timeoutPromise]);
} catch (error) {
  // Cleanup on timeout
  if (spawned.process.status === 'busy') {
    spawned.process.process.kill('SIGTERM');
  }
}
```

## Troubleshooting

### Common Issues

#### 1. "Gemini CLI not available"

**Cause**: CLI not installed or not in PATH

**Solution:**
```bash
# Install globally
npm install -g @google/gemini-cli

# Or verify npx can access it
npx -y @google/gemini-cli --version
```

#### 2. "Authentication failed"

**Cause**: Not logged in or credentials expired

**Solution:**
```bash
# Re-authenticate
npx @google/gemini-cli login

# Verify login
npx @google/gemini-cli --help
```

#### 3. "Session not found"

**Cause**: Invalid session ID or session deleted

**Solution:**
```typescript
// Always check session existence before resuming
const exists = await sessionManager.sessionExists(sessionId);
if (!exists) {
  console.error('Session does not exist');
  // Start new session instead
  const spawned = await executor.executeTask(task);
}
```

#### 4. "ACP protocol error"

**Cause**: Version mismatch or protocol issue

**Solution:**
```bash
# Update to latest Gemini CLI
npm update -g @google/gemini-cli

# Update execution engine
npm update agent-execution-engine
```

#### 5. "Tool approval timeout"

**Cause**: `autoApprove: false` but no approval service configured

**Solution:**
```typescript
// Either enable auto-approve
const executor = new GeminiExecutor({
  workDir: '/project',
  autoApprove: true,
});

// Or provide approval service
executor.setApprovalService({
  async requestApproval(request) {
    // Implement approval logic
    return { status: 'approved' };
  },
});
```

### Debug Mode

Enable verbose logging:

```typescript
const executor = new GeminiExecutor({
  workDir: '/project',
  additionalParams: ['--verbose'],
  env: {
    DEBUG: 'gemini:*',
  },
});

// Listen to all events
const harness = (executor as any).harness;
harness.on('output', (data, type) => {
  console.log('[DEBUG]', type, data.toString());
});
```

### Testing Availability

Create a test script:

```typescript
import { GeminiExecutor } from 'agent-execution-engine/agents/gemini';

async function testGemini() {
  const executor = new GeminiExecutor({
    workDir: process.cwd(),
  });

  console.log('Checking availability...');
  const available = await executor.checkAvailability();

  if (!available) {
    console.error('❌ Gemini CLI not available');
    console.log('Install: npm install -g @google/gemini-cli');
    console.log('Login: gemini login');
    return;
  }

  console.log('✅ Gemini CLI available');

  try {
    const spawned = await executor.executeTask({
      id: 'test',
      type: 'custom',
      prompt: 'Say hello',
      workDir: process.cwd(),
      priority: 0,
      dependencies: [],
      createdAt: new Date(),
      config: {},
    });

    await spawned.exitSignal;
    console.log('✅ Test execution successful');
  } catch (error) {
    console.error('❌ Test execution failed:', error);
  }
}

testGemini();
```

## Comparison with Other Agents

### Gemini vs Claude Code

| Feature | Gemini CLI | Claude Code |
|---------|-----------|-------------|
| **Protocol** | ACP (Agent Client Protocol) | Stream JSON |
| **Session Persistence** | Built-in JSONL | Manual implementation |
| **Session Resumption** | Native support | Via prompt context |
| **Tool Approval** | Configurable auto-approve | Permission system |
| **Thinking Output** | Explicit thinking chunks | Integrated in stream |
| **Model Selection** | Multiple models | Single model |
| **Setup Complexity** | Google auth only | Anthropic API key |

### Gemini vs GitHub Copilot

| Feature | Gemini CLI | GitHub Copilot |
|---------|-----------|---------------|
| **Protocol** | ACP | JSONL |
| **Context Window** | Large | Medium |
| **Speed** | Fast (flash model) | Medium |
| **Tool Support** | Rich tool ecosystem | Basic tools |
| **MCP Support** | Native | Yes |
| **Authentication** | Google account | GitHub account |

### When to Use Gemini

✅ **Use Gemini when:**
- You need conversation history and session resumption
- You want multiple model options (speed vs reasoning)
- You need rich tool support (read, edit, execute, search)
- You prefer ACP protocol standardization
- You have Google account access

❌ **Consider alternatives when:**
- You need Claude-specific features (Artifacts, analysis mode)
- You're already using GitHub Copilot ecosystem
- You need direct API access without CLI

## Further Reading

- [Agent Client Protocol Specification](https://agentclientprotocol.com)
- [Gemini CLI Documentation](https://www.npmjs.com/package/@google/gemini-cli)
- [Execution Engine Architecture](../../README.md#architecture)
- [Base Agent Executor Reference](../../src/agents/base/base-executor.ts)
- [ACP SDK Documentation](https://github.com/zed-industries/agent-client-protocol)

## Contributing

Found an issue or have a suggestion? Please open an issue or PR on the [agent-execution-engine repository](https://github.com/alexngai/agent-execution-engine).
