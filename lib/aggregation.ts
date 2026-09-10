import { AggregatedPoint, AggregationInterval, Category, DataPoint } from "./types";

export function intervalMs(interval: AggregationInterval): number {
  switch (interval) {
    case "1m":
      return 60_000;
    case "5m":
      return 5 * 60_000;
    case "1h":
      return 60 * 60_000;
    case "raw":
    default:
      return 0;
  }
}

/**
 * Groups points into fixed-size time buckets per category and reduces each
 * bucket to {min,max,avg,count}. This is what backs the "1min / 5min / 1hour"
 * aggregation controls and the bar chart: without it, a bar chart over a
 * long time range would need one bar per raw point (thousands of 1px-wide
 * bars) instead of one readable bar per bucket.
 */
export function aggregate(points: readonly DataPoint[], interval: AggregationInterval): AggregatedPoint[] {
  const bucketSize = intervalMs(interval);
  if (bucketSize === 0) {
    // "raw" — no aggregation, but still return the same shape so callers don't branch.
    return points.map((p) => ({
      bucketStart: p.timestamp,
      bucketEnd: p.timestamp,
      category: p.category,
      min: p.value,
      max: p.value,
      avg: p.value,
      count: 1,
    }));
  }

  const buckets = new Map<string, { sum: number; min: number; max: number; count: number; bucketStart: number; category: Category }>();

  for (const p of points) {
    const bucketStart = Math.floor(p.timestamp / bucketSize) * bucketSize;
    const key = `${p.category}:${bucketStart}`;
    let b = buckets.get(key);
    if (!b) {
      b = { sum: 0, min: p.value, max: p.value, count: 0, bucketStart, category: p.category };
      buckets.set(key, b);
    }
    b.sum += p.value;
    b.min = Math.min(b.min, p.value);
    b.max = Math.max(b.max, p.value);
    b.count += 1;
  }

  const result: AggregatedPoint[] = [];
  for (const b of buckets.values()) {
    result.push({
      bucketStart: b.bucketStart,
      bucketEnd: b.bucketStart + bucketSize,
      category: b.category,
      min: b.min,
      max: b.max,
      avg: b.sum / b.count,
      count: b.count,
    });
  }
  result.sort((a, b) => a.bucketStart - b.bucketStart);
  return result;
}
