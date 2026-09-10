"use client";

import { memo, useCallback, useRef } from "react";
import ChartContainer from "./ChartContainer";
import { useChartRenderer } from "@/hooks/useChartRenderer";
import { sliceByTimeRange } from "@/lib/search";
import { aggregate } from "@/lib/aggregation";
import { clearCanvas, computeValueRange, drawTimeAxis, drawYAxis, timeToX, valueToY } from "@/lib/canvasUtils";
import { BoundedBuffer } from "@/lib/buffer";
import { AggregatedPoint, AggregationInterval, CATEGORY_COLOR, Category, DataPoint, Viewport } from "@/lib/types";

interface BarChartProps {
  buffers: Record<Category, BoundedBuffer<DataPoint>>;
  versionRef: React.MutableRefObject<number>;
  categories: Category[];
  viewport: Viewport;
  aggregation: AggregationInterval;
  onRenderTime?: (ms: number) => void;
}

/**
 * Bars are the aggregation control's clearest demonstration: raw points in
 * the viewport are grouped into 1min/5min/1h buckets (lib/aggregation.ts)
 * and each bucket becomes one bar showing its average, with categories
 * shown as grouped, side-by-side bars per bucket.
 */
function BarChart({ buffers, versionRef, categories, viewport, aggregation, onRenderTime }: BarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastVersionRef = useRef(-1);
  const lastViewportRef = useRef<Viewport | null>(null);
  const lastAggRef = useRef<AggregationInterval | null>(null);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      clearCanvas(ctx, width, height);

      // Bar charts need at least a handful of buckets to be legible; "raw" falls back to 1m.
      const effectiveInterval = aggregation === "raw" ? "1m" : aggregation;

      const perCategory = new Map<Category, AggregatedPoint[]>();
      const allValues: number[] = [];
      for (const category of categories) {
        const slice = sliceByTimeRange(buffers[category].snapshot(), viewport.startTime, viewport.endTime);
        const buckets = aggregate(slice, effectiveInterval);
        perCategory.set(category, buckets);
        for (const b of buckets) allValues.push(b.avg);
      }

      const range = computeValueRange(allValues.length ? allValues : [0, 100]);
      drawYAxis(ctx, width, height, range.min, range.max);

      const bucketKeys = new Set<number>();
      for (const category of categories) {
        for (const b of perCategory.get(category) ?? []) bucketKeys.add(b.bucketStart);
      }
      const sortedBuckets = Array.from(bucketKeys).sort((a, b) => a - b);
      if (sortedBuckets.length === 0) {
        drawTimeAxis(ctx, width, height, viewport.startTime, viewport.endTime);
        return;
      }

      const bucketWidth = width / sortedBuckets.length;
      const barGroupPadding = bucketWidth * 0.15;
      const barWidth = (bucketWidth - barGroupPadding * 2) / Math.max(1, categories.length);

      sortedBuckets.forEach((bucketStart, bucketIdx) => {
        categories.forEach((category, catIdx) => {
          const point = (perCategory.get(category) ?? []).find((b) => b.bucketStart === bucketStart);
          if (!point) return;
          const x = bucketIdx * bucketWidth + barGroupPadding + catIdx * barWidth;
          const y = valueToY(point.avg, range, height);
          const zeroY = valueToY(Math.max(range.min, 0), range, height);
          ctx.fillStyle = CATEGORY_COLOR[category];
          ctx.fillRect(x, Math.min(y, zeroY), Math.max(1, barWidth - 1), Math.abs(zeroY - y));
        });
      });

      drawTimeAxis(ctx, width, height, viewport.startTime, viewport.endTime);
    },
    [buffers, categories, viewport, aggregation]
  );

  const isDirty = useCallback(() => {
    const changed =
      versionRef.current !== lastVersionRef.current || viewport !== lastViewportRef.current || aggregation !== lastAggRef.current;
    if (changed) {
      lastVersionRef.current = versionRef.current;
      lastViewportRef.current = viewport;
      lastAggRef.current = aggregation;
    }
    return changed;
  }, [versionRef, viewport, aggregation]);

  useChartRenderer({ canvasRef, draw, isDirty, onFrameRendered: onRenderTime });

  return <ChartContainer ref={canvasRef} title={`Bar Chart (${aggregation === "raw" ? "1m" : aggregation} buckets)`} categories={categories} />;
}

export default memo(BarChart);
