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

  describe("MCP configuration", () => {
    it("includes single MCP config as JSON string", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        mcpConfig: {
          mcpServers: {
            filesystem: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-filesystem"],
            },
          },
        },
      });

      expect(config.args.includes("--mcp-config")).toBeTruthy();
      const mcpConfigIdx = config.args.indexOf("--mcp-config");
      const mcpConfigJson = config.args[mcpConfigIdx + 1];
      expect(JSON.parse(mcpConfigJson)).toEqual({
        mcpServers: {
          filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
          },
        },
      });
    });

    it("includes multiple MCP configs", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        mcpConfig: [
          {
            mcpServers: {
              filesystem: { command: "npx", args: ["-y", "filesystem"] },
            },
          },
          {
            mcpServers: {
              git: { command: "npx", args: ["-y", "git"] },
            },
          },
        ],
      });

      const mcpConfigCount = config.args.filter((arg) => arg === "--mcp-config").length;
      expect(mcpConfigCount).toBe(2);
    });

    it("includes MCP config file path as-is", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        mcpConfig: "/path/to/mcp-config.json",
      });

      expect(config.args.includes("--mcp-config")).toBeTruthy();
      expect(config.args.includes("/path/to/mcp-config.json")).toBeTruthy();
    });

    it("includes --strict-mcp-config flag when enabled", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        strictMcpConfig: true,
      });

      expect(config.args.includes("--strict-mcp-config")).toBeTruthy();
    });
  });

  describe("Plugin configuration", () => {
    it("includes single plugin directory", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        pluginDir: "./my-plugins",
      });

      expect(config.args.includes("--plugin-dir")).toBeTruthy();
      expect(config.args.includes("./my-plugins")).toBeTruthy();
    });

    it("includes multiple plugin directories", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        pluginDir: ["./plugins1", "./plugins2"],
      });

      const pluginDirCount = config.args.filter((arg) => arg === "--plugin-dir").length;
      expect(pluginDirCount).toBe(2);
      expect(config.args.includes("./plugins1")).toBeTruthy();
      expect(config.args.includes("./plugins2")).toBeTruthy();
    });
  });

  describe("Tool configuration", () => {
    it("includes --tools flag with string", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        tools: "default",
      });

      expect(config.args.includes("--tools")).toBeTruthy();
      expect(config.args.includes("default")).toBeTruthy();
    });

    it("includes --tools flag with array (comma-separated)", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        tools: ["Bash", "Edit", "Read"],
      });

      expect(config.args.includes("--tools")).toBeTruthy();
      expect(config.args.includes("Bash,Edit,Read")).toBeTruthy();
    });

    it("includes --tools flag with empty string to disable all", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        tools: "",
      });

      expect(config.args.includes("--tools")).toBeTruthy();
      const toolsIdx = config.args.indexOf("--tools");
      expect(config.args[toolsIdx + 1]).toBe("");
    });

    it("includes --allowed-tools flag with single tool", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        allowedTools: "Bash(git:*)",
      });

      expect(config.args.includes("--allowed-tools")).toBeTruthy();
      expect(config.args.includes("Bash(git:*)")).toBeTruthy();
    });

    it("includes --allowed-tools flag with multiple tools", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        allowedTools: ["Bash(git:*)", "Edit", "Read"],
      });

      expect(config.args.includes("--allowed-tools")).toBeTruthy();
      expect(config.args.includes("Bash(git:*)")).toBeTruthy();
      expect(config.args.includes("Edit")).toBeTruthy();
      expect(config.args.includes("Read")).toBeTruthy();
    });

    it("includes --disallowed-tools flag with single tool", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        disallowedTools: "Bash(rm:*)",
      });

      expect(config.args.includes("--disallowed-tools")).toBeTruthy();
      expect(config.args.includes("Bash(rm:*)")).toBeTruthy();
    });

    it("includes --disallowed-tools flag with multiple tools", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        disallowedTools: ["Bash(rm:*)", "Write"],
      });

      expect(config.args.includes("--disallowed-tools")).toBeTruthy();
      expect(config.args.includes("Bash(rm:*)")).toBeTruthy();
      expect(config.args.includes("Write")).toBeTruthy();
    });
  });

  describe("Complete configuration", () => {
    it("builds config with all new options together", () => {
      const config = buildClaudeConfig({
        workDir: "/test/dir",
        print: true,
        outputFormat: "stream-json",
        mcpConfig: {
          mcpServers: {
            filesystem: { command: "npx", args: ["-y", "filesystem"] },
          },
        },
        strictMcpConfig: true,
        pluginDir: ["./plugins1", "./plugins2"],
        tools: ["Bash", "Edit", "Read"],
        allowedTools: ["Bash(git:*)"],
        disallowedTools: ["Bash(rm:*)"],
      });

      expect(config.args.includes("--print")).toBeTruthy();
      expect(config.args.includes("--output-format")).toBeTruthy();
      expect(config.args.includes("--mcp-config")).toBeTruthy();
      expect(config.args.includes("--strict-mcp-config")).toBeTruthy();
      expect(config.args.filter((arg) => arg === "--plugin-dir").length).toBe(2);
      expect(config.args.includes("--tools")).toBeTruthy();
      expect(config.args.includes("--allowed-tools")).toBeTruthy();
      expect(config.args.includes("--disallowed-tools")).toBeTruthy();
    });
  });
});
