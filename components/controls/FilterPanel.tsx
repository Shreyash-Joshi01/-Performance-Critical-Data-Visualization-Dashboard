"use client";

import { CATEGORIES, CATEGORY_COLOR, Category } from "@/lib/types";

interface FilterPanelProps {
  active: Category[];
  onChange: (categories: Category[]) => void;
}

/**
 * Category filter checkboxes. Toggling a category doesn't touch the data
 * buffers at all — it only changes which categories each chart iterates
 * over when it draws, so filtering is effectively free (no re-fetch, no
 * re-generation, just "skip this series this frame").
 */
export default function FilterPanel({ active, onChange }: FilterPanelProps) {
  const toggle = (category: Category) => {
    if (active.includes(category)) {
      onChange(active.filter((c) => c !== category));
    } else {
      onChange([...active, category]);
    }
  };

  return (
    <div className="control-group">
      <span className="control-label">Filters</span>
      <div className="control-row">
        {CATEGORIES.map((category) => (
          <label key={category} className="checkbox-pill" style={{ opacity: active.includes(category) ? 1 : 0.45 }}>
            <input type="checkbox" checked={active.includes(category)} onChange={() => toggle(category)} />
            <span className="legend-dot" style={{ background: CATEGORY_COLOR[category] }} />
            {category}
          </label>
        ))}
      </div>
    </div>
  );
}
