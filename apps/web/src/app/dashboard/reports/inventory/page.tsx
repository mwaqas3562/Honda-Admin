"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AsyncContent,
  Badge,
  type BadgeTone,
  DrillDown,
  EmptyState,
  ErrorState,
  ExportCSV,
  KPICard,
  LoadingSkeleton,
  ReportPageHeader,
  ReportPanel,
  ReportToolbar,
  SortableTH,
  type ExportColumn,
} from "@/components/reports";
import { useReportFilters } from "@/hooks/useReportFilters";
import { fetchInventoryReport, fetchPartLedger } from "@/lib/inventory-api";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSortControl } from "@/hooks/useSortControl";
import type {
  InventoryReportResponse,
  InventoryRow,
  StockLedgerResponse,
  StockStatus,
} from "@/types/inventory";

type SortKey = "name" | "stock" | "value" | "usage" | "category";
type StatusFilter = "ALL" | StockStatus;

const STATUS_META: Record<StockStatus, { label: string; tone: BadgeTone }> = {
  IN_STOCK: { label: "In stock", tone: "emerald" },
  LOW: { label: "Low", tone: "amber" },
  OUT: { label: "Out", tone: "red" },
};

const LOG_TYPE_META: Record<
  "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT",
  { label: string; tone: BadgeTone }
> = {
  PURCHASE_IN: { label: "Purchase In", tone: "emerald" },
  JOBCARD_OUT: { label: "Job Card Out", tone: "red" },
  ADJUSTMENT: { label: "Adjustment", tone: "slate" },
};

export default function InventoryReportPage() {
  const filters = useReportFilters("today");
  const debouncedSearch = useDebouncedValue(filters.search, 250);

  const [category, setCategory] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const { sortBy, sortDir, toggleSort } = useSortControl<SortKey>({
    defaultKey: "value",
    defaultDir: "desc",
    resolveDirForKey: (k) =>
      k === "name" || k === "category" ? "asc" : "desc",
  });
  const onHeaderSort = toggleSort as (key: string) => void;

  const [data, setData] = useState<InventoryReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  /* Drill-down state */
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<StockLedgerResponse | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchInventoryReport({
      category: category || undefined,
      status: statusFilter,
      q: debouncedSearch || undefined,
      sortBy,
      sortDir,
      signal: ctrl.signal,
    })
      .then((res) => setData(res))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load inventory.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [category, statusFilter, debouncedSearch, sortBy, sortDir, reloadTick]);

  const rows = data?.parts ?? [];
  const totals = data?.totals;
  const categories = data?.categories ?? [];

  const exportColumns = useMemo<ExportColumn<InventoryRow>[]>(
    () => [
      { header: "Name", accessor: "name" },
      { header: "SKU", accessor: "sku" },
      { header: "Category", accessor: (r) => r.category ?? "" },
      { header: "Stock", accessor: "stockQty" },
      { header: "Cost", accessor: "cost" },
      { header: "Selling Price", accessor: "sellingPrice" },
      { header: "Inventory Value", accessor: "value" },
      { header: "Potential Profit", accessor: "potentialProfit" },
      { header: "Usage (window)", accessor: "usage" },
      { header: "Status", accessor: "status" },
    ],
    []
  );

  const openLedger = useCallback(async (partId: string) => {
    setLedgerOpen(true);
    setLedger(null);
    setLedgerError(null);
    setLedgerLoading(true);
    try {
      const res = await fetchPartLedger(partId);
      setLedger(res);
    } catch (e: unknown) {
      setLedgerError(e instanceof Error ? e.message : "Failed to load ledger.");
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  const retry = useCallback(() => setReloadTick((t) => t + 1), []);

  return (
    <div className="p-3 space-y-3">
      <ReportPageHeader
        title="Inventory Report"
        description="Stock-on-hand valuation, low-stock alerts, and consumption trends."
      />

      {/* KPI cards (always reflect shop-wide totals from latest fetch) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard
          label="Total Parts"
          value={totals ? formatInteger(totals.totalParts) : "—"}
          accentClass="text-[var(--text-main)]"
        />
        <KPICard
          label="Inventory Value"
          value={totals ? formatCurrency(totals.inventoryValue) : "—"}
        />
        <KPICard
          label="Potential Profit"
          value={totals ? formatCurrency(totals.potentialProfit) : "—"}
          accentClass="text-emerald-700"
        />
        <KPICard
          label="Low / Out of Stock"
          value={
            totals
              ? `${formatInteger(totals.lowStock)} / ${formatInteger(
                  totals.outOfStock
                )}`
              : "—"
          }
          accentClass="text-red-700"
          hint={
            data
              ? `Threshold: ${data.lowStockThreshold} • Usage window: ${data.usageWindowDays}d`
              : undefined
          }
        />
      </div>

      {/* Toolbar */}
      <ReportToolbar
        filters={filters}
        searchPlaceholder="Search part name or SKU…"
        actions={
          <>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border border-[var(--border)] rounded-sm px-2 py-1 text-[11px] bg-white"
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as StatusFilter)
              }
              className="border border-[var(--border)] rounded-sm px-2 py-1 text-[11px] bg-white"
              aria-label="Filter by stock status"
            >
              <option value="ALL">All stock</option>
              <option value="IN_STOCK">In stock</option>
              <option value="LOW">Low</option>
              <option value="OUT">Out of stock</option>
            </select>
            <ExportCSV
              filename="inventory-report"
              rows={rows}
              columns={exportColumns}
            />
          </>
        }
      />

      {/* Table panel */}
      <ReportPanel
        title="Parts"
        actions={
          <span className="text-[11px] text-[var(--text-muted)]">
            {loading ? "Loading…" : `${rows.length} part${rows.length === 1 ? "" : "s"}`}
          </span>
        }
        noPadding
      >
        <AsyncContent<InventoryRow[]>
          loading={loading}
          error={error}
          data={data ? rows : null}
          onRetry={retry}
          emptyMessage="No parts match the current filters."
        >
          {(list) => (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <SortableTH sortKey="name" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Part Name</SortableTH>
                  <SortableTH>SKU</SortableTH>
                  <SortableTH sortKey="category" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Category</SortableTH>
                  <SortableTH align="right" sortKey="stock" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Stock</SortableTH>
                  <SortableTH align="right">Cost</SortableTH>
                  <SortableTH align="right">Selling</SortableTH>
                  <SortableTH align="right" sortKey="value" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Value</SortableTH>
                  <SortableTH align="right" sortKey="usage" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Usage</SortableTH>
                  <SortableTH align="center">Status</SortableTH>
                  <SortableTH align="right">Action</SortableTH>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--border)] hover:bg-[var(--bg-table-head)]"
                    >
                      <td className="px-3 py-1.5 font-medium text-[var(--text-main)]">
                        {r.name}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">
                        {r.sku}
                      </td>
                      <td className="px-3 py-1.5">{r.category ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatInteger(r.stockQty)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCurrency(r.cost)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCurrency(r.sellingPrice)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                        {formatCurrency(r.value)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatInteger(r.usage)}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => openLedger(r.id)}
                          className="text-[11px] text-[var(--accent)] hover:underline"
                        >
                          View ledger
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </AsyncContent>
      </ReportPanel>

      {/* Ledger drill-down */}
      <DrillDown
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        title={ledger ? `${ledger.part.name} • Stock Ledger` : "Stock Ledger"}
        subtitle={
          ledger
            ? `SKU ${ledger.part.sku} • Stock ${formatInteger(
                ledger.part.stockQty
              )} • Cost ${formatCurrency(ledger.part.cost)} • Selling ${formatCurrency(
                ledger.part.sellingPrice
              )}`
            : undefined
        }
        size="lg"
      >
        {ledgerError ? (
          <ErrorState
            message={ledgerError}
            onRetry={() => ledger && openLedger(ledger.part.id)}
          />
        ) : ledgerLoading || !ledger ? (
          <LoadingSkeleton rows={6} />
        ) : ledger.logs.length === 0 ? (
          <EmptyState description="No stock movements recorded for this part." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <SortableTH>Date</SortableTH>
                  <SortableTH>Type</SortableTH>
                  <SortableTH align="right">Change</SortableTH>
                  <SortableTH align="right">Balance</SortableTH>
                  <SortableTH>Reference</SortableTH>
                  <SortableTH>Notes</SortableTH>
                  <SortableTH>By</SortableTH>
                </tr>
              </thead>
              <tbody>
                {ledger.logs.map((l) => {
                  const m = LOG_TYPE_META[l.logType];
                  const sign =
                    l.changeQty > 0 ? "+" : l.changeQty < 0 ? "" : "";
                  const changeClass =
                    l.changeQty > 0
                      ? "text-emerald-700"
                      : l.changeQty < 0
                        ? "text-red-700"
                        : "text-[var(--text-muted)]";
                  return (
                    <tr
                      key={l.id}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">
                        {formatDate(l.createdAt)}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge tone={m.tone}>{m.label}</Badge>
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums font-medium ${changeClass}`}
                      >
                        {sign}
                        {formatInteger(l.changeQty)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatInteger(l.balanceQty)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">
                        {l.jobNumber
                          ? `Job ${l.jobNumber}`
                          : l.purchaseId
                            ? `Purchase ${l.purchaseId.slice(0, 8)}…`
                            : "—"}
                      </td>
                      <td className="px-3 py-1.5">{l.notes ?? "—"}</td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">
                        {l.createdBy?.fullName ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DrillDown>
    </div>
  );
}
