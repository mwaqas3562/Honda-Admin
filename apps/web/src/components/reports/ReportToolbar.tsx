"use client";

import type { ReactNode } from "react";
import DateRangeFilter from "./DateRangeFilter";
import SearchInput from "./SearchInput";
import type { UseReportFiltersResult } from "@/hooks/useReportFilters";

export type ReportToolbarProps = {
  filters: UseReportFiltersResult;
  showSearch?: boolean;
  searchPlaceholder?: string;
  /** Right-side slot, e.g. ExportCSV button. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Standard toolbar combining `DateRangeFilter`, optional `SearchInput`,
 * and a right-aligned action slot. Drop into any report page.
 */
export default function ReportToolbar({
  filters,
  showSearch = true,
  searchPlaceholder = "Search…",
  actions,
  className = "",
}: ReportToolbarProps) {
  return (
    <div
      className={[
        "flex flex-wrap items-center gap-3 justify-between",
        "border border-[var(--border)] bg-[var(--bg-panel)]",
        "px-3 py-2 rounded-sm",
        className,
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilter
          value={filters.range}
          onPresetChange={filters.setPreset}
          onCustomChange={filters.setCustomRange}
        />
        {showSearch && (
          <SearchInput
            value={filters.search}
            onChange={filters.setSearch}
            placeholder={searchPlaceholder}
          />
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
