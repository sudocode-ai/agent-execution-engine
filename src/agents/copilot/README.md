
# GitHub Copilot CLI

The `CopilotExecutor` provides integration with GitHub Copilot CLI, handling its plain text streaming protocol and session management.

**Setup Requirements:**

Before using the Copilot executor, authenticate with GitHub:

```bash
# Install and authenticate
npx -y @github/copilot

# In the CLI prompt:
/login
# Follow the GitHub authentication flow
```

**Basic Usage:**

```typescript
import { CopilotExecutor } from 'agent-execution-engine/agents/copilot';

const executor = new CopilotExecutor({
  workDir: '/path/to/project',
  model: 'gpt-4o',
  allowAllTools: true,
});

// Execute a task
const task = {
  id: 'read-file',
  type: 'custom',
  prompt: 'Read the file README.md and summarize it',
  workDir: '/path/to/project',
  config: {},
};

const result = await executor.executeTask(task);

// Process normalized output
for await (const entry of executor.normalizeOutput(
  result.process.streams!.stdout,
  task.workDir
)) {
  console.log('Content:', entry.content);
}
```

**Features:**

- **Plain Text Streaming**: Processes Copilot's plain text output with ANSI escape code stripping
- **Session Resumption**: Resume conversations using session IDs from log files
- **MCP Support**: Native Model Context Protocol integration via `~/.copilot/mcp-config.json`
- **Tool Permissions**: Fine-grained control with `allowAllTools`, `allowTool`, `denyTool`
- **Model Selection**: Choose between GPT models (`gpt-4o`, `gpt-4`, etc.)
- **Multi-Directory Support**: Add additional directories to context with `addDir`

**Configuration Options:**

```typescript
interface CopilotConfig {
  workDir: string;                    // Working directory (required)
  model?: string;                     // Model to use (e.g., 'gpt-4o')
  allowAllTools?: boolean;            // Allow all tools without prompts
  allowTool?: string;                 // Comma-separated allowed tools
  denyTool?: string;                  // Comma-separated denied tools
  addDir?: string[];                  // Additional directories for context
  disableMcpServer?: string[];        // MCP servers to disable
  systemPrompt?: string;              // System prompt prefix
  executablePath?: string;            // Custom copilot path (default: 'npx')
  env?: Record<string, string>;       // Environment variables
  timeout?: number;                   // Task timeout in milliseconds
}
```

**Session Resumption:**

```typescript
// Execute initial task
const result = await executor.executeTask(task);

// Copilot emits session ID in output stream
let sessionId: string | undefined;
for await (const entry of executor.normalizeOutput(
  result.process.streams!.stdout,
  task.workDir
)) {
  if (entry.type.kind === 'system_message' && entry.content.includes('Session ID')) {
    // Extract session ID from system message
    const match = entry.content.match(/Session ID: ([a-f0-9-]+)/);
    if (match) sessionId = match[1];
  }
}

// Resume the session
if (sessionId) {
  const resumeResult = await executor.resumeTask(
    {
      ...task,
      prompt: 'Now modify that file to add error handling',
    },
    sessionId
  );
}
```

**Limitations:**

- **No Structured Logs**: Copilot outputs plain text, not JSON/JSONL
- **No Tool Call Tracking**: Cannot track individual tool calls like other agents
- **Session ID Polling**: Session discovery requires polling log directory (200ms intervals)
- **MCP Configuration**: Requires `~/.copilot/mcp-config.json` for MCP servers