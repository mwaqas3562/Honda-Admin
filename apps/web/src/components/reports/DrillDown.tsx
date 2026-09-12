"use client";

import { useEffect, type ReactNode } from "react";

export type DrillDownProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Width preset. */
  size?: "sm" | "md" | "lg" | "xl";
  /** Optional footer area (actions, summary). */
  footer?: ReactNode;
};

const SIZE_CLASS: Record<NonNullable<DrillDownProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
};

export default function DrillDown({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = "lg",
  footer,
}: DrillDownProps) {
  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        // Close only when clicking the backdrop itself
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${SIZE_CLASS[size]} bg-white border border-[var(--border)] shadow-xl rounded-sm flex flex-col max-h-[calc(100vh-4rem)]`}
      >
        <div className="flex items-start justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-table-head)]">
          <div>
            <div className="text-[13px] font-semibold text-[var(--text-main)]">
              {title}
            </div>
            {subtitle && (
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[16px] leading-none px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3">{children}</div>

        {footer && (
          <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-panel)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
