"use client";

import { PerformanceMetrics } from "@/lib/types";

interface PerformanceMonitorProps {
  metrics: PerformanceMetrics;
}

function fpsColor(fps: number): string {
  if (fps >= 50) return "var(--good)";
  if (fps >= 30) return "var(--warn)";
  return "var(--bad)";
}

/**
 * Pure display component — every number here is a *measured* value passed
 * in as a prop (see usePerformanceMonitor.ts and useChartRenderer.ts's
 * onFrameRendered callback), never a hardcoded or assumed figure. This is
 * the on-screen half of CLAUDE.md's "measure instead of guessing" rule.
 */
export default function PerformanceMonitor({ metrics }: PerformanceMonitorProps) {
  return (
    <div className="perf-monitor">
      <div className="perf-stat">
        <span className="perf-label">Points</span>
        <span className="perf-value">{metrics.pointCount.toLocaleString()}</span>
      </div>
      <div className="perf-stat">
        <span className="perf-label">FPS</span>
        <span className="perf-value" style={{ color: fpsColor(metrics.fps) }}>
          {metrics.fps}
        </span>
      </div>
      <div className="perf-stat">
        <span className="perf-label">Render</span>
        <span className="perf-value">{metrics.renderTimeMs.toFixed(1)} ms</span>
      </div>
      <div className="perf-stat">
        <span className="perf-label">Processing</span>
        <span className="perf-value">{metrics.processingTimeMs.toFixed(1)} ms</span>
      </div>
      <div className="perf-stat">
        <span className="perf-label">Memory</span>
        <span className="perf-value">{metrics.memoryUsageMB !== undefined ? `${metrics.memoryUsageMB} MB` : "n/a"}</span>
      </div>
      <div className="perf-stat">
        <span className="perf-label">Dropped</span>
        <span className="perf-value">{metrics.droppedFrames}</span>
      </div>
    </div>
  );
}
