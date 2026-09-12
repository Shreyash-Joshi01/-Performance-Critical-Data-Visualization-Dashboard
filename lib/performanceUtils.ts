/**
 * Rolling FPS counter driven by requestAnimationFrame timestamps.
 * "Dropped frames" is estimated against a 60fps budget (16.7ms/frame):
 * any inter-frame gap bigger than ~1.5 frames counts the extra frames as
 * dropped. This is what lets the UI show a real, measured FPS number
 * instead of an assumed one.
 *
 * Two bugs were found by testing this against a simulated tab-background
 * gap (a plain Node reproduction of this class, no browser needed — a
 * 30-second gap between two `tick()` calls) rather than by inspection:
 *
 * 1. `droppedFrames` was a lifetime-cumulative counter with no way back
 *    down. A single ~30s gap (switching tabs, the laptop sleeping, a
 *    DevTools breakpoint) added ~1,800 to it — and since nothing ever
 *    decremented it, "Dropped" stayed at that inflated number for the
 *    *rest of the session*, even seconds later once `fps` had already
 *    recovered to a clean 60. Fixed by keeping drop *events* in the same
 *    rolling `windowMs` window `fps` already uses, so a stall's effect on
 *    "Dropped" fades out exactly when it stops being recent — consistent
 *    with what `fps` already does, instead of two metrics on incompatible
 *    time semantics (one "right now", one "ever").
 * 2. The gap arithmetic didn't distinguish "the main thread was genuinely
 *    busy for 30s" (a real, meaningful stall) from "the tab was hidden for
 *    30s" (rAF is intentionally paused by the browser there — nothing was
 *    dropped because nothing was attempted). Counting a backgrounding gap
 *    as ~1,800 dropped frames is simply the wrong number, not just an
 *    unbounded one. Fixed by having the caller (usePerformanceMonitor.ts)
 *    tell `tick()` whether the document was hidden at any point since the
 *    last tick (via the Page Visibility API), and skipping drop-counting
 *    entirely for that gap when it was. A same-size gap that happens while
 *    the tab stays visible (a real stall) is still counted — this narrows
 *    what's excluded to gaps that aren't real rendering jank, it doesn't
 *    hide genuine ones.
 */
export class FpsTracker {
  private frameTimes: number[] = [];
  /** Rolling log of drop events `{time, count}` — trimmed by the same `windowMs` cutoff as `frameTimes`, so "Dropped" reflects recent stalls, not the session's entire history. */
  private dropEvents: { time: number; count: number }[] = [];
  private lastFrameTime = 0;
  private readonly windowMs = 1000;
  /** A single gap this large is almost certainly not real per-frame jank (a hidden-tab resume the visibility check below missed, a long GC pause, a suspended OS process) — cap what one gap can contribute so one freak event can't dominate the rolling window either. */
  private readonly maxCountedGapMs = 2000;

  /** @param wasHiddenSinceLastTick true if `document.visibilityState` was "hidden" at any point since the previous `tick()` — such a gap is excluded from drop-counting (see class comment). */
  tick(now: number, wasHiddenSinceLastTick = false): void {
    if (this.lastFrameTime > 0 && !wasHiddenSinceLastTick) {
      const delta = Math.min(now - this.lastFrameTime, this.maxCountedGapMs);
      const expected = 1000 / 60;
      if (delta > expected * 1.5) {
        this.dropEvents.push({ time: now, count: Math.round(delta / expected) - 1 });
      }
    }
    this.lastFrameTime = now;
    this.frameTimes.push(now);
    const cutoff = now - this.windowMs;
    while (this.frameTimes.length > 0 && this.frameTimes[0]! < cutoff) {
      this.frameTimes.shift();
    }
    while (this.dropEvents.length > 0 && this.dropEvents[0]!.time < cutoff) {
      this.dropEvents.shift();
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

  /** Dropped frames within the last `windowMs` (currently 1s) — "recent", not "all-time". */
  get droppedFrames(): number {
    let sum = 0;
    for (const e of this.dropEvents) sum += e.count;
    return sum;
  }

  reset(): void {
    this.frameTimes = [];
    this.dropEvents = [];
    this.lastFrameTime = 0;
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
