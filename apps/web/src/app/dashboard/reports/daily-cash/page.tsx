"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DrillDown,
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
import { useToast } from "@/components/Toast";
import CashEntryForm, {
  type CashEntryFormValues,
} from "@/components/reports/cash/CashEntryForm";
import { useReportFilters } from "@/hooks/useReportFilters";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import {
  createCashEntry,
  deleteCashEntry,
  getCashEntriesByDay,
  listCashEntries,
  updateCashEntry,
} from "@/lib/cash-api";
import {
  CASH_ENTRY_TYPES,
  type CashDaySummary,
  type CashEntry,
  type CashListResponse,
} from "@/types/cash";

const TYPE_LABEL = Object.fromEntries(
  CASH_ENTRY_TYPES.map((t) => [t.value, t.label])
) as Record<CashEntry["type"], string>;

type SortKey = "entryDate" | "type" | "amount" | "createdAt";
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

export default function DailyCashReportPage() {
  const toast = useToast();
  const filters = useReportFilters("today");
  const [data, setData] = useState<CashListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<SortKey>("entryDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CashEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [drillDay, setDrillDay] = useState<string | null>(null);
  const [drillEntries, setDrillEntries] = useState<CashEntry[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);

  const [reloadTick, setReloadTick] = useState(0);
  const role = useMemo(() => readUserRole(), []);
  const canDelete = role !== null && ADMIN_ROLES.has(role);

  /* ── Load main list ──────────────────────────────────── */
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    listCashEntries({
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

  /* ── Search filter (client-side) ─────────────────────── */
  const filteredEntries = useMemo(() => {
    if (!data) return [];
    const q = filters.search.trim().toLowerCase();
    if (!q) return data.entries;
    return data.entries.filter(
      (e) =>
        (e.notes ?? "").toLowerCase().includes(q) ||
        TYPE_LABEL[e.type]?.toLowerCase().includes(q) ||
        String(e.amount).includes(q)
    );
  }, [data, filters.search]);

  /* ── Sortable header ─────────────────────────────────── */
  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  }
  function sortIndicator(key: SortKey) {
    if (sortBy !== key) return <span className="text-[var(--text-muted)] opacity-30">↕</span>;
    return <span>{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  /* ── Drill down ──────────────────────────────────────── */
  function openDrill(date: string) {
    setDrillDay(date);
    setDrillEntries(null);
    setDrillError(null);
    setDrillLoading(true);
    getCashEntriesByDay(date)
      .then((res) => setDrillEntries(res.entries))
      .catch((err: unknown) => setDrillError((err as Error).message))
      .finally(() => setDrillLoading(false));
  }

  /* ── Add / Edit ──────────────────────────────────────── */
  function openCreate() {
    setEditing(null);
    setSubmitError(null);
    setEditorOpen(true);
  }
  function openEdit(entry: CashEntry) {
    setEditing(entry);
    setSubmitError(null);
    setEditorOpen(true);
  }
  async function handleSubmit(values: CashEntryFormValues) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        entryDate: new Date(values.entryDate).toISOString(),
        type: values.type,
        amount: Number(values.amount) || 0,
        notes: values.notes.trim() ? values.notes.trim() : null,
      };
      if (editing) {
        await updateCashEntry(editing.id, payload);
      } else {
        await createCashEntry(payload);
      }
      setEditorOpen(false);
      setEditing(null);
      setReloadTick((t) => t + 1);
      // Refresh drill-down if open and the date matches
      if (drillDay) openDrill(drillDay);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Delete ──────────────────────────────────────────── */
  async function handleDelete(entry: CashEntry) {
    if (!canDelete) return;
    if (!confirm(`Delete this ${TYPE_LABEL[entry.type]} entry of ${formatCurrency(entry.amount)}?`)) {
      return;
    }
    try {
      await deleteCashEntry(entry.id);
      setReloadTick((t) => t + 1);
      if (drillDay) openDrill(drillDay);
    } catch (err) {
      toast.error(`Failed to delete: ${(err as Error).message}`);
    }
  }

  /* ── Export columns ──────────────────────────────────── */
  const entryCols: ExportColumn<CashEntry>[] = [
    { header: "Date", accessor: (r) => r.entryDate.slice(0, 10) },
    { header: "Type", accessor: (r) => TYPE_LABEL[r.type] ?? r.type },
    { header: "Amount", accessor: "amount" },
    { header: "Notes", accessor: (r) => r.notes ?? "" },
  ];

  return (
    <div className="space-y-3">
      <ReportPageHeader
        title="Daily Cash Report"
        description="Track sales, expenses, and cash flow per day."
        actions={
          <>
            {data && (
              <ExportCSV
                filename="daily-cash"
                rows={filteredEntries}
                columns={entryCols}
              />
            )}
            <button
              type="button"
              onClick={openCreate}
              className="erp-btn erp-btn-primary"
            >
              + Add Entry
            </button>
          </>
        }
      />

      <ReportToolbar
        filters={filters}
        searchPlaceholder="Search notes, type, amount…"
      />

      {error ? (
        <ErrorState message={error} onRetry={() => setReloadTick((t) => t + 1)} />
      ) : loading || !data ? (
        <>
          <LoadingSkeleton variant="cards" rows={5} />
          <LoadingSkeleton variant="table" rows={6} columns={6} />
        </>
      ) : (
        <>
          {/* ── KPI cards ─────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <TrendKPICard
              label="Sales"
              value={formatCurrency(data.totals.sales)}
              trendPct={null}
              accentClass="text-emerald-700"
            />
            <TrendKPICard
              label="Expenses"
              value={formatCurrency(data.totals.expenses)}
              trendPct={null}
              accentClass="text-orange-700"
            />
            <TrendKPICard
              label="Online Cash"
              value={formatCurrency(data.totals.online)}
              trendPct={null}
              accentClass="text-[var(--accent)]"
            />
            <TrendKPICard
              label="Cash in Hand"
              value={formatCurrency(data.totals.cashInHand)}
              trendPct={null}
            />
            <TrendKPICard
              label="Take-Home Cash"
              value={formatCurrency(data.totals.takeHome)}
              trendPct={null}
              accentClass="text-emerald-700"
            />
          </div>

          {/* ── Per-day summary ───────────────────────── */}
          <ReportPanel title="Daily Summary" noPadding>
            {data.days.length === 0 ? (
              <EmptyState
                title="No entries yet"
                description="Add your first cash entry to get started."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-[var(--bg-table-head)] text-left">
                    <tr>
                      <th className="px-2 py-1.5 border-b border-[var(--border)]">Date</th>
                      <th className="px-2 py-1.5 border-b border-[var(--border)] text-right">Sales</th>
                      <th className="px-2 py-1.5 border-b border-[var(--border)] text-right">Expenses</th>
                      <th className="px-2 py-1.5 border-b border-[var(--border)] text-right">Online</th>
                      <th className="px-2 py-1.5 border-b border-[var(--border)] text-right">Cash in Hand</th>
                      <th className="px-2 py-1.5 border-b border-[var(--border)] text-right">Take-Home</th>
                      <th className="px-2 py-1.5 border-b border-[var(--border)] text-right">Entries</th>
                      <th className="px-2 py-1.5 border-b border-[var(--border)]" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((d: CashDaySummary) => (
                      <tr key={d.date} className="hover:bg-[var(--bg-table-head)]/50">
                        <td className="px-2 py-1 border-b border-[var(--border)] font-mono">
                          {formatDate(d.date)}
                        </td>
                        <td className="px-2 py-1 border-b border-[var(--border)] text-right">{formatCurrency(d.sales)}</td>
                        <td className="px-2 py-1 border-b border-[var(--border)] text-right text-orange-700">{formatCurrency(d.expenses)}</td>
                        <td className="px-2 py-1 border-b border-[var(--border)] text-right">{formatCurrency(d.online)}</td>
                        <td className="px-2 py-1 border-b border-[var(--border)] text-right">{formatCurrency(d.cashInHand)}</td>
                        <td className="px-2 py-1 border-b border-[var(--border)] text-right text-emerald-700">{formatCurrency(d.takeHome)}</td>
                        <td className="px-2 py-1 border-b border-[var(--border)] text-right">{formatInteger(d.count)}</td>
                        <td className="px-2 py-1 border-b border-[var(--border)] text-right">
                          <button
                            type="button"
                            onClick={() => openDrill(d.date)}
                            className="text-[var(--accent)] hover:underline"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportPanel>

          {/* ── Entries (sortable) ─────────────────────── */}
          <ReportPanel title="All Entries" noPadding>
            {filteredEntries.length === 0 ? (
              <EmptyState
                title="No entries"
                description="Try changing the date range or clearing the search."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-[var(--bg-table-head)] text-left select-none">
                    <tr>
                      <SortableTH label="Date" k="entryDate" sortBy={sortBy} indicator={sortIndicator("entryDate")} onClick={toggleSort} />
                      <SortableTH label="Type" k="type" sortBy={sortBy} indicator={sortIndicator("type")} onClick={toggleSort} />
                      <SortableTH label="Amount" k="amount" align="right" sortBy={sortBy} indicator={sortIndicator("amount")} onClick={toggleSort} />
                      <th className="px-2 py-1.5 border-b border-[var(--border)]">Notes</th>
                      <SortableTH label="Created" k="createdAt" sortBy={sortBy} indicator={sortIndicator("createdAt")} onClick={toggleSort} />
                      <th className="px-2 py-1.5 border-b border-[var(--border)] w-32" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-[var(--bg-table-head)]/50">
                        <td className="px-2 py-1 border-b border-[var(--border)] font-mono">
                          {formatDate(e.entryDate)}
                        </td>
                        <td className="px-2 py-1 border-b border-[var(--border)]">
                          <TypeBadge type={e.type} />
                        </td>
                        <td className="px-2 py-1 border-b border-[var(--border)] text-right">
                          {formatCurrency(e.amount)}
                        </td>
                        <td className="px-2 py-1 border-b border-[var(--border)] text-[var(--text-muted)]">
                          {e.notes ?? ""}
                        </td>
                        <td className="px-2 py-1 border-b border-[var(--border)] font-mono">
                          {formatDate(e.createdAt)}
                        </td>
                        <td className="px-2 py-1 border-b border-[var(--border)] text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportPanel>
        </>
      )}

      {/* ── Add / Edit modal ────────────────────────────── */}
      <DrillDown
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit Cash Entry" : "Add Cash Entry"}
        size="sm"
      >
        <CashEntryForm
          initial={editing}
          submitting={submitting}
          error={submitError}
          onSubmit={handleSubmit}
          onCancel={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
        />
      </DrillDown>

      {/* ── Drill-down modal ───────────────────────────── */}
      <DrillDown
        open={drillDay !== null}
        onClose={() => {
          setDrillDay(null);
          setDrillEntries(null);
        }}
        title={drillDay ? `Transactions on ${formatDate(drillDay)}` : ""}
        subtitle={
          drillEntries
            ? `${drillEntries.length} entr${drillEntries.length === 1 ? "y" : "ies"}`
            : undefined
        }
        size="lg"
      >
        {drillError ? (
          <ErrorState message={drillError} onRetry={() => drillDay && openDrill(drillDay)} />
        ) : drillLoading || !drillEntries ? (
          <LoadingSkeleton variant="table" rows={4} columns={4} />
        ) : drillEntries.length === 0 ? (
          <EmptyState title="No transactions" />
        ) : (
          <table className="w-full text-[11px]">
            <thead className="bg-[var(--bg-table-head)] text-left">
              <tr>
                <th className="px-2 py-1.5 border-b border-[var(--border)]">Type</th>
                <th className="px-2 py-1.5 border-b border-[var(--border)] text-right">Amount</th>
                <th className="px-2 py-1.5 border-b border-[var(--border)]">Notes</th>
                <th className="px-2 py-1.5 border-b border-[var(--border)]">By</th>
                <th className="px-2 py-1.5 border-b border-[var(--border)] w-24" />
              </tr>
            </thead>
            <tbody>
              {drillEntries.map((e) => (
                <tr key={e.id}>
                  <td className="px-2 py-1 border-b border-[var(--border)]">
                    <TypeBadge type={e.type} />
                  </td>
                  <td className="px-2 py-1 border-b border-[var(--border)] text-right">
                    {formatCurrency(e.amount)}
                  </td>
                  <td className="px-2 py-1 border-b border-[var(--border)] text-[var(--text-muted)]">
                    {e.notes ?? ""}
                  </td>
                  <td className="px-2 py-1 border-b border-[var(--border)]">
                    {e.createdBy?.fullName ?? "—"}
                  </td>
                  <td className="px-2 py-1 border-b border-[var(--border)] text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        setDrillDay(null);
                        setDrillEntries(null);
                        openEdit(e);
                      }}
                      className="text-[var(--accent)] hover:underline mr-2"
                    >
                      Edit
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(e)}
                        className="text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DrillDown>
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

const TYPE_COLORS: Record<CashEntry["type"], string> = {
  SALE: "bg-emerald-100 text-emerald-800 border-emerald-300",
  EXPENSE: "bg-orange-100 text-orange-800 border-orange-300",
  ONLINE: "bg-blue-100 text-blue-800 border-blue-300",
  CASH_IN_HAND: "bg-gray-100 text-gray-800 border-gray-300",
  TAKE_HOME: "bg-violet-100 text-violet-800 border-violet-300",
};

function TypeBadge({ type }: { type: CashEntry["type"] }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] rounded-sm border ${TYPE_COLORS[type]}`}
    >
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}
