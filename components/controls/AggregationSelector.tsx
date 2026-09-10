"use client";

import { AggregationInterval } from "@/lib/types";

interface AggregationSelectorProps {
  value: AggregationInterval;
  onChange: (interval: AggregationInterval) => void;
}

const OPTIONS: { key: AggregationInterval; label: string }[] = [
  { key: "raw", label: "Raw" },
  { key: "1m", label: "1 min" },
  { key: "5m", label: "5 min" },
  { key: "1h", label: "1 hour" },
];

/** Drives the Bar Chart's bucket size (lib/aggregation.ts) — see BarChart.tsx. */
export default function AggregationSelector({ value, onChange }: AggregationSelectorProps) {
  return (
    <div className="control-group">
      <span className="control-label">Aggregation</span>
      <div className="control-row">
        {OPTIONS.map((o) => (
          <button key={o.key} className={`btn ${value === o.key ? "btn-active" : ""}`} onClick={() => onChange(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
