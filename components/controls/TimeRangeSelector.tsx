"use client";

export type TimeRangePreset = "1m" | "5m" | "15m" | "all";

interface TimeRangeSelectorProps {
  active: TimeRangePreset;
  onChange: (preset: TimeRangePreset) => void;
}

const PRESETS: { key: TimeRangePreset; label: string }[] = [
  { key: "1m", label: "Last 1 min" },
  { key: "5m", label: "Last 5 min" },
  { key: "15m", label: "Last 15 min" },
  { key: "all", label: "All" },
];

/**
 * Presets jump the shared viewport straight to a known time span (anchored
 * to "now"). Free-form zoom/pan (wheel + drag on the charts themselves)
 * still works after picking a preset — this is just a fast way to reset.
 */
export default function TimeRangeSelector({ active, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="control-group">
      <span className="control-label">Time Range</span>
      <div className="control-row">
        {PRESETS.map((p) => (
          <button key={p.key} className={`btn ${active === p.key ? "btn-active" : ""}`} onClick={() => onChange(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
