"use client";

import { useEffect, useRef } from "react";
import { setupCanvasDPR } from "@/lib/canvasUtils";

export interface ChartRendererOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** Draw the current frame. Receives the CSS-pixel size (already DPR-corrected on the context). */
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  /** Called once per rAF tick; return true if new data/props mean this frame needs a repaint. */
  isDirty: () => boolean;
  onFrameRendered?: (renderMs: number) => void;
}

/**
 * Shared canvas lifecycle for every chart: devicePixelRatio-aware resize
 * (via ResizeObserver, since charts live in a fluid responsive layout, not
 * a fixed-size box), and a requestAnimationFrame loop gated by a dirty
 * flag instead of redrawing unconditionally on every frame.
 *
 * This is "separate data frequency from render frequency" in code: data
 * arrives on its own 100ms (or 20ms in stress mode) timer, but we only
 * pay the cost of an actual canvas repaint on frames that can show
 * something new — a static, unchanged chart costs ~0 extra work per
 * frame instead of redrawing 10k+ points 60 times a second for nothing.
 *
 * Each chart component only supplies *what* to draw; every chart gets
 * resize handling, DPR correction and the dirty-flag loop for free and
 * identically, instead of reimplementing (and risking a leak in) this
 * boilerplate four times.
 */
export function useChartRenderer({ canvasRef, draw, isDirty, onFrameRendered }: ChartRendererOptions): void {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const onFrameRef = useRef(onFrameRendered);
  onFrameRef.current = onFrameRendered;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement ?? canvas;

    let ctx: CanvasRenderingContext2D | null = null;
    let width = 0;
    let height = 0;
    let sizeDirty = true;

    const applySize = () => {
      const rect = parent.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(rect.width));
      const nextHeight = Math.max(1, Math.floor(rect.height));
      if (nextWidth !== width || nextHeight !== height) {
        width = nextWidth;
        height = nextHeight;
        ctx = setupCanvasDPR(canvas, width, height);
        sizeDirty = true;
      }
    };

    applySize();
    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(parent);

    let rafId: number;
    const loop = () => {
      if (ctx && (sizeDirty || isDirtyRef.current())) {
        sizeDirty = false;
        const start = performance.now();
        drawRef.current(ctx, width, height);
        onFrameRef.current?.(performance.now() - start);
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [canvasRef]);
}
