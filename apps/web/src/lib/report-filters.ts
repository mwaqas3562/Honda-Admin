/**
 * Date helpers + preset ranges for the reporting infrastructure.
 * All ranges are inclusive of `from` and exclusive of the day after `to`
 * when querying APIs. Components/hooks treat `to` as the end-of-day moment.
 */

export type DatePresetKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "custom";

export type DateRange = {
  from: Date;
  to: Date;
  preset: DatePresetKey;
};

export type DatePreset = {
  key: DatePresetKey;
  label: string;
};

export const DATE_PRESETS: DatePreset[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisYear", label: "This Year" },
  { key: "custom", label: "Custom" },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Monday-based start of week. */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}

function startOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfDay(x);
}

function endOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return endOfDay(x);
}

function startOfYear(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), 0, 1));
}

export function rangeFromPreset(
  preset: DatePresetKey,
  reference: Date = new Date()
): DateRange {
  const now = reference;
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), preset };
    case "yesterday": {
      const y = addDays(now, -1);
      return { from: startOfDay(y), to: endOfDay(y), preset };
    }
    case "thisWeek":
      return { from: startOfWeek(now), to: endOfDay(now), preset };
    case "lastWeek": {
      const lastWeekStart = addDays(startOfWeek(now), -7);
      const lastWeekEnd = addDays(lastWeekStart, 6);
      return { from: lastWeekStart, to: endOfDay(lastWeekEnd), preset };
    }
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfDay(now), preset };
    case "lastMonth": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm), preset };
    }
    case "thisYear":
      return { from: startOfYear(now), to: endOfDay(now), preset };
    case "custom":
    default:
      return { from: startOfMonth(now), to: endOfDay(now), preset: "custom" };
  }
}

/** ISO yyyy-mm-dd for `<input type="date">`. */
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse yyyy-mm-dd from `<input type="date">` as a local-midnight Date. */
export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Build URL query params (`from=...&to=...`) for API calls. */
export function rangeToQuery(range: DateRange): URLSearchParams {
  const params = new URLSearchParams();
  params.set("from", range.from.toISOString());
  params.set("to", range.to.toISOString());
  return params;
}

export function formatRangeLabel(range: DateRange): string {
  const f = toDateInputValue(range.from);
  const t = toDateInputValue(range.to);
  return f === t ? f : `${f} → ${t}`;
}
