/**
 * Rolling FPS counter driven by requestAnimationFrame timestamps.
 * "Dropped frames" is estimated against a 60fps budget (16.7ms/frame):
 * any inter-frame gap bigger than ~1.5 frames counts the extra frames as
 * dropped. This is what lets the UI show a real, measured FPS number
 * instead of an assumed one.
 */
export class FpsTracker {
  private frameTimes: number[] = [];
  private lastFrameTime = 0;
  private dropped = 0;
  private readonly windowMs = 1000;

  tick(now: number): void {
    if (this.lastFrameTime > 0) {
      const delta = now - this.lastFrameTime;
      const expected = 1000 / 60;
      if (delta > expected * 1.5) {
        this.dropped += Math.round(delta / expected) - 1;
      }
    }
    this.lastFrameTime = now;
    this.frameTimes.push(now);
    const cutoff = now - this.windowMs;
    while (this.frameTimes.length > 0 && this.frameTimes[0]! < cutoff) {
      this.frameTimes.shift();
    }
  }

  get fps(): number {
    if (this.frameTimes.length < 2) return 0;
    // Safe: length >= 2 was just checked.
    const first = this.frameTimes[0]!;
    const last = this.frameTimes[this.frameTimes.length - 1]!;
    const durationSec = (last - first) / 1000;
    if (durationSec <= 0) return 0;
    return Math.round((this.frameTimes.length - 1) / durationSec);
  }

  get droppedFrames(): number {
    return this.dropped;
  }

  reset(): void {
    this.frameTimes = [];
    this.lastFrameTime = 0;
    this.dropped = 0;
  }
}

/** performance.memory is Chrome-only and non-standard; every other browser gets `undefined`. */
export function getMemoryUsageMB(): number | undefined {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
  if (perf.memory?.usedJSHeapSize) {
    return Math.round((perf.memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
  }
  return undefined;
}

/** Small helper so render/processing timings read as "measure(fn)" instead of manual now()/now() pairs everywhere. */
export function measure<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  return { result, ms };
}
