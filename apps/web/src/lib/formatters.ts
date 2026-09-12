/**
 * Display formatters for reports.
 * All functions are safe for `null`/`undefined`/non-numeric values
 * and return a sensible placeholder ("—") when the input is invalid.
 */

const PLACEHOLDER = "—";

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export type CurrencyOptions = {
  currency?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export function formatCurrency(
  value: unknown,
  options: CurrencyOptions = {}
): string {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  const {
    currency = "PKR",
    locale = "en-PK",
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(n);
  } catch {
    // Fallback if the runtime doesn't support the currency code
    return `${currency} ${formatNumber(n, { maximumFractionDigits })}`;
  }
}

export type NumberOptions = {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export function formatNumber(
  value: unknown,
  options: NumberOptions = {}
): string {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  const {
    locale = "en-PK",
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(n);
}

/**
 * Format a percentage. Pass `fromRatio: true` if the input is already a
 * fraction (e.g. 0.125 -> "12.5%"); default treats input as a percent
 * (e.g. 12.5 -> "12.5%").
 */
export function formatPercent(
  value: unknown,
  options: { fromRatio?: boolean; fractionDigits?: number; locale?: string } = {}
): string {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  const { fromRatio = false, fractionDigits = 1, locale = "en-PK" } = options;
  const pct = fromRatio ? n * 100 : n;
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(pct)}%`;
}

export function formatInteger(value: unknown, locale = "en-PK"): string {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
}

export function formatDate(value: unknown, locale = "en-PK"): string {
  if (!value) return PLACEHOLDER;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return PLACEHOLDER;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

export function formatDateTime(value: unknown, locale = "en-PK"): string {
  if (!value) return PLACEHOLDER;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return PLACEHOLDER;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Compact short numbers: 12,300 -> "12.3K". Useful for KPI tiles. */
export function formatCompact(value: unknown, locale = "en-PK"): string {
  const n = toNumber(value);
  if (n === null) return PLACEHOLDER;
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
