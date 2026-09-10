/**
 * Bounded sliding-window buffer. This is what stops the dataset from
 * growing forever: every push() beyond `maxSize` evicts from the front,
 * so memory usage plateaus instead of climbing for as long as the tab
 * stays open (the exact "unbounded array + setInterval" leak pattern
 * CLAUDE.md calls out).
 *
 * Trimming is batched (only runs once the buffer is 10% over budget, and
 * removes back down to budget) rather than done on every single push.
 * array.shift() is O(n); doing that on every 100ms tick against a
 * 10k+-element array would mean a lot of wasted element copying for no
 * benefit, since one point over budget is not visually different from
 * being exactly at budget.
 */
export class BoundedBuffer<T> {
  private items: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.maxSize * 1.1) {
      this.items.splice(0, this.items.length - this.maxSize);
    }
  }

  setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
    if (this.items.length > maxSize) {
      this.items.splice(0, this.items.length - maxSize);
    }
  }

  /** Returns the live backing array. Callers must treat it as read-only. */
  snapshot(): readonly T[] {
    return this.items;
  }

  get length(): number {
    return this.items.length;
  }

  seed(items: T[]): void {
    this.items = items.slice(-this.maxSize);
  }

  clear(): void {
    this.items = [];
  }
}
