/**
 * AsyncQueue Tests
 *
 * Tests for async iterable queue utility.
 */

import { describe, it, expect, vi } from "vitest";
import { AsyncQueue } from "@/agents/claude/utils/async-queue";

describe("AsyncQueue", () => {
  describe("basic operations", () => {
    it("should create an empty queue", () => {
      const queue = new AsyncQueue<string>();

      expect(queue.isClosed()).toBe(false);
      expect(queue.length).toBe(0);
      expect(queue.waitingConsumers).toBe(0);
    });

    it("should push and iterate items in order", async () => {
      const queue = new AsyncQueue<string>();
      const items: string[] = [];

      // Push items first
      queue.push("first");
      queue.push("second");
      queue.push("third");
      queue.close();

      // Then consume
      for await (const item of queue) {
        items.push(item);
      }

      expect(items).toEqual(["first", "second", "third"]);
    });

    it("should handle concurrent push and consume", async () => {
      const queue = new AsyncQueue<number>();
      const items: number[] = [];

      // Start consuming in background
      const consumerPromise = (async () => {
        for await (const item of queue) {
          items.push(item);
        }
      })();

      // Push items with delays
      queue.push(1);
      await new Promise((r) => setTimeout(r, 10));
      queue.push(2);
      await new Promise((r) => setTimeout(r, 10));
      queue.push(3);
      queue.close();

      await consumerPromise;

      expect(items).toEqual([1, 2, 3]);
    });

    it("should wait for items when queue is empty", async () => {
      const queue = new AsyncQueue<string>();
      const items: string[] = [];

      // Start consuming (will wait)
      const consumerPromise = (async () => {
        for await (const item of queue) {
          items.push(item);
        }
      })();

      // Push after a delay
      await new Promise((r) => setTimeout(r, 50));
      expect(queue.waitingConsumers).toBe(1);

      queue.push("delayed");
      queue.close();

      await consumerPromise;

      expect(items).toEqual(["delayed"]);
    });
  });

  describe("close()", () => {
    it("should stop iteration when closed", async () => {
      const queue = new AsyncQueue<string>();
      const items: string[] = [];

      queue.push("before");
      queue.close();
      queue.close(); // Should be idempotent

      for await (const item of queue) {
        items.push(item);
      }

      expect(items).toEqual(["before"]);
      expect(queue.isClosed()).toBe(true);
    });

    it("should throw when pushing to closed queue", () => {
      const queue = new AsyncQueue<string>();

      queue.close();

      expect(() => queue.push("after")).toThrow("Queue is closed");
    });

    it("should resolve waiting consumers with done", async () => {
      const queue = new AsyncQueue<string>();
      let done = false;

      // Start waiting
      const consumerPromise = (async () => {
        for await (const _item of queue) {
          // Should not receive any items
        }
        done = true;
      })();

      // Wait a bit then close
      await new Promise((r) => setTimeout(r, 10));
      expect(queue.waitingConsumers).toBe(1);

      queue.close();
      await consumerPromise;

      expect(done).toBe(true);
    });
  });

  describe("closeWithError()", () => {
    it("should throw error on next iteration", async () => {
      const queue = new AsyncQueue<string>();
      const error = new Error("Queue error");

      queue.closeWithError(error);

      await expect(async () => {
        for await (const _item of queue) {
          // Should throw
        }
      }).rejects.toThrow("Queue error");
    });

    it("should throw error for waiting consumers", async () => {
      const queue = new AsyncQueue<string>();
      const error = new Error("Async error");

      // Start consuming
      const consumerPromise = (async () => {
        const items: string[] = [];
        for await (const item of queue) {
          items.push(item);
        }
        return items;
      })();

      // Wait for consumer to start waiting
      await new Promise((r) => setTimeout(r, 10));

      queue.closeWithError(error);

      // Consumer should complete (error is thrown on next iteration)
      const items = await consumerPromise;
      expect(items).toEqual([]);
    });
  });

  describe("iterator protocol", () => {
    it("should support break in for-await-of", async () => {
      const queue = new AsyncQueue<number>();
      const items: number[] = [];

      queue.push(1);
      queue.push(2);
      queue.push(3);

      for await (const item of queue) {
        items.push(item);
        if (item === 2) break;
      }

      expect(items).toEqual([1, 2]);
      expect(queue.isClosed()).toBe(true); // Iterator.return called
    });

    it("should handle multiple iterators", async () => {
      const queue = new AsyncQueue<number>();
      const items1: number[] = [];
      const items2: number[] = [];

      queue.push(1);
      queue.push(2);
      queue.push(3);
      queue.push(4);
      queue.close();

      // Both iterators share the same queue
      const iter = queue[Symbol.asyncIterator]();

      const result1 = await iter.next();
      items1.push(result1.value);

      const result2 = await iter.next();
      items1.push(result2.value);

      const result3 = await iter.next();
      items2.push(result3.value);

      const result4 = await iter.next();
      items2.push(result4.value);

      expect(items1).toEqual([1, 2]);
      expect(items2).toEqual([3, 4]);
    });
  });

  describe("edge cases", () => {
    it("should handle empty queue being closed", async () => {
      const queue = new AsyncQueue<string>();
      const items: string[] = [];

      queue.close();

      for await (const item of queue) {
        items.push(item);
      }

      expect(items).toEqual([]);
    });

    it("should handle rapid push/consume cycles", async () => {
      const queue = new AsyncQueue<number>();
      const items: number[] = [];

      const consumerPromise = (async () => {
        for await (const item of queue) {
          items.push(item);
        }
      })();

      // Rapid fire
      for (let i = 0; i < 100; i++) {
        queue.push(i);
      }
      queue.close();

      await consumerPromise;

      expect(items.length).toBe(100);
      expect(items[0]).toBe(0);
      expect(items[99]).toBe(99);
    });

    it("should handle objects as items", async () => {
      interface Message {
        id: number;
        text: string;
      }

      const queue = new AsyncQueue<Message>();
      const items: Message[] = [];

      queue.push({ id: 1, text: "hello" });
      queue.push({ id: 2, text: "world" });
      queue.close();

      for await (const item of queue) {
        items.push(item);
      }

      expect(items).toEqual([
        { id: 1, text: "hello" },
        { id: 2, text: "world" },
      ]);
    });
  });
});
