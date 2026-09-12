"use client";

import type { ReactNode } from "react";

export type SummaryTileProps = {
  label: string;
  value: ReactNode;
  /** Tailwind class for the value colour. */
  accent?: string;
  hint?: ReactNode;
  className?: string;
};

/**
 * Compact KPI tile used inside drill-down panels.
 * Smaller than `KPICard` and meant for grids of 4-7 metrics.
 */
export default function SummaryTile({
  label,
  value,
  accent = "text-[var(--text-main)]",
  hint,
  className = "",
}: SummaryTileProps) {
  return (
    <div
      className={`border border-[var(--border)] bg-[var(--bg-panel)] rounded-sm px-3 py-2 ${className}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
      <div className={`text-[14px] font-semibold mt-0.5 ${accent}`}>{value}</div>
      {hint && (
        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{hint}</div>
      )}
    </div>
  );
}
