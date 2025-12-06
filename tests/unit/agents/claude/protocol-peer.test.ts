/**
 * ProtocolPeer Tests
 *
 * Tests for bidirectional stream-json protocol communication.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable, Writable } from 'stream';
import {
  ProtocolPeer,
  type IProtocolClient,
  parseStreamJsonLine,
  readStreamJson,
  serializeStreamJson,
} from '@/agents/claude/protocol';
import type {
  ClaudeStreamMessage,
  SystemMessage,
  AssistantMessage,
  ControlRequestMessage,
} from '@/agents/claude/types/messages';
import type {
  ControlRequest,
  ControlResponse,
} from '@/agents/claude/types/control';

describe('Protocol Utils', () => {
  describe('parseStreamJsonLine', () => {
    it('should parse valid JSON', () => {
      const line = '{"type":"system","sessionId":"sess-123"}';
      const msg = parseStreamJsonLine(line);

      expect(msg).toEqual({ type: 'system', sessionId: 'sess-123' });
    });

    it('should handle whitespace', () => {
      const line = '  {"type":"system","sessionId":"sess-123"}  \n';
      const msg = parseStreamJsonLine(line);

      expect(msg).toEqual({ type: 'system', sessionId: 'sess-123' });
    });

    it('should return null for invalid JSON', () => {
      const line = '{invalid json}';
      const msg = parseStreamJsonLine(line);

      expect(msg).toBeNull();
    });

    it('should return null for empty lines', () => {
      expect(parseStreamJsonLine('')).toBeNull();
      expect(parseStreamJsonLine('   ')).toBeNull();
      expect(parseStreamJsonLine('\n')).toBeNull();
    });
  });

  describe('serializeStreamJson', () => {
    it('should serialize message with newline', () => {
      const msg = { type: 'system', sessionId: 'sess-123' };
      const json = serializeStreamJson(msg);

      expect(json).toBe('{"type":"system","sessionId":"sess-123"}\n');
    });

    it('should handle complex objects', () => {
      const msg = {
        type: 'control_response',
        response: {
          type: 'success',
          requestId: 'req-123',
          response: { result: 'allow', updatedInput: { command: 'ls' } },
        },
      };

      const json = serializeStreamJson(msg);
      expect(json).toContain('"type":"control_response"');
      expect(json).toContain('"result":"allow"');
      expect(json.endsWith('\n')).toBe(true);
    });
  });

  describe('readStreamJson', () => {
    it('should parse complete lines', async () => {
      const stream = Readable.from([
        '{"type":"system","sessionId":"sess-1"}\n',
        '{"type":"user","message":{"role":"user","content":"test"}}\n',
      ]);

      const messages: ClaudeStreamMessage[] = [];
      for await (const msg of readStreamJson(stream)) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('system');
      expect(messages[1].type).toBe('user');
    });

    it('should handle chunked data', async () => {
      const stream = Readable.from([
        '{"type":"sys',
        'tem","sessionId":"s',
        'ess-1"}\n{"type":"user"',
        ',"message":{"role":"user","content":"test"}}\n',
      ]);

      const messages: ClaudeStreamMessage[] = [];
      for await (const msg of readStreamJson(stream)) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('system');
      expect(messages[1].type).toBe('user');
    });

    it('should handle partial lines at end', async () => {
      const stream = Readable.from([
        '{"type":"system","sessionId":"sess-1"}\n',
        '{"type":"user","message":{"role":"user","content":"test"}}',
      ]);

      const messages: ClaudeStreamMessage[] = [];
      for await (const msg of readStreamJson(stream)) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(2);
      expect(messages[1].type).toBe('user');
    });

    it('should skip invalid JSON lines', async () => {
      const stream = Readable.from([
        '{"type":"system","sessionId":"sess-1"}\n',
        '{invalid}\n',
        '{"type":"user","message":{"role":"user","content":"test"}}\n',
      ]);

      const messages: ClaudeStreamMessage[] = [];
      for await (const msg of readStreamJson(stream)) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('system');
      expect(messages[1].type).toBe('user');
    });

    it('should skip empty lines', async () => {
      const stream = Readable.from([
        '{"type":"system","sessionId":"sess-1"}\n',
        '\n',
        '   \n',
        '{"type":"user","message":{"role":"user","content":"test"}}\n',
      ]);

      const messages: ClaudeStreamMessage[] = [];
      for await (const msg of readStreamJson(stream)) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(2);
    });
  });
});

describe('ProtocolPeer', () => {
  let mockClient: IProtocolClient;
  let stdin: Writable;
  let stdout: Readable;
  let peer: ProtocolPeer;
  let stdinWrites: string[];

  beforeEach(() => {
    // Mock client
    mockClient = {
      handleControlRequest: vi.fn(),
    };

    // Create mock streams
    stdinWrites = [];
    stdin = new Writable({
      write(chunk, _encoding, callback) {
        stdinWrites.push(chunk.toString());
        callback();
      },
    });

    stdout = new Readable({
      read() {
        // No-op
      },
    });

    peer = new ProtocolPeer(stdin, stdout, mockClient);
  });

  describe('Message Handling', () => {
    it('should emit non-control messages to handlers', async () => {
      const messages: ClaudeStreamMessage[] = [];
      peer.onMessage((msg) => messages.push(msg));

      peer.start();

      // Push messages to stdout
      stdout.push('{"type":"system","sessionId":"sess-123"}\n');
      stdout.push(
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]}}\n'
      );
      stdout.push(null); // End stream

      // Give read loop time to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      await peer.stop();

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('system');
      expect(messages[1].type).toBe('assistant');
    });

    it('should route control requests to client', async () => {
      const mockResponse: ControlResponse = {
        type: 'success',
        requestId: 'req-123',
        response: { result: 'allow' },
      };

      vi.mocked(mockClient.handleControlRequest).mockResolvedValue(
        mockResponse
      );

      peer.start();

      // Push control request
      stdout.push(
        '{"type":"control_request","requestId":"req-123","request":{"type":"can_use_tool","toolName":"Bash","input":{"command":"ls"}}}\n'
      );
      stdout.push(null);

      // Give read loop time to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      await peer.stop();

      // Verify client was called
      expect(mockClient.handleControlRequest).toHaveBeenCalledWith(
        {
          type: 'can_use_tool',
          toolName: 'Bash',
          input: { command: 'ls' },
        },
        'req-123'
      );

      // Verify response was sent
      expect(stdinWrites.length).toBeGreaterThan(0);
      const responseMsg = JSON.parse(stdinWrites[stdinWrites.length - 1]);
      expect(responseMsg.type).toBe('control_response');
      expect(responseMsg.response.type).toBe('success');
      expect(responseMsg.response.requestId).toBe('req-123');
    });

    it('should handle client errors gracefully', async () => {
      vi.mocked(mockClient.handleControlRequest).mockRejectedValue(
        new Error('Client error')
      );

      const errors: Error[] = [];
      peer.onError((err) => errors.push(err));

      peer.start();

      stdout.push(
        '{"type":"control_request","requestId":"req-123","request":{"type":"can_use_tool","toolName":"Bash","input":{"command":"ls"}}}\n'
      );
      stdout.push(null);

      // Give read loop time to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      await peer.stop();

      // Verify error response was sent
      const responseMsg = JSON.parse(stdinWrites[stdinWrites.length - 1]);
      expect(responseMsg.type).toBe('control_response');
      expect(responseMsg.response.type).toBe('error');
      expect(responseMsg.response.error).toBe('Client error');

      // Verify error was emitted
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Client error');
    });
  });

  describe('Message Sending', () => {
    it('should send user messages', async () => {
      await peer.sendUserMessage('List files');

      expect(stdinWrites).toHaveLength(1);
      const msg = JSON.parse(stdinWrites[0]);
      expect(msg.type).toBe('user');
      expect(msg.message.role).toBe('user');
      expect(msg.message.content).toBe('List files');
    });

    it('should send user messages with array content', async () => {
      await peer.sendUserMessage([{ type: 'text', text: 'List files' }]);

      expect(stdinWrites).toHaveLength(1);
      const msg = JSON.parse(stdinWrites[0]);
      expect(msg.type).toBe('user');
      expect(msg.message.content[0].text).toBe('List files');
    });

    it('should send initialization request', async () => {
      await peer.initialize({
        preToolUse: { enabled: true },
      });

      expect(stdinWrites).toHaveLength(1);
      const msg = JSON.parse(stdinWrites[0]);
      expect(msg.type).toBe('sdk_control_request');
      expect(msg.request.type).toBe('initialize');
      expect(msg.request.hooks.preToolUse.enabled).toBe(true);
    });

    it('should set permission mode', async () => {
      await peer.setPermissionMode('bypass_permissions', 'session');

      expect(stdinWrites).toHaveLength(1);
      const msg = JSON.parse(stdinWrites[0]);
      expect(msg.type).toBe('sdk_control_request');
      expect(msg.request.type).toBe('set_permission_mode');
      expect(msg.request.mode).toBe('bypass_permissions');
    });

    it('should send interrupt control message', async () => {
      await peer.sendInterrupt();

      expect(stdinWrites).toHaveLength(1);
      const msg = JSON.parse(stdinWrites[0]);
      expect(msg.type).toBe('control');
      expect(msg.control).toEqual({ type: 'interrupt' });
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop read loop', async () => {
      const messages: ClaudeStreamMessage[] = [];
      peer.onMessage((msg) => messages.push(msg));

      peer.start();

      stdout.push('{"type":"system","sessionId":"sess-123"}\n');
      stdout.push(null);

      // Give read loop time to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      await peer.stop();

      expect(messages).toHaveLength(1);
    });

    it('should handle multiple start calls', async () => {
      peer.start();
      peer.start(); // Should be no-op

      stdout.push('{"type":"system","sessionId":"sess-123"}\n');
      stdout.push(null);

      await peer.stop();
    });

    it('should stop gracefully when no read loop', async () => {
      // Should not throw
      await peer.stop();
    });
  });

  describe('Error Handling', () => {
    it('should emit errors from message handlers', async () => {
      const errors: Error[] = [];
      peer.onError((err) => errors.push(err));

      peer.onMessage(() => {
        throw new Error('Handler error');
      });

      peer.start();

      stdout.push('{"type":"system","sessionId":"sess-123"}\n');
      stdout.push(null);

      // Give read loop time to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      await peer.stop();

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Handler error');
    });

    it('should handle errors in error handlers gracefully', async () => {
      peer.onError(() => {
        throw new Error('Error handler error');
      });

      peer.onMessage(() => {
        throw new Error('Handler error');
      });

      peer.start();

      stdout.push('{"type":"system","sessionId":"sess-123"}\n');
      stdout.push(null);

      // Should not throw
      await peer.stop();
    });

    it('should emit stream errors', async () => {
      const errors: Error[] = [];
      peer.onError((err) => errors.push(err));

      peer.start();

      // Emit error on stream
      stdout.destroy(new Error('Stream error'));

      await peer.stop();

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Stream error');
    });
  });

  describe('Integration', () => {
    it('should handle complete message flow', async () => {
      const messages: ClaudeStreamMessage[] = [];
      peer.onMessage((msg) => messages.push(msg));

      const mockResponse: ControlResponse = {
        type: 'success',
        requestId: 'req-123',
        response: { result: 'allow' },
      };

      vi.mocked(mockClient.handleControlRequest).mockResolvedValue(
        mockResponse
      );

      peer.start();

      // Initialize
      await peer.initialize({ preToolUse: { enabled: true } });

      // Send user message
      await peer.sendUserMessage('List files');

      // Receive system message
      stdout.push('{"type":"system","sessionId":"sess-123"}\n');

      // Receive assistant message
      stdout.push(
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool-1","name":"Bash","input":{"command":"ls"}}]}}\n'
      );

      // Receive control request
      stdout.push(
        '{"type":"control_request","requestId":"req-123","request":{"type":"can_use_tool","toolName":"Bash","input":{"command":"ls"}}}\n'
      );

      // Receive tool result
      stdout.push(
        '{"type":"tool_use","subtype":"completed","toolUseId":"tool-1","toolResult":{"stdout":"file1.txt"}}\n'
      );

      // End stream
      stdout.push(null);

      // Give read loop time to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      await peer.stop();

      // Verify messages received
      // control_request is NOT emitted to handlers (routed to client instead)
      expect(messages).toHaveLength(3); // system, assistant, tool_use
      expect(messages[0].type).toBe('system');
      expect(messages[1].type).toBe('assistant');
      expect(messages[2].type).toBe('tool_use');

      // Verify messages sent
      expect(stdinWrites.length).toBeGreaterThanOrEqual(3); // init, user, control response

      const initMsg = JSON.parse(stdinWrites[0]);
      expect(initMsg.type).toBe('sdk_control_request');

      const userMsg = JSON.parse(stdinWrites[1]);
      expect(userMsg.type).toBe('user');

      const controlRes = JSON.parse(stdinWrites[2]);
      expect(controlRes.type).toBe('control_response');
    });
  });
});
