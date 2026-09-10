"use client";

import { memo, useCallback, useRef } from "react";
import ChartContainer from "./ChartContainer";
import { useChartRenderer } from "@/hooks/useChartRenderer";
import { useViewportInteractions, ViewportBounds } from "@/hooks/useViewportInteractions";
import { sliceByTimeRange } from "@/lib/search";
import { clearCanvas, computeValueRange, drawTimeAxis, drawYAxis, timeToX, valueToY } from "@/lib/canvasUtils";
import { BoundedBuffer } from "@/lib/buffer";
import { CATEGORY_COLOR, Category, DataPoint, Viewport } from "@/lib/types";

interface ScatterPlotProps {
  buffers: Record<Category, BoundedBuffer<DataPoint>>;
  versionRef: React.MutableRefObject<number>;
  categories: Category[];
  viewport: Viewport;
  viewportRef: React.MutableRefObject<Viewport>;
  bounds: ViewportBounds;
  onViewportChange: (v: Viewport) => void;
  onRenderTime?: (ms: number) => void;
}

// Above this many visible points per category, draw every Nth point instead of all of them.
// A 1px dot for every one of 12,500 points on a ~600px-wide canvas is >20 dots stacked per
// pixel column anyway — invisible to the eye but not to the CPU, so we sample instead of LOD-bucketing.
const MAX_RENDERED_PER_SERIES = 4000;

function ScatterPlot({ buffers, versionRef, categories, viewport, viewportRef, bounds, onViewportChange, onRenderTime }: ScatterPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastVersionRef = useRef(-1);
  const lastViewportRef = useRef<Viewport | null>(null);

  useViewportInteractions(canvasRef, viewportRef, bounds, onViewportChange);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const vp = viewportRef.current;
      clearCanvas(ctx, width, height);

      const slices: { category: Category; points: readonly DataPoint[] }[] = [];
      const allValues: number[] = [];
      for (const category of categories) {
        const slice = sliceByTimeRange(buffers[category].snapshot(), vp.startTime, vp.endTime);
        slices.push({ category, points: slice });
        for (const p of slice) allValues.push(p.value);
      }

      const range = computeValueRange(allValues);
      drawYAxis(ctx, width, height, range.min, range.max);

      for (const { category, points } of slices) {
        if (points.length === 0) continue;
        const step = Math.max(1, Math.floor(points.length / MAX_RENDERED_PER_SERIES));
        ctx.fillStyle = CATEGORY_COLOR[category];
        ctx.globalAlpha = 0.65;
        for (let i = 0; i < points.length; i += step) {
          // Safe: i is always < points.length by the loop condition.
          const p = points[i]!;
          const x = timeToX(p.timestamp, vp, width);
          const y = valueToY(p.value, range, height);
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      drawTimeAxis(ctx, width, height, vp.startTime, vp.endTime);
    },
    [buffers, categories, viewportRef]
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

  return <ChartContainer ref={canvasRef} title="Scatter Plot" categories={categories} />;
}

export default memo(ScatterPlot);
