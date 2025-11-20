/**
 * Unified Diff Utilities
 *
 * Extracts and creates unified diff format from Cursor's edit strategies.
 * Supports 3 strategies: applyPatch, strReplace, multiStrReplace.
 *
 * @module agents/cursor/normalizer/diff-utils
 */

import type { FileChange } from '../../types/agent-executor.js';
import type { CursorEditTool } from '../types/tools.js';

/**
 * Extract unified diff hunks from patch content.
 *
 * Parses unified diff format and splits into individual hunks.
 * Each hunk starts with @@ and contains a set of changes.
 *
 * @param patchContent - Unified diff patch content
 * @returns Array of hunk strings (including @@ headers)
 *
 * @example
 * ```typescript
 * const patch = `@@ -10,7 +10,7 @@ function example() {
 *  const unchanged = 'same';
 * -const old = 'value';
 * +const new = 'value';
 * }`;
 *
 * const hunks = extractUnifiedDiffHunks(patch);
 * // Returns: ['@@ -10,7 +10,7 @@ function example() {\n ...']
 * ```
 */
export function extractUnifiedDiffHunks(patchContent: string): string[] {
  if (!patchContent || !patchContent.trim()) {
    return [];
  }

  const lines = patchContent.split('\n');
  const hunks: string[] = [];
  let currentHunk: string[] = [];

  for (const line of lines) {
    // Skip file headers (--- and +++)
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    // Start of new hunk
    if (line.startsWith('@@')) {
      // Save previous hunk if exists
      if (currentHunk.length > 0) {
        hunks.push(currentHunk.join('\n'));
      }
      // Start new hunk
      currentHunk = [line];
    } else if (currentHunk.length > 0) {
      // Add line to current hunk
      currentHunk.push(line);
    }
  }

  // Add final hunk
  if (currentHunk.length > 0) {
    hunks.push(currentHunk.join('\n'));
  }

  return hunks;
}

/**
 * Create complete unified diff with file header and hunks.
 *
 * Combines file path header with multiple hunks into a complete
 * unified diff format suitable for UI display or patching tools.
 *
 * @param filePath - Relative file path
 * @param hunks - Array of hunk strings (from extractUnifiedDiffHunks)
 * @returns Complete unified diff with header
 *
 * @example
 * ```typescript
 * const hunks = ['@@ -10,3 +10,3 @@\n-old\n+new'];
 * const diff = concatenateDiffHunks('src/file.ts', hunks);
 * // Returns:
 * // --- a/src/file.ts
 * // +++ b/src/file.ts
 * // @@ -10,3 +10,3 @@
 * // -old
 * // +new
 * ```
 */
export function concatenateDiffHunks(
  filePath: string,
  hunks: string[]
): string {
  if (hunks.length === 0) {
    return '';
  }

  const header = `--- a/${filePath}\n+++ b/${filePath}`;
  return [header, ...hunks].join('\n');
}

/**
 * Create unified diff from string replacement.
 *
 * Converts a simple oldText → newText replacement into unified diff format.
 * Estimates line numbers based on newline counts. Does not include context lines.
 *
 * @param filePath - Relative file path
 * @param oldText - Text being replaced
 * @param newText - New text content
 * @returns Unified diff with minimal context
 *
 * @example
 * ```typescript
 * const diff = createUnifiedDiff(
 *   'src/file.ts',
 *   'const x = 1;',
 *   'const x = 2;'
 * );
 * // Returns:
 * // --- a/src/file.ts
 * // +++ b/src/file.ts
 * // @@ -1,1 +1,1 @@
 * // -const x = 1;
 * // +const x = 2;
 * ```
 */
export function createUnifiedDiff(
  filePath: string,
  oldText: string,
  newText: string
): string {
  const hunk = createUnifiedDiffHunk(oldText, newText);
  return concatenateDiffHunks(filePath, [hunk]);
}

/**
 * Create single unified diff hunk without file header.
 *
 * Used for multi-edit scenarios where multiple hunks are concatenated.
 * Creates a minimal hunk with @@ header and change lines.
 *
 * @param oldText - Text being replaced
 * @param newText - New text content
 * @returns Single hunk string (no file header)
 *
 * @example
 * ```typescript
 * const hunk = createUnifiedDiffHunk('old value', 'new value');
 * // Returns:
 * // @@ -1,1 +1,1 @@
 * // -old value
 * // +new value
 * ```
 */
export function createUnifiedDiffHunk(
  oldText: string,
  newText: string
): string {
  // Count lines in old and new text
  const oldLines = oldText ? oldText.split('\n').length : 0;
  const newLines = newText ? newText.split('\n').length : 0;

  // Create hunk header with line numbers
  // Format: @@ -startLine,count +startLine,count @@
  // We use 1 as start line since we don't know actual position
  const hunkHeader = `@@ -1,${oldLines} +1,${newLines} @@`;

  // Create diff lines
  const diffLines: string[] = [hunkHeader];

  // Add removed lines
  if (oldText) {
    for (const line of oldText.split('\n')) {
      diffLines.push(`-${line}`);
    }
  }

  // Add added lines
  if (newText) {
    for (const line of newText.split('\n')) {
      diffLines.push(`+${line}`);
    }
  }

  return diffLines.join('\n');
}

/**
 * Extract FileChange array from Cursor edit tool args.
 *
 * Routes to appropriate strategy based on args structure:
 * - applyPatch: Full unified diff from Cursor
 * - strReplace: Single string replacement
 * - multiStrReplace: Multiple replacements (multiple hunks)
 *
 * @param args - Edit tool arguments
 * @param filePath - File path being edited (from args.path)
 * @returns Array of FileChange objects with unified diffs
 *
 * @example
 * ```typescript
 * // Strategy 1: applyPatch
 * const changes = extractEditChanges({
 *   path: 'src/file.ts',
 *   applyPatch: { patchContent: '@@...' }
 * }, 'src/file.ts');
 *
 * // Strategy 2: strReplace
 * const changes = extractEditChanges({
 *   path: 'src/file.ts',
 *   strReplace: { oldText: 'old', newText: 'new' }
 * }, 'src/file.ts');
 *
 * // Strategy 3: multiStrReplace
 * const changes = extractEditChanges({
 *   path: 'src/file.ts',
 *   multiStrReplace: {
 *     edits: [
 *       { oldText: 'old1', newText: 'new1' },
 *       { oldText: 'old2', newText: 'new2' }
 *     ]
 *   }
 * }, 'src/file.ts');
 * ```
 */
export function extractEditChanges(
  args: CursorEditTool['editToolCall']['args'],
  filePath: string
): FileChange[] {
  const changes: FileChange[] = [];

  // Strategy 1: applyPatch - Full unified diff from Cursor
  if (args.applyPatch) {
    const hunks = extractUnifiedDiffHunks(args.applyPatch.patchContent);
    if (hunks.length > 0) {
      changes.push({
        type: 'edit',
        unifiedDiff: concatenateDiffHunks(filePath, hunks),
      });
    } else {
      // Fallback: no hunks extracted, use raw patch content
      changes.push({
        type: 'edit',
        unifiedDiff: args.applyPatch.patchContent,
      });
    }
  }

  // Strategy 2: strReplace - Single string replacement
  if (args.strReplace) {
    const unifiedDiff = createUnifiedDiff(
      filePath,
      args.strReplace.oldText || '',
      args.strReplace.newText || ''
    );
    if (unifiedDiff) {
      changes.push({
        type: 'edit',
        unifiedDiff,
      });
    }
  }

  // Strategy 3: multiStrReplace - Multiple replacements
  if (args.multiStrReplace && args.multiStrReplace.edits) {
    const hunks = args.multiStrReplace.edits.map((edit) =>
      createUnifiedDiffHunk(edit.oldText || '', edit.newText || '')
    );
    if (hunks.length > 0) {
      changes.push({
        type: 'edit',
        unifiedDiff: concatenateDiffHunks(filePath, hunks),
      });
    }
  }

  return changes;
}

/**
 * Extract FileChange from edit tool result.
 *
 * Fallback strategy when args don't contain enough information.
 * Tries to extract diffString from result.success.
 *
 * @param result - Edit tool result
 * @param filePath - File path being edited
 * @returns FileChange with unified diff, or null if no diff found
 *
 * @example
 * ```typescript
 * const change = extractResultDiff(
 *   { success: { diffString: '@@ -1,1 +1,1 @@\n-old\n+new' } },
 *   'src/file.ts'
 * );
 * ```
 */
export function extractResultDiff(
  result: any,
  filePath: string
): FileChange | null {
  const diffString = result?.success?.diffString;

  if (!diffString) {
    return null;
  }

  const hunks = extractUnifiedDiffHunks(diffString);
  if (hunks.length > 0) {
    return {
      type: 'edit',
      unifiedDiff: concatenateDiffHunks(filePath, hunks),
    };
  }

  // Fallback: use raw diffString
  return {
    type: 'edit',
    unifiedDiff: diffString,
  };
}

/**
 * Validate unified diff format.
 *
 * Checks if string is a valid unified diff (has @@ markers and +/- lines).
 *
 * @param diff - Potential unified diff string
 * @returns True if valid unified diff format
 *
 * @example
 * ```typescript
 * isValidUnifiedDiff('@@ -1,1 +1,1 @@\n-old\n+new'); // true
 * isValidUnifiedDiff('not a diff'); // false
 * ```
 */
export function isValidUnifiedDiff(diff: string): boolean {
  if (!diff || !diff.trim()) {
    return false;
  }

  // Must contain at least one @@ hunk marker
  const hasHunkMarker = diff.includes('@@');
  if (!hasHunkMarker) {
    return false;
  }

  // Should have at least one + or - line (actual changes)
  const lines = diff.split('\n');
  const hasChanges = lines.some(
    (line) => line.startsWith('+') || line.startsWith('-')
  );

  return hasChanges;
}
