"use client";

import { memo, useCallback, useRef } from "react";
import ChartContainer from "./ChartContainer";
import { useChartRenderer } from "@/hooks/useChartRenderer";
import { useProcessedSeries } from "@/hooks/useProcessedSeries";
import { intervalMs } from "@/lib/aggregation";
import { clearCanvas, computeValueRange, drawTimeAxis, drawYAxis, valueToY } from "@/lib/canvasUtils";
import { BoundedBuffer } from "@/lib/buffer";
import { AggregationInterval, CATEGORY_COLOR, Category, DataPoint, Viewport } from "@/lib/types";

interface BarChartProps {
  buffers: Record<Category, BoundedBuffer<DataPoint>>;
  versionRef: React.MutableRefObject<number>;
  categories: Category[];
  viewport: Viewport;
  aggregation: AggregationInterval;
  onRenderTime?: (ms: number) => void;
  onProcessingTime?: (ms: number) => void;
}

/**
 * Bars are the aggregation control's clearest demonstration: raw points in
 * the viewport are grouped into 1min/5min/1h buckets and each bucket
 * becomes one bar showing its average, with categories shown as grouped,
 * side-by-side bars per bucket, plus a high-low wick per bar.
 *
 * The aggregation itself (lib/numericProcessing.ts's aggregateFromArrays)
 * runs on a Web Worker via useProcessedSeries — see that hook's comment
 * for why and for the one-tick-latency trade-off involved.
 */
function BarChart({ buffers, versionRef, categories, viewport, aggregation, onRenderTime, onProcessingTime }: BarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastVersionRef = useRef(-1);
  const lastViewportRef = useRef<Viewport | null>(null);
  const lastAggRef = useRef<AggregationInterval | null>(null);
  const lastResultVersionRef = useRef(-1);
  const processed = useProcessedSeries();

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      // Bar charts need at least a handful of buckets to be legible; "raw" falls back to 1m.
      const effectiveInterval = aggregation === "raw" ? "1m" : aggregation;
      const bucketSizeMs = intervalMs(effectiveInterval);

      // See LineChart.tsx's identical comment: the bucketing math now runs
      // on a worker thread, so this main-thread "processing" measurement is
      // genuinely small (reading refs, building the Y range) rather than a
      // stand-in for work that secretly still happens here.
      const processingStart = performance.now();
      const resultsMap = processed.getSeries(buffers, categories, viewport.startTime, viewport.endTime, versionRef.current, {
        kind: "aggregate",
        bucketSizeMs,
      });

      const allValues: number[] = [];
      const bucketKeys = new Set<number>();
      for (const category of categories) {
        const r = resultsMap.get(category);
        if (!r) continue;
        for (let i = 0; i < r.x.length; i++) {
          allValues.push(r.avg[i]!);
          bucketKeys.add(r.x[i]!);
        }
      }
      const range = computeValueRange(allValues.length ? allValues : [0, 100]);
      const sortedBuckets = Array.from(bucketKeys).sort((a, b) => a - b);
      const processingMs = performance.now() - processingStart;
      onProcessingTime?.(processingMs);

      const renderStart = performance.now();
      clearCanvas(ctx, width, height);
      drawYAxis(ctx, width, height, range.min, range.max);

      if (sortedBuckets.length === 0) {
        drawTimeAxis(ctx, width, height, viewport.startTime, viewport.endTime);
        onRenderTime?.(performance.now() - renderStart);
        return;
      }

      const bucketWidth = width / sortedBuckets.length;
      const barGroupPadding = bucketWidth * 0.15;
      const barWidth = (bucketWidth - barGroupPadding * 2) / Math.max(1, categories.length);
      const bucketIndex = new Map<number, number>(sortedBuckets.map((b, i) => [b, i]));

      for (const category of categories) {
        const r = resultsMap.get(category);
        if (!r) continue;
        for (let i = 0; i < r.x.length; i++) {
          const bucketIdx = bucketIndex.get(r.x[i]!);
          if (bucketIdx === undefined) continue;
          const catIdx = categories.indexOf(category);
          const x = bucketIdx * bucketWidth + barGroupPadding + catIdx * barWidth;
          const centerX = x + barWidth / 2;
          const y = valueToY(r.avg[i]!, range, height);
          const zeroY = valueToY(Math.max(range.min, 0), range, height);

          // High-low wick: the bucket's min/max range, aggregateFromArrays already
          // computes for free alongside the average — drawing it costs one extra
          // stroke() per bar and turns "average per bucket" into something that
          // actually reads as a price chart (you can see how much a bucket moved,
          // not just where it ended up).
          ctx.strokeStyle = CATEGORY_COLOR[category];
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(centerX, valueToY(r.min[i]!, range, height));
          ctx.lineTo(centerX, valueToY(r.max[i]!, range, height));
          ctx.stroke();
          ctx.globalAlpha = 1;

          ctx.fillStyle = CATEGORY_COLOR[category];
          ctx.fillRect(x, Math.min(y, zeroY), Math.max(1, barWidth - 1), Math.abs(zeroY - y));
        }
      }

      drawTimeAxis(ctx, width, height, viewport.startTime, viewport.endTime);
      onRenderTime?.(performance.now() - renderStart);
    },
    [buffers, categories, viewport, aggregation, versionRef, processed, onProcessingTime, onRenderTime]
  );

  const isDirty = useCallback(() => {
    const changed =
      versionRef.current !== lastVersionRef.current || viewport !== lastViewportRef.current || aggregation !== lastAggRef.current;
    const workerCaughtUp = processed.resultVersionRef.current !== lastResultVersionRef.current;
    if (changed || workerCaughtUp) {
      lastVersionRef.current = versionRef.current;
      lastViewportRef.current = viewport;
      lastAggRef.current = aggregation;
      lastResultVersionRef.current = processed.resultVersionRef.current;
    }
    return changed || workerCaughtUp;
  }, [versionRef, viewport, aggregation, processed]);

  useChartRenderer({ canvasRef, draw, isDirty });

  return <ChartContainer ref={canvasRef} title={`Bar Chart (${aggregation === "raw" ? "1m" : aggregation} buckets)`} categories={categories} />;
}

export default memo(BarChart);
