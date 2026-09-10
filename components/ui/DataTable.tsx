"use client";

import { useEffect, useRef, useState } from "react";
import { computeVirtualRange } from "@/hooks/useVirtualization";
import { BoundedBuffer } from "@/lib/buffer";
import { CATEGORY_COLOR, Category, DataPoint } from "@/lib/types";

interface DataTableProps {
  buffers: Record<Category, BoundedBuffer<DataPoint>>;
  versionRef: React.MutableRefObject<number>;
  categories: Category[];
  refreshIntervalMs?: number;
}

const ROW_HEIGHT = 26;
const CONTAINER_HEIGHT = 240;

/**
 * Virtualized table over the *entire* live buffer (up to 50k rows across
 * categories), not just a small recent slice — refreshed on its own
 * throttle (default 500ms) rather than every 100ms tick, since a table a
 * human is reading doesn't need to repaint 10x/sec to be useful, and
 * merging+sorting up to 50k rows is comfortably cheap at 2Hz but would be
 * wasteful at 10Hz for no visible benefit.
 *
 * Only `endIndex - startIndex` rows (visible + a small overscan) ever
 * become real <tr> elements; scrolling through 50,000 rows never creates
 * more than a few dozen DOM nodes.
 */
export default function DataTable({ buffers, versionRef, categories, refreshIntervalMs = 500 }: DataTableProps) {
  const [rows, setRows] = useState<DataPoint[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const lastVersionRef = useRef(-1);
  const scrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (versionRef.current !== lastVersionRef.current) {
        lastVersionRef.current = versionRef.current;
        const merged: DataPoint[] = [];
        for (const category of categories) {
          merged.push(...buffers[category].snapshot());
        }
        merged.sort((a, b) => b.timestamp - a.timestamp); // newest first
        setRows(merged);
      }
    };
    refresh();
    const id = setInterval(refresh, refreshIntervalMs);
    return () => clearInterval(id);
  }, [buffers, categories, versionRef, refreshIntervalMs]);

  const { startIndex, endIndex, offsetY, totalHeight } = computeVirtualRange({
    scrollTop,
    itemHeight: ROW_HEIGHT,
    containerHeight: CONTAINER_HEIGHT,
    totalCount: rows.length,
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      setScrollTop(top);
      scrollFrameRef.current = null;
    });
  };

  const visibleRows = rows.slice(startIndex, endIndex);

  return (
    <div className="chart-container">
      <div className="chart-header">
        <span className="chart-title">Data Table ({rows.length.toLocaleString()} rows)</span>
      </div>
      <div className="table-scroll" style={{ height: CONTAINER_HEIGHT }} onScroll={handleScroll}>
        <div style={{ height: totalHeight, position: "relative" }}>
          <table className="data-table" style={{ transform: `translateY(${offsetY}px)` }}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Category</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => (
                <tr key={startIndex + i} style={{ height: ROW_HEIGHT }}>
                  <td>{new Date(row.timestamp).toLocaleTimeString()}</td>
                  <td>
                    <span className="legend-dot" style={{ background: CATEGORY_COLOR[row.category] }} /> {row.category}
                  </td>
                  <td>{row.value.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
