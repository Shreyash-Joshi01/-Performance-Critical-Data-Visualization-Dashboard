"use client";

import { ChartType } from "@/lib/types";

interface ChartTypeSelectorProps {
  label: string;
  value: ChartType;
  onChange: (type: ChartType) => void;
}

const TYPES: ChartType[] = ["line", "bar", "scatter", "heatmap"];

export default function ChartTypeSelector({ label, value, onChange }: ChartTypeSelectorProps) {
  return (
    <div className="control-group">
      <span className="control-label">{label}</span>
      <div className="control-row">
        {TYPES.map((t) => (
          <button key={t} className={`btn ${value === t ? "btn-active" : ""}`} onClick={() => onChange(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
