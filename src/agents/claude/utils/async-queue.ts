/**
 * AsyncQueue - Async iterable queue for streaming SDK input
 *
 * Allows pushing messages that can be consumed as an async iterable.
 * Used to stream user messages to the SDK's query() function.
 *
 * @example
 * ```typescript
 * const queue = new AsyncQueue<string>();
 *
 * // Consumer
 * (async () => {
 *   for await (const item of queue) {
 *     console.log(item);
 *   }
 * })();
 *
 * // Producer
 * queue.push('first');
 * queue.push('second');
 * queue.close();
 * ```
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private resolvers: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;
  private error: Error | null = null;

  /**
   * Push an item to the queue
   * @throws Error if the queue is closed
   */
  push(item: T): void {
    if (this.closed) {
      throw new Error("Queue is closed");
    }

    if (this.resolvers.length > 0) {
      // There's a waiting consumer, resolve immediately
      const resolve = this.resolvers.shift()!;
      resolve({ value: item, done: false });
    } else {
      // No waiting consumers, add to queue
      this.queue.push(item);
    }
  }

  /**
   * Close the queue (signal no more items)
   * Any waiting consumers will receive done: true
   */
  close(): void {
    if (this.closed) return;

    this.closed = true;
    // Resolve any waiting consumers with done
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as T, done: true });
    }
    this.resolvers = [];
  }

  /**
   * Close the queue with an error
   * Any waiting consumers will have the error thrown
   */
  closeWithError(error: Error): void {
    if (this.closed) return;

    this.closed = true;
    this.error = error;

    // Reject any waiting consumers
    // Note: We can't reject through IteratorResult, so we store the error
    // and throw it when the iterator is next called
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as T, done: true });
    }
    this.resolvers = [];
  }

  /**
   * Check if queue is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Check if queue has pending items
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Check if there are waiting consumers
   */
  get waitingConsumers(): number {
    return this.resolvers.length;
  }

  /**
   * Async iterator implementation
   */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        // Check for error
        if (this.error) {
          throw this.error;
        }

        // If there are items in the queue, return one
        if (this.queue.length > 0) {
          return { value: this.queue.shift()!, done: false };
        }

        // If closed and no items, we're done
        if (this.closed) {
          return { value: undefined as T, done: true };
        }

        // Wait for an item to be pushed
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      },

      return: async (): Promise<IteratorResult<T>> => {
        // Called when consumer breaks out of for-await-of
        this.close();
        return { value: undefined as T, done: true };
      },

      throw: async (error: Error): Promise<IteratorResult<T>> => {
        // Called when consumer throws
        this.closeWithError(error);
        throw error;
      },
    };
  }
}
