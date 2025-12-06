# Claude Agent SDK Research

This document captures research findings for the `@anthropic-ai/claude-agent-sdk` TypeScript SDK integration.

## Package Information

- **Package**: `@anthropic-ai/claude-agent-sdk`
- **NPM**: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
- **GitHub**: https://github.com/anthropics/claude-agent-sdk-typescript
- **Docs**: https://docs.claude.com/en/api/agent-sdk/typescript
- **Requirements**: Node.js 18+

## Installation

```bash
npm install @anthropic-ai/claude-agent-sdk
```

## Core API

### `query()` Function

The main entry point for executing Claude queries:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

function query({
  prompt,
  options
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query
```

**Key feature**: The `prompt` parameter accepts `AsyncIterable<SDKUserMessage>` for streaming/mid-execution messaging.

### `Query` Interface

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
}
```

The Query is an async generator that yields messages as they arrive, plus control methods.

## Message Types

### Input: `SDKUserMessage`

```typescript
type SDKUserMessage = {
  type: 'user';
  uuid?: string;
  session_id: string;
  message: {
    role: 'user';
    content: string | ContentBlock[];
  };
  parent_tool_use_id: string | null;
};
```

### Output: `SDKMessage` (Union)

```typescript
type SDKMessage =
  | SDKSystemMessage      // Session init, contains session_id
  | SDKAssistantMessage   // Claude's responses
  | SDKPartialAssistantMessage  // Streamed chunks
  | SDKUserMessage        // Echo of user messages
  | SDKUserMessageReplay  // Replayed messages on resume
  | SDKResultMessage      // Final result
  | SDKCompactBoundaryMessage;  // Compaction markers
```

**Key Output Types**:

```typescript
// System initialization (first message)
type SDKSystemMessage = {
  type: 'system';
  subtype: 'init';
  uuid: string;
  session_id: string;
  permissionMode: PermissionMode;
};

// Assistant response
type SDKAssistantMessage = {
  type: 'assistant';
  uuid: string;
  session_id: string;
  message: APIAssistantMessage;
  parent_tool_use_id: string | null;
};

// Streamed partial response
type SDKPartialAssistantMessage = {
  type: 'partialAssistant';
  uuid: string;
  session_id: string;
  partial_message: Partial<APIAssistantMessage>;
  parent_tool_use_id: string | null;
};

// Final result
type SDKResultMessage = {
  type: 'result';
  // execution results
};
```

## Session Handling

### New Session

```typescript
const response = query({
  prompt: 'Initial task',
  options: { model: 'claude-opus-4-5-20251101' }
});

let sessionId: string;
for await (const message of response) {
  if (message.type === 'system' && message.subtype === 'init') {
    sessionId = message.session_id;
  }
}
```

### Resume Session

```typescript
const resumed = query({
  prompt: 'Continue task',
  options: {
    resume: sessionId,
    model: 'claude-opus-4-5-20251101'
  }
});
```

### Fork Session

```typescript
const forked = query({
  prompt: 'Try different approach',
  options: {
    resume: sessionId,
    forkSession: true,  // Creates new session ID
    model: 'claude-opus-4-5-20251101'
  }
});
```

## Mid-Execution Messaging

The key to mid-execution messaging is using `AsyncIterable<SDKUserMessage>` as the prompt:

```typescript
async function* messageGenerator(): AsyncIterable<SDKUserMessage> {
  // Initial message
  yield {
    type: 'user',
    session_id: '',  // Will be set after init
    message: { role: 'user', content: 'Initial task' },
    parent_tool_use_id: null
  };

  // Wait for external trigger, then send more
  const nextMessage = await waitForUserInput();
  yield {
    type: 'user',
    session_id: sessionId,
    message: { role: 'user', content: nextMessage },
    parent_tool_use_id: null
  };
}

const response = query({
  prompt: messageGenerator(),
  options: { model: 'claude-opus-4-5-20251101' }
});
```

## Interruption

```typescript
const response = query({ prompt: 'Long task', options: {} });

// Process in background
const processing = (async () => {
  for await (const message of response) {
    console.log(message.type);
  }
})();

// Interrupt after timeout
setTimeout(async () => {
  await response.interrupt();
}, 5000);
```

## Permission Control

### Permission Modes

```typescript
type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
```

### Custom Permission Handler

```typescript
const response = query({
  prompt: 'Edit files',
  options: {
    permissionMode: 'default',
    canUseTool: async (toolName, input, options) => {
      if (toolName === 'bash' && input.command.includes('rm -rf')) {
        return {
          behavior: 'deny',
          message: 'Dangerous command blocked',
          interrupt: true
        };
      }
      return { behavior: 'allow', updatedInput: input };
    }
  }
});

// Change permission mode mid-execution
await response.setPermissionMode('acceptEdits');
```

## Comparison: SDK vs CLI

| Aspect | SDK | CLI (ProtocolPeer) |
|--------|-----|-------------------|
| Installation | npm package | claude CLI binary |
| Input | AsyncIterable pattern | stdin JSON protocol |
| Output | Typed SDKMessage | Stream-JSON lines |
| Interruption | `Query.interrupt()` | Control message |
| Permissions | Callback-based | Control request/response |
| Session resume | `options.resume` | `--resume` flag |
| Process management | Internal | External (spawn) |

### When to Use SDK

- New projects wanting simpler integration
- Need programmatic permission handling
- Want typed message interfaces
- Don't need PTY/terminal emulation

### When to Use CLI

- Need PTY/interactive terminal features
- Want to use existing process management
- Need custom environment control
- Want to avoid additional dependency

## Implementation Notes

### AsyncQueue Pattern

For mid-execution messaging, we need an `AsyncQueue` utility:

```typescript
class AsyncQueue<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private resolvers: ((result: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(item: T): void {
    if (this.resolvers.length > 0) {
      this.resolvers.shift()!({ value: item, done: false });
    } else {
      this.queue.push(item);
    }
  }

  close(): void {
    this.closed = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as any, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.closed) {
        return;
      } else {
        const result = await new Promise<IteratorResult<T>>(resolve => {
          this.resolvers.push(resolve);
        });
        if (result.done) return;
        yield result.value;
      }
    }
  }
}
```

### Output Normalization

SDK messages map to existing `NormalizedEntry` types:

| SDK Message | NormalizedEntry Kind |
|-------------|---------------------|
| `system` (init) | `system_message` |
| `assistant` | `assistant_message` |
| `partialAssistant` | `assistant_message` (partial) |
| `result` | `result` |

The `SDKAssistantMessage.message` contains the same structure as CLI's assistant messages, so existing normalizer logic can be reused.

## Open Questions Resolved

1. **Interrupt semantics**: SDK's `interrupt()` is graceful - Claude finishes current tool, then stops
2. **Message ordering**: SDK handles ordering internally via the async iterator pattern
3. **Session persistence**: Session ID persists; mid-execution messages are part of session history for resume

## Next Steps

1. Add `@anthropic-ai/claude-agent-sdk` as dependency
2. Create `AsyncQueue` utility class
3. Implement `ClaudeSDKExecutor` using SDK's `query()` function
4. Map SDK output to `NormalizedEntry` format
5. Document when to use SDK vs CLI executor
