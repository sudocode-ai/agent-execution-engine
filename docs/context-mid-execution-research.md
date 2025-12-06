# Mid-Execution Messaging Research Context

This document captures the research and exploration findings for implementing mid-execution messaging support in the agent-execution-engine.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Existing Infrastructure](#existing-infrastructure)
3. [Interface Analysis](#interface-analysis)
4. [Claude Code CLI Capabilities](#claude-code-cli-capabilities)
5. [Reference Implementation Analysis](#reference-implementation-analysis)
6. [SDK Research](#sdk-research)
7. [Implementation Considerations](#implementation-considerations)

---

## Architecture Overview

The execution engine follows a 5-layer design:

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

### Key Directories

```
src/
├── process/           # Layer 1: Process Management
│   ├── manager.ts     # IProcessManager interface
│   ├── simple-manager.ts  # SimpleProcessManager (stdin/stdout pipes)
│   ├── pty-manager.ts     # PtyProcessManager (terminal emulation)
│   └── types.ts       # ProcessConfig, ManagedProcess, etc.
│
├── engine/            # Layer 2: Execution Engine
│   ├── engine.ts      # IExecutionEngine interface
│   ├── simple-engine.ts   # SimpleExecutionEngine (queue-based)
│   └── types.ts       # ExecutionTask, TaskResult, etc.
│
├── agents/            # Agent Adapters
│   ├── types/
│   │   ├── agent-adapter.ts   # IAgentAdapter (config building)
│   │   └── agent-executor.ts  # IAgentExecutor (unified execution)
│   └── claude/
│       ├── executor.ts        # ClaudeCodeExecutor
│       ├── protocol/
│       │   ├── protocol-peer.ts   # Bidirectional JSON protocol
│       │   └── client.ts          # ClaudeAgentClient (approvals)
│       └── types/
│           ├── messages.ts    # Stream-JSON message types
│           └── control.ts     # Control request/response types
```

---

## Existing Infrastructure

### Process Layer: `sendInput()` Already Exists

The `IProcessManager` interface already defines input sending:

```typescript
// src/process/manager.ts

interface IProcessManager {
  // ... other methods ...

  /**
   * Send input to a process's stdin
   */
  sendInput(processId: string, input: string): Promise<void>;

  /**
   * Close stdin stream for a process
   */
  closeInput(processId: string): void;
}
```

**SimpleProcessManager implementation** (`src/process/simple-manager.ts:420-432`):

```typescript
async sendInput(processId: string, input: string): Promise<void> {
  const managed = this._activeProcesses.get(processId);
  if (!managed) {
    throw new Error(`Process ${processId} not found`);
  }

  return new Promise((resolve, reject) => {
    managed.streams!.stdin.write(input, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
```

### Protocol Layer: Bidirectional Communication

The `ProtocolPeer` class handles bidirectional stream-json communication:

```typescript
// src/agents/claude/protocol/protocol-peer.ts

class ProtocolPeer {
  constructor(stdin: Writable, stdout: Readable, client: IProtocolClient) {}

  // Start background read loop
  start(): void;

  // Stop reading
  async stop(): Promise<void>;

  // Send user message to Claude CLI
  async sendUserMessage(
    content: string | ContentBlock[],
    sessionId?: string
  ): Promise<void>;

  // Register message handler
  onMessage(handler: MessageHandler): void;

  // Register error handler
  onError(handler: ErrorHandler): void;
}
```

**Key insight**: `sendUserMessage()` can be called multiple times to send additional messages to a running process.

### ClaudeCodeExecutor: Peer is Attached but Not Exposed

```typescript
// src/agents/claude/executor.ts

interface ClaudeManagedProcess extends ManagedProcess {
  peer?: ProtocolPeer;  // Attached here!
}

class ClaudeCodeExecutor {
  async executeTask(task: ExecutionTask): Promise<SpawnedChild> {
    // ... spawn process ...

    const peer = new ProtocolPeer(
      childProcess.stdin!,
      childProcess.stdout!,
      client
    );
    peer.start();

    // Send initial prompt
    await peer.sendUserMessage(task.prompt);

    // Return process with peer attached
    const claudeProcess: ClaudeManagedProcess = {
      // ... other fields ...
      peer,  // <-- Peer is attached!
    };

    return { process: claudeProcess };
  }
}
```

**Gap**: The `peer` is attached but there's no interface method to access it or send additional messages after `executeTask()` returns.

---

## Interface Analysis

### IAgentExecutor (Current)

```typescript
// src/agents/types/agent-executor.ts

interface IAgentExecutor {
  // Execute new task
  executeTask(task: ExecutionTask): Promise<SpawnedChild>;

  // Resume previous session
  resumeTask(task: ExecutionTask, sessionId: string): Promise<SpawnedChild>;

  // Normalize output to unified format
  normalizeOutput(
    outputStream: AsyncIterable<OutputChunk>,
    workDir: string
  ): AsyncIterable<NormalizedEntry>;

  // Get capabilities
  getCapabilities(): AgentCapabilities;

  // Check availability
  checkAvailability(): Promise<boolean>;

  // Optional: Set approval service
  setApprovalService?(service: IApprovalService): void;
}
```

### AgentCapabilities (Current)

```typescript
interface AgentCapabilities {
  supportsSessionResume: boolean;
  requiresSetup: boolean;
  supportsApprovals: boolean;
  supportsMcp: boolean;
  protocol: ProtocolType;
  // Missing: supportsMidExecutionMessages
}
```

### SpawnedChild

```typescript
interface SpawnedChild {
  process: ManagedProcess;
  exitSignal?: Promise<void>;
}
```

---

## Claude Code CLI Capabilities

### Execution Modes

1. **Print mode (`--print`)**: Non-interactive, reads prompt from args, executes, exits
2. **Interactive mode**: TUI with real-time streaming, reads from stdin
3. **Stream-JSON mode (`--input-format stream-json`)**: Bidirectional JSON protocol

### Stream-JSON Protocol

When using `--input-format stream-json` and `--output-format stream-json`:

**Input messages (stdin)**:

```jsonl
{"type":"user","message":{"role":"user","content":"Your prompt"}}
{"type":"control","control":{"type":"interrupt"}}
```

**Output messages (stdout)**:

```jsonl
{"type":"system","message":{...}}
{"type":"assistant","message":{...}}
{"type":"tool_use","tool_use":{...}}
{"type":"control_request","requestId":"...","request":{...}}
{"type":"result","is_error":false,...}
```

### Session Resumption

```bash
# Get session ID from first execution
session_id=$(claude -p "First task" --output-format json | jq -r '.session_id')

# Resume with new prompt
claude -p --resume "$session_id" "Follow-up task"
```

**Note**: This is sequential turn-taking, NOT mid-execution messaging.

### Mid-Execution Input

For true mid-execution messaging, Claude Code must be:

1. Running with `--input-format stream-json`
2. Actively listening on stdin
3. Processing the user message while still executing

The `ProtocolPeer.sendUserMessage()` method already handles this by writing to stdin.

---

## Reference Implementation Analysis

### claude-code-server (Python)

Located at `references/claude-code-server/`, this project provides a WebSocket server for Claude Code.

**Key classes**:

```python
# src/claude_code_server/sessions.py

class ClaudeSDKClient:
    """Persistent client for interactive sessions"""

    async def query(self, message: str, session_id: str = None):
        """Send a new message"""

    async def interrupt(self):
        """Interrupt current execution"""

    async def receive_messages(self) -> AsyncIterable[Message]:
        """Receive messages from Claude"""
```

**Session handling** (`server.py`):

```python
async with ClaudeSDKClient(options) as client:
    await client.query(user_message.message, session_id=session.session_id)

    # Can interrupt anytime
    await client.interrupt()

    # Receive responses
    async for message in client.receive_messages():
        await websocket.send(message)
```

**Mid-execution message handling**:

When a new user message arrives while a query is running:

1. Cancel current query task
2. Queue the new message
3. Start new query with combined messages

```python
# Queued messages are combined
query_message = "\n\n".join(session.queued_messages)
```

---

## SDK Research

### TypeScript SDK (`@anthropic-ai/claude-agent-sdk`)

**Installation**:

```bash
npm install @anthropic-ai/claude-agent-sdk
```

**Basic usage**:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

// One-shot query
for await (const message of query({ prompt: "Hello", options: {...} })) {
  console.log(message);
}
```

**Streaming input for mid-execution messages**:

```typescript
import { query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

// Create async generator for streaming input
async function* createMessageStream(): AsyncIterable<SDKUserMessage> {
  // Initial prompt
  yield {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'Initial task' }] }
  };

  // Wait for more input
  while (true) {
    const nextMessage = await waitForUserInput();
    if (nextMessage === null) break;
    yield nextMessage;
  }
}

// Start query with streaming input
const result = query({
  prompt: createMessageStream(),
  options: { workDir: '/project' }
});

// Interrupt anytime
await result.interrupt();
```

**Key features**:

- `query()` returns a `Query` object that is an async iterator
- `Query.interrupt()` method for cancellation
- Accepts `AsyncIterable<SDKUserMessage>` for streaming input

### Python SDK (`claude-agent-sdk`)

Two approaches:

1. **`query()` function**: Simple, one-off tasks
2. **`ClaudeSDKClient` class**: Maintains conversation session

```python
from claude_code_sdk import ClaudeSDKClient

async with ClaudeSDKClient(options) as client:
    # First message
    await client.query("Initial task")

    async for message in client.receive_response():
        print(message)

    # Follow-up (maintains context!)
    await client.query("Additional context")

    # Interrupt anytime
    await client.interrupt()
```

| Feature | `query()` | `ClaudeSDKClient` |
|---------|-----------|-------------------|
| Session | New each time | Reuses same |
| Conversation | Single exchange | Multiple exchanges |
| Interrupts | Not supported | Supported |
| Custom Tools | Not supported | Supported |

---

## Implementation Considerations

### Approach Comparison

| Aspect | Option A: Expose ProtocolPeer | Option B: TypeScript SDK |
|--------|------------------------------|--------------------------|
| Effort | Low | Medium-High |
| Risk | Low (existing code) | Medium (new dependency) |
| Dependencies | None | `@anthropic-ai/claude-agent-sdk` |
| Future-proof | Less | More |
| Testing | Easier (mock existing) | Harder (mock SDK) |

### Message Ordering

When sending mid-execution messages, consider:

1. **Queue-based**: Messages queue and process in order
2. **Interrupt-based**: New message interrupts current, combines context
3. **Parallel**: Messages processed as they arrive (may cause confusion)

Recommendation: Queue-based with optional interrupt flag.

### Interrupt Semantics

Options:

1. **Soft interrupt**: Current tool finishes, then stop
2. **Hard interrupt**: Kill immediately, may leave state inconsistent
3. **Graceful**: Send control message, let Claude decide

Current ProtocolPeer approach: Send control message (graceful).

### Session State

Questions:

1. Are mid-execution messages part of session history?
2. Can you `--resume` after mid-execution messages?
3. How does session ID work with multiple messages?

Based on claude-code-server: Messages are queued and combined, session ID maintained.

### Error Handling

Scenarios:

1. Process exits before message sent
2. Message sent but no response
3. Interrupt fails
4. Process crashes mid-execution

Recommendation: Wrap all operations with proper error handling, emit errors via `onError` handlers.

---

## Files Reference

### Core Interfaces

- `src/process/manager.ts` - IProcessManager with `sendInput()`
- `src/engine/engine.ts` - IExecutionEngine
- `src/agents/types/agent-executor.ts` - IAgentExecutor

### Claude Implementation

- `src/agents/claude/executor.ts` - ClaudeCodeExecutor
- `src/agents/claude/protocol/protocol-peer.ts` - ProtocolPeer (bidirectional)
- `src/agents/claude/protocol/client.ts` - ClaudeAgentClient (approvals)
- `src/agents/claude/types/messages.ts` - Stream-JSON message types
- `src/agents/claude/types/control.ts` - Control message types

### Tests

- `tests/unit/process/io.test.ts` - Tests for `sendInput()` and bidirectional I/O

---

## Next Steps

1. **Phase 1**: Add `sendMessage()` and `interrupt()` to IAgentExecutor
2. **Phase 1**: Implement in ClaudeCodeExecutor using existing ProtocolPeer
3. **Phase 1**: Add ClaudeSession wrapper for convenience
4. **Phase 2**: Evaluate SDK integration as alternative
5. **Phase 2**: Add SDK-based executor if needed
