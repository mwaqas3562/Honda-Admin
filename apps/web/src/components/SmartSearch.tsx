"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export type SmartSearchColumn<T> = {
  /** Column header label. */
  label: string;
  /** Width in px or any CSS width value. Omit for 1fr. */
  width?: number | string;
  /** Cell renderer. */
  render: (item: T) => ReactNode;
  /** Optional alignment. */
  align?: "left" | "right" | "center";
  /** Use monospace font (for codes / SKUs). */
  mono?: boolean;
};

export type SmartSearchProps<T> = {
  value: string;
  onChange: (next: string) => void;
  fetcher: (q: string, signal: AbortSignal) => Promise<T[]>;
  /**
   * EITHER provide `columns` for built-in tabular dropdown,
   * OR provide `renderItem` for fully-custom rows.
   */
  columns?: SmartSearchColumn<T>[];
  renderItem?: (item: T) => ReactNode;
  keyOf: (item: T) => string;
  onPick: (item: T) => void;
  placeholder?: string;
  width?: number | string;
  /** Pixels — minimum width of dropdown panel. Default 560. */
  dropdownMinWidth?: number | string;
  disabled?: boolean;
  minChars?: number;
  debounceMs?: number;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  emptyMessage?: string;
  showClear?: boolean;
  onClear?: () => void;
  /** Align dropdown to "left" or "right" of the input. Default "left". */
  align?: "left" | "right";
  /** Optional: called when Enter or Tab is pressed and no result is picked. */
  onNoResultEnter?: () => void;
  /** Optional external ref to the underlying <input> element. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

/**
 * User-friendly searchable dropdown with optional tabular columns.
 *
 *  - Live debounced lookups (default 250 ms)
 *  - Server-side multi-field OR search via the supplied fetcher
 *  - Wide dropdown showing all columns with sticky header row
 *  - Keyboard nav: ↑/↓ + Enter to pick, Escape to close
 *  - Outside click closes; mouse hover highlights
 */
export default function SmartSearch<T>({
  value,
  onChange,
  fetcher,
  columns,
  renderItem,
  keyOf,
  onPick,
  placeholder = "Search…",
  width = 280,
  dropdownMinWidth = 560,
  disabled = false,
  minChars = 0,
  debounceMs = 250,
  inputClassName = "si-input",
  inputStyle,
  emptyMessage = "No matches.",
  showClear = true,
  onClear,
  align = "left",
  onNoResultEnter,
  inputRef: externalInputRef,
}: SmartSearchProps<T>) {
  const debounced = useDebouncedValue(value, debounceMs);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState<number>(-1);
  const [suppressOpen, setSuppressOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /* Sync external ref if provided */
  useEffect(() => {
    if (externalInputRef && inputRef.current) {
      (externalInputRef as React.MutableRefObject<HTMLInputElement | null>).current = inputRef.current;
    }
  });
  /* Hold fetcher in a ref so an unstable inline function from the parent
     does not re-trigger the effect on every render. */
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  /* Whenever the input is cleared externally, lift the suppress-open
     latch so the next focus reopens the dropdown. */
  useEffect(() => {
    if (!value) setSuppressOpen(false);
  }, [value]);

  /* Fetch results — depends only on debounced query / disabled / minChars. */
  useEffect(() => {
    if (disabled) return;
    if (debounced.length < minChars) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetcherRef.current(debounced.trim(), ctrl.signal)
      .then((r) => setItems(r))
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setItems([]);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [debounced, disabled, minChars]);

  /* Close on outside click */
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const wrapStyle = useMemo<React.CSSProperties>(
    () => ({ position: "relative", width }),
    [width]
  );

  const gridTemplate = useMemo(() => {
    if (!columns) return undefined;
    return columns
      .map((c) => (typeof c.width === "number" ? `${c.width}px` : c.width ?? "1fr"))
      .join(" ");
  }, [columns]);

  function pick(it: T) {
    setSuppressOpen(true);
    onPick(it);
    setOpen(false);
    setHover(-1);
    inputRef.current?.blur();
  }

  return (
    <div ref={wrapRef} style={wrapStyle}>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          className={inputClassName}
          style={{
            width: "100%",
            paddingRight: showClear && value ? 22 : undefined,
            ...inputStyle,
          }}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => { if (!suppressOpen) setOpen(true); }}
          onChange={(e) => {
            setSuppressOpen(false);
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHover((h) => Math.min(items.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHover((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter" && open && hover >= 0 && items[hover]) {
              e.preventDefault();
              pick(items[hover]);
            } else if ((e.key === "Enter" || e.key === "Tab") && (!open || items.length === 0 || hover < 0)) {
              if (typeof onNoResultEnter === "function") {
                e.preventDefault();
                setOpen(false);
                onNoResultEnter();
              }
            }
          }}
        />
        {showClear && value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              onChange("");
              setItems([]);
              onClear?.();
            }}
            style={{
              position: "absolute",
              right: 4,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              fontSize: 14,
              color: "#888",
              padding: "0 4px",
              lineHeight: 1,
            }}
            title="Clear"
          >
            ×
          </button>
        )}
      </div>

      {open && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            [align === "right" ? "right" : "left"]: 0,
            zIndex: 50,
            background: "#fff",
            border: "1px solid #b8c1cc",
            minWidth: dropdownMinWidth,
            maxHeight: 480,
            overflowY: "auto",
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            borderRadius: 2,
            marginTop: 2,
          }}
        >
          {columns && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate,
                gap: 10,
                padding: "6px 10px",
                background: "#0050a0",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              {columns.map((c, i) => (
                <div key={i} style={{ textAlign: c.align ?? "left" }}>{c.label}</div>
              ))}
            </div>
          )}

          {(() => {
            const pending = value.trim() !== debounced.trim();
            const tooShort = value.trim().length > 0 && value.trim().length < minChars;
            if (items.length === 0) {
              if (loading || pending || tooShort) {
                return <div style={{ padding: "10px 12px", fontSize: 12, color: "#666" }}>Searching…</div>;
              }
              return <div style={{ padding: "10px 12px", fontSize: 12, color: "#888" }}>{emptyMessage}</div>;
            }
            return null;
          })()}
          {items.map((it, idx) => {
              const isHover = hover === idx;
              if (columns) {
                return (
                  <div
                    key={keyOf(it)}
                    onClick={() => pick(it)}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHover(idx)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: gridTemplate,
                      gap: 10,
                      padding: "6px 10px",
                      borderBottom: "1px solid #eef0f4",
                      cursor: "pointer",
                      fontSize: 12,
                      /* Solid, not a tint: the previous highlight was so
                         faint that on a long parts list you could not tell
                         which row Enter would pick. */
                      background: isHover ? "#0050a0" : "#fff",
                      color: isHover ? "#fff" : "inherit",
                    }}
                  >
                    {columns.map((c, i) => (
                      <div
                        key={i}
                        style={{
                          textAlign: c.align ?? "left",
                          fontFamily: c.mono ? "monospace" : undefined,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.render(it)}
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div
                  key={keyOf(it)}
                  onClick={() => pick(it)}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHover(idx)}
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid #eef0f4",
                    cursor: "pointer",
                    fontSize: 12,
                    background: isHover ? "#0050a0" : "#fff",
                    color: isHover ? "#fff" : "inherit",
                  }}
                >
                  {renderItem ? renderItem(it) : null}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
