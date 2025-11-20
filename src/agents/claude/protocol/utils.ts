/**
 * Protocol Utilities
 *
 * Utility functions for parsing stream-json protocol messages.
 *
 * @module agents/claude/protocol/utils
 */

import type { Readable } from 'stream';
import type { ClaudeStreamMessage } from '../types/messages.js';

/**
 * Parse a single line of stream-json into a ClaudeStreamMessage
 *
 * @param line - JSON string to parse
 * @returns Parsed message or null if invalid
 *
 * @example
 * ```typescript
 * const msg = parseStreamJsonLine('{"type":"system","sessionId":"sess-123"}');
 * if (msg?.type === 'system') {
 *   console.log('Session:', msg.sessionId);
 * }
 * ```
 */
export function parseStreamJsonLine(line: string): ClaudeStreamMessage | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed as ClaudeStreamMessage;
  } catch (error) {
    // Invalid JSON - return null
    return null;
  }
}

/**
 * Create an async generator that yields messages from a readable stream
 *
 * Reads newline-delimited JSON from the stream and yields parsed messages.
 * Handles partial lines and buffering.
 *
 * @param stream - Readable stream (e.g., process.stdout)
 * @yields Parsed ClaudeStreamMessage objects
 *
 * @example
 * ```typescript
 * for await (const message of readStreamJson(process.stdout)) {
 *   if (message.type === 'assistant') {
 *     console.log('Assistant:', message.message.content);
 *   }
 * }
 * ```
 */
export async function* readStreamJson(
  stream: Readable
): AsyncGenerator<ClaudeStreamMessage, void, undefined> {
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunk.toString();

    // Split on newlines
    const lines = buffer.split('\n');

    // Keep last partial line in buffer
    buffer = lines.pop() || '';

    // Parse and yield complete lines
    for (const line of lines) {
      const message = parseStreamJsonLine(line);
      if (message) {
        yield message;
      }
    }
  }

  // Handle any remaining data in buffer
  if (buffer.trim()) {
    const message = parseStreamJsonLine(buffer);
    if (message) {
      yield message;
    }
  }
}

/**
 * Serialize a message to stream-json format (newline-terminated JSON)
 *
 * @param message - Message object to serialize
 * @returns JSON string with trailing newline
 *
 * @example
 * ```typescript
 * const json = serializeStreamJson({ type: 'control_response', response: {...} });
 * process.stdin.write(json);
 * ```
 */
export function serializeStreamJson(message: unknown): string {
  return JSON.stringify(message) + '\n';
}
