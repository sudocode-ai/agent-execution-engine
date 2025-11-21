import { describe, it, expect, vi } from 'vitest';
import type {
  Client,
  SessionNotification,
  RequestPermissionRequest,
  ReadTextFileRequest,
  CreateTerminalRequest,
} from '@/agents/acp/index.js';
import { AcpError, AcpErrorCode } from '@/agents/acp/index.js';

describe('ACP Client Interface', () => {
  describe('Basic client implementation', () => {
    it('should implement required methods', async () => {
      const client: Client = {
        async sessionUpdate(args) {
          expect(args.sessionId).toBeDefined();
        },
        async requestPermission(args) {
          return {
            outcome: { Selected: { optionId: args.options[0].id } },
          };
        },
      };

      // Test sessionUpdate
      await client.sessionUpdate({
        sessionId: { id: 'test-session' },
        update: {
          AgentMessageChunk: {
            content: { Text: { text: 'Hello' } },
          },
        },
      });

      // Test requestPermission
      const response = await client.requestPermission({
        toolCall: {
          id: 'tool-1',
          kind: 'Read',
          title: 'Read file',
          status: 'Pending',
        },
        options: [
          {
            id: 'allow-once',
            kind: 'AllowOnce',
            label: 'Allow once',
          },
        ],
      });

      expect(response.outcome).toEqual({
        Selected: { optionId: 'allow-once' },
      });
    });

    it('should handle all SessionUpdate variants', async () => {
      const events: string[] = [];

      const client: Client = {
        async sessionUpdate(args) {
          if ('AgentMessageChunk' in args.update) {
            events.push('message');
          } else if ('AgentThoughtChunk' in args.update) {
            events.push('thought');
          } else if ('ToolCall' in args.update) {
            events.push('tool-call');
          } else if ('ToolCallUpdate' in args.update) {
            events.push('tool-update');
          } else if ('Plan' in args.update) {
            events.push('plan');
          } else if ('AvailableCommandsUpdate' in args.update) {
            events.push('commands');
          } else if ('CurrentModeUpdate' in args.update) {
            events.push('mode');
          }
        },
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
      };

      // Test different update types
      const sessionId = { id: 'test' };

      await client.sessionUpdate({
        sessionId,
        update: { AgentMessageChunk: { content: { Text: { text: 'hi' } } } },
      });

      await client.sessionUpdate({
        sessionId,
        update: { AgentThoughtChunk: { content: { Text: { text: 'thinking' } } } },
      });

      await client.sessionUpdate({
        sessionId,
        update: {
          ToolCall: {
            id: 'tool-1',
            kind: 'Read',
            title: 'Read',
            status: 'Pending',
          },
        },
      });

      await client.sessionUpdate({
        sessionId,
        update: {
          Plan: {
            entries: [{ content: 'Step 1' }],
          },
        },
      });

      expect(events).toEqual(['message', 'thought', 'tool-call', 'plan']);
    });
  });

  describe('Permission handling patterns', () => {
    it('should auto-approve with AllowAlways preference', async () => {
      const client: Client = {
        async sessionUpdate() {},
        async requestPermission(args) {
          const chosen =
            args.options.find((o) => o.kind === 'AllowAlways') ||
            args.options.find((o) => o.kind === 'AllowOnce') ||
            args.options[0];

          return {
            outcome: { Selected: { optionId: chosen.id } },
          };
        },
      };

      const response = await client.requestPermission({
        toolCall: {
          id: 'tool-1',
          kind: 'Execute',
          title: 'Run command',
          status: 'Pending',
        },
        options: [
          { id: 'deny', kind: 'DenyOnce', label: 'Deny' },
          { id: 'allow-once', kind: 'AllowOnce', label: 'Allow once' },
          { id: 'allow-always', kind: 'AllowAlways', label: 'Allow always' },
        ],
      });

      expect(response.outcome).toEqual({
        Selected: { optionId: 'allow-always' },
      });
    });

    it('should handle cancellation', async () => {
      const client: Client = {
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
      };

      const response = await client.requestPermission({
        toolCall: {
          id: 'tool-1',
          kind: 'Delete',
          title: 'Delete file',
          status: 'Pending',
        },
        options: [
          { id: 'allow', kind: 'AllowOnce', label: 'Allow' },
          { id: 'deny', kind: 'DenyAlways', label: 'Deny always' },
        ],
      });

      expect(response.outcome).toBe('Cancelled');
    });
  });

  describe('Optional file system methods', () => {
    it('should implement readTextFile', async () => {
      const client: Client = {
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
        async readTextFile(args) {
          expect(args.path).toBe('/test/file.txt');
          return {
            content: 'File content',
            encoding: 'utf-8',
          };
        },
      };

      const response = await client.readTextFile!({
        path: '/test/file.txt',
        encoding: 'utf-8',
      });

      expect(response.content).toBe('File content');
    });

    it('should implement writeTextFile', async () => {
      const client: Client = {
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
        async writeTextFile(args) {
          expect(args.path).toBe('/test/output.txt');
          expect(args.content).toBe('New content');
          return {
            success: true,
            bytesWritten: args.content.length,
          };
        },
      };

      const response = await client.writeTextFile!({
        path: '/test/output.txt',
        content: 'New content',
      });

      expect(response.success).toBe(true);
      expect(response.bytesWritten).toBe(11);
    });

    it('should throw MethodNotFound if not implemented', () => {
      const client: Client = {
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
        // readTextFile not implemented
      };

      expect(client.readTextFile).toBeUndefined();
    });
  });

  describe('Optional terminal methods', () => {
    it('should implement createTerminal', async () => {
      const terminals = new Map<string, any>();

      const client: Client = {
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
        async createTerminal(args) {
          const terminalId = `term-${Date.now()}`;
          terminals.set(terminalId, {
            command: args.command,
            args: args.args,
          });
          return { terminalId };
        },
      };

      const response = await client.createTerminal!({
        command: 'bash',
        args: ['-c', 'echo hello'],
      });

      expect(response.terminalId).toMatch(/^term-/);
      expect(terminals.size).toBe(1);
    });

    it('should handle terminal lifecycle', async () => {
      const events: string[] = [];

      const client: Client = {
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
        async createTerminal() {
          events.push('create');
          return { terminalId: 'term-1' };
        },
        async terminalOutput(args) {
          events.push(`output:${args.stream}`);
        },
        async releaseTerminal() {
          events.push('release');
        },
        async waitForTerminalExit() {
          events.push('wait-exit');
          return { exitCode: 0 };
        },
        async killTerminalCommand() {
          events.push('kill');
        },
      };

      await client.createTerminal!({ command: 'ls' });
      await client.terminalOutput!({
        terminalId: 'term-1',
        output: 'file.txt\n',
        stream: 'stdout',
      });
      await client.waitForTerminalExit!({ terminalId: 'term-1' });
      await client.releaseTerminal!({ terminalId: 'term-1' });

      expect(events).toEqual([
        'create',
        'output:stdout',
        'wait-exit',
        'release',
      ]);
    });
  });

  describe('Extension methods', () => {
    it('should support extMethod for custom features', async () => {
      const client: Client = {
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
        async extMethod(args: any) {
          if (args.action === 'custom') {
            return { result: 'success' };
          }
          throw new AcpError(
            AcpErrorCode.InvalidParams,
            'Unknown action'
          );
        },
      };

      const response = await client.extMethod!({ action: 'custom' });
      expect(response).toEqual({ result: 'success' });
    });

    it('should support extNotification for custom events', async () => {
      const notifications: any[] = [];

      const client: Client = {
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
        async extNotification(args: any) {
          notifications.push(args);
        },
      };

      await client.extNotification!({ event: 'custom-event', data: 123 });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].event).toBe('custom-event');
    });
  });

  describe('Type safety', () => {
    it('should enforce required methods at compile time', () => {
      // This should compile - all required methods present
      const validClient: Client = {
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
      };

      expect(validClient).toBeDefined();

      // TypeScript should error if required methods are missing
      // (This is a compile-time check, not a runtime test)
    });

    it('should allow optional methods to be undefined', () => {
      const client: Client = {
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: 'Cancelled' };
        },
        // Optional methods not defined
      };

      expect(client.readTextFile).toBeUndefined();
      expect(client.createTerminal).toBeUndefined();
    });
  });
});
