"use client";

import { useEffect, useState } from "react";
import {
  DATE_PRESETS,
  type DatePresetKey,
  type DateRange,
  fromDateInputValue,
  toDateInputValue,
} from "@/lib/report-filters";

export type DateRangeFilterProps = {
  value: DateRange;
  onPresetChange: (preset: DatePresetKey) => void;
  onCustomChange: (from: Date, to: Date) => void;
  className?: string;
};

export default function DateRangeFilter({
  value,
  onPresetChange,
  onCustomChange,
  className = "",
}: DateRangeFilterProps) {
  const [from, setFrom] = useState(() => toDateInputValue(value.from));
  const [to, setTo] = useState(() => toDateInputValue(value.to));

  useEffect(() => {
    setFrom(toDateInputValue(value.from));
    setTo(toDateInputValue(value.to));
  }, [value.from, value.to]);

  const isCustom = value.preset === "custom";

  function applyCustom(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) return;
    const f = fromDateInputValue(nextFrom);
    const t = fromDateInputValue(nextTo);
    if (f.getTime() > t.getTime()) return;
    onCustomChange(f, t);
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-1">
        {DATE_PRESETS.map((p) => {
          const active = value.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onPresetChange(p.key)}
              className={[
                "px-2.5 py-1 text-[11px] border rounded-sm transition-colors",
                active
                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                  : "bg-white text-[var(--text-main)] border-[var(--border)] hover:bg-[var(--bg-table-head)]",
              ].join(" ")}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {isCustom && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            className="erp-input !h-7 !text-[11px]"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              applyCustom(e.target.value, to);
            }}
          />
          <span className="text-[11px] text-[var(--text-muted)]">→</span>
          <input
            type="date"
            className="erp-input !h-7 !text-[11px]"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              applyCustom(from, e.target.value);
            }}
          />
        </div>
      )}
    </div>
  );
}
