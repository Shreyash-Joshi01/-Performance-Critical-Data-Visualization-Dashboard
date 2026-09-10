import { useMemo } from "react";

export interface VirtualizationInput {
  scrollTop: number;
  itemHeight: number;
  containerHeight: number;
  totalCount: number;
  overscan?: number;
}

export interface VirtualizationResult {
  startIndex: number;
  endIndex: number; // exclusive
  offsetY: number; // translateY for the visible slice
  totalHeight: number; // full scroll height, so the scrollbar is correctly sized
}

/**
 * Pure math for row virtualization: given scroll position and row height,
 * work out which slice of rows is actually on screen. No DOM/React
 * dependency, so it's trivially testable and reusable by any list, not
 * just the data table.
 *
 * Without this, rendering a table for a 10k-50k row dataset means 10k-50k
 * real DOM rows — the browser has to lay out, paint and keep all of them
 * in memory, which is the single fastest way to make a "virtualized data
 * table" requirement fail outright.
 */
export function computeVirtualRange({ scrollTop, itemHeight, containerHeight, totalCount, overscan = 6 }: VirtualizationInput): VirtualizationResult {
  if (totalCount === 0 || itemHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }
  const firstVisible = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(totalCount, firstVisible + visibleCount + overscan);

  return {
    startIndex,
    endIndex,
    offsetY: startIndex * itemHeight,
    totalHeight: totalCount * itemHeight,
  };
}

export function useVirtualRange(input: VirtualizationInput): VirtualizationResult {
  return useMemo(() => computeVirtualRange(input), [input.scrollTop, input.itemHeight, input.containerHeight, input.totalCount, input.overscan]);
}
