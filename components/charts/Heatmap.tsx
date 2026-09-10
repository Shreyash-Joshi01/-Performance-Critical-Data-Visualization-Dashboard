"use client";

import { memo, useCallback, useRef } from "react";
import ChartContainer from "./ChartContainer";
import { useChartRenderer } from "@/hooks/useChartRenderer";
import { sliceByTimeRange } from "@/lib/search";
import { clearCanvas, drawTimeAxis } from "@/lib/canvasUtils";
import { measure } from "@/lib/performanceUtils";
import { BoundedBuffer } from "@/lib/buffer";
import { Category, DataPoint, Viewport } from "@/lib/types";

interface HeatmapProps {
  buffers: Record<Category, BoundedBuffer<DataPoint>>;
  versionRef: React.MutableRefObject<number>;
  categories: Category[];
  viewport: Viewport;
  onRenderTime?: (ms: number) => void;
  onProcessingTime?: (ms: number) => void;
}

const TIME_BUCKETS = 80;
const VALUE_BUCKETS = 24;

/** Simple blue -> yellow -> red sequential scale, built with fillRect only (no chart library). */
function densityColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const hue = 220 - clamped * 220; // 220 (blue) -> 0 (red)
  const lightness = 18 + clamped * 42;
  return `hsl(${hue}, 85%, ${lightness}%)`;
}

/**
 * Heatmap treats time x value as a 2D grid: each cell's color encodes how
 * many samples (across the active categories) landed in it. This is the
 * one chart where raw per-point drawing was never on the table — a 10k+
 * point dataset naturally wants to be shown as density, not dots.
 */
function Heatmap({ buffers, versionRef, categories, viewport, onRenderTime, onProcessingTime }: HeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastVersionRef = useRef(-1);
  const lastViewportRef = useRef<Viewport | null>(null);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      // "Processing" = slicing to the viewport + binning every point into the
      // fixed TIME_BUCKETS x VALUE_BUCKETS grid. This is the one chart where
      // processing cost scales directly with raw point count (every point is
      // visited once to increment its cell) — the render phase below is still
      // flat (always exactly TIME_BUCKETS*VALUE_BUCKETS fillRect calls).
      const { result, ms: processingMs } = measure(() => {
        const points: DataPoint[] = [];
        for (const category of categories) {
          points.push(...sliceByTimeRange(buffers[category].snapshot(), viewport.startTime, viewport.endTime));
        }
        if (points.length === 0) return { grid: null as Uint32Array | null, maxCount: 0 };

        let minValue = points[0]!.value;
        let maxValue = points[0]!.value;
        for (const p of points) {
          if (p.value < minValue) minValue = p.value;
          if (p.value > maxValue) maxValue = p.value;
        }
        const valueSpan = maxValue - minValue || 1;
        const timeSpan = viewport.endTime - viewport.startTime || 1;

        const grid = new Uint32Array(TIME_BUCKETS * VALUE_BUCKETS);
        let maxCount = 0;
        for (const p of points) {
          let tIdx = Math.floor(((p.timestamp - viewport.startTime) / timeSpan) * TIME_BUCKETS);
          let vIdx = Math.floor(((p.value - minValue) / valueSpan) * VALUE_BUCKETS);
          tIdx = Math.max(0, Math.min(TIME_BUCKETS - 1, tIdx));
          vIdx = Math.max(0, Math.min(VALUE_BUCKETS - 1, vIdx));
          const idx = vIdx * TIME_BUCKETS + tIdx;
          // Safe: idx is always within [0, TIME_BUCKETS*VALUE_BUCKETS) because tIdx/vIdx were clamped above.
          grid[idx]! += 1;
          if (grid[idx]! > maxCount) maxCount = grid[idx]!;
        }
        return { grid, maxCount };
      });
      onProcessingTime?.(processingMs);

      const renderStart = performance.now();
      clearCanvas(ctx, width, height);

      if (!result.grid) {
        drawTimeAxis(ctx, width, height, viewport.startTime, viewport.endTime);
        onRenderTime?.(performance.now() - renderStart);
        return;
      }

      const cellWidth = width / TIME_BUCKETS;
      const cellHeight = height / VALUE_BUCKETS;
      for (let v = 0; v < VALUE_BUCKETS; v++) {
        for (let t = 0; t < TIME_BUCKETS; t++) {
          const count = result.grid[v * TIME_BUCKETS + t]!;
          if (count === 0) continue;
          // sqrt compresses the scale so a handful of hot cells don't wash out everything else.
          const intensity = Math.sqrt(count / result.maxCount);
          ctx.fillStyle = densityColor(intensity);
          ctx.fillRect(t * cellWidth, height - (v + 1) * cellHeight, cellWidth + 0.5, cellHeight + 0.5);
        }
      }

      drawTimeAxis(ctx, width, height, viewport.startTime, viewport.endTime);
      onRenderTime?.(performance.now() - renderStart);
    },
    [buffers, categories, viewport, onProcessingTime, onRenderTime]
  );

  const isDirty = useCallback(() => {
    const changed = versionRef.current !== lastVersionRef.current || viewport !== lastViewportRef.current;
    if (changed) {
      lastVersionRef.current = versionRef.current;
      lastViewportRef.current = viewport;
    }
    return changed;
  }, [versionRef, viewport]);

  useChartRenderer({ canvasRef, draw, isDirty });

  return <ChartContainer ref={canvasRef} title="Heatmap (time x value density)" categories={categories} />;
}

export default memo(Heatmap);
