# ACP (Agent Client Protocol) Integration

This module provides TypeScript types and utilities for integrating with [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) agents like Gemini CLI.

## Architecture Decision

**We use the official `@agentclientprotocol/sdk` for protocol communication.**

Instead of implementing JSONRPC and connection handling from scratch, we leverage the official SDK maintained by Zed Industries. This gives us:

- ✅ **Correctness**: Implements the official ACP specification exactly
- ✅ **Maintenance**: Protocol updates handled by maintainers
- ✅ **Battle-tested**: Used by Gemini CLI in production
- ✅ **Type Safety**: Runtime validation via Zod schemas
- ✅ **Time Savings**: ~650 lines of code we don't have to write

See `docs/acp-sdk-analysis.md` for the full analysis.

## Module Structure

```
src/agents/acp/
├── types/
│   ├── protocol.ts    # ACP protocol type definitions (for reference)
│   ├── client.ts      # Client interface (SDK-compatible)
│   └── index.ts
├── errors/
│   ├── acp-error.ts   # JSONRPC error handling
│   └── index.ts
├── events/            # Phase 5 - Event helpers ✅
│   ├── acp-event.ts   # Event helpers
│   ├── normalizer.ts  # Event → NormalizedEntry conversion
│   └── index.ts
└── index.ts
```

## Usage with Official SDK

### 1. Install Dependencies

```bash
npm install @agentclientprotocol/sdk
```

### 2. Implement Client Interface

Our `Client` interface matches the SDK's interface exactly:

```typescript
import type * as acp from '@agentclientprotocol/sdk';
import type { Client } from '@/agents/acp';

class AcpClient implements acp.Client {
  async sessionUpdate(params: acp.SessionNotification) {
    // Handle session updates (messages, tool calls, etc.)
    console.log('Agent update:', params.update);
  }

  async requestPermission(params: acp.RequestPermissionRequest) {
    // Auto-approve tool calls
    return {
      outcome: {
        outcome: 'selected' as const,
        optionId: params.options[0].optionId
      }
    };
  }

  // Optional: file system capabilities
  async readTextFile(params: acp.ReadTextFileRequest) {
    const content = await fs.readFile(params.path, 'utf-8');
    return { content };
  }

  async writeTextFile(params: acp.WriteTextFileRequest) {
    await fs.writeFile(params.path, params.content, 'utf-8');
    return {};
  }
}
```

### 3. Create Connection with SDK

```typescript
import * as acp from '@agentclientprotocol/sdk';
import { spawn } from 'child_process';
import { Readable, Writable } from 'stream';

// Spawn Gemini CLI
const process = spawn('gemini', ['--acp']);

// Create SDK stream
const stream = acp.ndJsonStream(
  Writable.toWeb(process.stdin),
  Readable.toWeb(process.stdout)
);

// Create client instance
const client = new AcpClient();

// Create SDK connection
const connection = new acp.ClientSideConnection(
  (_agent) => client,
  stream
);

// Initialize
await connection.initialize({
  protocolVersion: acp.PROTOCOL_VERSION,
  clientCapabilities: {
    fs: { readTextFile: true, writeTextFile: true },
    terminal: false
  }
});

// Create session
const session = await connection.newSession({
  cwd: process.cwd()
});

// Send prompt
const result = await connection.prompt({
  sessionId: session.sessionId,
  prompt: [{ type: 'text', text: 'Hello, agent!' }]
});

console.log('Completed with:', result.stopReason);
```

## What We Provide

While we use the SDK for communication, we still provide:

### 1. Type Definitions (`types/protocol.ts`)

TypeScript discriminated unions for ACP protocol types:
- `SessionUpdate` - Agent events (messages, tool calls, plans)
- `ContentBlock` - Message content (text, images, audio)
- `ToolCall` - Tool invocation details
- `RequestPermissionRequest/Response` - Permission handling

**Note**: These are kept for reference and type safety, but you can also use types directly from the SDK.

### 2. Client Interface (`types/client.ts`)

TypeScript interface matching the SDK's `Client` interface with comprehensive JSDoc:
- Required: `sessionUpdate()`, `requestPermission()`
- Optional: File system, terminal, extension methods

### 3. Error Handling (`errors/acp-error.ts`)

JSONRPC error codes and `AcpError` class for standardized error handling.

### 4. Event Helpers (`events/acp-event.ts`, `events/normalizer.ts`) ✅

Utilities for converting ACP events to simplified format and normalizing to `NormalizedEntry`:

**Event Conversion:**
```typescript
import { sessionUpdateToEvent, extractTextContent, isMessageEvent } from '@/agents/acp';

class AcpClient implements acp.Client {
  async sessionUpdate(params: acp.SessionNotification) {
    // Convert to simplified event
    const event = sessionUpdateToEvent(params);

    switch (event.type) {
      case 'Message':
        const text = extractTextContent(event.content);
        console.log('Agent says:', text);
        break;

      case 'ToolCall':
        console.log(`Tool ${event.toolCall.kind}: ${event.toolCall.title}`);
        break;

      case 'Plan':
        console.log('Plan:', event.plan.entries.map(e => e.content).join(', '));
        break;
    }
  }
}
```

**Normalization for Persistence:**
```typescript
import { toNormalizedEntry } from '@/agents/acp';

let index = 0;

class AcpClient implements acp.Client {
  async sessionUpdate(params: acp.SessionNotification) {
    const event = sessionUpdateToEvent(params);

    // Convert to normalized entry for session persistence
    const entry = toNormalizedEntry(event, index++, new Date());
    await this.sessionManager.append(entry);

    // Entry format matches other agents (Claude, Cursor, etc.)
    // type: 'assistant_message' | 'thinking' | 'tool_use' | 'error' | 'system_message'
  }
}
```

**Helper Functions:**
- `sessionUpdateToEvent()` - Converts SDK notifications to simplified `AcpEvent`
- `extractTextContent()` - Extracts text from `ContentBlock`
- `isMessageEvent()` - Type guard for Message/Thought events
- `isToolEvent()` - Type guard for ToolCall/ToolUpdate events
- `isTerminalStatus()` - Checks if tool status is complete
- `toNormalizedEntry()` - Converts to unified `NormalizedEntry` format

## Differences from Custom Implementation

| Feature | Custom Implementation | With Official SDK |
|---------|----------------------|-------------------|
| JSONRPC Handler | Would write ~200 lines | SDK provides built-in |
| ClientSideConnection | Would write ~200 lines | SDK provides built-in |
| Stream Utilities | Would write ~100 lines | `ndJsonStream()` provided |
| Protocol Validation | Manual validation | Zod schemas included |
| Maintenance | On us | Zed Industries |

## Integration with Execution Engine

The ACP module integrates with our execution engine through:

1. **AcpAgentHarness** (to be implemented in Gemini executor)
   - Spawns Gemini CLI process
   - Wraps SDK's `ClientSideConnection`
   - Manages process lifecycle

2. **SessionManager** (to be implemented)
   - Persists conversation history to JSONL
   - Handles session forking/loading
   - Normalizes events for storage

3. **GeminiExecutor** (to be implemented)
   - Implements `IAgentExecutor` interface
   - Uses AcpAgentHarness for process management
   - Normalizes output to standard format

## References

- [ACP Specification](https://agentclientprotocol.com/)
- [Official SDK](https://github.com/agentclientprotocol/typescript-sdk)
- [Analysis Document](../../../docs/acp-sdk-analysis.md)
- [Gemini CLI](https://github.com/gemini-cli/gemini)

## Examples

See official SDK examples:
- `node_modules/@agentclientprotocol/sdk/dist/examples/client.js` - Full client implementation
- [SDK Documentation](https://github.com/agentclientprotocol/typescript-sdk#readme)

## Test Coverage

**49/49 tests passing ✅**

- **Protocol types** (13 tests): Type definitions, discriminated unions, exhaustiveness
- **Client interface** (13 tests): Required/optional methods, permission handling, type safety
- **Events & normalization** (23 tests):
  - Event conversion: All SessionUpdate variants
  - Content extraction: Text, Image, Audio handling
  - Type guards: Message, Tool, Terminal status checks
  - Normalization: AcpEvent → NormalizedEntry for all event types

Run tests: `npm test -- tests/unit/agents/acp/`

## Status

- ✅ **Phase 1**: Protocol Types - Completed (13 tests)
- ✅ **Phase 2**: Client Interface - Completed (13 tests, SDK-compatible)
- ❌ **Phase 3**: JSONRPC Handler - Skipped (using SDK)
- ❌ **Phase 4**: ClientSideConnection - Skipped (using SDK)
- ✅ **Phase 5**: Event Helpers - Completed (23 tests)
- ✅ **Phase 6**: Testing & Docs - Completed
