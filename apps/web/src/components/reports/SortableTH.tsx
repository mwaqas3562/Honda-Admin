"use client";

import { memo, type ReactNode } from "react";

export type ColAlign = "left" | "right" | "center";

export type SortableTHProps = {
  /** When provided, header becomes a clickable sort toggle. */
  sortKey?: string;
  /** The currently-active sort key from the parent's sort state. */
  activeKey?: string;
  /** The current sort direction from the parent's sort state. */
  direction?: "asc" | "desc";
  onSort?: (key: string) => void;
  align?: ColAlign;
  className?: string;
  children: ReactNode;
};

const ALIGN_CLASS: Record<ColAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * Reusable table header cell.
 * - When `sortKey` is provided, the header is clickable and shows a ▲/▼
 *   indicator if it matches the active sort key.
 * - Memoised so the table head doesn't re-render unless its props change.
 */
function SortableTHImpl({
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  className = "",
  children,
}: SortableTHProps) {
  const sortable = Boolean(sortKey && onSort);
  const isActive = sortable && sortKey === activeKey;
  return (
    <th
      className={`px-3 py-1.5 font-semibold ${ALIGN_CLASS[align]} ${
        sortable ? "cursor-pointer select-none hover:text-[var(--text-main)]" : ""
      } ${className}`}
      onClick={sortable ? () => onSort?.(sortKey as string) : undefined}
    >
      {children}
      {isActive && (
        <span className="ml-1 text-[var(--text-muted)]">
          {direction === "asc" ? "▲" : "▼"}
        </span>
      )}
    </th>
  );
}

const SortableTH = memo(SortableTHImpl);
export default SortableTH;
