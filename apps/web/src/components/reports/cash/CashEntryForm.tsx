"use client";

import { blockDecimalKeys, blockDecimalPaste } from "@/lib/intInput";
import { useEffect, useState } from "react";
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
  onSubmit: (values: CashEntryFormValues) => void;
  onCancel: () => void;
};

export default function CashEntryForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: CashEntryFormProps) {
  const [values, setValues] = useState<CashEntryFormValues>(() => ({
    entryDate: initial
      ? toDateInputValue(new Date(initial.entryDate))
      : toDateInputValue(new Date()),
    type: initial?.type ?? "SALE",
    amount: initial ? String(initial.amount) : "",
    notes: initial?.notes ?? "",
  }));

  useEffect(() => {
    if (initial) {
      setValues({
        entryDate: toDateInputValue(new Date(initial.entryDate)),
        type: initial.type,
        amount: String(initial.amount),
        notes: initial.notes ?? "",
      });
    }
  }, [initial]);

  function update<K extends keyof CashEntryFormValues>(
    key: K,
    val: CashEntryFormValues[K]
  ) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <form onSubmit={submit} className="space-y-2 text-[12px]">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">
            Date
          </span>
          <input
            type="date"
            required
            className="erp-input !h-8 w-full"
            value={values.entryDate}
            onChange={(e) => update("entryDate", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">
            Type
          </span>
          <select
            className="erp-input !h-8 w-full"
            value={values.type}
            onChange={(e) => update("type", e.target.value as CashEntryType)}
          >
            {CASH_ENTRY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">
          Amount (PKR)
        </span>
        <input
          type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste}
          inputMode="numeric"
          min={0}
          step="1"
          required
          className="erp-input !h-8 w-full"
          value={values.amount}
          onChange={(e) => update("amount", e.target.value)}
        />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">
          Notes
        </span>
        <textarea
          rows={3}
          maxLength={500}
          className="erp-input w-full !h-auto"
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Optional details about this entry…"
        />
      </label>
      {error && (
        <div className="text-[11px] text-red-700 border border-red-300 bg-red-50 p-2 rounded-sm">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          className="erp-btn"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="erp-btn erp-btn-primary"
          disabled={submitting}
        >
          {submitting ? "Saving…" : initial ? "Update" : "Add Entry"}
        </button>
      </div>
    </form>
  );
}
