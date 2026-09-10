"use client";

import { useEffect, useRef, useState } from "react";
import { FpsTracker, getMemoryUsageMB } from "@/lib/performanceUtils";
import { PerformanceMetrics } from "@/lib/types";

/**
 * Owns the FPS ticker and exposes read/write handles that the render loop
 * elsewhere (useChartRenderer) reports timings into, plus a React-state
 * snapshot for the on-screen monitor.
 *
 * State updates are throttled to ~4Hz (updateIntervalMs), not once per
 * frame: a PerformanceMonitor that re-renders 60 times/sec purely to show
 * a number ticking would itself become a measurable chunk of the frame
 * budget it's supposed to be reporting on.
 */
export function usePerformanceMonitor(pointCount: number, updateIntervalMs = 250) {
  const trackerRef = useRef(new FpsTracker());
  const renderTimeRef = useRef(0);
  const processingTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    renderTimeMs: 0,
    processingTimeMs: 0,
    pointCount,
    droppedFrames: 0,
  });

  useEffect(() => {
    let lastUiUpdate = 0;

    const loop = (now: number) => {
      trackerRef.current.tick(now);
      if (now - lastUiUpdate >= updateIntervalMs) {
        lastUiUpdate = now;
        setMetrics({
          fps: trackerRef.current.fps,
          renderTimeMs: Math.round(renderTimeRef.current * 100) / 100,
          processingTimeMs: Math.round(processingTimeRef.current * 100) / 100,
          pointCount,
          memoryUsageMB: getMemoryUsageMB(),
          droppedFrames: trackerRef.current.droppedFrames,
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // pointCount intentionally the only dep that should restart display cadence assumptions;
    // the loop reads refs for everything else so it never needs to be torn down/rebuilt on every metric change.
  }, [pointCount, updateIntervalMs]);

  return {
    metrics,
    reportRenderTime: (ms: number) => {
      renderTimeRef.current = ms;
    },
    reportProcessingTime: (ms: number) => {
      processingTimeRef.current = ms;
    },
  };
}
