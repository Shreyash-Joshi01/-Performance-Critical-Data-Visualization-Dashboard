"use client";

import { memo, useCallback, useRef } from "react";
import ChartContainer from "./ChartContainer";
import { useChartRenderer } from "@/hooks/useChartRenderer";
import { sliceByTimeRange } from "@/lib/search";
import { clearCanvas, drawTimeAxis } from "@/lib/canvasUtils";
import { BoundedBuffer } from "@/lib/buffer";
import { Category, DataPoint, Viewport } from "@/lib/types";

interface HeatmapProps {
  buffers: Record<Category, BoundedBuffer<DataPoint>>;
  versionRef: React.MutableRefObject<number>;
  categories: Category[];
  viewport: Viewport;
  onRenderTime?: (ms: number) => void;
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
function Heatmap({ buffers, versionRef, categories, viewport, onRenderTime }: HeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastVersionRef = useRef(-1);
  const lastViewportRef = useRef<Viewport | null>(null);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      clearCanvas(ctx, width, height);

      const points: DataPoint[] = [];
      for (const category of categories) {
        points.push(...sliceByTimeRange(buffers[category].snapshot(), viewport.startTime, viewport.endTime));
      }

      if (points.length === 0) {
        drawTimeAxis(ctx, width, height, viewport.startTime, viewport.endTime);
        return;
      }

      // Safe: the points.length === 0 check above already returned.
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

      const cellWidth = width / TIME_BUCKETS;
      const cellHeight = height / VALUE_BUCKETS;
      for (let v = 0; v < VALUE_BUCKETS; v++) {
        for (let t = 0; t < TIME_BUCKETS; t++) {
          const count = grid[v * TIME_BUCKETS + t]!;
          if (count === 0) continue;
          // sqrt compresses the scale so a handful of hot cells don't wash out everything else.
          const intensity = Math.sqrt(count / maxCount);
          ctx.fillStyle = densityColor(intensity);
          ctx.fillRect(t * cellWidth, height - (v + 1) * cellHeight, cellWidth + 0.5, cellHeight + 0.5);
        }
      }

      drawTimeAxis(ctx, width, height, viewport.startTime, viewport.endTime);
    },
    [buffers, categories, viewport]
  );

  const isDirty = useCallback(() => {
    const changed = versionRef.current !== lastVersionRef.current || viewport !== lastViewportRef.current;
    if (changed) {
      lastVersionRef.current = versionRef.current;
      lastViewportRef.current = viewport;
    }
    return changed;
  }, [versionRef, viewport]);

  useChartRenderer({ canvasRef, draw, isDirty, onFrameRendered: onRenderTime });

  return <ChartContainer ref={canvasRef} title="Heatmap (time x value density)" categories={categories} />;
}

export default memo(Heatmap);
