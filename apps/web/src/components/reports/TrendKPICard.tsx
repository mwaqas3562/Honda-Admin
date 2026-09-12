"use client";

import { formatPercent } from "@/lib/formatters";
import type { ReactNode } from "react";

export type TrendKPICardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trendPct: number | null;
  /** Some metrics treat "down" as good (e.g. costs, low-stock count). */
  invert?: boolean;
  accentClass?: string;
};

export default function TrendKPICard({
  label,
  value,
  hint,
  trendPct,
  invert = false,
  accentClass = "text-[var(--accent)]",
}: TrendKPICardProps) {
  const hasTrend = trendPct !== null && Number.isFinite(trendPct);
  const isPositive = hasTrend ? trendPct > 0 : null;
  const goodDirection =
    isPositive === null ? null : invert ? !isPositive : isPositive;

  const trendColor =
    goodDirection === null
      ? "text-[var(--text-muted)]"
      : goodDirection
        ? "text-emerald-700"
        : "text-red-700";

  const arrow = isPositive === null ? "•" : isPositive ? "▲" : "▼";

  return (
    <div className="border border-[var(--border)] bg-white rounded-sm p-3 flex flex-col">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
        {hasTrend && (
          <span className={`text-[10px] font-semibold ${trendColor}`}>
            {arrow} {formatPercent(Math.abs(trendPct as number), { fractionDigits: 1 })}
          </span>
        )}
      </div>
      <div className={`text-[18px] font-semibold mt-1 ${accentClass}`}>{value}</div>
      {hint && (
        <div className="text-[10px] text-[var(--text-muted)] mt-1">{hint}</div>
      )}
    </div>
  );
}
