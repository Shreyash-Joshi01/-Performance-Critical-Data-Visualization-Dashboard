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
// How many UI-update ticks of FPS history the sparkline keeps. At the default
// 250ms updateIntervalMs that's 60 samples = 15 seconds of history — enough to
// see a stress-test toggle or a load-level jump show up as a visible dip/step,
// without the array growing forever (it's capped, not accumulated for the tab's whole lifetime).
const FPS_HISTORY_LENGTH = 60;

export function usePerformanceMonitor(pointCount: number, updateIntervalMs = 250) {
  const trackerRef = useRef(new FpsTracker());
  const renderTimeRef = useRef(0);
  const processingTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const fpsHistoryRef = useRef<number[]>([]);

  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    renderTimeMs: 0,
    processingTimeMs: 0,
    pointCount,
    droppedFrames: 0,
    fpsHistory: [],
  });

  // Sticky flag: set the moment the tab goes hidden, and only cleared once
  // we've processed a tick where the tab is confirmed visible again.
  //
  // The first version of this used a one-shot flag (set on visibilitychange,
  // cleared by the very next tick()), reasoning that requestAnimationFrame
  // is paused for the whole time a tab is hidden — so the next tick must be
  // the first one after returning. That reasoning was wrong: tested against
  // a real backgrounded tab (not just a simulated gap), Chromium doesn't
  // fully pause a hidden tab's rAF, it throttles it — so several tick()
  // calls can still land *while still hidden*, each ~1s apart. A one-shot
  // flag only protected the first of those; the rest each saw a ~1s gap
  // with the flag already consumed, and got counted as real dropped frames
  // — which is exactly the bug this was meant to fix, just less severe (101
  // vs. ~1800). Sticky-until-confirmed-visible fixes that: every tick that
  // fires while `document.hidden` is still true keeps the flag set, so none
  // of them count toward drops, and it's only cleared on a tick where the
  // document reads visible again.
  const wasHiddenRef = useRef(false);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) wasHiddenRef.current = true;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    let lastUiUpdate = 0;

    const loop = (now: number) => {
      const hiddenForThisGap = document.hidden || wasHiddenRef.current;
      trackerRef.current.tick(now, hiddenForThisGap);
      if (!document.hidden) wasHiddenRef.current = false;
      if (now - lastUiUpdate >= updateIntervalMs) {
        lastUiUpdate = now;
        const fps = trackerRef.current.fps;
        fpsHistoryRef.current.push(fps);
        if (fpsHistoryRef.current.length > FPS_HISTORY_LENGTH) fpsHistoryRef.current.shift();
        setMetrics({
          fps,
          renderTimeMs: Math.round(renderTimeRef.current * 100) / 100,
          processingTimeMs: Math.round(processingTimeRef.current * 100) / 100,
          pointCount,
          memoryUsageMB: getMemoryUsageMB(),
          droppedFrames: trackerRef.current.droppedFrames,
          fpsHistory: [...fpsHistoryRef.current],
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
