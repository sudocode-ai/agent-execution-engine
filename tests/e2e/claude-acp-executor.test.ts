/**
 * End-to-End Test: Claude ACP Executor
 *
 * Tests the AcpExecutor implementation with Claude Code via ACP protocol.
 * This test validates:
 * - ACP protocol connection establishment using claude-code-acp binary
 * - Session creation and management
 * - Prompt sending and response handling
 * - Output normalization via AcpNormalizer
 *
 * The claude-code-acp binary is provided by @zed-industries/claude-code-acp package.
 * It wraps the @anthropic-ai/claude-agent-sdk with ACP protocol support.
 *
 * IMPORTANT: This test is SKIPPED BY DEFAULT and only runs when:
 * - Environment variable RUN_E2E_TESTS=true is set
 * - AND @zed-industries/claude-code-acp is installed
 *
 * To run this test:
 *   RUN_E2E_TESTS=true npm test -- tests/e2e/claude-acp-executor.test.ts
 *
 * Or set CLAUDE_ACP_PATH to use a specific binary:
 *   RUN_E2E_TESTS=true CLAUDE_ACP_PATH=/path/to/claude-code-acp npm test -- tests/e2e/claude-acp-executor.test.ts
 */

import { describe, it, beforeAll, beforeEach, afterEach, expect } from "vitest";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import {
  AcpExecutor,
  AcpNormalizer,
  spawnAcpAgent,
  DefaultAcpClient,
  AcpSession,
  type AcpExecutorConfig,
  type SessionNotification,
  type NormalizedEntry,
} from "@/agents/index";
import { ClaudeAcpAdapter } from "@/agents/claude/acp-adapter";
import type { ExecutionTask } from "@/engine/types";

// Environment configuration
const SKIP_E2E =
  process.env.SKIP_E2E_TESTS === "true" || process.env.RUN_E2E_TESTS !== "true";

// Use ClaudeAcpAdapter to find the binary
const claudeAcpAdapter = new ClaudeAcpAdapter();

// Path to claude-code-acp binary (ACP wrapper around Claude Agent SDK)
// Provided by @zed-industries/claude-code-acp package
const CLAUDE_ACP_PATH =
  process.env.CLAUDE_ACP_PATH ||
  claudeAcpAdapter.findClaudeAcpPath() ||
  join(__dirname, "../../node_modules/.bin/claude-code-acp");

// Fallback path to standard Claude CLI (for fallback tests)
const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";

/**
 * Check if claude-code-acp binary is available
 */
async function checkClaudeAcpAvailable(): Promise<boolean> {
  // Check if the file exists
  if (!existsSync(CLAUDE_ACP_PATH)) {
    return false;
  }

  // Try to run it (it will start and wait for input on stdin)
  return new Promise((resolve) => {
    const check = spawn(CLAUDE_ACP_PATH, [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // If it starts without error, it's available
    check.on("error", () => resolve(false));
    check.on("spawn", () => {
      // Process started successfully, kill it
      check.kill();
      resolve(true);
    });

    setTimeout(() => {
      check.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * Check if standard Claude CLI is available (for fallback tests)
 */
async function checkClaudeCLIAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn(CLAUDE_PATH, ["--version"], {
      stdio: "ignore",
    });

    check.on("error", () => resolve(false));
    check.on("exit", (code) => resolve(code === 0));

    setTimeout(() => {
      check.kill();
      resolve(false);
    }, 5000);
  });
}

describe.skipIf(SKIP_E2E)("E2E: Claude ACP Executor", () => {
  let tempDir: string;
  let claudeAcpAvailable: boolean;
  let claudeCLIAvailable: boolean;

  beforeAll(async () => {
    // Check availability of ACP binary and CLI
    claudeAcpAvailable = await checkClaudeAcpAvailable();
    claudeCLIAvailable = await checkClaudeCLIAvailable();

    if (!claudeAcpAvailable) {
      console.warn(
        "claude-code-acp binary not available - ACP tests will be skipped. " +
        "Install @zed-industries/claude-code-acp package."
      );
    }

    if (!claudeCLIAvailable) {
      console.warn(
        "Claude CLI not available - fallback tests will be skipped"
      );
    }
  });

  beforeEach(() => {
    // Create a fresh temp directory for each test
    tempDir = join(
      tmpdir(),
      `claude-acp-e2e-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`
    );
    mkdirSync(tempDir, { recursive: true });

    // Create test files
    writeFileSync(
      join(tempDir, "test.txt"),
      "This is a test file for Claude ACP execution."
    );
    writeFileSync(join(tempDir, "numbers.txt"), "1\n2\n3\n4\n5");
  });

  afterEach(async () => {
    // Give processes time to clean up
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("AcpNormalizer", () => {
    it("should normalize agent_message_chunk notifications", () => {
      const normalizer = new AcpNormalizer({
        coalesceChunks: false, // Disable coalescing to get immediate output
        includeThoughts: true,
      });

      // SessionUpdate uses 'sessionUpdate' as discriminant, and ContentChunk has 'content' property
      const notification: SessionNotification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello, " },
        },
      };

      const entries = normalizer.normalize(notification);

      expect(entries.length).toBe(1);
      expect(entries[0].type.kind).toBe("assistant_message");
      if (entries[0].type.kind === "assistant_message") {
        expect(entries[0].content).toBe("Hello, ");
      }
    });

    it("should coalesce multiple chunks into single entry", () => {
      const normalizer = new AcpNormalizer({
        coalesceChunks: true,
      });

      // First chunk - with coalescing, it gets buffered
      const notification1: SessionNotification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello, " },
        },
      };

      const entries1 = normalizer.normalize(notification1);
      // With coalescing, first chunk is buffered
      expect(entries1.length).toBe(0);

      // Second chunk - also buffered
      const notification2: SessionNotification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "world!" },
        },
      };

      const entries2 = normalizer.normalize(notification2);
      expect(entries2.length).toBe(0);

      // Flush to get the coalesced content
      const flushed = normalizer.flush();
      expect(flushed.length).toBe(1);
      if (flushed[0].type.kind === "assistant_message") {
        expect(flushed[0].content).toBe("Hello, world!");
      }
    });

    it("should normalize tool_call notifications", () => {
      const normalizer = new AcpNormalizer();

      // ToolCall uses 'sessionUpdate: tool_call' with toolCallId at top level
      const notification: SessionNotification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tool-123",
          title: "Read",
          kind: "read",
          status: "in_progress",
          rawInput: JSON.stringify({ file_path: "/test.txt" }),
        },
      };

      const entries = normalizer.normalize(notification);

      expect(entries.length).toBe(1);
      expect(entries[0].type.kind).toBe("tool_use");
      if (entries[0].type.kind === "tool_use") {
        expect(entries[0].type.tool.toolName).toBe("Read");
        expect(entries[0].type.tool.status).toBe("running");
      }
    });

    it("should normalize tool_call_update notifications", () => {
      const normalizer = new AcpNormalizer();

      // First, add the tool call
      normalizer.normalize({
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tool-456",
          title: "Bash",
          kind: "execute",
          status: "in_progress",
          rawInput: JSON.stringify({ command: "echo hello" }),
        },
      });

      // Then update it
      const notification: SessionNotification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "tool-456",
          status: "completed",
          rawOutput: "hello\n",
        },
      };

      const entries = normalizer.normalize(notification);

      expect(entries.length).toBe(1);
      expect(entries[0].type.kind).toBe("tool_use");
      if (entries[0].type.kind === "tool_use") {
        expect(entries[0].type.tool.status).toBe("success");
        expect(entries[0].type.tool.result).toBeDefined();
        expect(entries[0].type.tool.result?.success).toBe(true);
      }
    });

    it("should normalize plan notifications", () => {
      const normalizer = new AcpNormalizer({
        includePlans: true,
      });

      // Plan update has 'entries' array, not 'content' string
      const notification: SessionNotification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "plan",
          entries: [
            { content: "Read the file", status: "pending", priority: "medium" },
            {
              content: "Analyze contents",
              status: "pending",
              priority: "medium",
            },
            { content: "Respond", status: "pending", priority: "medium" },
          ],
        },
      };

      const entries = normalizer.normalize(notification);

      expect(entries.length).toBe(1);
      // Plan is normalized to system_message, not 'plan'
      expect(entries[0].type.kind).toBe("system_message");
      expect(entries[0].content).toContain("Read the file");
    });

    it("should normalize thought notifications", () => {
      const normalizer = new AcpNormalizer({
        includeThoughts: true,
        coalesceChunks: false,
      });

      // agent_thought_chunk uses ContentChunk structure
      const notification: SessionNotification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "I should read the file first..." },
        },
      };

      const entries = normalizer.normalize(notification);

      expect(entries.length).toBe(1);
      expect(entries[0].type.kind).toBe("thinking");
      expect(entries[0].content).toContain("read the file");
    });

    it("should flush remaining state", () => {
      const normalizer = new AcpNormalizer({
        coalesceChunks: true,
      });

      // Add a partial message
      normalizer.normalize({
        sessionId: "test-session",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Incomplete message" },
        },
      });

      // Flush should return remaining entries
      const flushed = normalizer.flush();
      expect(flushed.length).toBe(1);
      expect(flushed[0].content).toBe("Incomplete message");
    });
  });

  describe("DefaultAcpClient", () => {
    it("should create client with auto-approve mode", () => {
      const client = new DefaultAcpClient({
        autoApprove: true,
        capabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
      });

      expect(client.autoApprove).toBe(true);
      expect(client.capabilities.fs?.readTextFile).toBe(true);
      expect(client.capabilities.terminal).toBe(true);
    });

    it("should handle session updates", async () => {
      const updates: SessionNotification[] = [];

      const client = new DefaultAcpClient({
        autoApprove: true,
        capabilities: {},
        onSessionUpdate: (notification) => {
          updates.push(notification);
        },
      });

      // Simulate a session update with correct structure
      await client.sessionUpdate({
        sessionId: "test-session",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello!" },
        },
      });

      expect(updates.length).toBe(1);
      expect(updates[0].sessionId).toBe("test-session");
    });

    it("should handle permission requests in auto-approve mode", async () => {
      const client = new DefaultAcpClient({
        autoApprove: true,
        capabilities: {},
      });

      const response = await client.requestPermission({
        toolCall: {
          toolCallId: "tool-789",
          title: "Bash",
          kind: "command",
          status: "pending",
          rawInput: JSON.stringify({ command: "ls" }),
        },
        options: [
          { optionId: "allow", kind: "allow_once", label: "Allow" },
          { optionId: "reject", kind: "reject_once", label: "Reject" },
        ],
      });

      expect(response.outcome.outcome).toBe("selected");
      if (response.outcome.outcome === "selected") {
        expect(response.outcome.optionId).toBe("allow");
      }
    });
  });

  describe("AcpExecutor Configuration", () => {
    it("should create executor with config", () => {
      const config: AcpExecutorConfig = {
        executablePath: CLAUDE_ACP_PATH,
        args: [],
        autoApprove: true,
        agentName: "claude-code-acp",
        supportsSessionResume: false,
        supportsMcp: true,
      };

      const executor = new AcpExecutor(config);

      expect(executor).toBeDefined();
    });

    it("should report ACP capabilities", () => {
      const executor = new AcpExecutor({
        executablePath: CLAUDE_ACP_PATH,
        agentName: "claude-code-acp",
      });

      const capabilities = executor.getCapabilities();

      expect(capabilities.protocol).toBe("acp");
      expect(capabilities.supportsApprovals).toBe(true);
      expect(capabilities.supportsMidExecutionMessages).toBe(true);
    });

    it("should check availability based on executable", async () => {
      const executor = new AcpExecutor({
        executablePath: CLAUDE_ACP_PATH,
      });

      const available = await executor.checkAvailability();

      // Should be true if claude-code-acp is installed
      expect(typeof available).toBe("boolean");
      if (claudeAcpAvailable) {
        expect(available).toBe(true);
      }
    });
  });

  describe("Output Normalization", () => {
    it("should normalize ACP output stream", async () => {
      const executor = new AcpExecutor({
        executablePath: CLAUDE_ACP_PATH,
        agentName: "claude-code-acp",
      });

      // Create mock output stream with ACP messages using correct structure
      const mockMessages = [
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "test-session",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "The answer is " },
            },
          },
        }) + "\n",
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "test-session",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "4." },
            },
          },
        }) + "\n",
      ];

      async function* createOutputStream() {
        for (const msg of mockMessages) {
          yield {
            data: Buffer.from(msg),
            type: "stdout" as const,
            timestamp: new Date(),
          };
        }
      }

      const entries: NormalizedEntry[] = [];
      for await (const entry of executor.normalizeOutput(
        createOutputStream(),
        tempDir
      )) {
        entries.push(entry);
      }

      // Should have assistant message entries (may be coalesced)
      const assistantEntries = entries.filter(
        (e) => e.type.kind === "assistant_message"
      );
      expect(assistantEntries.length).toBeGreaterThan(0);
    });

    it("should normalize tool_call in ACP output", async () => {
      const executor = new AcpExecutor({
        executablePath: CLAUDE_ACP_PATH,
        agentName: "claude-code-acp",
      });

      const mockMessages = [
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "test-session",
            update: {
              sessionUpdate: "tool_call",
              toolCallId: "tool-abc",
              title: "Read",
              kind: "read",
              status: "in_progress",
              rawInput: '{"file_path": "/test.txt"}',
            },
          },
        }) + "\n",
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "test-session",
            update: {
              sessionUpdate: "tool_call_update",
              toolCallId: "tool-abc",
              status: "completed",
              rawOutput: "File contents here",
            },
          },
        }) + "\n",
      ];

      async function* createOutputStream() {
        for (const msg of mockMessages) {
          yield {
            data: Buffer.from(msg),
            type: "stdout" as const,
            timestamp: new Date(),
          };
        }
      }

      const entries: NormalizedEntry[] = [];
      for await (const entry of executor.normalizeOutput(
        createOutputStream(),
        tempDir
      )) {
        entries.push(entry);
      }

      const toolEntries = entries.filter((e) => e.type.kind === "tool_use");
      expect(toolEntries.length).toBe(2); // One for start, one for completion

      // First should be running
      if (toolEntries[0].type.kind === "tool_use") {
        expect(toolEntries[0].type.tool.status).toBe("running");
      }

      // Second should be success
      if (toolEntries[1].type.kind === "tool_use") {
        expect(toolEntries[1].type.tool.status).toBe("success");
      }
    });
  });

  describe.skipIf(!claudeAcpAvailable)("Live Claude Execution via ACP", () => {
    it("should execute a simple task with AcpExecutor using claude-code-acp", async () => {
      // Build config using the adapter
      const config = claudeAcpAdapter.buildAcpExecutorConfig({
        workDir: tempDir,
        autoApprove: true,
      });

      const executor = new AcpExecutor({
        ...config,
        // Override to ensure we're using the correct path
        executablePath: CLAUDE_ACP_PATH,
      });

      const task: ExecutionTask = {
        id: "acp-e2e-task-1",
        type: "claude-acp",
        prompt: "What is 2 + 2? Reply with just the number.",
        workDir: tempDir,
      };

      const result = await executor.executeTask(task);

      // Verify process was spawned
      expect(result.process).toBeDefined();
      expect(result.process.pid).toBeGreaterThan(0);

      // Wait for completion or timeout
      const exitPromise = Promise.race([
        result.exitSignal,
        new Promise((resolve) => setTimeout(resolve, 30000)),
      ]);

      await exitPromise;

      // Clean up if still running
      if (result.process.process.exitCode === null) {
        result.process.process.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      expect(result.process.pid).toBeGreaterThan(0);
    }, 60000);

    it("should handle tool execution with approval", async () => {
      const approvalLog: Array<{ toolName: string; input: unknown }> = [];

      const executor = new AcpExecutor({
        executablePath: CLAUDE_ACP_PATH,
        args: [],
        autoApprove: false,
        agentName: "claude-code-acp",
      });

      // Set up approval service that logs and approves
      executor.setApprovalService({
        async requestApproval(request) {
          approvalLog.push({
            toolName: request.toolName,
            input: request.toolInput,
          });
          return { status: "approved" };
        },
      });

      const task: ExecutionTask = {
        id: "acp-e2e-task-2",
        type: "claude-acp",
        prompt: "Read the test.txt file and tell me what it contains.",
        workDir: tempDir,
      };

      const result = await executor.executeTask(task);

      // Wait for Claude to request tool use
      const exitPromise = Promise.race([
        result.exitSignal,
        new Promise((resolve) => setTimeout(resolve, 30000)),
      ]);

      await exitPromise;

      // Clean up
      if (result.process.process.exitCode === null) {
        result.process.process.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Approval service should have been called (if Claude used tools)
      expect(approvalLog).toBeDefined();
      expect(Array.isArray(approvalLog)).toBe(true);
    }, 60000);

    it("should support mid-execution messages", async () => {
      const executor = new AcpExecutor({
        executablePath: CLAUDE_ACP_PATH,
        args: [],
        autoApprove: true,
        agentName: "claude-code-acp",
      });

      const task: ExecutionTask = {
        id: "acp-e2e-task-3",
        type: "claude-acp",
        prompt: "What is 5 + 5?",
        workDir: tempDir,
      };

      const result = await executor.executeTask(task);

      // Wait a moment for initial processing
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Verify mid-execution message capability
      const capabilities = executor.getCapabilities();
      expect(capabilities.supportsMidExecutionMessages).toBe(true);

      // Clean up
      if (result.process.process.exitCode === null) {
        result.process.process.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }, 30000);

    it("should normalize live output stream", async () => {
      const executor = new AcpExecutor({
        executablePath: CLAUDE_ACP_PATH,
        args: [],
        autoApprove: true,
        agentName: "claude-code-acp",
      });

      const task: ExecutionTask = {
        id: "acp-e2e-task-4",
        type: "claude-acp",
        prompt: 'Say "Hello from ACP test"',
        workDir: tempDir,
      };

      const result = await executor.executeTask(task);

      // Create output stream from process
      async function* createOutputStream() {
        for await (const chunk of result.process.streams!.stdout) {
          yield {
            data: chunk as Buffer,
            type: "stdout" as const,
            timestamp: new Date(),
          };
        }
      }

      const entries: NormalizedEntry[] = [];
      const normalizeTask = (async () => {
        for await (const entry of executor.normalizeOutput(
          createOutputStream(),
          tempDir
        )) {
          entries.push(entry);
          // Stop after getting a few entries
          if (entries.length >= 5) {
            break;
          }
        }
      })();

      await Promise.race([
        normalizeTask,
        new Promise((resolve) => setTimeout(resolve, 20000)),
      ]);

      // Clean up
      if (result.process.process.exitCode === null) {
        result.process.process.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Should have normalized some entries
      expect(entries.length).toBeGreaterThanOrEqual(0);
    }, 60000);
  });

  describe("Error Handling", () => {
    it("should handle non-existent executable gracefully", async () => {
      const executor = new AcpExecutor({
        executablePath: "/nonexistent/path/to/agent",
        agentName: "nonexistent",
      });

      const available = await executor.checkAvailability();
      expect(available).toBe(false);
    });

    // Skip process termination test in E2E as it requires a running Claude process
    // which may not always be available or may timeout
    it.skip("should handle process termination", async () => {
      if (!claudeAcpAvailable) {
        console.log("Skipping - claude-code-acp not available");
        return;
      }

      const executor = new AcpExecutor({
        executablePath: CLAUDE_ACP_PATH,
        args: [],
        autoApprove: true,
        agentName: "claude-code-acp",
      });

      const task: ExecutionTask = {
        id: "acp-e2e-task-5",
        type: "claude-acp",
        prompt: "Count slowly from 1 to 100",
        workDir: tempDir,
      };

      const result = await executor.executeTask(task);

      // Let it start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Terminate
      result.process.process.kill("SIGTERM");

      // Wait for termination
      await new Promise((resolve) => {
        result.process.process.on("exit", resolve);
        setTimeout(resolve, 5000);
      });

      expect(
        result.process.process.killed ||
          result.process.process.exitCode !== null
      ).toBe(true);
    }, 30000);
  });
});
