/**
 * Tests for unified diff utilities
 */

import { describe, it, expect } from 'vitest';
import {
  extractUnifiedDiffHunks,
  concatenateDiffHunks,
  createUnifiedDiff,
  createUnifiedDiffHunk,
  extractEditChanges,
  extractResultDiff,
  isValidUnifiedDiff,
} from '@/agents/cursor/normalizer/diff-utils';

describe('Unified Diff Utilities', () => {
  describe('extractUnifiedDiffHunks()', () => {
    it('should extract single hunk', () => {
      const patch = `--- a/file.ts
+++ b/file.ts
@@ -10,7 +10,7 @@ function example() {
 const unchanged = 'same';
-const old = 'value';
+const new = 'value';
}`;

      const hunks = extractUnifiedDiffHunks(patch);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]).toContain('@@ -10,7 +10,7 @@');
      expect(hunks[0]).toContain('-const old');
      expect(hunks[0]).toContain('+const new');
    });

    it('should extract multiple hunks', () => {
      const patch = `--- a/file.ts
+++ b/file.ts
@@ -10,3 +10,3 @@
-old line 1
+new line 1
@@ -20,3 +20,3 @@
-old line 2
+new line 2`;

      const hunks = extractUnifiedDiffHunks(patch);

      expect(hunks).toHaveLength(2);
      expect(hunks[0]).toContain('@@ -10,3 +10,3 @@');
      expect(hunks[1]).toContain('@@ -20,3 +20,3 @@');
    });

    it('should skip file headers', () => {
      const patch = `--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
-old
+new`;

      const hunks = extractUnifiedDiffHunks(patch);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]).not.toContain('---');
      expect(hunks[0]).not.toContain('+++');
    });

    it('should handle empty patch', () => {
      expect(extractUnifiedDiffHunks('')).toEqual([]);
      expect(extractUnifiedDiffHunks('   ')).toEqual([]);
    });

    it('should handle patch without hunks', () => {
      const patch = `--- a/file.ts
+++ b/file.ts`;

      expect(extractUnifiedDiffHunks(patch)).toEqual([]);
    });

    it('should handle context lines', () => {
      const patch = `@@ -10,5 +10,5 @@
 context line 1
 context line 2
-old line
+new line
 context line 3
 context line 4`;

      const hunks = extractUnifiedDiffHunks(patch);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]).toContain('context line 1');
      expect(hunks[0]).toContain('-old line');
      expect(hunks[0]).toContain('+new line');
    });
  });

  describe('concatenateDiffHunks()', () => {
    it('should create complete unified diff with header', () => {
      const hunks = ['@@ -10,3 +10,3 @@\n-old\n+new'];
      const diff = concatenateDiffHunks('src/file.ts', hunks);

      expect(diff).toContain('--- a/src/file.ts');
      expect(diff).toContain('+++ b/src/file.ts');
      expect(diff).toContain('@@ -10,3 +10,3 @@');
      expect(diff).toContain('-old');
      expect(diff).toContain('+new');
    });

    it('should combine multiple hunks', () => {
      const hunks = [
        '@@ -10,1 +10,1 @@\n-old1\n+new1',
        '@@ -20,1 +20,1 @@\n-old2\n+new2',
      ];
      const diff = concatenateDiffHunks('file.ts', hunks);

      expect(diff).toContain('@@ -10,1 +10,1 @@');
      expect(diff).toContain('@@ -20,1 +20,1 @@');
      expect(diff).toContain('-old1');
      expect(diff).toContain('-old2');
    });

    it('should return empty string for no hunks', () => {
      expect(concatenateDiffHunks('file.ts', [])).toBe('');
    });

    it('should handle relative paths', () => {
      const hunks = ['@@ -1,1 +1,1 @@\n-old\n+new'];

      expect(concatenateDiffHunks('src/file.ts', hunks)).toContain(
        'a/src/file.ts'
      );
      expect(concatenateDiffHunks('file.ts', hunks)).toContain('a/file.ts');
    });
  });

  describe('createUnifiedDiffHunk()', () => {
    it('should create hunk for single line change', () => {
      const hunk = createUnifiedDiffHunk('old value', 'new value');

      expect(hunk).toContain('@@ -1,1 +1,1 @@');
      expect(hunk).toContain('-old value');
      expect(hunk).toContain('+new value');
    });

    it('should handle multiline old and new text', () => {
      const oldText = 'line 1\nline 2\nline 3';
      const newText = 'new line 1\nnew line 2';

      const hunk = createUnifiedDiffHunk(oldText, newText);

      expect(hunk).toContain('@@ -1,3 +1,2 @@');
      expect(hunk).toContain('-line 1');
      expect(hunk).toContain('-line 2');
      expect(hunk).toContain('-line 3');
      expect(hunk).toContain('+new line 1');
      expect(hunk).toContain('+new line 2');
    });

    it('should handle empty old text (addition)', () => {
      const hunk = createUnifiedDiffHunk('', 'new line');

      expect(hunk).toContain('@@ -1,0 +1,1 @@');
      expect(hunk).toContain('+new line');
      // Should not have any deletion lines (lines starting with '- ')
      const lines = hunk.split('\n');
      const deletionLines = lines.filter(line => line.startsWith('-') && !line.startsWith('-1'));
      expect(deletionLines).toHaveLength(0);
    });

    it('should handle empty new text (deletion)', () => {
      const hunk = createUnifiedDiffHunk('old line', '');

      expect(hunk).toContain('@@ -1,1 +1,0 @@');
      expect(hunk).toContain('-old line');
      // Should not have any addition lines (lines starting with '+ ')
      const lines = hunk.split('\n');
      const additionLines = lines.filter(line => line.startsWith('+') && !line.startsWith('+1'));
      expect(additionLines).toHaveLength(0);
    });

    it('should handle both empty (no change)', () => {
      const hunk = createUnifiedDiffHunk('', '');

      expect(hunk).toContain('@@ -1,0 +1,0 @@');
    });
  });

  describe('createUnifiedDiff()', () => {
    it('should create complete diff with file header', () => {
      const diff = createUnifiedDiff('src/file.ts', 'const x = 1;', 'const x = 2;');

      expect(diff).toContain('--- a/src/file.ts');
      expect(diff).toContain('+++ b/src/file.ts');
      expect(diff).toContain('@@ -1,1 +1,1 @@');
      expect(diff).toContain('-const x = 1;');
      expect(diff).toContain('+const x = 2;');
    });

    it('should handle multiline replacements', () => {
      const oldText = 'function old() {\n  return 1;\n}';
      const newText = 'function new() {\n  return 2;\n}';

      const diff = createUnifiedDiff('file.ts', oldText, newText);

      expect(diff).toContain('@@ -1,3 +1,3 @@');
      expect(diff).toContain('-function old()');
      expect(diff).toContain('+function new()');
    });
  });

  describe('extractEditChanges()', () => {
    it('should extract from applyPatch strategy', () => {
      const args = {
        path: '/project/src/file.ts',
        applyPatch: {
          patchContent: `@@ -10,3 +10,3 @@
-const x = 1;
+const x = 2;`,
        },
      };

      const changes = extractEditChanges(args, 'src/file.ts');

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('edit');
      expect(changes[0]).toHaveProperty('unifiedDiff');
      if ('unifiedDiff' in changes[0]) {
        expect(changes[0].unifiedDiff).toContain('--- a/src/file.ts');
        expect(changes[0].unifiedDiff).toContain('+++ b/src/file.ts');
        expect(changes[0].unifiedDiff).toContain('@@ -10,3 +10,3 @@');
      }
    });

    it('should extract from strReplace strategy', () => {
      const args = {
        path: '/project/file.ts',
        strReplace: {
          oldText: 'const x = 1;',
          newText: 'const x = 2;',
        },
      };

      const changes = extractEditChanges(args, 'file.ts');

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('edit');
      if ('unifiedDiff' in changes[0]) {
        expect(changes[0].unifiedDiff).toContain('--- a/file.ts');
        expect(changes[0].unifiedDiff).toContain('-const x = 1;');
        expect(changes[0].unifiedDiff).toContain('+const x = 2;');
      }
    });

    it('should extract from multiStrReplace strategy', () => {
      const args = {
        path: '/project/file.ts',
        multiStrReplace: {
          edits: [
            { oldText: 'const x = 1;', newText: 'const x = 2;' },
            { oldText: 'const y = 3;', newText: 'const y = 4;' },
          ],
        },
      };

      const changes = extractEditChanges(args, 'file.ts');

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('edit');
      if ('unifiedDiff' in changes[0]) {
        expect(changes[0].unifiedDiff).toContain('--- a/file.ts');
        expect(changes[0].unifiedDiff).toContain('-const x = 1;');
        expect(changes[0].unifiedDiff).toContain('+const x = 2;');
        expect(changes[0].unifiedDiff).toContain('-const y = 3;');
        expect(changes[0].unifiedDiff).toContain('+const y = 4;');
      }
    });

    it('should handle empty edits in strReplace', () => {
      const args = {
        path: '/project/file.ts',
        strReplace: {
          oldText: '',
          newText: 'new content',
        },
      };

      const changes = extractEditChanges(args, 'file.ts');

      expect(changes).toHaveLength(1);
      if ('unifiedDiff' in changes[0]) {
        expect(changes[0].unifiedDiff).toContain('+new content');
      }
    });

    it('should return empty array for no strategy', () => {
      const args = {
        path: '/project/file.ts',
      };

      const changes = extractEditChanges(args, 'file.ts');

      expect(changes).toEqual([]);
    });

    it('should use raw patch if no hunks extracted', () => {
      const args = {
        path: '/project/file.ts',
        applyPatch: {
          patchContent: 'invalid patch content without hunks',
        },
      };

      const changes = extractEditChanges(args, 'file.ts');

      expect(changes).toHaveLength(1);
      if ('unifiedDiff' in changes[0]) {
        expect(changes[0].unifiedDiff).toBe('invalid patch content without hunks');
      }
    });
  });

  describe('extractResultDiff()', () => {
    it('should extract from result.success.diffString', () => {
      const result = {
        success: {
          diffString: `@@ -1,1 +1,1 @@
-old
+new`,
        },
      };

      const change = extractResultDiff(result, 'file.ts');

      expect(change).not.toBeNull();
      expect(change?.type).toBe('edit');
      if (change && 'unifiedDiff' in change) {
        expect(change.unifiedDiff).toContain('--- a/file.ts');
        expect(change.unifiedDiff).toContain('@@ -1,1 +1,1 @@');
      }
    });

    it('should return null if no diffString', () => {
      const result = {
        success: {},
      };

      expect(extractResultDiff(result, 'file.ts')).toBeNull();
    });

    it('should return null for null result', () => {
      expect(extractResultDiff(null, 'file.ts')).toBeNull();
    });

    it('should use raw diffString if no hunks extracted', () => {
      const result = {
        success: {
          diffString: 'plain text without hunks',
        },
      };

      const change = extractResultDiff(result, 'file.ts');

      expect(change).not.toBeNull();
      if (change && 'unifiedDiff' in change) {
        expect(change.unifiedDiff).toBe('plain text without hunks');
      }
    });
  });

  describe('isValidUnifiedDiff()', () => {
    it('should return true for valid unified diff', () => {
      const diff = `@@ -1,1 +1,1 @@
-old
+new`;

      expect(isValidUnifiedDiff(diff)).toBe(true);
    });

    it('should return true for diff with file headers', () => {
      const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
-old
+new`;

      expect(isValidUnifiedDiff(diff)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidUnifiedDiff('')).toBe(false);
      expect(isValidUnifiedDiff('   ')).toBe(false);
    });

    it('should return false for diff without @@ markers', () => {
      expect(isValidUnifiedDiff('-old\n+new')).toBe(false);
    });

    it('should return false for diff without changes', () => {
      const diff = `@@ -1,1 +1,1 @@
 context line only`;

      expect(isValidUnifiedDiff(diff)).toBe(false);
    });

    it('should handle diff with only additions', () => {
      const diff = `@@ -0,0 +1,2 @@
+line 1
+line 2`;

      expect(isValidUnifiedDiff(diff)).toBe(true);
    });

    it('should handle diff with only deletions', () => {
      const diff = `@@ -1,2 +0,0 @@
-line 1
-line 2`;

      expect(isValidUnifiedDiff(diff)).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete edit workflow with applyPatch', () => {
      const patchContent = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,5 @@
 export function hello() {
-  console.log('Hello');
+  console.log('Hello World');
 }`;

      const hunks = extractUnifiedDiffHunks(patchContent);
      const diff = concatenateDiffHunks('src/index.ts', hunks);

      expect(isValidUnifiedDiff(diff)).toBe(true);
      expect(diff).toContain('--- a/src/index.ts');
      expect(diff).toContain('+++ b/src/index.ts');
      expect(diff).toContain("console.log('Hello World')");
    });

    it('should handle complete edit workflow with strReplace', () => {
      const oldText = 'const API_URL = "http://localhost:3000";';
      const newText = 'const API_URL = "https://api.prod.com";';

      const diff = createUnifiedDiff('config.ts', oldText, newText);

      expect(isValidUnifiedDiff(diff)).toBe(true);
      expect(diff).toContain('--- a/config.ts');
      expect(diff).toContain('-const API_URL = "http://localhost:3000"');
      expect(diff).toContain('+const API_URL = "https://api.prod.com"');
    });

    it('should handle complete edit workflow with multiStrReplace', () => {
      const edits = [
        { oldText: 'import { A }', newText: 'import { A, B }' },
        { oldText: 'export default A;', newText: 'export default { A, B };' },
      ];

      const hunks = edits.map((edit) =>
        createUnifiedDiffHunk(edit.oldText, edit.newText)
      );
      const diff = concatenateDiffHunks('module.ts', hunks);

      expect(isValidUnifiedDiff(diff)).toBe(true);
      expect(diff).toContain('import { A, B }');
      expect(diff).toContain('export default { A, B }');
    });
  });

  describe('Edge Cases', () => {
    it('should handle patch with Windows line endings', () => {
      const patch = `@@ -1,1 +1,1 @@\r\n-old\r\n+new\r\n`;

      const hunks = extractUnifiedDiffHunks(patch);

      expect(hunks).toHaveLength(1);
    });

    it('should handle very long lines', () => {
      const longLine = 'x'.repeat(10000);
      const hunk = createUnifiedDiffHunk(longLine, longLine + 'y');

      expect(hunk).toContain(`-${longLine}`);
      expect(hunk).toContain(`+${longLine}y`);
    });

    it('should handle special characters in diff', () => {
      const oldText = 'const regex = /[a-z]+/;';
      const newText = 'const regex = /[a-zA-Z0-9]+/;';

      const diff = createUnifiedDiff('file.ts', oldText, newText);

      expect(diff).toContain('-const regex = /[a-z]+/;');
      expect(diff).toContain('+const regex = /[a-zA-Z0-9]+/;');
    });

    it('should handle empty multiStrReplace edits array', () => {
      const args = {
        path: '/project/file.ts',
        multiStrReplace: {
          edits: [],
        },
      };

      const changes = extractEditChanges(args, 'file.ts');

      expect(changes).toEqual([]);
    });
  });
});
