import { DataPoint } from "./types";

export interface LodBucket {
  x: number; // representative timestamp (bucket start)
  min: number;
  max: number;
  avg: number;
}

/**
 * Level-of-detail reduction for the line chart: when more data points map
 * to the visible pixel range than there are physical pixels, drawing every
 * point is wasted work (many points land on the same x pixel) and actually
 * looks *worse* (a solid smear rather than a legible trend line).
 *
 * We bucket points into `targetBuckets` (≈ canvas width in CSS pixels) and
 * keep min/max/avg per bucket, so spikes are never silently averaged away —
 * a single one-sample anomaly still shows up as a min/max excursion.
 */
export function levelOfDetail(points: readonly DataPoint[], targetBuckets: number): LodBucket[] {
  if (points.length === 0) return [];
  if (points.length <= targetBuckets) {
    return points.map((p) => ({ x: p.timestamp, min: p.value, max: p.value, avg: p.value }));
  }

  // Safe: the points.length === 0 check above already returned.
  const first = points[0]!.timestamp;
  const last = points[points.length - 1]!.timestamp;
  const span = last - first || 1;
  const bucketSize = span / targetBuckets;

  const buckets: { sum: number; min: number; max: number; count: number; x: number }[] = [];

  for (const p of points) {
    let idx = Math.floor((p.timestamp - first) / bucketSize);
    if (idx >= targetBuckets) idx = targetBuckets - 1;
    let b = buckets[idx];
    if (!b) {
      b = { sum: 0, min: p.value, max: p.value, count: 0, x: first + idx * bucketSize };
      buckets[idx] = b;
    }
    b.sum += p.value;
    b.min = Math.min(b.min, p.value);
    b.max = Math.max(b.max, p.value);
    b.count += 1;
  }

  const out: LodBucket[] = [];
  for (const b of buckets) {
    if (!b) continue;
    out.push({ x: b.x, min: b.min, max: b.max, avg: b.sum / b.count });
  }
  return out;
}
