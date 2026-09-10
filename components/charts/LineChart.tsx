"use client";

import { memo, useCallback, useRef } from "react";
import ChartContainer from "./ChartContainer";
import { useChartRenderer } from "@/hooks/useChartRenderer";
import { useViewportInteractions, ViewportBounds } from "@/hooks/useViewportInteractions";
import { sliceByTimeRange } from "@/lib/search";
import { levelOfDetail } from "@/lib/lod";
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
  onRenderTime?: (ms: number) => void;
}

/**
 * The primary chart: one polyline per active category, drawn from
 * level-of-detail buckets rather than raw points. Supports wheel-zoom and
 * drag-pan on the time axis; the Y axis auto-fits to whatever's visible.
 */
function LineChart({ buffers, versionRef, categories, viewport, viewportRef, bounds, onViewportChange, onRenderTime }: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastVersionRef = useRef(-1);
  const lastViewportRef = useRef<Viewport | null>(null);

  useViewportInteractions(canvasRef, viewportRef, bounds, onViewportChange);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const vp = viewportRef.current;
      clearCanvas(ctx, width, height);

      const allValues: number[] = [];
      const series: { category: Category; buckets: ReturnType<typeof levelOfDetail> }[] = [];

      for (const category of categories) {
        const slice = sliceByTimeRange(buffers[category].snapshot(), vp.startTime, vp.endTime);
        const buckets = levelOfDetail(slice, Math.max(50, Math.floor(width)));
        for (const b of buckets) allValues.push(b.min, b.max);
        series.push({ category, buckets });
      }

      const range = computeValueRange(allValues);
      drawYAxis(ctx, width, height, range.min, range.max);

      for (const { category, buckets } of series) {
        if (buckets.length === 0) continue;
        ctx.strokeStyle = CATEGORY_COLOR[category];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        buckets.forEach((b, i) => {
          const x = timeToX(b.x, vp, width);
          const y = valueToY(b.avg, range, height);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
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

  return <ChartContainer ref={canvasRef} title="Line Chart" categories={categories} />;
}

export default memo(LineChart);
