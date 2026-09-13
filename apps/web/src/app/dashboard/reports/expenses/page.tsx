"use client";

import { blockDecimalKeys, blockDecimalPaste } from "@/lib/intInput";
import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ErrorState,
  ExportCSV,
  LoadingSkeleton,
  ReportPageHeader,
  ReportPanel,
  ReportToolbar,
  type ExportColumn,
} from "@/components/reports";
import TrendKPICard from "@/components/reports/TrendKPICard";
import { useReportFilters } from "@/hooks/useReportFilters";
import { useToast } from "@/components/Toast";
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
} from "@/lib/expenses-api";
import { formatCurrency, formatDate, formatNumber } from "@/lib/formatters";
import { toDateInputValue } from "@/lib/report-filters";
import {
  CATEGORY_META,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type ExpenseListResponse,
} from "@/types/expense";

type SortKey = "expenseDate" | "category" | "amount" | "createdAt";
type SortDir = "asc" | "desc";

function readUserRole(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = JSON.parse(localStorage.getItem("wpm_user") ?? "null") as
      | { role?: string }
      | null;
    return u?.role ?? null;
  } catch {
    return null;
  }
}

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "SHOP_ADMIN"]);

export default function ExpensesReportPage() {
  const toast = useToast();
  const filters = useReportFilters("today");
  const [data, setData] = useState<ExpenseListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [sortBy, setSortBy] = useState<SortKey>("expenseDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const role = useMemo(() => readUserRole(), []);
  const canDelete = role !== null && ADMIN_ROLES.has(role);

  /* Quick-add row state */
  const [qaDate, setQaDate] = useState(() => toDateInputValue(new Date()));
  const [qaCategory, setQaCategory] = useState<ExpenseCategory>("FOOD");
  const [qaAmount, setQaAmount] = useState("");
  const [qaNotes, setQaNotes] = useState("");
  const [qaSubmitting, setQaSubmitting] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  /* Inline edit state */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    expenseDate: string;
    category: ExpenseCategory;
    amount: string;
    notes: string;
  } | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    listExpenses({
      from: filters.range.from,
      to: filters.range.to,
      sortBy,
      sortDir,
      signal: ctrl.signal,
    })
      .then((res) => setData(res))
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [filters.range.from, filters.range.to, sortBy, sortDir, reloadTick]);

  const filteredExpenses = useMemo(() => {
    if (!data) return [];
    const q = filters.search.trim().toLowerCase();
    if (!q) return data.expenses;
    return data.expenses.filter(
      (e) =>
        (e.notes ?? "").toLowerCase().includes(q) ||
        CATEGORY_META[e.category].label.toLowerCase().includes(q) ||
        String(e.amount).includes(q)
    );
  }, [data, filters.search]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("desc");
    }
  }
  function sortIndicator(key: SortKey) {
    if (sortBy !== key)
      return <span className="text-[var(--text-muted)] opacity-30">↕</span>;
    return <span>{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    setQaError(null);
    const amt = Number(qaAmount);
    if (!Number.isFinite(amt) || amt < 0) {
      setQaError("Enter a valid amount.");
      return;
    }
    setQaSubmitting(true);
    try {
      await createExpense({
        expenseDate: new Date(qaDate).toISOString(),
        category: qaCategory,
        amount: amt,
        notes: qaNotes.trim() ? qaNotes.trim() : null,
      });
      setQaAmount("");
      setQaNotes("");
      setReloadTick((t) => t + 1);
    } catch (err) {
      setQaError((err as Error).message);
    } finally {
      setQaSubmitting(false);
    }
  }

  function startEdit(e: Expense) {
    setEditingId(e.id);
    setEditDraft({
      expenseDate: toDateInputValue(new Date(e.expenseDate)),
      category: e.category,
      amount: String(e.amount),
      notes: e.notes ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;
    const amt = Number(editDraft.amount);
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    setEditSubmitting(true);
    try {
      await updateExpense(editingId, {
        expenseDate: new Date(editDraft.expenseDate).toISOString(),
        category: editDraft.category,
        amount: amt,
        notes: editDraft.notes.trim() ? editDraft.notes.trim() : null,
      });
      cancelEdit();
      setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error(`Failed to update: ${(err as Error).message}`);
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(exp: Expense) {
    if (!canDelete) return;
    if (
      !confirm(
        `Delete this ${CATEGORY_META[exp.category].label} expense of ${formatCurrency(exp.amount)}?`
      )
    )
      return;
    try {
      await deleteExpense(exp.id);
      setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error(`Failed to delete: ${(err as Error).message}`);
    }
  }

  const exportCols: ExportColumn<Expense>[] = [
    { header: "Date", accessor: (r) => r.expenseDate.slice(0, 10) },
    { header: "Category", accessor: (r) => CATEGORY_META[r.category].label },
    { header: "Amount", accessor: "amount" },
    { header: "Notes", accessor: (r) => r.notes ?? "" },
  ];

  return (
    <div className="space-y-3">
      <ReportPageHeader
        title="Expenses Report"
        description="Track spending across categories."
        actions={
          data && (
            <ExportCSV
              filename="expenses"
              rows={filteredExpenses}
              columns={exportCols}
            />
          )
        }
      />

      <ReportToolbar
        filters={filters}
        searchPlaceholder="Search notes, category, amount…"
      />

      {error ? (
        <ErrorState message={error} onRetry={() => setReloadTick((t) => t + 1)} />
      ) : loading || !data ? (
        <>
          <LoadingSkeleton variant="cards" rows={4} />
          <LoadingSkeleton variant="table" rows={6} columns={5} />
        </>
      ) : (
        <>
          {/* ── KPIs ────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <CategoryKPI
              category="FOOD"
              value={data.totals.food}
              total={data.totals.grandTotal}
            />
            <CategoryKPI
              category="UTILITY"
              value={data.totals.utility}
              total={data.totals.grandTotal}
            />
            <CategoryKPI
              category="MISC"
              value={data.totals.misc}
              total={data.totals.grandTotal}
            />
            <TrendKPICard
              label="Grand Total"
              value={formatCurrency(data.totals.grandTotal)}
              hint={`${data.expenses.length} entries`}
              trendPct={null}
              accentClass="text-red-700"
            />
          </div>

          {/* ── Quick add row ───────────────────────────── */}
          <ReportPanel title="Quick Add">
            <form
              onSubmit={handleQuickAdd}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
            >
              <label className="sm:col-span-2 block">
                <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">
                  Date
                </span>
                <input
                  type="date"
                  required
                  className="erp-input !h-8 w-full"
                  value={qaDate}
                  onChange={(e) => setQaDate(e.target.value)}
                />
              </label>
              <label className="sm:col-span-2 block">
                <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">
                  Category
                </span>
                <select
                  className="erp-input !h-8 w-full"
                  value={qaCategory}
                  onChange={(e) =>
                    setQaCategory(e.target.value as ExpenseCategory)
                  }
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2 block">
                <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">
                  Amount
                </span>
                <input
                  type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste}
                  inputMode="numeric"
                  min={0}
                  step="1"
                  required
                  className="erp-input !h-8 w-full"
                  value={qaAmount}
                  onChange={(e) => setQaAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label className="sm:col-span-4 block">
                <span className="block text-[10px] uppercase text-[var(--text-muted)] mb-0.5">
                  Notes
                </span>
                <input
                  type="text"
                  maxLength={500}
                  className="erp-input !h-8 w-full"
                  value={qaNotes}
                  onChange={(e) => setQaNotes(e.target.value)}
                  placeholder="Optional…"
                />
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="erp-btn erp-btn-primary !h-8 w-full"
                  disabled={qaSubmitting}
                >
                  {qaSubmitting ? "Adding…" : "+ Add Expense"}
                </button>
              </div>
              {qaError && (
                <div className="sm:col-span-12 text-[11px] text-red-700 border border-red-300 bg-red-50 p-2 rounded-sm">
                  {qaError}
                </div>
              )}
            </form>
          </ReportPanel>

          {/* ── Table ───────────────────────────────────── */}
          <ReportPanel title="Expense Entries" noPadding>
            {filteredExpenses.length === 0 ? (
              <EmptyState
                title="No expenses"
                description="Use the quick-add form above to record your first expense."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-[var(--bg-table-head)] text-left select-none">
                    <tr>
                      <SortableTH
                        label="Type"
                        k="category"
                        sortBy={sortBy}
                        indicator={sortIndicator("category")}
                        onClick={toggleSort}
                      />
                      <SortableTH
                        label="Amount"
                        k="amount"
                        align="right"
                        sortBy={sortBy}
                        indicator={sortIndicator("amount")}
                        onClick={toggleSort}
                      />
                      <th className="px-2 py-1.5 border-b border-[var(--border)]">
                        Notes
                      </th>
                      <SortableTH
                        label="Date"
                        k="expenseDate"
                        sortBy={sortBy}
                        indicator={sortIndicator("expenseDate")}
                        onClick={toggleSort}
                      />
                      <th className="px-2 py-1.5 border-b border-[var(--border)] w-32" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((e) => {
                      const meta = CATEGORY_META[e.category];
                      const isEditing = editingId === e.id;
                      if (isEditing && editDraft) {
                        return (
                          <tr
                            key={e.id}
                            className="bg-yellow-50/50 border-b border-[var(--border)]"
                          >
                            <td className="px-2 py-1">
                              <select
                                className="erp-input !h-7 w-full"
                                value={editDraft.category}
                                onChange={(ev) =>
                                  setEditDraft({
                                    ...editDraft,
                                    category: ev.target.value as ExpenseCategory,
                                  })
                                }
                              >
                                {EXPENSE_CATEGORIES.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.icon} {c.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste}
                                min={0}
                                step="1"
                                className="erp-input !h-7 w-full text-right"
                                value={editDraft.amount}
                                onChange={(ev) =>
                                  setEditDraft({
                                    ...editDraft,
                                    amount: ev.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                maxLength={500}
                                className="erp-input !h-7 w-full"
                                value={editDraft.notes}
                                onChange={(ev) =>
                                  setEditDraft({
                                    ...editDraft,
                                    notes: ev.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="date"
                                className="erp-input !h-7 w-full"
                                value={editDraft.expenseDate}
                                onChange={(ev) =>
                                  setEditDraft({
                                    ...editDraft,
                                    expenseDate: ev.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={saveEdit}
                                disabled={editSubmitting}
                                className="text-emerald-700 hover:underline mr-2"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="text-[var(--text-muted)] hover:underline"
                              >
                                Cancel
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr
                          key={e.id}
                          className="hover:bg-[var(--bg-table-head)]/50"
                        >
                          <td className="px-2 py-1 border-b border-[var(--border)]">
                            <CategoryBadge category={e.category} />
                          </td>
                          <td
                            className={`px-2 py-1 border-b border-[var(--border)] text-right font-semibold ${meta.amountClass}`}
                          >
                            {formatCurrency(e.amount)}
                          </td>
                          <td className="px-2 py-1 border-b border-[var(--border)] text-[var(--text-muted)]">
                            {e.notes ?? ""}
                          </td>
                          <td className="px-2 py-1 border-b border-[var(--border)] font-mono">
                            {formatDate(e.expenseDate)}
                          </td>
                          <td className="px-2 py-1 border-b border-[var(--border)] text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => startEdit(e)}
                              className="text-[var(--accent)] hover:underline mr-2"
                            >
                              Edit
                            </button>
                            {canDelete ? (
                              <button
                                type="button"
                                onClick={() => handleDelete(e)}
                                className="text-red-700 hover:underline"
                              >
                                Delete
                              </button>
                            ) : (
                              <span
                                className="text-gray-400 cursor-not-allowed"
                                title="Only Admin can delete"
                              >
                                Delete
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filteredExpenses.length > 0 && (
                    <tfoot>
                      <tr className="bg-[var(--bg-panel)] font-semibold">
                        <td className="px-2 py-1.5 text-right">Total</td>
                        <td className="px-2 py-1.5 text-right">
                          {formatCurrency(
                            filteredExpenses.reduce(
                              (s, e) => s + e.amount,
                              0
                            )
                          )}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </ReportPanel>
        </>
      )}
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────── */

function SortableTH({
  label,
  k,
  sortBy,
  indicator,
  onClick,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortBy: SortKey;
  indicator: React.ReactNode;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = sortBy === k;
  return (
    <th
      onClick={() => onClick(k)}
      className={`px-2 py-1.5 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--bg-panel)] ${
        align === "right" ? "text-right" : ""
      } ${isActive ? "text-[var(--accent)]" : ""}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {indicator}
      </span>
    </th>
  );
}

function CategoryBadge({ category }: { category: ExpenseCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-sm border ${meta.badgeClass}`}
    >
      <span aria-hidden>{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

function CategoryKPI({
  category,
  value,
  total,
}: {
  category: ExpenseCategory;
  value: number;
  total: number;
}) {
  const meta = CATEGORY_META[category];
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div
      className={`border rounded-sm p-3 ${meta.badgeClass} flex flex-col`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider opacity-80 inline-flex items-center gap-1">
          <span aria-hidden>{meta.icon}</span>
          {meta.label}
        </span>
        {total > 0 && (
          <span className="text-[10px] font-semibold opacity-80">
            {formatNumber(pct, { maximumFractionDigits: 2 })}%
          </span>
        )}
      </div>
      <div className={`text-[18px] font-semibold mt-1 ${meta.amountClass}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}
