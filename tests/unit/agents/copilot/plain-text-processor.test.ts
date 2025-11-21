/**
 * Unit tests for PlainTextLogProcessor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PlainTextLogProcessor,
  CounterIndexProvider,
  type ConversationPatch,
} from '@/agents/copilot/plain-text-processor';
import type { NormalizedEntry } from '@/agents/types/agent-executor';

describe('PlainTextLogProcessor', () => {
  let processor: PlainTextLogProcessor;
  let indexProvider: CounterIndexProvider;

  beforeEach(() => {
    indexProvider = new CounterIndexProvider(0);
    processor = PlainTextLogProcessor.builder()
      .normalizedEntryProducer(
        (content: string): NormalizedEntry => ({
          index: 0,
          timestamp: new Date('2024-01-01'),
          type: { kind: 'assistant_message' },
          content,
          metadata: undefined,
        })
      )
      .setIndexProvider(indexProvider)
      .build();
  });

  describe('ANSI Escape Stripping', () => {
    it('should strip color codes', () => {
      const lineWithColors = '\x1b[32mGreen text\x1b[0m\n';
      const patches = processor.process(lineWithColors);

      expect(patches).toHaveLength(1);
      expect(patches[0].entry.content).toBe('Green text\n');
    });

    it('should strip bold formatting', () => {
      const lineWithBold = '\x1b[1mBold text\x1b[0m\n';
      const patches = processor.process(lineWithBold);

      expect(patches).toHaveLength(1);
      expect(patches[0].entry.content).toBe('Bold text\n');
    });

    it('should strip multiple ANSI codes', () => {
      const complexLine = '\x1b[31m\x1b[1mRed Bold\x1b[0m \x1b[32mGreen\x1b[0m\n';
      const patches = processor.process(complexLine);

      expect(patches).toHaveLength(1);
      expect(patches[0].entry.content).toBe('Red Bold Green\n');
    });
  });

  describe('Line Batching', () => {
    it('should create add patch for first line', () => {
      const patches = processor.process('First line\n');

      expect(patches).toHaveLength(1);
      expect(patches[0].type).toBe('add');
      expect(patches[0].index).toBe(0);
      expect(patches[0].entry.content).toBe('First line\n');
    });

    it('should create replace patches for subsequent lines', () => {
      processor.process('First line\n');
      const patches = processor.process('Second line\n');

      expect(patches).toHaveLength(1);
      expect(patches[0].type).toBe('replace');
      expect(patches[0].index).toBe(0);
      expect(patches[0].entry.content).toBe('First line\nSecond line\n');
    });

    it('should flush paragraph on blank line', () => {
      processor.process('Line 1\n');
      processor.process('Line 2\n');
      const patches = processor.process('\n');

      expect(patches).toHaveLength(1);
      expect(patches[0].type).toBe('replace');
      expect(patches[0].entry.content).toBe('Line 1\nLine 2\n');
    });

    it('should start new paragraph after blank line', () => {
      processor.process('Paragraph 1\n');
      processor.process('\n'); // Flush

      const patches = processor.process('Paragraph 2\n');

      expect(patches).toHaveLength(1);
      expect(patches[0].type).toBe('add');
      expect(patches[0].index).toBe(1); // New index
      expect(patches[0].entry.content).toBe('Paragraph 2\n');
    });

    it('should handle multiple consecutive blank lines', () => {
      processor.process('Line 1\n');
      processor.process('\n');
      const patches = processor.process('\n');

      // Second blank line should return empty array (buffer already empty)
      expect(patches).toHaveLength(0);
    });
  });

  describe('Streaming Updates', () => {
    it('should emit progressive updates for multi-line content', () => {
      const patches1 = processor.process('Line 1\n');
      const patches2 = processor.process('Line 2\n');
      const patches3 = processor.process('Line 3\n');

      // First line: add
      expect(patches1[0].type).toBe('add');
      expect(patches1[0].entry.content).toBe('Line 1\n');

      // Subsequent lines: replace with cumulative content
      expect(patches2[0].type).toBe('replace');
      expect(patches2[0].entry.content).toBe('Line 1\nLine 2\n');

      expect(patches3[0].type).toBe('replace');
      expect(patches3[0].entry.content).toBe('Line 1\nLine 2\nLine 3\n');
    });

    it('should use same index for paragraph', () => {
      const patches1 = processor.process('Line 1\n');
      const patches2 = processor.process('Line 2\n');

      expect(patches1[0].index).toBe(patches2[0].index);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty lines (whitespace only)', () => {
      const patches = processor.process('   \n');

      // Empty line (whitespace trimmed) should flush
      expect(patches).toHaveLength(0);
    });

    it('should handle very long lines', () => {
      const longLine = 'x'.repeat(10000) + '\n';
      const patches = processor.process(longLine);

      expect(patches).toHaveLength(1);
      expect(patches[0].entry.content).toHaveLength(10001);
    });

    it('should handle lines without newlines', () => {
      const patches = processor.process('No newline');

      expect(patches).toHaveLength(1);
      expect(patches[0].entry.content).toBe('No newline');
    });

    it('should handle flush() for pending content', () => {
      processor.process('Pending line\n');
      const patch = processor.flush();

      expect(patch).not.toBeNull();
      expect(patch!.type).toBe('replace');
      expect(patch!.entry.content).toBe('Pending line\n');
    });

    it('should return null from flush() when buffer empty', () => {
      const patch = processor.flush();
      expect(patch).toBeNull();
    });
  });

  describe('Builder Pattern', () => {
    it('should require entryProducer', () => {
      expect(() => {
        PlainTextLogProcessor.builder()
          .setIndexProvider(new CounterIndexProvider(0))
          .build();
      }).toThrow('entryProducer and indexProvider are required');
    });

    it('should require indexProvider', () => {
      expect(() => {
        PlainTextLogProcessor.builder()
          .normalizedEntryProducer(() => ({
            index: 0,
            timestamp: new Date(),
            type: { kind: 'assistant_message' },
            content: '',
            metadata: undefined,
          }))
          .build();
      }).toThrow('entryProducer and indexProvider are required');
    });

    it('should support optional transformLines', () => {
      const processorWithTransform = PlainTextLogProcessor.builder()
        .normalizedEntryProducer((content) => ({
          index: 0,
          timestamp: new Date(),
          type: { kind: 'assistant_message' },
          content,
          metadata: undefined,
        }))
        .transformLinesFunc((lines) => {
          // Transform each line to uppercase
          lines.forEach((line, i) => {
            lines[i] = line.toUpperCase();
          });
        })
        .setIndexProvider(new CounterIndexProvider(0))
        .build();

      processorWithTransform.process('lowercase\n');
      const patch = processorWithTransform.flush();

      expect(patch!.entry.content).toBe('LOWERCASE\n');
    });
  });
});

describe('CounterIndexProvider', () => {
  it('should start at specified index', () => {
    const provider = new CounterIndexProvider(5);
    expect(provider.next()).toBe(5);
  });

  it('should increment on each call', () => {
    const provider = new CounterIndexProvider(0);
    expect(provider.next()).toBe(0);
    expect(provider.next()).toBe(1);
    expect(provider.next()).toBe(2);
  });

  it('should default to 0', () => {
    const provider = new CounterIndexProvider();
    expect(provider.next()).toBe(0);
  });
});
