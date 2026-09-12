"use client";

import { useCallback, useMemo, useState } from "react";
import {
  type DatePresetKey,
  type DateRange,
  rangeFromPreset,
  rangeToQuery,
} from "@/lib/report-filters";

export type ReportFilters = {
  range: DateRange;
  search: string;
};

export type UseReportFiltersResult = {
  filters: ReportFilters;
  range: DateRange;
  search: string;
  setPreset: (preset: DatePresetKey) => void;
  setCustomRange: (from: Date, to: Date) => void;
  setSearch: (value: string) => void;
  reset: () => void;
  /** Build a `URLSearchParams` for API calls, including search if non-empty. */
  toQuery: (extra?: Record<string, string | number | undefined>) => URLSearchParams;
};

export function useReportFilters(
  defaultPreset: DatePresetKey = "today"
): UseReportFiltersResult {
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset(defaultPreset));
  const [search, setSearch] = useState("");

  const setPreset = useCallback((preset: DatePresetKey) => {
    setRange(rangeFromPreset(preset));
  }, []);

  const setCustomRange = useCallback((from: Date, to: Date) => {
    const f = new Date(from);
    f.setHours(0, 0, 0, 0);
    const t = new Date(to);
    t.setHours(23, 59, 59, 999);
    setRange({ from: f, to: t, preset: "custom" });
  }, []);

  const reset = useCallback(() => {
    setRange(rangeFromPreset(defaultPreset));
    setSearch("");
  }, [defaultPreset]);

  const toQuery = useCallback(
    (extra: Record<string, string | number | undefined> = {}) => {
      const qs = rangeToQuery(range);
      if (search.trim()) qs.set("q", search.trim());
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== "") qs.set(k, String(v));
      }
      return qs;
    },
    [range, search]
  );

  const filters = useMemo<ReportFilters>(() => ({ range, search }), [range, search]);

  return { filters, range, search, setPreset, setCustomRange, setSearch, reset, toQuery };
}
