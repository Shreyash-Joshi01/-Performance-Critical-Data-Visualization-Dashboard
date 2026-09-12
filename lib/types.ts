/**
 * Core data model for the dashboard. Kept in one file so every layer
 * (generator, buffer, aggregation, renderers) shares the exact same shapes.
 */

/** One simulated price/quote sample for an instrument. */
export interface DataPoint {
  timestamp: number; // epoch ms
  value: number; // price, in simulated $
  category: Category;
  metadata?: Record<string, unknown>;
}

// Four tickers, each driven by a genuinely different stochastic process in
// lib/dataGenerator.ts (not just different parameters on the same formula) —
// see that file for the model each one uses and why.
export const CATEGORIES = ["AAPL", "TSLA", "XOM", "NVDA"] as const;
export type Category = (typeof CATEGORIES)[number];

export type ChartType = "line" | "bar" | "scatter" | "heatmap";

export type AggregationInterval = "raw" | "1m" | "5m" | "1h";

/** The visible window into the data: a time range on X, a value range on Y. */
export interface Viewport {
  startTime: number;
  endTime: number;
  minValue: number;
  maxValue: number;
}

/** One bucket produced by aggregation.ts — preserves min/max/avg, not just an average. */
export interface AggregatedPoint {
  bucketStart: number;
  bucketEnd: number;
  category: Category;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface PerformanceMetrics {
  fps: number;
  renderTimeMs: number;
  processingTimeMs: number;
  pointCount: number;
  memoryUsageMB?: number;
  droppedFrames: number;
  /** Recent FPS samples (oldest first), for the on-screen sparkline — see PerformanceMonitor.tsx. */
  fpsHistory: number[];
}

export type LoadLevel = 10_000 | 25_000 | 50_000 | 100_000;

/** Per-instrument color, single source of truth for chart + legend + table. */
export const CATEGORY_COLOR: Record<Category, string> = {
  AAPL: "#4da3ff",
  TSLA: "#f5524a",
  XOM: "#3ecf8e",
  NVDA: "#f5a623",
};
