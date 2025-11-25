/**
 * Codex Normalizer Tests
 *
 * Tests for the Codex executor's normalizeOutput method.
 * Verifies proper parsing of Codex JSONL events and session ID capture.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CodexExecutor } from "@/agents/codex/executor";
import type { OutputChunk } from "@/agents/types/agent-executor";
import type { NormalizedEntry } from "@/agents/types/agent-executor";

/**
 * Helper to create output chunks from lines
 */
function createOutputChunks(lines: string[]): AsyncIterable<OutputChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const line of lines) {
        yield {
          type: "stdout",
          data: Buffer.from(line + "\n"),
          timestamp: new Date(),
        };
      }
    },
  };
}

/**
 * Helper to collect all normalized entries
 */
async function collectEntries(
  executor: CodexExecutor,
  lines: string[]
): Promise<NormalizedEntry[]> {
  const chunks = createOutputChunks(lines);
  const entries: NormalizedEntry[] = [];

  for await (const entry of executor.normalizeOutput(chunks, "/test/dir")) {
    entries.push(entry);
  }

  return entries;
}

describe("CodexExecutor normalizeOutput", () => {
  let executor: CodexExecutor;
  const workDir = "/test/project";

  beforeEach(() => {
    executor = new CodexExecutor({
      workDir,
      model: "gpt-5-codex",
    });
  });

  describe("Session ID Capture", () => {
    it("should capture session ID from thread.started event", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"019abc89-3427-7430-8b7a-cfb71f76b76d"}',
      ];

      const entries = await collectEntries(executor, lines);

      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe("system_message");
      expect(entries[0].content).toContain(
        "Session: 019abc89-3427-7430-8b7a-cfb71f76b76d"
      );
      expect(entries[0].metadata?.sessionId).toBe(
        "019abc89-3427-7430-8b7a-cfb71f76b76d"
      );
    });

    it("should include model in system message metadata", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"test-session-123"}',
      ];

      const entries = await collectEntries(executor, lines);

      expect(entries[0].metadata?.model).toBe("gpt-5-codex");
      expect(entries[0].content).toContain("Model: gpt-5-codex");
    });

    it("should propagate session ID to subsequent entries", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"sess-abc-123"}',
        '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Hello!"}}',
      ];

      const entries = await collectEntries(executor, lines);

      expect(entries).toHaveLength(2);
      expect(entries[0].metadata?.sessionId).toBe("sess-abc-123");
      expect(entries[1].metadata?.sessionId).toBe("sess-abc-123");
    });
  });

  describe("Event Type Parsing", () => {
    it("should parse thread.started as system_message", async () => {
      const lines = ['{"type":"thread.started","thread_id":"test-session"}'];

      const entries = await collectEntries(executor, lines);

      expect(entries[0].type.kind).toBe("system_message");
    });

    it("should skip turn.started events (no output)", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"test-session"}',
        '{"type":"turn.started"}',
      ];

      const entries = await collectEntries(executor, lines);

      // Should only have thread.started entry
      expect(entries).toHaveLength(1);
      expect(entries[0].type.kind).toBe("system_message");
    });

    it("should parse agent_message as assistant_message", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"test-session"}',
        '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"The answer is 4"}}',
      ];

      const entries = await collectEntries(executor, lines);

      expect(entries).toHaveLength(2);
      expect(entries[1].type.kind).toBe("assistant_message");
      expect(entries[1].content).toBe("The answer is 4");
    });

    it("should parse reasoning as thinking", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"test-session"}',
        '{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"Let me think about this..."}}',
      ];

      const entries = await collectEntries(executor, lines);

      expect(entries).toHaveLength(2);
      expect(entries[1].type.kind).toBe("thinking");
      if (entries[1].type.kind === "thinking") {
        expect(entries[1].type.reasoning).toBe("Let me think about this...");
      }
      expect(entries[1].content).toBe("Let me think about this...");
    });

    it("should skip turn.completed events (no output)", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"test-session"}',
        '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Done"}}',
        '{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":10}}',
      ];

      const entries = await collectEntries(executor, lines);

      // Should only have thread.started and agent_message
      expect(entries).toHaveLength(2);
    });

    it("should skip item.completed without text", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"test-session"}',
        '{"type":"item.completed","item":{"id":"item_0","type":"agent_message"}}',
      ];

      const entries = await collectEntries(executor, lines);

      // Should only have thread.started (agent_message has no text)
      expect(entries).toHaveLength(1);
    });
  });

  describe("Full Conversation Flow", () => {
    it("should parse a complete Codex conversation", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"019abc89-3427-7430-8b7a-cfb71f76b76d"}',
        '{"type":"turn.started"}',
        '{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"**Providing concise answers only**"}}',
        '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"4"}}',
        '{"type":"turn.completed","usage":{"input_tokens":7698,"cached_input_tokens":3072,"output_tokens":7}}',
      ];

      const entries = await collectEntries(executor, lines);

      // Should have: system_message, thinking, assistant_message
      expect(entries).toHaveLength(3);

      // First entry: system message with session ID
      expect(entries[0].type.kind).toBe("system_message");
      expect(entries[0].metadata?.sessionId).toBe(
        "019abc89-3427-7430-8b7a-cfb71f76b76d"
      );

      // Second entry: thinking/reasoning
      expect(entries[1].type.kind).toBe("thinking");
      expect(entries[1].content).toBe("**Providing concise answers only**");
      expect(entries[1].metadata?.sessionId).toBe(
        "019abc89-3427-7430-8b7a-cfb71f76b76d"
      );

      // Third entry: assistant message
      expect(entries[2].type.kind).toBe("assistant_message");
      expect(entries[2].content).toBe("4");
      expect(entries[2].metadata?.sessionId).toBe(
        "019abc89-3427-7430-8b7a-cfb71f76b76d"
      );
    });
  });

  describe("Non-JSON Input Handling", () => {
    it("should handle non-JSON lines as assistant_message", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"test-session"}',
        "This is plain text output",
      ];

      const entries = await collectEntries(executor, lines);

      expect(entries).toHaveLength(2);
      expect(entries[1].type.kind).toBe("assistant_message");
      expect(entries[1].content).toBe("This is plain text output");
      expect(entries[1].metadata?.sessionId).toBe("test-session");
    });

    it("should handle unknown event types", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"test-session"}',
        '{"type":"unknown.event","data":"something"}',
      ];

      const entries = await collectEntries(executor, lines);

      expect(entries).toHaveLength(2);
      expect(entries[1].type.kind).toBe("assistant_message");
      // Unknown events are JSON stringified
      expect(entries[1].content).toContain("unknown.event");
    });
  });

  describe("Metadata Consistency", () => {
    it("should use camelCase sessionId in metadata (not snake_case)", async () => {
      const lines = [
        '{"type":"thread.started","thread_id":"test-session-123"}',
        '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Test"}}',
      ];

      const entries = await collectEntries(executor, lines);

      // Verify camelCase is used in metadata
      for (const entry of entries) {
        if (entry.metadata) {
          expect(entry.metadata).toHaveProperty("sessionId");
          expect(entry.metadata).not.toHaveProperty("session_id");
          expect(entry.metadata).not.toHaveProperty("thread_id");
        }
      }
    });
  });

  describe("Capabilities", () => {
    it("should report supportsSessionResume as true", () => {
      const capabilities = executor.getCapabilities();
      expect(capabilities.supportsSessionResume).toBe(true);
    });

    it("should report protocol as jsonl", () => {
      const capabilities = executor.getCapabilities();
      expect(capabilities.protocol).toBe("jsonl");
    });
  });
});
