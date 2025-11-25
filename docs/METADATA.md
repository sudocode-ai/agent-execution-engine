# Standardized Metadata Format

All agent executors in the execution engine provide consistent metadata in `NormalizedEntry.metadata` following a standardized format.

## Overview

The `NormalizedEntryMetadata` interface defines common fields that all agents should populate when available:

```typescript
export interface NormalizedEntryMetadata {
  sessionId?: string | null;
  model?: string | null;
  [key: string]: unknown; // Agent-specific extensions
}
```

## Standard Fields

### sessionId

The session identifier for the current execution. Used for resuming sessions.

**Availability by Agent:**

| Agent | Support | Format | Notes |
|-------|---------|--------|-------|
| **Claude Code** | ✅ Always | `sess-abc-123` | Available from first system message |
| **Cursor** | ✅ Always | `sess-xyz-789` | Available from first system message |
| **Copilot** | ✅ After discovery | UUID format | Discovered via log file polling (~200ms delay) |
| **Codex** | ❌ Not supported | `null` | Codex does not support session resumption |

**Usage Example:**

```typescript
const executor = new ClaudeCodeExecutor(config);
const spawned = await executor.executeTask(task);

const outputStream = createOutputChunks(spawned.process);
for await (const entry of executor.normalizeOutput(outputStream, workDir)) {
  if (entry.metadata?.sessionId) {
    console.log('Session ID:', entry.metadata.sessionId);

    // Resume later
    await executor.resumeTask(nextTask, entry.metadata.sessionId);
  }
}
```

### model

The AI model used for this execution.

**Examples by Agent:**

| Agent | Example Values |
|-------|----------------|
| **Claude Code** | `claude-sonnet-4`, `claude-opus-4` |
| **Cursor** | `claude-sonnet-4.5`, `gpt-4o`, `auto` |
| **Copilot** | `gpt-4o`, `claude-sonnet-4` |
| **Codex** | `gpt-5-codex` |

## Agent-Specific Extensions

Agents can add custom fields beyond the standard ones:

```typescript
// Cursor adds permission mode
{
  sessionId: 'sess-123',
  model: 'claude-sonnet-4.5',
  permissionMode: 'auto'  // Custom field
}

// Claude Code could add MCP server status
{
  sessionId: 'sess-456',
  model: 'claude-sonnet-4',
  mcpServers: [{ name: 'filesystem', status: 'connected' }]  // Custom field
}
```

## When Metadata is Available

Metadata is populated for **all message types** after the initial system message:

- ✅ **system_message** - First message with session info
- ✅ **user_message** - User prompts
- ✅ **assistant_message** - AI responses (including streaming chunks)
- ✅ **thinking** - Extended thinking/reasoning blocks
- ✅ **tool_use** - Tool executions (both started and completed)
- ✅ **error** - Error messages

**No system message?** If an agent doesn't emit a system message, metadata will be `undefined` for all entries.

## Implementation Guidelines

When implementing a new agent executor:

1. **Track session ID and model** in normalizer state when first received
2. **Include metadata in all entries** using a consistent helper method
3. **Use `null` for unsupported fields** rather than omitting them
4. **Document agent-specific fields** in the agent's README

Example implementation:

```typescript
class MyAgentState {
  private sessionId: string | null = null;
  private model: string | null = null;

  private getMetadata(): NormalizedEntryMetadata | undefined {
    if (!this.sessionId && !this.model) {
      return undefined;
    }
    return {
      sessionId: this.sessionId,
      model: this.model,
    };
  }

  handleSystemMessage(msg: SystemMessage): NormalizedEntry {
    // Capture metadata
    this.sessionId = msg.session_id;
    this.model = msg.model;

    return {
      index: this.nextIndex(),
      type: { kind: 'system_message' },
      content: `Session: ${msg.session_id}`,
      metadata: {
        sessionId: this.sessionId,
        model: this.model,
      },
    };
  }

  handleUserMessage(msg: UserMessage): NormalizedEntry {
    return {
      index: this.nextIndex(),
      type: { kind: 'user_message' },
      content: msg.content,
      metadata: this.getMetadata(), // Include consistent metadata
    };
  }
}
```

## Benefits

The standardized metadata format provides:

- **Consistent API** - Same fields across all agents
- **Session resumption** - Extract sessionId from any entry
- **Model tracking** - Know which model generated responses
- **Graceful degradation** - Fields are optional, agents populate what they support
- **Extensibility** - Agent-specific fields via index signature

## See Also

- [Agent Executor Interface](../src/agents/types/agent-executor.ts) - Full TypeScript definitions
- [AGENTS.md](../AGENTS.md) - Guide for implementing agent adapters
- Individual agent READMEs for agent-specific metadata fields
