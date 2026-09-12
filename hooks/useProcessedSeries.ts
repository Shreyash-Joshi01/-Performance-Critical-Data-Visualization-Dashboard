"use client";

import { useCallback, useEffect, useRef } from "react";
import { BoundedBuffer } from "@/lib/buffer";
import { sliceByTimeRange } from "@/lib/search";
import { CategoryJob, CategoryResult, ProcessingMode, WorkerResponse, lodFromArrays, aggregateFromArrays } from "@/lib/numericProcessing";
import { Category, DataPoint } from "@/lib/types";

export interface ProcessedSeriesHandle {
  /**
   * Call once per draw(). `mode` is passed per-call (not fixed at hook
   * construction) because LOD's targetBuckets depends on the canvas's
   * current CSS-pixel width, which draw() only learns from
   * useChartRenderer at call time — it can change on every resize.
   *
   * Reads straight from the live buffers and, if the result is stale for
   * the current viewport/data version/mode, fires an async request to the
   * worker (or — first call ever, or no worker available — computes
   * synchronously) so the caller always has *something* to draw.
   */
  getSeries: (
    buffers: Record<Category, BoundedBuffer<DataPoint>>,
    categories: Category[],
    startTime: number,
    endTime: number,
    dataVersion: number,
    mode: ProcessingMode
  ) => Map<Category, CategoryResult>;
  /** Bumped whenever a worker response lands, so callers can treat "new worker result" as its own dirty condition. */
  resultVersionRef: React.MutableRefObject<number>;
  usingWorker: () => boolean;
}

let nextRequestId = 1;

function buildJob(buffer: BoundedBuffer<DataPoint>, category: Category, startTime: number, endTime: number): CategoryJob {
  const slice = sliceByTimeRange(buffer.snapshot(), startTime, endTime);
  const n = slice.length;
  const timestamps = new Float64Array(n);
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    timestamps[i] = slice[i]!.timestamp;
    values[i] = slice[i]!.value;
  }
  return { category, timestamps, values, count: n };
}

function computeOne(job: CategoryJob, mode: ProcessingMode): CategoryResult {
  if (mode.kind === "lod") {
    const r = lodFromArrays(job.timestamps, job.values, job.count, mode.targetBuckets);
    return { category: job.category, x: r.x, min: r.min, max: r.max, avg: r.avg, count: new Float64Array(0) };
  }
  const r = aggregateFromArrays(job.timestamps, job.values, job.count, mode.bucketSizeMs);
  return { category: job.category, x: r.bucketStart, min: r.min, max: r.max, avg: r.avg, count: r.count };
}

/**
 * Owns one dedicated Worker (public/workers/dataProcessor.worker.js) that runs the
 * LOD/aggregation bucketing off the main thread, with a synchronous
 * fallback so the chart never blocks on — or breaks without — the worker.
 *
 * Why a fallback, not just "use the worker": (1) the very first frame has
 * no worker response yet (postMessage is async — there's a real round
 * trip), so a bootstrap draw would otherwise be blank; (2) Workers can be
 * unavailable (very old browsers, some locked-down embeds) or the worker
 * script can fail to construct; CLAUDE.md is explicit that a Worker must
 * never be the thing that destabilizes the MVP. Every path that can fail
 * falls back to calling the exact same lodFromArrays/aggregateFromArrays
 * functions synchronously on the main thread — identical output, just paid
 * for on this thread instead of the worker thread.
 *
 * Why the main thread still returns the *previous* result while a new one
 * is being computed, instead of blocking: draw() is called from inside a
 * requestAnimationFrame loop and cannot await a postMessage round trip
 * without stalling every other chart and all input handling for that
 * frame. So a change in data/viewport fires an async request and, this
 * frame, draws whatever was last resolved (the prior tick's bucketing) —
 * a one-tick lag, well under 100ms even outside stress mode — while the
 * actual bucketing math for the new tick runs in parallel on the worker
 * thread instead of inline in this rAF callback. At most one request is
 * ever in flight: a newer key arriving mid-request is simply not fired
 * (checked again next dirty frame), so a fast-panning user can't queue up
 * a backlog of stale requests resolving out of order.
 */
export function useProcessedSeries(): ProcessedSeriesHandle {
  const workerRef = useRef<Worker | null>(null);
  const supportedRef = useRef(true);
  const resultsRef = useRef<Map<Category, CategoryResult>>(new Map());
  const resultVersionRef = useRef(0);
  const lastRequestedKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      supportedRef.current = false;
      return;
    }
    let worker: Worker;
    try {
      // Served as a static file from /public, not bundled by webpack — see
      // public/workers/dataProcessor.worker.js's top comment for why
      // (short version: Next.js's default webpack config doesn't support
      // the `new Worker(new URL(...))` module-worker pattern, and that
      // failure is otherwise silent because of the catch below).
      worker = new Worker("/workers/dataProcessor.worker.js");
    } catch {
      // Construction can throw in restrictive environments (e.g. some sandboxed iframes) — fall back permanently.
      supportedRef.current = false;
      return;
    }

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const map = new Map<Category, CategoryResult>();
      for (const r of event.data.results) map.set(r.category as Category, r);
      resultsRef.current = map;
      resultVersionRef.current += 1;
      inFlightRef.current = false;
    };
    worker.onerror = () => {
      // A runtime error inside the worker (not a construction failure) — stop relying on it for the rest of this session.
      supportedRef.current = false;
      inFlightRef.current = false;
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const getSeries = useCallback(
    (
      buffers: Record<Category, BoundedBuffer<DataPoint>>,
      categories: Category[],
      startTime: number,
      endTime: number,
      dataVersion: number,
      mode: ProcessingMode
    ) => {
      const modeKey = mode.kind === "lod" ? `lod:${mode.targetBuckets}` : `agg:${mode.bucketSizeMs}`;
      const key = `${dataVersion}|${startTime}|${endTime}|${categories.join(",")}|${modeKey}`;
      if (key === lastRequestedKeyRef.current) {
        return resultsRef.current;
      }
      lastRequestedKeyRef.current = key;

      if (!supportedRef.current || workerRef.current === null) {
        // No worker available (unsupported, failed to construct, or the
        // construction effect just hasn't run yet on this very first
        // render) — full synchronous fallback, identical to pre-worker behavior.
        const out = new Map<Category, CategoryResult>();
        for (const category of categories) out.set(category, computeOne(buildJob(buffers[category], category, startTime, endTime), mode));
        resultsRef.current = out;
        return resultsRef.current;
      }

      // True bootstrap: nothing has ever been computed yet (first mount) — compute
      // once synchronously so the first paint isn't blank while the very first
      // worker round trip is still in flight.
      if (resultsRef.current.size === 0) {
        const out = new Map<Category, CategoryResult>();
        for (const category of categories) out.set(category, computeOne(buildJob(buffers[category], category, startTime, endTime), mode));
        resultsRef.current = out;
      }

      if (!inFlightRef.current) {
        const jobs: CategoryJob[] = [];
        const transfer: Transferable[] = [];
        for (const category of categories) {
          const job = buildJob(buffers[category], category, startTime, endTime);
          jobs.push(job);
          transfer.push(job.timestamps.buffer, job.values.buffer);
        }
        inFlightRef.current = true;
        const id = nextRequestId++;
        workerRef.current.postMessage({ id, mode, jobs }, transfer);
      }

      return resultsRef.current;
    },
    []
  );

  return { getSeries, resultVersionRef, usingWorker: () => supportedRef.current && workerRef.current !== null };
}
