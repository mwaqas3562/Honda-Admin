"use client";

import { useMemo } from "react";

export type ExportColumn<T> = {
  /** Column header in the CSV. */
  header: string;
  /** Either a property key or a value accessor. */
  accessor: keyof T | ((row: T) => unknown);
};

export type ExportCSVProps<T> = {
  /** File base name without extension. A timestamp will be appended. */
  filename: string;
  rows: T[];
  columns: ExportColumn<T>[];
  /** Optional disable override (in addition to "rows is empty"). */
  disabled?: boolean;
  className?: string;
  label?: string;
};

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) {
    s = value.toISOString();
  } else if (typeof value === "object") {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  } else {
    s = String(value);
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCSV<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const raw =
            typeof c.accessor === "function"
              ? c.accessor(row)
              : (row as Record<string, unknown>)[c.accessor as string];
          return escapeCell(raw);
        })
        .join(",")
    )
    .join("\r\n");
  return body ? `${header}\r\n${body}` : header;
}

function timestampSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export default function ExportCSV<T>({
  filename,
  rows,
  columns,
  disabled = false,
  className = "",
  label = "Export CSV",
}: ExportCSVProps<T>) {
  const isDisabled = disabled || rows.length === 0;

  const csv = useMemo(() => buildCSV(rows, columns), [rows, columns]);

  function download() {
    if (isDisabled) return;
    // BOM keeps Excel happy with UTF-8.
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${timestampSuffix()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={isDisabled}
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1 text-[11px] border rounded-sm transition-colors",
        isDisabled
          ? "bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed"
          : "bg-white text-[var(--text-main)] border-[var(--border)] hover:bg-[var(--bg-table-head)]",
        className,
      ].join(" ")}
      title={isDisabled ? "No rows to export" : "Download CSV"}
    >
      <span aria-hidden>⬇</span>
      <span>{label}</span>
    </button>
  );
}
