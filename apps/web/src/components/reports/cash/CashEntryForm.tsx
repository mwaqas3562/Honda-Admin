"use client";

import { blockDecimalKeys, blockDecimalPaste } from "@/lib/intInput";
import { useEffect, useRef, useState } from "react";
import {
  CASH_ENTRY_TYPES,
  type CashEntry,
  type CashEntryType,
} from "@/types/cash";
import { toDateInputValue } from "@/lib/report-filters";

export type CashEntryFormValues = {
  entryDate: string; // yyyy-mm-dd
  type: CashEntryType;
  amount: string;
  notes: string;
};

export type CashEntryFormProps = {
  initial?: CashEntry | null;
  submitting: boolean;
  error: string | null;
  /** Always an array. Editing yields exactly one; adding may yield several.
   *  Resolves with how many were actually written, so a partial failure can
   *  drop the saved rows and leave only the rest to retry. */
  onSubmit: (values: CashEntryFormValues[]) => Promise<number> | void;
  onCancel: () => void;
};

type Line = {
  key: number;
  type: CashEntryType;
  amount: string;
  notes: string;
};

let nextKey = 1;

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CASH_ENTRY_TYPES.map((t) => [t.value, t.label])
);

/**
 * Cash entry editor.
 *
 * Adding follows the Sale Invoice pattern: pick a type, type an amount, press
 * Add, and the line drops into the table below. A day's cash is usually several
 * lines — sales, fuel, food, sundries — so they share one date and save
 * together rather than reopening the dialog each time. Editing stays a single
 * plain form.
 */
export default function CashEntryForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: CashEntryFormProps) {
  const isEdit = Boolean(initial);

  const [entryDate, setEntryDate] = useState(() =>
    initial ? toDateInputValue(new Date(initial.entryDate)) : toDateInputValue(new Date())
  );

  /* Edit mode edits these directly; add mode uses them as the draft row. */
  const [type, setType] = useState<CashEntryType>(initial?.type ?? "SALE");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [lines, setLines] = useState<Line[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initial) {
      setEntryDate(toDateInputValue(new Date(initial.entryDate)));
      setType(initial.type);
      setAmount(String(initial.amount));
      setNotes(initial.notes ?? "");
      setLines([]);
    }
  }, [initial]);

  const draftValid = amount.trim() !== "" && Number(amount) > 0;

  function addLine(): boolean {
    if (!draftValid) {
      setLocalError("Enter an amount greater than zero.");
      return false;
    }
    setLines((ls) => [...ls, { key: nextKey++, type, amount: amount.trim(), notes: notes.trim() }]);
    /* Keep the type — consecutive entries are usually the same kind — and
     * clear the rest ready for the next one. */
    setAmount("");
    setNotes("");
    setLocalError(null);
    amountRef.current?.focus();
    return true;
  }

  function removeLine(key: number) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  const pendingCount = lines.length + (draftValid ? 1 : 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (isEdit) {
      if (!draftValid) { setLocalError("Enter an amount greater than zero."); return; }
      await onSubmit([{ entryDate, type, amount: amount.trim(), notes: notes.trim() }]);
      return;
    }

    /* A filled-in draft row that was never "Added" still counts — losing it
     * silently because the user skipped one button would be a nasty surprise. */
    const all: Line[] = draftValid
      ? [...lines, { key: nextKey++, type, amount: amount.trim(), notes: notes.trim() }]
      : lines;

    if (all.length === 0) {
      setLocalError("Add at least one entry.");
      return;
    }

    /* Fold the draft into the list before sending, so the list alone is the
     * record of what was submitted. */
    setLines(all);
    setAmount("");
    setNotes("");

    const saved = await onSubmit(
      all.map((l) => ({ entryDate, type: l.type, amount: l.amount, notes: l.notes }))
    );

    /* Entries are written one at a time and are not rolled back on failure.
     * Keeping the saved ones on screen would re-create them on retry and
     * double-count the day's cash, so drop them and leave the remainder. */
    if (typeof saved === "number" && saved > 0 && saved < all.length) {
      setLines(all.slice(saved));
    }
  }

  const shown = error ?? localError;

  return (
    <form onSubmit={submit} className="text-[12px]">
      {/* ── Date ─────────────────────────────────────────── */}
      <div className="flex items-end gap-3 pb-2 mb-2 border-b border-[var(--border)]">
        <label className="block" style={{ width: 200 }}>
          <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">Date</span>
          <input
            type="date"
            required
            className="erp-input !h-8 w-full"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
          />
        </label>
        {!isEdit && (
          <span className="text-[11px] text-[var(--text-muted)] pb-1.5">
            Applies to every entry added below.
          </span>
        )}
      </div>

      {/* ── Entry row ────────────────────────────────────── */}
      <div className="flex items-end gap-2 flex-wrap">
        <label className="block" style={{ width: 180 }}>
          <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">Type</span>
          <select
            className="erp-input !h-8 w-full"
            value={type}
            onChange={(e) => setType(e.target.value as CashEntryType)}
          >
            {CASH_ENTRY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="block" style={{ width: 150 }}>
          <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">Amount (PKR)</span>
          <input
            ref={amountRef}
            type="number" onKeyDown={(e) => {
              blockDecimalKeys(e);
              if (!isEdit && e.key === "Enter") { e.preventDefault(); addLine(); }
            }}
            onPaste={blockDecimalPaste}
            inputMode="numeric"
            min={0}
            step="1"
            className="erp-input !h-8 w-full"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="block flex-1" style={{ minWidth: 200 }}>
          <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">Notes</span>
          <input
            maxLength={500}
            className="erp-input !h-8 w-full"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (!isEdit && e.key === "Enter") { e.preventDefault(); addLine(); }
            }}
            placeholder="e.g. Food, Misc, Fuel…"
          />
        </label>
        {!isEdit && (
          <button
            type="button"
            className="erp-btn erp-btn-primary !h-8"
            onClick={addLine}
            disabled={submitting}
            title="Add this entry to the list (or press Enter)"
          >
            + Add
          </button>
        )}
      </div>

      {/* ── Added entries ────────────────────────────────── */}
      {!isEdit && (
        <div className="mt-3">
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th style={{ width: 160 }}>Type</th>
                <th className="text-right" style={{ width: 130 }}>Amount</th>
                <th>Notes</th>
                <th style={{ width: 70 }} />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    No entries added yet — fill the row above and press Add.
                  </td>
                </tr>
              )}
              {lines.map((l, i) => (
                <tr key={l.key}>
                  <td>{i + 1}</td>
                  <td>{TYPE_LABEL[l.type] ?? l.type}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>
                    {Number(l.amount).toLocaleString()}
                  </td>
                  <td>{l.notes || <span className="text-[var(--text-muted)]">—</span>}</td>
                  <td>
                    <button
                      type="button"
                      className="text-[11px] text-red-700 hover:underline"
                      onClick={() => removeLine(l.key)}
                      disabled={submitting}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown && (
        <div className="mt-2 text-[11px] text-red-700 border border-red-300 bg-red-50 p-2 rounded-sm whitespace-pre-line">
          {shown}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3">
        <button type="button" className="erp-btn" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="erp-btn erp-btn-primary" disabled={submitting}>
          {submitting
            ? "Saving…"
            : isEdit
              ? "Update"
              : pendingCount > 1
                ? `Save ${pendingCount} Entries`
                : "Save Entry"}
        </button>
      </div>
    </form>
  );
}
