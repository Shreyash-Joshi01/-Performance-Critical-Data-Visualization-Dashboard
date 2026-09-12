/**
 * Typed-array versions of the LOD (lib/lod.ts) and aggregation
 * (lib/aggregation.ts) reductions, plus the message protocol for
 * public/workers/dataProcessor.worker.js (see that file's comment for why
 * it's a hand-mirrored plain-JS copy rather than importing this file).
 *
 * Why a second implementation instead of reusing lib/lod.ts directly: those
 * operate on DataPoint[] (arrays of {timestamp,value,category,metadata}
 * objects). Sending a few thousand JS objects across a postMessage is a
 * real structured-clone cost (the engine walks and copies every object,
 * every key). Float64Arrays are "transferable" instead: postMessage moves
 * ownership of the underlying ArrayBuffer with an O(1) pointer handoff, no
 * copy at all. So the main thread converts each category's DataPoint slice
 * into two flat Float64Arrays (timestamps, values) once, transfers them,
 * and the worker hands back typed-array results the same way. This file is
 * the logic shared by both sides of that boundary: the worker runs it on
 * the worker thread, and hooks/useProcessedSeries.ts runs the exact same
 * functions synchronously on the main thread as a fallback (first paint,
 * or if Workers aren't supported) — so "offloaded" and "fallback" output
 * are guaranteed identical, not two implementations that can drift apart.
 */

export interface LodArrays {
  x: Float64Array;
  min: Float64Array;
  max: Float64Array;
  avg: Float64Array;
}

export interface AggArrays {
  bucketStart: Float64Array;
  min: Float64Array;
  max: Float64Array;
  avg: Float64Array;
  count: Float64Array;
}

/** Typed-array equivalent of lib/lod.ts's levelOfDetail(). Same bucketing rule, same min/max/avg-per-bucket output. */
export function lodFromArrays(timestamps: Float64Array, values: Float64Array, count: number, targetBuckets: number): LodArrays {
  if (count === 0) return { x: new Float64Array(0), min: new Float64Array(0), max: new Float64Array(0), avg: new Float64Array(0) };
  if (count <= targetBuckets) {
    // Fewer raw points than pixels — no reduction needed, pass them through as 1-sample "buckets".
    return { x: timestamps.slice(0, count), min: values.slice(0, count), max: values.slice(0, count), avg: values.slice(0, count) };
  }

  const first = timestamps[0]!;
  const last = timestamps[count - 1]!;
  const span = last - first || 1;
  const bucketSize = span / targetBuckets;

  const sum = new Float64Array(targetBuckets);
  const min = new Float64Array(targetBuckets).fill(Infinity);
  const max = new Float64Array(targetBuckets).fill(-Infinity);
  const bucketCount = new Int32Array(targetBuckets);

  for (let i = 0; i < count; i++) {
    let idx = Math.floor((timestamps[i]! - first) / bucketSize);
    if (idx >= targetBuckets) idx = targetBuckets - 1;
    if (idx < 0) idx = 0;
    const v = values[i]!;
    sum[idx]! += v;
    if (v < min[idx]!) min[idx] = v;
    if (v > max[idx]!) max[idx] = v;
    bucketCount[idx]! += 1;
  }

  // Compact out empty buckets (same as lib/lod.ts skipping undefined slots) so the
  // renderer never draws a spurious 0-value point for a bucket nothing landed in.
  let used = 0;
  for (let i = 0; i < targetBuckets; i++) if (bucketCount[i]! > 0) used++;

  const x = new Float64Array(used);
  const outMin = new Float64Array(used);
  const outMax = new Float64Array(used);
  const outAvg = new Float64Array(used);
  let w = 0;
  for (let i = 0; i < targetBuckets; i++) {
    const c = bucketCount[i]!;
    if (c === 0) continue;
    x[w] = first + i * bucketSize;
    outMin[w] = min[i]!;
    outMax[w] = max[i]!;
    outAvg[w] = sum[i]! / c;
    w++;
  }

  return { x, min: outMin, max: outMax, avg: outAvg };
}

/** Typed-array equivalent of lib/aggregation.ts's aggregate() for a single category (no category key needed — caller already split by category). */
export function aggregateFromArrays(timestamps: Float64Array, values: Float64Array, count: number, bucketSizeMs: number): AggArrays {
  if (count === 0 || bucketSizeMs <= 0) {
    return { bucketStart: timestamps.slice(0, count), min: values.slice(0, count), max: values.slice(0, count), avg: values.slice(0, count), count: new Float64Array(count).fill(1) };
  }

  const buckets = new Map<number, { sum: number; min: number; max: number; count: number }>();
  for (let i = 0; i < count; i++) {
    const bucketStart = Math.floor(timestamps[i]! / bucketSizeMs) * bucketSizeMs;
    const v = values[i]!;
    let b = buckets.get(bucketStart);
    if (!b) {
      b = { sum: 0, min: v, max: v, count: 0 };
      buckets.set(bucketStart, b);
    }
    b.sum += v;
    if (v < b.min) b.min = v;
    if (v > b.max) b.max = v;
    b.count += 1;
  }

  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
  const bucketStart = new Float64Array(keys.length);
  const min = new Float64Array(keys.length);
  const max = new Float64Array(keys.length);
  const avg = new Float64Array(keys.length);
  const cnt = new Float64Array(keys.length);
  keys.forEach((k, i) => {
    const b = buckets.get(k)!;
    bucketStart[i] = k;
    min[i] = b.min;
    max[i] = b.max;
    avg[i] = b.sum / b.count;
    cnt[i] = b.count;
  });

  return { bucketStart, min, max, avg, count: cnt };
}

// ---- Worker message protocol ----

export type ProcessingMode = { kind: "lod"; targetBuckets: number } | { kind: "aggregate"; bucketSizeMs: number };

export interface CategoryJob {
  category: string;
  timestamps: Float64Array;
  values: Float64Array;
  count: number;
}

export interface WorkerRequest {
  id: number;
  mode: ProcessingMode;
  jobs: CategoryJob[];
}

export interface CategoryResult {
  category: string;
  /** Bucket start / representative timestamp — `x` for LOD, `bucketStart` for aggregate. */
  x: Float64Array;
  min: Float64Array;
  max: Float64Array;
  avg: Float64Array;
  /** Samples per bucket; empty in LOD mode (not used there), populated in aggregate mode. */
  count: Float64Array;
}

export interface WorkerResponse {
  id: number;
  results: CategoryResult[];
}
