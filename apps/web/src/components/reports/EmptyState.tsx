"use client";

import type { ReactNode } from "react";

export type EmptyStateProps = {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** Visual style: full panel or compact inline. */
  variant?: "panel" | "inline";
  className?: string;
};

export default function EmptyState({
  title = "No data",
  description = "There's nothing to display for the selected filters.",
  icon = "📭",
  action,
  variant = "panel",
  className = "",
}: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-muted)] ${className}`}
      >
        <span aria-hidden>{icon}</span>
        <span>{title}</span>
      </div>
    );
  }

  return (
    <div
      className={[
        "flex flex-col items-center justify-center text-center",
        "border border-dashed border-[var(--border)] bg-white",
        "px-6 py-10 rounded-sm",
        className,
      ].join(" ")}
    >
      <div className="text-3xl mb-2" aria-hidden>{icon}</div>
      <div className="text-[13px] font-semibold text-[var(--text-main)]">{title}</div>
      <div className="text-[11px] text-[var(--text-muted)] mt-1 max-w-sm">
        {description}
      </div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ message, onRetry, className = "" }: ErrorStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-start gap-2 px-4 py-3 rounded-sm",
        "border border-red-300 bg-red-50 text-[12px] text-red-800",
        className,
      ].join(" ")}
      role="alert"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden>⚠</span>
        <span className="font-semibold">Failed to load report</span>
      </div>
      <div className="text-[11px] break-words">{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 px-2.5 py-1 text-[11px] border border-red-300 bg-white rounded-sm hover:bg-red-100"
        >
          Retry
        </button>
      )}
    </div>
  );
}
