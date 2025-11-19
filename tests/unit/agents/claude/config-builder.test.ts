/**
 * Tests for Claude Code Configuration Builder
 *
 * Tests the buildClaudeConfig utility for creating ProcessConfig
 * specific to Claude Code CLI.
 */

import { describe, it, expect } from "vitest";
import { buildClaudeConfig } from "@/agents/claude/config-builder";

describe("buildClaudeConfig", () => {
  it("builds config with minimal options", () => {
    const config = buildClaudeConfig({
      workDir: "/test/dir",
    });

    expect(config.executablePath).toBe("claude");
    expect(config.args).toEqual([]);
    expect(config.workDir).toBe("/test/dir");
  });

  it("builds config with custom claudePath", () => {
    const config = buildClaudeConfig({
      claudePath: "/custom/path/to/claude",
      workDir: "/test/dir",
    });

    expect(config.executablePath).toBe("/custom/path/to/claude");
  });

  it("includes --print flag when enabled", () => {
    const config = buildClaudeConfig({
      workDir: "/test/dir",
      print: true,
    });

    expect(config.args.includes("--print")).toBeTruthy();
  });

  it("includes --output-format flag", () => {
    const config = buildClaudeConfig({
      workDir: "/test/dir",
      outputFormat: "stream-json",
    });

    expect(config.args.includes("--output-format")).toBeTruthy();
    expect(config.args.includes("stream-json")).toBeTruthy();
  });

  it("includes --dangerously-skip-permissions flag when enabled", () => {
    const config = buildClaudeConfig({
      workDir: "/test/dir",
      dangerouslySkipPermissions: true,
    });

    expect(config.args.includes("--dangerously-skip-permissions")).toBeTruthy();
  });

  it("includes --permission-mode flag when provided", () => {
    const config = buildClaudeConfig({
      workDir: "/test/dir",
      permissionMode: "bypassPermissions",
    });

    expect(config.args.includes("--permission-mode")).toBeTruthy();
    expect(config.args.includes("bypassPermissions")).toBeTruthy();
  });

  it("builds config with all flags together", () => {
    const config = buildClaudeConfig({
      workDir: "/test/dir",
      print: true,
      outputFormat: "stream-json",
      dangerouslySkipPermissions: true,
      permissionMode: "bypassPermissions",
    });

    expect(config.args.includes("--print")).toBeTruthy();
    expect(config.args.includes("--output-format")).toBeTruthy();
    expect(config.args.includes("stream-json")).toBeTruthy();
    expect(config.args.includes("--dangerously-skip-permissions")).toBeTruthy();
    expect(config.args.includes("--permission-mode")).toBeTruthy();
    expect(config.args.includes("bypassPermissions")).toBeTruthy();
  });

  it("passes through environment variables", () => {
    const config = buildClaudeConfig({
      workDir: "/test/dir",
      env: {
        TEST_VAR: "test_value",
      },
    });

    expect(config.env).toEqual({ TEST_VAR: "test_value" });
  });

  it("passes through timeout settings", () => {
    const config = buildClaudeConfig({
      workDir: "/test/dir",
      timeout: 5000,
      idleTimeout: 1000,
    });

    expect(config.timeout).toBe(5000);
    expect(config.idleTimeout).toBe(1000);
  });

  it("passes through retry configuration", () => {
    const config = buildClaudeConfig({
      workDir: "/test/dir",
      retry: {
        maxAttempts: 3,
        backoffMs: 1000,
      },
    });

    expect(config.retry).toEqual({
      maxAttempts: 3,
      backoffMs: 1000,
    });
  });

  it("creates valid ProcessConfig structure", () => {
    const config = buildClaudeConfig({
      claudePath: "/usr/local/bin/claude",
      workDir: "/test/dir",
      print: true,
      outputFormat: "stream-json",
      dangerouslySkipPermissions: true,
      env: { TEST: "value" },
      timeout: 10000,
    });

    // Verify structure matches ProcessConfig interface
    expect(config.executablePath).toBeTruthy();
    expect(Array.isArray(config.args)).toBeTruthy();
    expect(config.workDir).toBeTruthy();
    expect(typeof config.executablePath).toBe("string");
    expect(typeof config.workDir).toBe("string");
  });
});
