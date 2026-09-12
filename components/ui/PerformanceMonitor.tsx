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

const SPARK_WIDTH = 64;
const SPARK_HEIGHT = 22;

/**
 * Tiny inline SVG sparkline of recent FPS samples (usePerformanceMonitor's
 * fpsHistory) — plotted 0-60fps so a dip reads as a dip and a flat line at
 * the top genuinely means "steady 60", not just "steady at whatever the max
 * sample happened to be". No charting library: this is a handful of SVG
 * polyline points, not a rendering problem worth pulling in a dependency for.
 */
function FpsSparkline({ history }: { history: number[] }) {
  if (history.length < 2) return <svg width={SPARK_WIDTH} height={SPARK_HEIGHT} aria-hidden="true" />;
  const max = 60;
  const points = history
    .map((fps, i) => {
      const x = (i / (history.length - 1)) * SPARK_WIDTH;
      const y = SPARK_HEIGHT - (Math.min(fps, max) / max) * SPARK_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const latest = history[history.length - 1]!;
  return (
    <svg width={SPARK_WIDTH} height={SPARK_HEIGHT} aria-hidden="true">
      {/* 30fps reference line — the "warn" threshold fpsColor also uses */}
      <line x1={0} y1={SPARK_HEIGHT / 2} x2={SPARK_WIDTH} y2={SPARK_HEIGHT / 2} stroke="#232833" strokeWidth={1} />
      <polyline points={points} fill="none" stroke={fpsColor(latest)} strokeWidth={1.5} />
    </svg>
  );
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
        <FpsSparkline history={metrics.fpsHistory} />
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
