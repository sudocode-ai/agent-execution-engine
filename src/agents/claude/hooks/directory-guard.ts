#!/usr/bin/env npx tsx
/**
 * Directory Guard Hook
 *
 * PreToolUse hook that restricts Claude Code file operations to a specific working directory.
 * This prevents the agent from accessing files outside the allowed directory.
 *
 * Usage:
 *   CLAUDE_WORKDIR=/path/to/allowed npx tsx directory-guard.ts
 *
 * The hook reads JSON from stdin (Claude Code hook protocol) and outputs a decision.
 *
 * @module agents/claude/hooks/directory-guard
 */

import * as path from 'path';

/**
 * Hook input from Claude Code
 */
export interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/**
 * Hook output decision
 */
export interface HookOutput {
  decision: 'allow' | 'block';
  reason?: string;
}

/**
 * Tools that operate on file paths
 */
export const FILE_TOOLS = ['Read', 'Edit', 'Write', 'MultiEdit', 'Glob', 'Grep'];

/**
 * Check if a path is within the allowed working directory
 *
 * @param targetPath - The path to check
 * @param workdir - The allowed working directory
 * @returns True if the path is within the workdir
 */
export function isPathWithinWorkdir(targetPath: string, workdir: string): boolean {
  try {
    // Resolve to absolute paths, handling ~ and relative paths
    const expandedPath = targetPath.startsWith('~')
      ? path.join(process.env.HOME || '', targetPath.slice(1))
      : targetPath;

    const absPath = path.resolve(workdir, expandedPath);
    const absWorkdir = path.resolve(workdir);

    // Normalize paths to handle trailing slashes and . / ..
    const normalizedPath = path.normalize(absPath);
    const normalizedWorkdir = path.normalize(absWorkdir);

    // Check if the path starts with the workdir
    // Using path.sep to ensure we match directory boundaries
    return (
      normalizedPath === normalizedWorkdir ||
      normalizedPath.startsWith(normalizedWorkdir + path.sep)
    );
  } catch {
    // If we can't resolve the path, deny access
    return false;
  }
}

/**
 * Extract file path from tool input based on tool type
 *
 * @param toolName - The name of the tool being called
 * @param toolInput - The tool input parameters
 * @returns The file path if found, null otherwise
 */
export function extractFilePath(toolName: string, toolInput: Record<string, unknown>): string | null {
  switch (toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return (toolInput.file_path as string) || null;

    case 'MultiEdit':
      // MultiEdit has an array of edits, each with a file_path
      // We'll check all of them
      return (toolInput.file_path as string) || null;

    case 'Glob':
    case 'Grep':
      // These use 'path' parameter, defaulting to cwd if not specified
      return (toolInput.path as string) || null;

    default:
      return null;
  }
}

/**
 * Process a hook input and return the decision
 *
 * @param hookInput - The hook input from Claude Code
 * @param workdir - The allowed working directory
 * @returns The hook output decision
 */
export function processHookInput(hookInput: HookInput, workdir: string): HookOutput {
  const { tool_name, tool_input } = hookInput;

  // Only check file-related tools
  if (!FILE_TOOLS.includes(tool_name)) {
    return { decision: 'allow' };
  }

  // Extract file path from tool input
  const filePath = extractFilePath(tool_name, tool_input);

  // If no path specified, the tool will use cwd which is already restricted
  if (!filePath) {
    return { decision: 'allow' };
  }

  // Check if path is within allowed directory
  if (isPathWithinWorkdir(filePath, workdir)) {
    return { decision: 'allow' };
  } else {
    return {
      decision: 'block',
      reason: `Access denied: "${filePath}" is outside the allowed directory "${workdir}"`,
    };
  }
}

/**
 * Main hook entry point - reads from stdin and writes to stdout
 */
export async function main(): Promise<void> {
  // Get allowed working directory from environment
  const workdir = process.env.CLAUDE_WORKDIR;

  if (!workdir) {
    // If no workdir specified, allow everything (fail open for safety in misconfiguration)
    const output: HookOutput = { decision: 'allow' };
    console.log(JSON.stringify(output));
    process.exit(0);
  }

  // Read JSON from stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookInput: HookInput;
  try {
    hookInput = JSON.parse(input);
  } catch {
    // If we can't parse input, allow (fail open)
    const output: HookOutput = { decision: 'allow' };
    console.log(JSON.stringify(output));
    process.exit(0);
  }

  const output = processHookInput(hookInput, workdir);
  console.log(JSON.stringify(output));

  // Exit code 2 signals block to Claude Code
  process.exit(output.decision === 'block' ? 2 : 0);
}

// Only run main if this is the entry point (not being imported)
const isMainModule = process.argv[1]?.endsWith('directory-guard.ts') ||
  process.argv[1]?.endsWith('directory-guard.js');

if (isMainModule) {
  main().catch((error) => {
    console.error('Directory guard hook error:', error);
    // On error, allow (fail open) to avoid breaking execution
    const output: HookOutput = { decision: 'allow' };
    console.log(JSON.stringify(output));
    process.exit(0);
  });
}
