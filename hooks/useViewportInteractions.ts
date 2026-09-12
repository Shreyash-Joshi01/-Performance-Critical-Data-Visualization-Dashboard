"use client";

import { useEffect, useRef } from "react";
import { Viewport } from "@/lib/types";

export interface ViewportBounds {
  minTime: number;
  maxTime: number;
}

/**
 * Wires wheel-to-zoom and drag-to-pan directly onto a canvas element,
 * translating pixel deltas into time deltas using the *current* viewport
 * (so zoom stays anchored under the cursor instead of always zooming
 * toward the center). Interaction state itself (isDragging, lastX) lives
 * in refs, not React state — a mousemove can fire far more than 60
 * times/sec, and none of that needs to schedule a re-render by itself.
 *
 * The single `onViewportChange` call per meaningful change is what does
 * trigger a React update (viewport lives in the parent's state), which is
 * what the "<100ms interaction response" target is measuring: the time
 * from a wheel/drag event to the chart visibly reflecting the new range.
 */
export function useViewportInteractions(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  viewportRef: React.MutableRefObject<Viewport>,
  bounds: ViewportBounds,
  onViewportChange: (next: Viewport) => void,
  /** Double-click on the chart to snap back to "follow live" — the fast way out of a zoomed/panned view without hunting for the right wheel/drag to get back. Optional: charts that don't have a live-follow concept simply omit it. */
  onReset?: () => void
): void {
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const width = rect.width || 1;
      const v = viewportRef.current;
      const span = v.endTime - v.startTime;
      const zoomFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const newSpan = Math.max(1000, Math.min(bounds.maxTime - bounds.minTime, span * zoomFactor));
      const cursorTime = v.startTime + (cursorX / width) * span;
      const ratio = cursorX / width;

      let newStart = cursorTime - newSpan * ratio;
      let newEnd = newStart + newSpan;
      if (newStart < bounds.minTime) {
        newStart = bounds.minTime;
        newEnd = newStart + newSpan;
      }
      if (newEnd > bounds.maxTime) {
        newEnd = bounds.maxTime;
        newStart = Math.max(bounds.minTime, newEnd - newSpan);
      }
      onViewportChange({ ...v, startTime: newStart, endTime: newEnd });
    };

    const handleMouseDown = (e: MouseEvent) => {
      draggingRef.current = true;
      lastXRef.current = e.clientX;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || 1;
      const v = viewportRef.current;
      const span = v.endTime - v.startTime;
      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      const deltaTime = -(deltaX / width) * span;

      let newStart = v.startTime + deltaTime;
      let newEnd = v.endTime + deltaTime;
      if (newStart < bounds.minTime) {
        newEnd += bounds.minTime - newStart;
        newStart = bounds.minTime;
      }
      if (newEnd > bounds.maxTime) {
        newStart -= newEnd - bounds.maxTime;
        newEnd = bounds.maxTime;
      }
      onViewportChange({ ...v, startTime: newStart, endTime: newEnd });
    };

    const handleMouseUp = () => {
      draggingRef.current = false;
    };

    const handleDoubleClick = (e: MouseEvent) => {
      e.preventDefault();
      onReset?.();
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("dblclick", handleDoubleClick);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("dblclick", handleDoubleClick);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [canvasRef, viewportRef, bounds.minTime, bounds.maxTime, onViewportChange, onReset]);
}
