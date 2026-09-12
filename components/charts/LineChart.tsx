"use client";

import { memo, useCallback, useRef } from "react";
import ChartContainer from "./ChartContainer";
import { useChartRenderer } from "@/hooks/useChartRenderer";
import { useViewportInteractions, ViewportBounds } from "@/hooks/useViewportInteractions";
import { useProcessedSeries } from "@/hooks/useProcessedSeries";
import { clearCanvas, computeValueRange, drawTimeAxis, drawYAxis, timeToX, valueToY } from "@/lib/canvasUtils";
import { BoundedBuffer } from "@/lib/buffer";
import { CATEGORY_COLOR, Category, DataPoint, Viewport } from "@/lib/types";

interface LineChartProps {
  buffers: Record<Category, BoundedBuffer<DataPoint>>;
  versionRef: React.MutableRefObject<number>;
  categories: Category[];
  viewport: Viewport;
  viewportRef: React.MutableRefObject<Viewport>;
  bounds: ViewportBounds;
  onViewportChange: (v: Viewport) => void;
  /** Double-click resets to "follow live" — see useViewportInteractions.ts. */
  onResetToLive?: () => void;
  onRenderTime?: (ms: number) => void;
  onProcessingTime?: (ms: number) => void;
}

/**
 * The primary chart: one polyline per active category, drawn from
 * level-of-detail buckets rather than raw points. Supports wheel-zoom and
 * drag-pan on the time axis; the Y axis auto-fits to whatever's visible.
 *
 * The LOD bucketing itself (lib/numericProcessing.ts's lodFromArrays) runs
 * on a Web Worker via useProcessedSeries — see that hook's comment for why
 * and for the one-tick-latency trade-off that makes offloading it safe to
 * do from inside a requestAnimationFrame draw loop.
 */
function LineChart({
  buffers,
  versionRef,
  categories,
  viewport,
  viewportRef,
  bounds,
  onViewportChange,
  onResetToLive,
  onRenderTime,
  onProcessingTime,
}: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastVersionRef = useRef(-1);
  const lastViewportRef = useRef<Viewport | null>(null);
  const lastResultVersionRef = useRef(-1);
  const processed = useProcessedSeries();

  useViewportInteractions(canvasRef, viewportRef, bounds, onViewportChange, onResetToLive);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const vp = viewportRef.current;
      const targetBuckets = Math.max(50, Math.floor(width));

      // "Processing" now measures only what actually still runs on this
      // thread: reading the (possibly one-tick-stale) worker result and
      // building the Y-axis range from it. The bucketing math that used to
      // dominate this number at high load now runs on the worker thread —
      // see useProcessedSeries.ts. It's still a real measurement, not a
      // fabricated one: it will show near-zero here and the actual cost
      // shows up as worker thread time instead (not surfaced in this UI,
      // since the point of offloading it was to get it off the thread this
      // app's FPS is measured on).
      const processingStart = performance.now();
      const resultsMap = processed.getSeries(buffers, categories, vp.startTime, vp.endTime, versionRef.current, {
        kind: "lod",
        targetBuckets,
      });
      const allValues: number[] = [];
      for (const category of categories) {
        const r = resultsMap.get(category);
        if (!r) continue;
        for (let i = 0; i < r.min.length; i++) {
          allValues.push(r.min[i]!, r.max[i]!);
        }
      }
      const range = computeValueRange(allValues);
      const processingMs = performance.now() - processingStart;
      onProcessingTime?.(processingMs);

      // "Render" = the actual canvas calls. This is the cost that's bounded by
      // LOD bucket count (≈ canvas width), not by how many raw points exist —
      // which is why it doesn't grow with load level or stress-test ingest rate.
      const renderStart = performance.now();
      clearCanvas(ctx, width, height);
      drawYAxis(ctx, width, height, range.min, range.max);

      for (const category of categories) {
        const r = resultsMap.get(category);
        if (!r || r.x.length === 0) continue;
        ctx.strokeStyle = CATEGORY_COLOR[category];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < r.x.length; i++) {
          const x = timeToX(r.x[i]!, vp, width);
          const y = valueToY(r.avg[i]!, range, height);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      drawTimeAxis(ctx, width, height, vp.startTime, vp.endTime);
      onRenderTime?.(performance.now() - renderStart);
    },
    [buffers, categories, viewportRef, versionRef, processed, onProcessingTime, onRenderTime]
  );

  const isDirty = useCallback(() => {
    // Redraw on a new data tick, a viewport change, OR a worker result landing
    // (so a one-tick-stale draw gets replaced promptly once the async LOD
    // bucketing catches up, instead of waiting for the next data tick).
    const changed = versionRef.current !== lastVersionRef.current || viewport !== lastViewportRef.current;
    const workerCaughtUp = processed.resultVersionRef.current !== lastResultVersionRef.current;
    if (changed || workerCaughtUp) {
      lastVersionRef.current = versionRef.current;
      lastViewportRef.current = viewport;
      lastResultVersionRef.current = processed.resultVersionRef.current;
    }
    return changed || workerCaughtUp;
  }, [versionRef, viewport, processed]);

  useChartRenderer({ canvasRef, draw, isDirty });

  return <ChartContainer ref={canvasRef} title="Line Chart" categories={categories} />;
}

export default memo(LineChart);
