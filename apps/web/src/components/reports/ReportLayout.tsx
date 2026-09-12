"use client";

import type { ReactNode } from "react";

export type ReportPageHeaderProps = {
  title: string;
  description?: string;
  /** Right-aligned actions (export buttons, links, etc). */
  actions?: ReactNode;
};

export function ReportPageHeader({
  title,
  description,
  actions,
}: ReportPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
      <div>
        <h1 className="text-[15px] font-semibold text-[var(--text-main)] leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export type ReportGridProps = {
  children: ReactNode;
  /** Tailwind columns at lg breakpoint. Default 4. */
  cols?: 1 | 2 | 3 | 4;
  className?: string;
};

const COLS_CLASS: Record<NonNullable<ReportGridProps["cols"]>, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/**
 * Responsive grid: 1 col on mobile, 2 on small screens, configurable on large.
 */
export function ReportGrid({ children, cols = 4, className = "" }: ReportGridProps) {
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 ${COLS_CLASS[cols]} gap-3 ${className}`}
    >
      {children}
    </div>
  );
}

export type KPICardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Optional accent color class (text). */
  accentClass?: string;
};

export function KPICard({ label, value, hint, accentClass = "text-[var(--accent)]" }: KPICardProps) {
  return (
    <div className="border border-[var(--border)] bg-white rounded-sm p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
      <div className={`text-[18px] font-semibold mt-1 ${accentClass}`}>{value}</div>
      {hint && <div className="text-[10px] text-[var(--text-muted)] mt-1">{hint}</div>}
    </div>
  );
}

export type ReportPanelProps = {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Remove inner padding (e.g. when wrapping a table). */
  noPadding?: boolean;
};

export function ReportPanel({
  title,
  actions,
  children,
  className = "",
  noPadding = false,
}: ReportPanelProps) {
  return (
    <section
      className={`border border-[var(--border)] bg-white rounded-sm ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-table-head)]">
          {title && (
            <div className="text-[12px] font-semibold text-[var(--text-main)]">
              {title}
            </div>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={noPadding ? "" : "p-3"}>{children}</div>
    </section>
  );
}
