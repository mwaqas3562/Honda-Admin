"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export type SearchInputProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  delayMs?: number;
  className?: string;
  /** Visual width helper (Tailwind class). */
  widthClass?: string;
};

export default function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  delayMs = 300,
  className = "",
  widthClass = "w-56",
}: SearchInputProps) {
  const [local, setLocal] = useState(value);
  const debounced = useDebouncedValue(local, delayMs);

  // Push debounced value upstream
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Sync downstream resets (e.g. after `reset()` in the hook)
  useEffect(() => {
    if (value !== local) setLocal(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={`relative ${widthClass} ${className}`}>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)]">
        🔍
      </span>
      <input
        type="search"
        className="erp-input !pl-7 !pr-7 !h-7 !text-[11px] w-full"
        placeholder={placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />
      {local && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setLocal("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          ×
        </button>
      )}
    </div>
  );
}
