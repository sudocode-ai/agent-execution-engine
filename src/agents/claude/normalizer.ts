/**
 * Claude Output Normalizer
 *
 * Converts Claude stream-json messages to normalized entries for UI rendering.
 *
 * @module agents/claude/normalizer
 */

import path from "path";
import type {
  ClaudeStreamMessage,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolUseMessage,
  ResultMessage,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
  TextBlock,
} from "./types/messages.js";
import type {
  NormalizedEntry,
  ActionType,
  ToolUseEntry,
  ErrorEntry,
} from "../types/agent-executor.js";

/**
 * Tool use tracking info stored in the map
 */
interface ToolUseInfo {
  /** Entry index for this tool use */
  entryIndex: number;
  /** Tool name */
  toolName: string;
}

/**
 * Normalizer state for tracking streaming and tool uses
 */
interface NormalizerState {
  /** Current entry index */
  index: number;
  /** Active assistant message being coalesced */
  activeMessage: { index: number; content: string } | null;
  /** Map of tool_use_id to tool info (entry index and name) */
  toolUseMap: Map<string, ToolUseInfo>;
  /** Session ID captured from system message */
  sessionId: string | null;
  /** Model captured from system message */
  model: string | null;
}

/**
 * Create initial normalizer state
 */
export function createNormalizerState(): NormalizerState {
  return {
    index: 0,
    activeMessage: null,
    toolUseMap: new Map(),
    sessionId: null,
    model: null,
  };
}

/**
 * Normalize a single Claude stream-json message
 *
 * @param message - Stream-json message from Claude
 * @param workDir - Working directory for path relativization
 * @param state - Normalizer state (modified in place)
 * @returns Normalized entry, or null if message should be skipped
 */
export function normalizeMessage(
  message: ClaudeStreamMessage,
  workDir: string,
  state: NormalizerState
): NormalizedEntry | null {
  switch (message.type) {
    case "system":
      return createSystemMessage(message, state);

    case "user":
      return createUserMessage(message, state);

    case "assistant":
      return handleAssistantMessage(message, workDir, state);

    case "tool_use":
      return handleToolUseMessage(message, workDir, state);

    case "result":
      return handleResultMessage(message, workDir, state);

    case "control_request":
    case "control_response":
      // Control protocol messages are not displayed
      return null;

    default:
      // Exhaustiveness check
      const _exhaustive: never = message;
      return null;
  }
}

/**
 * Create system message entry
 */
function createSystemMessage(
  message: SystemMessage,
  state: NormalizerState
): NormalizedEntry {
  // Handle both snake_case (from CLI) and camelCase (for backwards compatibility)
  const sessionId = message.session_id || message.sessionId;

  // Capture session ID and model for all subsequent messages
  state.sessionId = sessionId || null;
  state.model = message.model || null;

  return {
    index: state.index++,
    timestamp: new Date(),
    type: { kind: "system_message" },
    content: `Session: ${sessionId || "unknown"}${
      message.model ? `, Model: ${message.model}` : ""
    }`,
    metadata: {
      sessionId: sessionId,
      model: message.model,
    },
  };
}

/**
 * Handle user message
 *
 * User messages can contain:
 * - Regular text content (user input)
 * - Tool result blocks (tool execution results being fed back to Claude)
 *
 * When a tool_result block is found, we emit a tool completion entry instead
 * of a user_message entry, since the tool result is what's interesting for the UI.
 */
function createUserMessage(
  message: UserMessage,
  state: NormalizerState
): NormalizedEntry | null {
  // Close any active assistant message
  state.activeMessage = null;

  // Check if this is a tool result message
  if (typeof message.message.content !== "string") {
    const toolResultBlocks = message.message.content.filter(
      (block): block is ToolResultBlock => block.type === "tool_result"
    );

    // If we have tool result blocks, emit tool completion entries
    if (toolResultBlocks.length > 0) {
      // Handle first tool result (most common case)
      const toolResult = toolResultBlocks[0];
      const toolInfo = state.toolUseMap.get(toolResult.tool_use_id);

      if (toolInfo) {
        // Extract result content
        // Handle both string content and array of TextBlock objects
        const resultContent =
          typeof toolResult.content === "string"
            ? toolResult.content
            : toolResult.content
                .filter((block): block is TextBlock => block.type === "text")
                .map((block) => block.text)
                .join("");

        // Parse the result to determine success/failure
        const { status, result } = parseToolResultContent(
          resultContent,
          toolResult.is_error
        );

        return {
          index: toolInfo.entryIndex, // Same index as the original tool_use entry
          timestamp: new Date(),
          type: {
            kind: "tool_use",
            tool: {
              toolName: toolInfo.toolName,
              action: {
                kind: "tool",
                toolName: toolInfo.toolName,
                result: resultContent,
              },
              status,
              result,
            },
          },
          content: formatToolResultContent(toolInfo.toolName, resultContent),
          metadata: state.sessionId
            ? { sessionId: state.sessionId, model: state.model }
            : undefined,
        };
      }

      // No matching tool found - skip this message
      return null;
    }
  }

  // Regular user message - extract text content
  const content =
    typeof message.message.content === "string"
      ? message.message.content
      : message.message.content
          .filter((block): block is TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");

  return {
    index: state.index++,
    timestamp: new Date(),
    type: { kind: "user_message" },
    content,
    metadata: state.sessionId
      ? { sessionId: state.sessionId, model: state.model }
      : undefined,
  };
}

/**
 * Parse tool result content to determine status and structured result
 *
 * @param content - Raw result content string
 * @param isError - Whether the tool reported an error
 * @returns Object with status and structured result
 */
function parseToolResultContent(
  content: string,
  isError?: boolean
): {
  status: "success" | "failed";
  result: { success: boolean; data?: unknown; error?: string };
} {
  // If explicitly marked as error
  if (isError) {
    return {
      status: "failed",
      result: { success: false, error: content },
    };
  }

  // Try to parse as JSON to check for error indicators
  try {
    const parsed = JSON.parse(content);

    if (typeof parsed === "object" && parsed !== null) {
      // Check for explicit error field
      if ("error" in parsed || "isError" in parsed) {
        const errorMessage =
          typeof parsed.error === "string"
            ? parsed.error
            : typeof parsed.message === "string"
            ? parsed.message
            : content;
        return {
          status: "failed",
          result: { success: false, error: errorMessage, data: parsed },
        };
      }

      // Check for Bash command failure (non-zero exit code)
      if ("exitCode" in parsed && typeof parsed.exitCode === "number") {
        if (parsed.exitCode !== 0) {
          return {
            status: "failed",
            result: {
              success: false,
              data: parsed,
              error: `Command exited with code ${parsed.exitCode}`,
            },
          };
        }
      }
    }

    // Parsed successfully without errors
    return {
      status: "success",
      result: { success: true, data: parsed },
    };
  } catch {
    // Not JSON - treat as plain text success
    return {
      status: "success",
      result: { success: true, data: content },
    };
  }
}

/**
 * Handle assistant message with coalescing
 *
 * Streaming assistant messages are coalesced into a single entry.
 * Each chunk updates the existing entry.
 *
 * Also handles tool_use blocks within assistant messages.
 */
function handleAssistantMessage(
  message: AssistantMessage,
  workDir: string,
  state: NormalizerState
): NormalizedEntry | null {
  const content = extractAssistantContent(message.message.content);

  // Check for tool use blocks
  const toolUseBlocks = message.message.content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use"
  );

  // If there are tool use blocks, create tool_use entries
  if (toolUseBlocks.length > 0) {
    // Close active assistant message
    state.activeMessage = null;

    // For now, handle first tool use block
    const toolUse = toolUseBlocks[0];
    const entryIndex = state.index++;
    state.toolUseMap.set(toolUse.id, { entryIndex, toolName: toolUse.name });

    const action = parseToolAction(toolUse, workDir);

    return {
      index: entryIndex,
      timestamp: new Date(),
      type: {
        kind: "tool_use",
        tool: {
          toolName: toolUse.name,
          action,
          status: "running",
        },
      },
      content: formatToolUseContent(toolUse),
      metadata: state.sessionId
        ? { sessionId: state.sessionId, model: state.model }
        : undefined,
    };
  }

  // Otherwise, handle as text message with coalescing
  if (!content) {
    return null; // Skip empty messages
  }

  // If we have an active message, this is a continuation
  if (state.activeMessage) {
    state.activeMessage.content += content;
    return {
      index: state.activeMessage.index,
      timestamp: new Date(),
      type: { kind: "assistant_message" },
      content: state.activeMessage.content,
      metadata: state.sessionId
        ? { sessionId: state.sessionId, model: state.model }
        : undefined,
    };
  }

  // Start a new assistant message
  state.activeMessage = {
    index: state.index++,
    content,
  };

  return {
    index: state.activeMessage.index,
    timestamp: new Date(),
    type: { kind: "assistant_message" },
    content,
    metadata: state.sessionId
      ? { sessionId: state.sessionId, model: state.model }
      : undefined,
  };
}

/**
 * Extract text content from assistant message content blocks
 */
function extractAssistantContent(content: ContentBlock[]): string {
  return content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Handle tool use message
 *
 * Tool use messages are lifecycle events (started/completed).
 * Note: Claude CLI doesn't currently emit tool_use messages with subtype 'completed'.
 * Tool results come through user messages with tool_result content blocks instead.
 * This handler is kept for potential future compatibility.
 */
function handleToolUseMessage(
  _message: ToolUseMessage,
  _workDir: string,
  _state: NormalizerState
): NormalizedEntry | null {
  // Claude CLI doesn't emit tool_use messages with completion info.
  // Tool results are embedded in user messages as tool_result content blocks.
  // See createUserMessage() for tool result handling.
  return null;
}

/**
 * Format tool result content for display
 *
 * @param toolName - Name of the tool
 * @param toolResult - Raw tool result
 * @returns Formatted content string
 */
function formatToolResultContent(
  toolName: string,
  toolResult: unknown
): string {
  if (toolResult === null || toolResult === undefined) {
    return `Tool: ${toolName}\nResult: (completed)`;
  }

  // Handle Bash results with stdout/stderr
  if (typeof toolResult === "object") {
    const result = toolResult as Record<string, unknown>;

    if ("stdout" in result || "stderr" in result) {
      const parts: string[] = [`Tool: ${toolName}`];

      if (result.stdout && typeof result.stdout === "string") {
        parts.push(`Output:\n${result.stdout}`);
      }

      if (result.stderr && typeof result.stderr === "string") {
        parts.push(`Stderr:\n${result.stderr}`);
      }

      if ("exitCode" in result) {
        parts.push(`Exit code: ${result.exitCode}`);
      }

      return parts.join("\n");
    }

    // Handle error results
    if ("error" in result) {
      return `Tool: ${toolName}\nError: ${result.error}`;
    }
  }

  // Default: stringify the result
  return `Tool: ${toolName}\nResult: ${JSON.stringify(toolResult, null, 2)}`;
}

/**
 * Parse tool use input to ActionType
 */
function parseToolAction(toolUse: ToolUseBlock, workDir: string): ActionType {
  const { name, input } = toolUse;

  switch (name) {
    case "Bash": {
      const bashInput = input as { command?: string };
      return {
        kind: "command_run",
        command: bashInput.command || "",
      };
    }

    case "Edit": {
      const editInput = input as {
        file_path?: string;
        old_string?: string;
        new_string?: string;
      };
      // For Edit, we convert to file_edit with a change
      return {
        kind: "file_edit",
        path: relativizePath(editInput.file_path || "", workDir),
        changes: [
          {
            type: "edit",
            unifiedDiff: createUnifiedDiff(
              editInput.old_string || "",
              editInput.new_string || ""
            ),
          },
        ],
      };
    }

    case "Read": {
      const readInput = input as { file_path?: string };
      return {
        kind: "file_read",
        path: relativizePath(readInput.file_path || "", workDir),
      };
    }

    case "Write": {
      const writeInput = input as { file_path?: string };
      return {
        kind: "file_write",
        path: relativizePath(writeInput.file_path || "", workDir),
      };
    }

    default:
      // MCP tools or unknown tools
      return {
        kind: "tool",
        toolName: name,
        args: input,
      };
  }
}

/**
 * Create a simple unified diff representation
 */
function createUnifiedDiff(oldStr: string, newStr: string): string {
  return `- ${oldStr}\n+ ${newStr}`;
}

/**
 * Format tool use content for display
 */
function formatToolUseContent(toolUse: ToolUseBlock): string {
  return `Tool: ${toolUse.name}\nInput: ${JSON.stringify(
    toolUse.input,
    null,
    2
  )}`;
}

/**
 * Handle result message
 *
 * Final result message indicates task completion.
 * For now, we skip these as they don't add actionable info to the UI.
 */
function handleResultMessage(
  message: ResultMessage,
  workDir: string,
  state: NormalizerState
): NormalizedEntry | null {
  // Close any active assistant message
  state.activeMessage = null;

  // If there's an error, create an error entry
  if (message.isError && message.result) {
    return {
      index: state.index++,
      timestamp: new Date(),
      type: {
        kind: "error",
        error: {
          message: JSON.stringify(message.result),
          code: "TASK_ERROR",
        },
      },
      content: `Task failed: ${JSON.stringify(message.result)}`,
      metadata: state.sessionId
        ? { sessionId: state.sessionId, model: state.model }
        : undefined,
    };
  }

  // Otherwise skip - task success is implicit
  return null;
}

/**
 * Relativize file path based on working directory
 *
 * Converts absolute paths to relative paths for better display.
 */
function relativizePath(filePath: string, workDir: string): string {
  if (!filePath || !path.isAbsolute(filePath)) {
    return filePath;
  }

  try {
    const relative = path.relative(workDir, filePath);
    // Only use relative path if it's shorter and doesn't start with ../..
    if (relative.length < filePath.length && !relative.startsWith("../..")) {
      return relative;
    }
  } catch {
    // Ignore path errors
  }

  return filePath;
}
