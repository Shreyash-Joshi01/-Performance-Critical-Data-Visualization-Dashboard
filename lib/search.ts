/**
 * Binary search over time-ordered arrays. Every buffer (BoundedBuffer)
 * stays sorted by timestamp because points are only ever appended in
 * arrival order, so "give me the points visible in this viewport" never
 * needs a linear scan or a re-sort — it's two O(log n) searches.
 *
 * At 12,500 points/category (50k total / 4) and a redraw on every
 * animation frame, the difference between this and Array.prototype.filter
 * is the difference between ~14 comparisons and ~12,500 per chart per
 * frame — the kind of thing that doesn't matter at 1k points and matters
 * a great deal at 50k.
 */
export function lowerBound<T extends { timestamp: number }>(arr: readonly T[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    // Safe by loop invariant: 0 <= mid < hi <= arr.length.
    if (arr[mid]!.timestamp < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function upperBound<T extends { timestamp: number }>(arr: readonly T[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]!.timestamp <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function sliceByTimeRange<T extends { timestamp: number }>(arr: readonly T[], start: number, end: number): readonly T[] {
  const lo = lowerBound(arr, start);
  const hi = upperBound(arr, end);
  return arr.slice(lo, hi);
}
