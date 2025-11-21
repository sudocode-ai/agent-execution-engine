# ACP SDK Analysis & Recommendation

## Executive Summary

**Recommendation: ✅ Use the official `@agentclientprotocol/sdk` package**

The official SDK provides **everything we need** for Gemini CLI integration, eliminating the need to implement Phases 3-4 (JSONRPC handler and ClientSideConnection) from scratch. This will save ~5-6 days of implementation time.

---

## What the Official SDK Provides

### ✅ Complete Implementation

**Package**: `@agentclientprotocol/sdk@0.5.1`
- **Maintainer**: Zed Industries
- **License**: Apache-2.0
- **Dependencies**: Only `zod` (schema validation)
- **TypeScript**: Full native support with `.d.ts` files

### Key Exports

1. **ClientSideConnection** - Complete JSONRPC client implementation
   - Handles initialize handshake
   - Manages prompt/response lifecycle
   - Routes agent requests to Client callbacks
   - Built-in newSession, loadSession, prompt methods

2. **Client Interface** - Matches what we defined
   - `requestPermission()`
   - `sessionUpdate()` (matches our sessionNotification)
   - Optional: `readTextFile`, `writeTextFile`, `createTerminal`, etc.

3. **Schema Types** - All protocol types via Zod
   - All types we implemented in Phase 1
   - Runtime validation with Zod schemas
   - Generated from official JSON schema

4. **Stream Utilities**
   - `ndJsonStream()` - Newline-delimited JSON streaming
   - Handles bidirectional communication over stdio

---

## Comparison: Our Implementation vs Official SDK

| Feature | Our Custom (Phases 1-4) | Official SDK |
|---------|-------------------------|--------------|
| **Protocol Types** | ✅ Done (Phase 1) | ✅ Provided + Zod validation |
| **Client Interface** | ✅ Done (Phase 2) | ✅ Provided |
| **JSONRPC Handler** | ❌ TODO (Phase 3) | ✅ **Built-in** |
| **ClientSideConnection** | ❌ TODO (Phase 4) | ✅ **Built-in** |
| **Stream Handling** | ❌ TODO | ✅ **ndJsonStream()** |
| **Runtime Validation** | ❌ None | ✅ **Zod schemas** |
| **Maintenance** | 😰 Us | ✅ **Zed Industries** |
| **Battle-tested** | ❓ New | ✅ **Used by Gemini CLI** |

### Lines of Code Saved

| Component | Custom Implementation | SDK Provides | LOC Saved |
|-----------|----------------------|--------------|-----------|
| JSONRPC Handler | ~200 lines | Built-in | ~200 |
| ClientSideConnection | ~200 lines | Built-in | ~200 |
| Stream utilities | ~100 lines | Built-in | ~100 |
| Protocol validation | ~150 lines | Zod schemas | ~150 |
| **Total** | **~650 lines** | **0 lines** | **~650** |

---

## Example Usage from Official SDK

```typescript
import * as acp from '@agentclientprotocol/sdk';

// 1. Implement Client interface
class MyClient implements acp.Client {
  async requestPermission(params) {
    // Auto-approve
    return {
      outcome: {
        outcome: 'selected',
        optionId: params.options[0].optionId
      }
    };
  }

  async sessionUpdate(params) {
    // Handle session updates
    console.log('Update:', params.update.sessionUpdate);
  }

  // Optional methods
  async readTextFile(params) {
    const content = await fs.readFile(params.path, 'utf-8');
    return { content };
  }
}

// 2. Create connection
const client = new MyClient();
const stream = acp.ndJsonStream(input, output); // From stdio
const connection = new acp.ClientSideConnection(
  (_agent) => client,
  stream
);

// 3. Initialize
await connection.initialize({
  protocolVersion: acp.PROTOCOL_VERSION,
  clientCapabilities: {
    fs: { readTextFile: true, writeTextFile: false },
    terminal: false
  }
});

// 4. Create session and prompt
const session = await connection.newSession({});
const result = await connection.prompt({
  sessionId: session.sessionId,
  messages: [{
    role: 'user',
    content: [{ type: 'text', text: 'Hello!' }]
  }]
});
```

---

## Key Differences from Our Implementation

### 1. Naming: `sessionUpdate` vs `sessionNotification`

**SDK uses**: `sessionUpdate(params: SessionNotification)`
**We defined**: `sessionNotification(params: SessionNotification)`

**Resolution**: Use SDK's naming (minor change)

### 2. Permission Outcome Structure

**SDK uses**:
```typescript
{
  outcome: {
    outcome: 'selected' | 'cancelled',
    optionId?: string
  }
}
```

**We defined**:
```typescript
{
  outcome: { Selected: { optionId: string } } | 'Cancelled'
}
```

**Resolution**: Use SDK's structure (matches official spec)

### 3. Terminal Methods

**SDK has**: `terminalOutput()` - Gets output (request/response)
**We defined**: `terminalOutput()` - Receives output (notification)

**Resolution**: SDK version is correct per spec

---

## Updated Implementation Plan

### ✅ Keep (Already Done)
- **Phase 1**: Protocol Types (completed - can optionally replace with SDK types)
- **Phase 2**: Client Interface (completed - minor naming adjustments needed)

### ❌ Skip (Provided by SDK)
- ~~**Phase 3**: JSONRPC Message Handler~~ → Use SDK
- ~~**Phase 4**: ClientSideConnection~~ → Use SDK

### ✅ Implement (Gemini-specific)
- **Phase 5**: ACP Event Helpers (still needed for normalization)
- **Gemini Phase 1**: AcpAgentHarness (wraps SDK)
- **Gemini Phase 2**: SessionManager (JSONL persistence)
- **Gemini Phase 3**: AcpClient implementation
- **Gemini Phase 4**: Output Normalization
- **Gemini Phase 5**: GeminiExecutor
- **Gemini Phase 6**: Testing & Documentation

---

## Revised Architecture

```
┌─────────────────────────────────────────────────────────┐
│  GeminiExecutor                                         │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  AcpAgentHarness                                        │
│  - Process spawning                                     │
│  - stdio → ndJsonStream                                 │
│  - Wraps ClientSideConnection (SDK)                     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  @agentclientprotocol/sdk (OFFICIAL)                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ClientSideConnection                              │  │
│  │  - initialize()                                   │  │
│  │  - newSession()                                   │  │
│  │  - prompt()                                       │  │
│  │  - JSONRPC handling (built-in)                    │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  AcpClient (implements SDK's Client interface)         │
│  - sessionUpdate() → emit events                        │
│  - requestPermission() → auto-approve                   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  SessionManager + AcpNormalizer                         │
│  - JSONL persistence                                    │
│  - Event normalization to NormalizedEntry              │
└─────────────────────────────────────────────────────────┘
```

---

## Benefits of Using Official SDK

### 1. **Correctness** ✅
- Implements official ACP specification
- Used by Gemini CLI (production-tested)
- Maintained by Zed Industries (protocol authors)

### 2. **Time Savings** ⏱️
- Skip ~5-6 days of JSONRPC implementation
- No need to debug protocol edge cases
- Focus on Gemini-specific features

### 3. **Maintenance** 🔄
- Protocol updates handled by maintainers
- Bug fixes from community
- Schema validation via Zod

### 4. **Features** 🚀
- Runtime type validation
- Proper error handling
- Stream management
- Terminal support built-in

---

## Migration Strategy

### Step 1: Update Phase 1 Types (Optional)
We can keep our types OR switch to SDK types:

**Option A: Keep ours** (simpler)
- Our types work fine
- No migration needed
- Can coexist with SDK

**Option B: Use SDK types** (more correct)
```typescript
import type * as acp from '@agentclientprotocol/sdk';

// Use SDK types everywhere
type SessionNotification = acp.SessionNotification;
type Client = acp.Client;
```

**Recommendation**: Keep Phase 1 types, reference SDK types where needed.

### Step 2: Update Client Interface (Phase 2)
Minor naming change:
```typescript
// Change
sessionNotification(args: SessionNotification): Promise<void>;

// To
sessionUpdate(args: SessionNotification): Promise<void>;
```

### Step 3: Replace Phases 3-4 with SDK
Instead of implementing JSONRPC handler and ClientSideConnection:
```typescript
import { ClientSideConnection, ndJsonStream } from '@agentclientprotocol/sdk';

// Use SDK's ClientSideConnection directly in AcpAgentHarness
```

### Step 4: Update Test Files
- Update Phase 1/2 tests to use SDK types where applicable
- Add integration tests with actual SDK

---

## Risks & Mitigations

### Risk 1: SDK API Changes
**Likelihood**: Low (stable 0.5.x, backed by Zed)
**Mitigation**: Pin to specific version `@agentclientprotocol/sdk@0.5.1`

### Risk 2: Missing Features
**Likelihood**: Low (SDK is complete)
**Mitigation**: Can extend with custom wrapper if needed

### Risk 3: Bundle Size
**Impact**: +29KB (zod dependency)
**Mitigation**: Acceptable for server-side usage

---

## Recommendation Summary

### ✅ DO
1. Install `@agentclientprotocol/sdk@0.5.1`
2. Use `ClientSideConnection` for all JSONRPC communication
3. Implement `Client` interface from SDK
4. Use `ndJsonStream` for stdio handling
5. Keep our normalization/session management (Gemini-specific)

### ❌ DON'T
1. Implement custom JSONRPC handler (Phase 3)
2. Implement custom ClientSideConnection (Phase 4)
3. Duplicate stream utilities

### 📝 Update
1. Mark i-3zq6 (Phase 3) as **closed** (won't implement)
2. Mark i-2njc (Phase 4) as **closed** (won't implement)
3. Update remaining issues to use SDK

---

## Estimated Time Savings

| Original Plan | With SDK | Savings |
|---------------|----------|---------|
| 7-9 days (Phases 1-6) | 2-3 days (Phases 1-2, 5-6) | **~5-6 days** |

**New Total Timeline**:
- ✅ Phase 1: Types - Done
- ✅ Phase 2: Client - Done (minor updates)
- ❌ Phase 3: Skip (use SDK)
- ❌ Phase 4: Skip (use SDK)
- Phase 5: Event Helpers - 1 day
- Phase 6: Testing - 1 day
- **Total: ~2 days remaining** (vs 7-9 original)

---

## Next Steps

1. Update i-3zq6 and i-2njc issues to reference SDK usage
2. Create new issue for SDK integration
3. Update Phase 5 (Event Helpers) to work with SDK types
4. Proceed with Gemini implementation phases
