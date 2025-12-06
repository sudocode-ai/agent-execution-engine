/**
 * Claude Executor Factory Tests
 *
 * Tests for automatic executor selection with fallback logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createClaudeExecutor,
  getClaudeExecutor,
} from "@/agents/claude/executor-factory";
import { ClaudeCodeExecutor } from "@/agents/claude/executor";
import { ClaudeSDKExecutor } from "@/agents/claude/sdk-executor";

// Mock the SDK import
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

// Mock CLI availability check
const mockCliCheckAvailability = vi.fn();
vi.spyOn(ClaudeCodeExecutor.prototype, "checkAvailability").mockImplementation(
  mockCliCheckAvailability
);

describe("createClaudeExecutor", () => {
  const baseConfig = {
    workDir: "/test/project",
    dangerouslySkipPermissions: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCliCheckAvailability.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("auto mode (default)", () => {
    it("should prefer SDK when available", async () => {
      const result = await createClaudeExecutor(baseConfig);

      expect(result.type).toBe("sdk");
      expect(result.isFallback).toBe(false);
      expect(result.executor).toBeInstanceOf(ClaudeSDKExecutor);
    });

    it("should pass model config to SDK executor", async () => {
      const config = { ...baseConfig, model: "claude-opus-4-5-20251101" };
      const result = await createClaudeExecutor(config);

      expect(result.type).toBe("sdk");
      expect(result.executor).toBeInstanceOf(ClaudeSDKExecutor);
    });
  });

  describe("prefer: cli", () => {
    it("should use CLI executor when requested", async () => {
      const result = await createClaudeExecutor(baseConfig, { prefer: "cli" });

      expect(result.type).toBe("cli");
      expect(result.isFallback).toBe(false);
      expect(result.executor).toBeInstanceOf(ClaudeCodeExecutor);
    });

    it("should throw if CLI not available", async () => {
      mockCliCheckAvailability.mockResolvedValue(false);

      await expect(
        createClaudeExecutor(baseConfig, { prefer: "cli" })
      ).rejects.toThrow("Claude CLI not available");
    });
  });

  describe("prefer: sdk", () => {
    it("should use SDK executor when requested", async () => {
      const result = await createClaudeExecutor(baseConfig, { prefer: "sdk" });

      expect(result.type).toBe("sdk");
      expect(result.isFallback).toBe(false);
      expect(result.executor).toBeInstanceOf(ClaudeSDKExecutor);
    });
  });

  describe("verbose mode", () => {
    it("should log selection when verbose is true", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await createClaudeExecutor(baseConfig, { verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[claude-executor]")
      );

      consoleSpy.mockRestore();
    });

    it("should not log when verbose is false", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await createClaudeExecutor(baseConfig, { verbose: false });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

describe("getClaudeExecutor", () => {
  const baseConfig = {
    workDir: "/test/project",
  };

  it("should return SDK executor when type is sdk", () => {
    const executor = getClaudeExecutor(baseConfig, "sdk");
    expect(executor).toBeInstanceOf(ClaudeSDKExecutor);
  });

  it("should return CLI executor when type is cli", () => {
    const executor = getClaudeExecutor(baseConfig, "cli");
    expect(executor).toBeInstanceOf(ClaudeCodeExecutor);
  });

  it("should pass model to SDK executor", () => {
    const config = { ...baseConfig, model: "claude-sonnet-4-20250514" };
    const executor = getClaudeExecutor(config, "sdk");
    expect(executor).toBeInstanceOf(ClaudeSDKExecutor);
  });
});
