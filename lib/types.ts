/**
 * Core data model for the dashboard. Kept in one file so every layer
 * (generator, buffer, aggregation, renderers) shares the exact same shapes.
 */

/** One synthetic telemetry sample. */
export interface DataPoint {
  timestamp: number; // epoch ms
  value: number;
  category: Category;
  metadata?: Record<string, unknown>;
}

export const CATEGORIES = ["CPU", "Memory", "Network", "Temperature"] as const;
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
}

export type LoadLevel = 10_000 | 25_000 | 50_000;

/** Per-category color, single source of truth for chart + legend + table. */
export const CATEGORY_COLOR: Record<Category, string> = {
  CPU: "#4da3ff",
  Memory: "#b779ff",
  Network: "#3ecf8e",
  Temperature: "#f5a623",
};
