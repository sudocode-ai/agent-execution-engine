/**
 * Plain Text Log Processor
 *
 * Processes plain text output from GitHub Copilot CLI, stripping ANSI escape codes
 * and batching lines into paragraphs for normalized output.
 *
 * @module execution-engine/agents/copilot
 */

import stripAnsi from 'strip-ansi';
import type { NormalizedEntry } from '../types/agent-executor.js';

/**
 * Entry index provider for generating sequential entry indices
 */
export interface EntryIndexProvider {
  /**
   * Get the next available entry index
   */
  next(): number;
}

/**
 * Simple counter-based entry index provider
 */
export class CounterIndexProvider implements EntryIndexProvider {
  private currentIndex: number;

  constructor(startIndex: number = 0) {
    this.currentIndex = startIndex;
  }

  next(): number {
    return this.currentIndex++;
  }
}

/**
 * Conversation patch operation
 *
 * Represents a change to the conversation history (add new entry or replace existing)
 */
export interface ConversationPatch {
  /** Patch type: add new entry or replace existing */
  type: 'add' | 'replace';
  /** Entry index in conversation */
  index: number;
  /** Normalized entry content */
  entry: NormalizedEntry;
}

/**
 * Configuration for PlainTextLogProcessor
 */
export interface PlainTextProcessorConfig {
  /**
   * Function to create NormalizedEntry from content string
   */
  entryProducer: (content: string) => NormalizedEntry;

  /**
   * Optional function to transform lines before processing
   * Receives mutable array of lines that can be modified in-place
   */
  transformLines?: (lines: string[]) => void;

  /**
   * Provider for generating entry indices
   */
  indexProvider: EntryIndexProvider;
}

/**
 * Plain Text Log Processor
 *
 * Processes plain text output streams by:
 * 1. Stripping ANSI escape codes from each line
 * 2. Batching lines into paragraphs (separated by blank lines)
 * 3. Creating normalized entries for streaming updates
 *
 * @example
 * ```typescript
 * const processor = PlainTextLogProcessor.builder()
 *   .normalizedEntryProducer((content) => ({
 *     timestamp: new Date(),
 *     type: { kind: 'assistant_message' },
 *     content,
 *     metadata: null,
 *   }))
 *   .indexProvider(new CounterIndexProvider(0))
 *   .build();
 *
 * // Process output line by line
 * for await (const line of outputLines) {
 *   const patches = processor.process(line);
 *   for (const patch of patches) {
 *     msgStore.push(patch);
 *   }
 * }
 * ```
 */
export class PlainTextLogProcessor {
  private config: PlainTextProcessorConfig;
  private lineBuffer: string[] = [];
  private currentIndex: number | null = null;

  /**
   * Create a new PlainTextLogProcessor with the given configuration
   *
   * @param config - Processor configuration
   */
  constructor(config: PlainTextProcessorConfig) {
    this.config = config;
  }

  /**
   * Create a builder for configuring the processor
   *
   * @returns New builder instance
   */
  static builder(): PlainTextProcessorBuilder {
    return new PlainTextProcessorBuilder();
  }

  /**
   * Process a line of output and return patches to emit
   *
   * Lines are batched into paragraphs. A paragraph ends when:
   * - An empty line is encountered (blank line separator)
   * - The paragraph is explicitly flushed
   *
   * **Streaming behavior**:
   * - First line of paragraph: Emits 'add' patch
   * - Subsequent lines: Emit 'replace' patches to update the entry
   * - Blank line: Flushes paragraph and resets buffer
   *
   * @param line - Output line to process (may include ANSI escapes)
   * @returns Array of patches to apply (usually 0-1 patches)
   *
   * @example
   * ```typescript
   * // First line
   * processor.process("Hello\n"); // [{ type: 'add', index: 0, entry: {...} }]
   *
   * // Continuation
   * processor.process("World\n"); // [{ type: 'replace', index: 0, entry: {...} }]
   *
   * // Blank line (flush)
   * processor.process("\n"); // [{ type: 'replace', index: 0, entry: {...} }]
   * ```
   */
  process(line: string): ConversationPatch[] {
    const patches: ConversationPatch[] = [];

    // Strip ANSI escapes
    const cleanLine = stripAnsi(line);

    // Check if this is a blank line (paragraph separator)
    if (cleanLine.trim() === '') {
      if (this.lineBuffer.length > 0) {
        // Flush current paragraph
        patches.push(this.flushParagraph());
      }
      return patches;
    }

    // Add line to buffer
    this.lineBuffer.push(cleanLine);

    // If this is the first line, allocate a new index
    if (this.currentIndex === null) {
      this.currentIndex = this.config.indexProvider.next();
    }

    // Create or update entry
    const content = this.lineBuffer.join('');
    const entry = this.config.entryProducer(content);

    if (this.lineBuffer.length === 1) {
      // First line of paragraph - add new entry
      patches.push({
        type: 'add',
        index: this.currentIndex,
        entry,
      });
    } else {
      // Subsequent lines - replace existing entry
      patches.push({
        type: 'replace',
        index: this.currentIndex,
        entry,
      });
    }

    return patches;
  }

  /**
   * Flush the current paragraph buffer
   *
   * Applies line transformations (if configured) and creates a final
   * replace patch with the complete paragraph content.
   *
   * @returns Final replace patch for the paragraph
   */
  private flushParagraph(): ConversationPatch {
    // Apply line transformations if configured
    if (this.config.transformLines) {
      this.config.transformLines(this.lineBuffer);
    }

    const content = this.lineBuffer.join('');
    const entry = this.config.entryProducer(content);

    const patch: ConversationPatch = {
      type: 'replace',
      index: this.currentIndex!,
      entry,
    };

    // Reset state
    this.lineBuffer = [];
    this.currentIndex = null;

    return patch;
  }

  /**
   * Force flush any pending content
   *
   * Useful when the stream ends without a trailing blank line.
   *
   * @returns Final patch if buffer has content, null otherwise
   */
  flush(): ConversationPatch | null {
    if (this.lineBuffer.length === 0) {
      return null;
    }
    return this.flushParagraph();
  }
}

/**
 * Builder for PlainTextLogProcessor
 *
 * Provides a fluent API for configuring the processor.
 *
 * @example
 * ```typescript
 * const processor = PlainTextLogProcessor.builder()
 *   .normalizedEntryProducer((content) => createEntry(content))
 *   .transformLines((lines) => {
 *     // Strip ANSI from each line
 *     lines.forEach((line, i) => {
 *       lines[i] = stripAnsi(line);
 *     });
 *   })
 *   .indexProvider(new CounterIndexProvider(0))
 *   .build();
 * ```
 */
export class PlainTextProcessorBuilder {
  private entryProducer?: (content: string) => NormalizedEntry;
  private transformLines?: (lines: string[]) => void;
  private indexProvider?: EntryIndexProvider;

  /**
   * Set the entry producer function
   *
   * @param producer - Function that creates NormalizedEntry from content string
   * @returns This builder for chaining
   */
  normalizedEntryProducer(
    producer: (content: string) => NormalizedEntry
  ): this {
    this.entryProducer = producer;
    return this;
  }

  /**
   * Set the line transformation function
   *
   * @param transformer - Function that modifies lines array in-place
   * @returns This builder for chaining
   */
  transformLinesFunc(transformer: (lines: string[]) => void): this {
    this.transformLines = transformer;
    return this;
  }

  /**
   * Set the entry index provider
   *
   * @param provider - Provider for generating entry indices
   * @returns This builder for chaining
   */
  setIndexProvider(provider: EntryIndexProvider): this {
    this.indexProvider = provider;
    return this;
  }

  /**
   * Build the configured processor
   *
   * @returns New PlainTextLogProcessor instance
   * @throws Error if required configuration is missing
   */
  build(): PlainTextLogProcessor {
    if (!this.entryProducer || !this.indexProvider) {
      throw new Error(
        'entryProducer and indexProvider are required to build PlainTextLogProcessor'
      );
    }

    return new PlainTextLogProcessor({
      entryProducer: this.entryProducer,
      transformLines: this.transformLines,
      indexProvider: this.indexProvider,
    });
  }
}
