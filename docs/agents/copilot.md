# GitHub Copilot CLI Integration Guide

This guide covers everything you need to know about using the GitHub Copilot CLI executor in the agent-execution-engine framework.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation & Authentication](#installation--authentication)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Features](#features)
- [Session Management](#session-management)
- [MCP Integration](#mcp-integration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js 18+ or 20+
- npm or npx
- GitHub account with Copilot access
- `agent-execution-engine` package installed

## Installation & Authentication

### 1. Install and Authenticate

```bash
# Run Copilot CLI (downloads automatically via npx)
npx -y @github/copilot

# In the CLI prompt, authenticate
/login

# Follow the browser authentication flow
# This will create ~/.copilot/mcp-config.json
```

### 2. Verify Authentication

```bash
# Check if MCP config exists
ls ~/.copilot/mcp-config.json

# If the file exists, you're authenticated
```

### 3. Test Availability

```typescript
import { CopilotExecutor } from 'agent-execution-engine/agents/copilot';

const executor = new CopilotExecutor({
  workDir: process.cwd(),
});

const isAvailable = await executor.checkAvailability();
console.log('Copilot available:', isAvailable);
```

## Quick Start

### Basic Task Execution

```typescript
import { CopilotExecutor } from 'agent-execution-engine/agents/copilot';

// Create executor
const executor = new CopilotExecutor({
  workDir: '/path/to/project',
  model: 'gpt-4o',
  allowAllTools: true,
});

// Define task
const task = {
  id: 'read-and-summarize',
  type: 'custom',
  prompt: 'Read package.json and summarize the project dependencies',
  workDir: '/path/to/project',
  config: {},
};

// Execute
const result = await executor.executeTask(task);

// Process output
for await (const entry of executor.normalizeOutput(
  result.process.streams!.stdout,
  task.workDir
)) {
  if (entry.type.kind === 'assistant_message') {
    console.log(entry.content);
  }
}

// Clean up
if (result.process.status === 'busy') {
  result.process.process.kill('SIGTERM');
}
```

## Configuration

### Complete Configuration Interface

```typescript
interface CopilotConfig {
  // Required
  workDir: string;                    // Working directory

  // Model Selection
  model?: string;                     // 'gpt-4o', 'gpt-4', 'gpt-3.5-turbo', etc.

  // Tool Permissions
  allowAllTools?: boolean;            // Allow all tools (no approval prompts)
  allowTool?: string;                 // Comma-separated: 'bash,read_file,write_file'
  denyTool?: string;                  // Comma-separated: 'web_fetch'

  // Context Management
  addDir?: string[];                  // Additional directories for context

  // MCP Configuration
  mcpServers?: Record<string, McpServerConfig>;  // Inline MCP server definitions
  disableMcpServer?: string[];        // MCP servers to disable by name

  // Prompt Customization
  systemPrompt?: string;              // Prepended to all prompts

  // Process Configuration
  executablePath?: string;            // Custom executable (default: 'npx')
  env?: Record<string, string>;       // Environment variables
  timeout?: number;                   // Task timeout in milliseconds
}
```

### Configuration Examples

#### Minimal Configuration

```typescript
const executor = new CopilotExecutor({
  workDir: './my-project',
});
```

#### Production Configuration

```typescript
const executor = new CopilotExecutor({
  workDir: './my-project',
  model: 'gpt-4o',
  allowAllTools: true,
  addDir: ['../shared-library', '../common-utils'],
  systemPrompt: 'Use TypeScript with strict mode. Follow ESLint rules.',
  timeout: 300000, // 5 minutes
});
```

#### Restricted Permissions

```typescript
const executor = new CopilotExecutor({
  workDir: './my-project',
  allowTool: 'read_file,list_files,grep',  // Only allow read operations
  denyTool: 'bash,write_file',             // Explicitly deny writes and execution
});
```

### Configuration Validation

```typescript
import { validateCopilotConfig } from 'agent-execution-engine/agents/copilot';

const config = {
  workDir: '/path/to/project',
  allowAllTools: true,
  allowTool: 'bash',  // Ignored when allowAllTools is true
  mcpServers: {
    'my-server': {
      command: 'node',
      args: ['server.js'],
    },
  },
};

const errors = validateCopilotConfig(config);
if (errors.length > 0) {
  console.warn('Configuration issues:');
  errors.forEach(err => {
    console.warn(`- ${err.field}: ${err.message}`);
  });
}
```

**Validation checks include**:
- Tool permission conflicts
- Empty paths in `addDir`
- Empty server names in `disableMcpServer`
- MCP server validation:
  - Empty server names
  - Missing or empty command
  - Non-string arguments
  - Empty environment variable names
  - Non-string environment variable values

## Features

### Plain Text Streaming

Copilot CLI outputs plain text (not JSON). The executor automatically:

- Strips ANSI escape codes (colors, bold, etc.)
- Batches lines into paragraphs
- Emits streaming updates as content arrives

```typescript
for await (const entry of executor.normalizeOutput(outputStream, workDir)) {
  // entry.content is clean plain text
  // Progressive updates: "Line 1\n" → "Line 1\nLine 2\n" → ...
  console.log(entry.content);
}
```

### Model Selection

Copilot supports multiple GPT models:

```typescript
// GPT-4o (recommended)
const executor = new CopilotExecutor({
  workDir: './project',
  model: 'gpt-4o',
});

// GPT-4
const executor = new CopilotExecutor({
  workDir: './project',
  model: 'gpt-4',
});

// GPT-3.5 Turbo
const executor = new CopilotExecutor({
  workDir: './project',
  model: 'gpt-3.5-turbo',
});
```

### Multi-Directory Context

Add additional directories to Copilot's context:

```typescript
const executor = new CopilotExecutor({
  workDir: './main-project',
  addDir: [
    '../shared-library',
    '../common-utils',
    '/absolute/path/to/reference',
  ],
});
```

### System Prompts

Prepend instructions to every task:

```typescript
const executor = new CopilotExecutor({
  workDir: './project',
  systemPrompt: `
You are working on a TypeScript project with strict ESLint rules.
Always:
- Use TypeScript strict mode
- Add JSDoc comments to public functions
- Follow the project's code style guide
- Write unit tests for new functions
  `.trim(),
});

// When executing tasks, Copilot sees:
// "Use TypeScript with strict mode...\n\nAdd a logging utility function"
```

## Session Management

### Session ID Discovery

Copilot creates log files with UUIDs as filenames. The executor watches the log directory to discover session IDs:

```typescript
const result = await executor.executeTask(task);

// Session ID is emitted as a system message
let sessionId: string | undefined;

for await (const entry of executor.normalizeOutput(
  result.process.streams!.stdout,
  task.workDir
)) {
  if (entry.type.kind === 'system_message') {
    // Look for: "[copilot-session] 550e8400-e29b-41d4-a716-446655440000"
    const match = entry.content.match(/\[copilot-session\]\s+([a-f0-9-]+)/);
    if (match) {
      sessionId = match[1];
      console.log('Session ID:', sessionId);
    }
  }
}
```

### Session Resumption

Resume a previous conversation using the session ID:

```typescript
// Initial task
const task1 = {
  id: 'initial',
  type: 'custom',
  prompt: 'Read src/utils.ts and explain the parseConfig function',
  workDir: './project',
  config: {},
};

const result1 = await executor.executeTask(task1);

// ... collect session ID from output ...

// Resume session with follow-up task
if (sessionId) {
  const task2 = {
    id: 'followup',
    type: 'custom',
    prompt: 'Now add error handling to that function',
    workDir: './project',
    config: {},
  };

  const result2 = await executor.resumeTask(task2, sessionId);

  // Copilot remembers the previous context about parseConfig
}
```

### Session Log Files

Session logs are stored in temporary directories:

```bash
# Log directory structure
/tmp/copilot_logs_my-project_1234567890/
  ├── 550e8400-e29b-41d4-a716-446655440000.log  # Session 1
  └── 123e4567-e89b-12d3-a456-426614174000.log  # Session 2
```

The executor:
1. Creates a temp directory for each task
2. Polls the directory for `.log` files (200ms intervals)
3. Validates UUID format
4. Emits session ID as system message
5. Times out after 10 minutes if no log file appears

## MCP Integration

### Overview

Copilot CLI supports MCP (Model Context Protocol) servers through two mechanisms:

1. **Global Configuration**: `~/.copilot/mcp-config.json` (persisted across sessions)
2. **Inline Configuration**: `mcpServers` config option (session-specific, augments global config)

### Global MCP Configuration

MCP servers configured in `~/.copilot/mcp-config.json` are available to all Copilot sessions:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

### Inline MCP Configuration

Configure MCP servers programmatically for specific tasks using the `mcpServers` config option:

```typescript
const executor = new CopilotExecutor({
  workDir: './project',
  mcpServers: {
    'my-custom-server': {
      command: 'node',
      args: ['/path/to/server.js', '--port', '3000'],
      env: {
        API_KEY: 'secret',
        DEBUG: 'true',
      },
    },
    'filesystem': {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', './project'],
    },
  },
});
```

**Key Features**:
- Inline servers augment global configuration for the session
- If a server name conflicts, inline definition takes precedence
- Useful for task-specific servers or temporary configurations
- No need to modify global `~/.copilot/mcp-config.json`

### MCP Server Definition

Each MCP server is defined by:

```typescript
interface McpServerConfig {
  command: string;        // Executable (e.g., 'node', 'python', 'npx')
  args?: string[];        // Command arguments
  env?: Record<string, string>;  // Environment variables
}
```

**Examples**:

```typescript
// Node.js server
{
  command: 'node',
  args: ['/path/to/server.js'],
  env: { PORT: '3000' }
}

// Python server
{
  command: 'python',
  args: ['-m', 'my_mcp_server'],
  env: { PYTHONPATH: '/path/to/modules' }
}

// NPX package
{
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
}
```

### Combining Global and Inline Configurations

Inline MCP servers augment (not replace) global configuration:

```typescript
// Global config (~/.copilot/mcp-config.json):
// {
//   "mcpServers": {
//     "github": { "command": "npx", "args": [...] },
//     "slack": { "command": "npx", "args": [...] }
//   }
// }

const executor = new CopilotExecutor({
  workDir: './project',
  mcpServers: {
    // Add task-specific server
    'custom-api': {
      command: 'node',
      args: ['./api-server.js'],
    },
    // Override global github server for this task
    'github': {
      command: 'node',
      args: ['./custom-github-server.js'],
      env: { GITHUB_TOKEN: 'task-specific-token' },
    },
  },
});

// Result: Copilot uses these servers:
// - github: Custom override (inline config)
// - slack: Global config
// - custom-api: Inline config only
```

### Disabling MCP Servers

Disable specific servers (from global or inline config) per executor:

```typescript
const executor = new CopilotExecutor({
  workDir: './project',
  disableMcpServer: ['github', 'slack'],  // Disable these servers
});
```

This is useful for:
- Disabling slow or unreliable servers for specific tasks
- Testing without certain capabilities
- Limiting context to specific servers

### Checking MCP Availability

```typescript
const mcpConfigPath = executor.getDefaultMcpConfigPath();
console.log('MCP config:', mcpConfigPath);
// Output: /Users/yourname/.copilot/mcp-config.json

const isAvailable = await executor.checkAvailability();
// Returns true if MCP config exists and CLI is available
```

## Best Practices

### 1. Always Check Availability

```typescript
const executor = new CopilotExecutor({ workDir: './project' });

if (!(await executor.checkAvailability())) {
  console.error('Copilot CLI not available. Run: npx -y @github/copilot');
  console.error('Then authenticate with: /login');
  process.exit(1);
}
```

### 2. Use allowAllTools for Development

```typescript
// Development: No approval prompts
const devExecutor = new CopilotExecutor({
  workDir: './project',
  allowAllTools: true,
});

// Production: Restrict tools
const prodExecutor = new CopilotExecutor({
  workDir: './project',
  allowTool: 'read_file,list_files,grep',
  denyTool: 'bash,web_fetch',
});
```

### 3. Set Reasonable Timeouts

```typescript
const executor = new CopilotExecutor({
  workDir: './large-codebase',
  timeout: 600000,  // 10 minutes for complex tasks
});
```

### 4. Clean Up Processes

```typescript
const result = await executor.executeTask(task);

try {
  // Process output...
} finally {
  // Always clean up
  if (result.process.status === 'busy') {
    result.process.process.kill('SIGTERM');
  }
}
```

### 5. Handle Session ID Timeouts

```typescript
const result = await executor.executeTask(task);

const timeout = setTimeout(() => {
  console.warn('Session discovery timeout - terminating');
  if (result.process.status === 'busy') {
    result.process.process.kill('SIGTERM');
  }
}, 45000);  // 45 second timeout

try {
  for await (const entry of executor.normalizeOutput(
    result.process.streams!.stdout,
    task.workDir
  )) {
    // Process entries...
    if (entry.type.kind === 'system_message' && entry.content.includes('Session ID')) {
      clearTimeout(timeout);
    }
  }
} finally {
  clearTimeout(timeout);
}
```

### 6. Use System Prompts for Consistency

```typescript
const executor = new CopilotExecutor({
  workDir: './project',
  systemPrompt: `
Project context:
- TypeScript with strict mode
- ESLint with Airbnb config
- Jest for testing
- Follow SOLID principles
  `.trim(),
});

// All tasks will include this context
```

## Troubleshooting

### "Copilot CLI not available"

**Problem**: `checkAvailability()` returns `false`

**Solutions**:
```bash
# 1. Verify authentication
ls ~/.copilot/mcp-config.json

# 2. Re-authenticate if missing
npx -y @github/copilot
/login

# 3. Check Copilot CLI version
npx -y @github/copilot@0.0.358 --help
```

### Session ID Not Discovered

**Problem**: Process starts but no session ID appears

**Possible causes**:
1. Log directory not created
2. Copilot CLI version incompatibility
3. Permission issues with temp directory

**Debug steps**:
```typescript
const result = await executor.executeTask(task);

// Check log directory
console.log('Process env:', result.process.process.spawnargs);

// Monitor raw output
for await (const chunk of result.process.streams!.stdout) {
  console.log('RAW:', chunk.toString());
}
```

### ANSI Codes in Output

**Problem**: Seeing escape codes like `\x1b[32m` in output

**Solution**: This should not happen - the executor uses `strip-ansi`. If you see ANSI codes:

```typescript
// Verify you're using normalizeOutput
for await (const entry of executor.normalizeOutput(
  result.process.streams!.stdout,  // ✅ Correct
  task.workDir
)) {
  // entry.content is stripped
}

// Don't read raw stdout directly
for await (const chunk of result.process.streams!.stdout) {  // ❌ Wrong
  // chunk may contain ANSI codes
}
```

### Process Hangs

**Problem**: Process doesn't exit after task completion

**Solution**: Always terminate processes explicitly:

```typescript
const timeout = setTimeout(() => {
  if (result.process.status === 'busy') {
    result.process.process.kill('SIGTERM');
  }
}, 60000);

try {
  // Process output...
} finally {
  clearTimeout(timeout);
  if (result.process.status === 'busy') {
    result.process.process.kill('SIGTERM');
  }
}
```

### Tool Permission Denied

**Problem**: Copilot asks for tool approval interactively

**Solutions**:

```typescript
// Option 1: Allow all tools (development)
const executor = new CopilotExecutor({
  workDir: './project',
  allowAllTools: true,
});

// Option 2: Explicitly allow specific tools
const executor = new CopilotExecutor({
  workDir: './project',
  allowTool: 'bash,read_file,write_file,list_files,grep',
});
```

## Capabilities Reference

The Copilot executor reports these capabilities:

```typescript
const caps = executor.getCapabilities();

console.log(caps);
// {
//   supportsSessionResume: true,      // Can resume with session ID
//   requiresSetup: true,               // Needs authentication
//   supportsApprovals: false,          // No programmatic approval hooks
//   supportsMcp: true,                 // MCP server support
//   protocol: 'custom',                // Plain text protocol
// }
```

**Key differences from other executors:**

| Feature | Copilot | Claude Code | Cursor |
|---------|---------|-------------|---------|
| Output Format | Plain text | JSONL | JSONL |
| Session Resume | ✅ File-based | ✅ CLI flag | ✅ CLI flag |
| Tool Tracking | ❌ | ✅ | ✅ |
| Approval Hooks | ❌ | ✅ | ✅ |
| MCP Support | ✅ Native | ✅ Native | ❌ |

## Example Scripts

See the `examples/` directory for complete examples:

- `examples/copilot-basic.ts` - Basic task execution
- `examples/copilot-session-resume.ts` - Session resumption
- `examples/copilot-multi-directory.ts` - Multi-directory context
- `examples/copilot-with-workflow.ts` - Integration with workflow orchestrator

## Next Steps

- Review [tests/unit/agents/copilot/](../../tests/unit/agents/copilot/) for detailed usage examples
- Check [tests/e2e/copilot-executor.test.ts](../../tests/e2e/copilot-executor.test.ts) for integration tests
- Explore [src/agents/copilot/](../../src/agents/copilot/) for implementation details
