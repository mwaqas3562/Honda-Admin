"use client";

import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "emerald"
  | "sky"
  | "amber"
  | "red"
  | "slate";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-white text-[var(--text-main)] border-[var(--border)]",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
};

export type BadgeProps = {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Compact pill badge used for status, bucket, type, and category labels
 * across reports. Tone presets keep colour usage consistent.
 */
export default function Badge({
  tone = "neutral",
  icon,
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium border rounded-sm ${TONE_CLASS[tone]} ${className}`}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}
