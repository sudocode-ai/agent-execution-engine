/**
 * Claude Code Hooks
 *
 * PreToolUse hooks for Claude Code execution control.
 *
 * @module agents/claude/hooks
 */

import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the path to the directory guard hook script
 *
 * Returns the path to the compiled JavaScript hook script.
 * Use this when configuring ClaudeCodeConfig.directoryGuardHookPath.
 *
 * @returns Absolute path to directory-guard.js
 *
 * @example
 * ```typescript
 * const config: ClaudeCodeConfig = {
 *   workDir: '/path/to/project',
 *   restrictToWorkDir: true,
 *   directoryGuardHookPath: getDirectoryGuardHookPath(),
 * };
 * ```
 */
export function getDirectoryGuardHookPath(): string {
  return path.join(__dirname, 'directory-guard.js');
}

/**
 * Get the path to the TypeScript source of the directory guard hook
 *
 * Use this for development when running with tsx.
 *
 * @returns Absolute path to directory-guard.ts
 */
export function getDirectoryGuardHookSourcePath(): string {
  // In development, __dirname points to src/agents/claude/hooks
  // In production, it points to dist/agents/claude/hooks
  // We need to find the source file
  const srcPath = __dirname.replace('/dist/', '/src/');
  return path.join(srcPath, 'directory-guard.ts');
}
