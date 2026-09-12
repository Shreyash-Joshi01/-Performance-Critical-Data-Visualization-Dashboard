"use client";

import { useEffect, useRef, useState } from "react";
import { computeVirtualRange } from "@/hooks/useVirtualization";
import { formatPrice } from "@/lib/canvasUtils";
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
 * instruments), not just a small recent slice — refreshed on its own
 * throttle (default 500ms) rather than every 100ms tick, since a table a
 * human is reading doesn't need to repaint 10x/sec to be useful, and
 * merging+sorting up to 50k rows is comfortably cheap at 2Hz but would be
 * wasteful at 10Hz for no visible benefit.
 *
 * Only `endIndex - startIndex` rows (visible + a small overscan) ever
 * become real DOM nodes; scrolling through 50,000 rows never creates more
 * than a few dozen of them. Rows are CSS-grid divs rather than
 * <table>/<tr> — see the `.data-table-row` comment in globals.css for why:
 * it's what lets the header stay genuinely fixed (not just `sticky`, which
 * doesn't survive the virtualization transform) while guaranteeing its
 * columns never drift out of alignment with the scrolling body.
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
        <span className="chart-title">Trade Tape ({rows.length.toLocaleString()} rows)</span>
      </div>

      <div className="data-table-row data-table-head" role="row">
        <span role="columnheader">Timestamp</span>
        <span role="columnheader">Symbol</span>
        <span role="columnheader">Price</span>
      </div>

      <div className="table-scroll" style={{ height: CONTAINER_HEIGHT }} onScroll={handleScroll} role="table" aria-rowcount={rows.length}>
        <div style={{ height: totalHeight, position: "relative" }}>
          {visibleRows.map((row, i) => (
            <div
              key={startIndex + i}
              role="row"
              className="data-table-row data-table-row-body"
              style={{ position: "absolute", top: offsetY + i * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
            >
              <span role="cell">{new Date(row.timestamp).toLocaleTimeString()}</span>
              <span role="cell">
                <span className="legend-dot" style={{ background: CATEGORY_COLOR[row.category] }} /> {row.category}
              </span>
              <span role="cell">{formatPrice(row.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
