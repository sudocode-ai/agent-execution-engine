/**
 * List Command
 *
 * Implements the list command to display available coding agents.
 */

import { AVAILABLE_AGENTS, getAvailableAgents } from '../../agents/factory.js';

/**
 * List command options
 */
export interface ListOptions {
  /**
   * Output format: 'table' (default) or 'json'
   */
  format?: 'table' | 'json';
}

/**
 * Agent information for display
 */
interface AgentInfo {
  agent: string;
  displayName: string;
  description: string;
  available: boolean;
}

/**
 * Get all agent information
 */
function getAgentInfo(): AgentInfo[] {
  return Object.entries(AVAILABLE_AGENTS).map(([agent, info]) => ({
    agent,
    displayName: info.displayName,
    description: info.description,
    available: info.available,
  }));
}

/**
 * Render agents in table format
 */
function renderTable(agents: AgentInfo[]): string {
  // Calculate column widths
  const agentWidth = Math.max(
    10,
    ...agents.map((a) => a.agent.length)
  );
  const nameWidth = Math.max(
    15,
    ...agents.map((a) => a.displayName.length)
  );
  const descWidth = Math.max(
    30,
    ...agents.map((a) => a.description.length)
  );
  const statusWidth = 12;

  // Helper to pad text
  const pad = (text: string, width: number) => text.padEnd(width);

  // Build table
  const lines: string[] = [];

  // Header
  lines.push('Available Coding Agents:');
  lines.push('');

  // Top border
  lines.push(
    '┌─' +
      '─'.repeat(agentWidth) +
      '─┬─' +
      '─'.repeat(nameWidth) +
      '─┬─' +
      '─'.repeat(descWidth) +
      '─┬─' +
      '─'.repeat(statusWidth) +
      '─┐'
  );

  // Header row
  lines.push(
    '│ ' +
      pad('Agent', agentWidth) +
      ' │ ' +
      pad('Display Name', nameWidth) +
      ' │ ' +
      pad('Description', descWidth) +
      ' │ ' +
      pad('Status', statusWidth) +
      ' │'
  );

  // Header separator
  lines.push(
    '├─' +
      '─'.repeat(agentWidth) +
      '─┼─' +
      '─'.repeat(nameWidth) +
      '─┼─' +
      '─'.repeat(descWidth) +
      '─┼─' +
      '─'.repeat(statusWidth) +
      '─┤'
  );

  // Data rows
  for (const agent of agents) {
    const status = agent.available ? 'Available' : 'Coming soon';
    lines.push(
      '│ ' +
        pad(agent.agent, agentWidth) +
        ' │ ' +
        pad(agent.displayName, nameWidth) +
        ' │ ' +
        pad(agent.description, descWidth) +
        ' │ ' +
        pad(status, statusWidth) +
        ' │'
    );
  }

  // Bottom border
  lines.push(
    '└─' +
      '─'.repeat(agentWidth) +
      '─┴─' +
      '─'.repeat(nameWidth) +
      '─┴─' +
      '─'.repeat(descWidth) +
      '─┴─' +
      '─'.repeat(statusWidth) +
      '─┘'
  );

  return lines.join('\n');
}

/**
 * Render agents in JSON format
 */
function renderJson(agents: AgentInfo[]): string {
  return JSON.stringify(agents, null, 2);
}

/**
 * List command implementation
 */
export async function listCommand(options: ListOptions = {}): Promise<void> {
  const format = options.format || 'table';
  const agents = getAgentInfo();

  if (format === 'json') {
    console.log(renderJson(agents));
  } else {
    console.log(renderTable(agents));
  }
}

/**
 * Register list command with Commander program
 */
export function registerListCommand(program: any): void {
  program
    .command('list')
    .description('List available coding agents')
    .option(
      '--format <format>',
      'Output format: table or json',
      'table'
    )
    .action(async (options: ListOptions) => {
      try {
        await listCommand(options);
        process.exit(0);
      } catch (error) {
        console.error('[ERR] ' + (error instanceof Error ? error.message : error));
        process.exit(1);
      }
    });
}
