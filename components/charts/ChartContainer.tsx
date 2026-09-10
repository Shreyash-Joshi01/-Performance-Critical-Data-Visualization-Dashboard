"use client";

import { forwardRef } from "react";
import { Category, CATEGORY_COLOR } from "@/lib/types";

interface ChartContainerProps {
  title: string;
  categories: Category[];
  height?: number;
}

/**
 * Pure layout/chrome shared by all four chart types: a title bar with a
 * legend (HTML, not canvas — it never changes 60x/sec, so there's no
 * performance reason to draw it with pixels), and the canvas itself.
 * Kept as `forwardRef` so each chart owns its own canvas ref and renderer
 * hook, while this component only owns how it's framed on screen.
 */
const ChartContainer = forwardRef<HTMLCanvasElement, ChartContainerProps>(function ChartContainer(
  { title, categories, height = 260 },
  ref
) {
  return (
    <div className="chart-container" style={{ height }}>
      <div className="chart-header">
        <span className="chart-title">{title}</span>
        <div className="chart-legend">
          {categories.map((c) => (
            <span key={c} className="legend-item">
              <span className="legend-dot" style={{ background: CATEGORY_COLOR[c] }} />
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className="chart-canvas-wrap">
        <canvas ref={ref} />
      </div>
    </div>
  );
});

export default ChartContainer;
