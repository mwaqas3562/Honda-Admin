"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AsyncContent,
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
  SummaryTile,
  type ExportColumn,
} from "@/components/reports";
import { useReportFilters } from "@/hooks/useReportFilters";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSortControl } from "@/hooks/useSortControl";
import {
  fetchInvoiceProfit,
  fetchProfitReport,
} from "@/lib/profit-report-api";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import type {
  InvoiceProfitBreakdown,
  ProfitInvoiceRow,
  ProfitReportResponse,
} from "@/types/profit-report";

type SortKey = "date" | "invoiceNumber" | "revenue" | "cost" | "profit" | "customer";

export default function ProfitReportPage() {
  const filters = useReportFilters("today");
  const debouncedSearch = useDebouncedValue(filters.search, 250);

  const { sortBy, sortDir, toggleSort } = useSortControl<SortKey>({
    defaultKey: "date",
    defaultDir: "desc",
    resolveDirForKey: (k) =>
      k === "invoiceNumber" || k === "customer" ? "asc" : "desc",
  });
  const onHeaderSort = toggleSort as (key: string) => void;

  const [data, setData] = useState<ProfitReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  /* Drill-down */
  const [bdOpen, setBdOpen] = useState(false);
  const [bdLoading, setBdLoading] = useState(false);
  const [bdError, setBdError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<InvoiceProfitBreakdown | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchProfitReport({
      q: debouncedSearch || undefined,
      from: filters.range.from.toISOString(),
      to: filters.range.to.toISOString(),
      sortBy,
      sortDir,
      signal: ctrl.signal,
    })
      .then(setData)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load profit report.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [
    debouncedSearch,
    filters.range.from,
    filters.range.to,
    sortBy,
    sortDir,
    reloadTick,
  ]);

  const rows = data?.invoices ?? [];
  const totals = data?.totals;

  const exportColumns = useMemo<ExportColumn<ProfitInvoiceRow>[]>(
    () => [
      { header: "Date", accessor: "date" },
      { header: "Invoice No", accessor: "invoiceNumber" },
      { header: "Job No", accessor: (r) => r.jobNumber ?? "" },
      { header: "Customer", accessor: "customerName" },
      { header: "Labour", accessor: "labour" },
      { header: "Parts", accessor: "parts" },
      { header: "Discount", accessor: "discount" },
      { header: "Bill Amount", accessor: "bill" },
      { header: "Revenue", accessor: "revenue" },
      { header: "Cost", accessor: "cost" },
      { header: "Profit", accessor: "profit" },
    ],
    []
  );

  const openBreakdown = useCallback(async (invoiceId: string) => {
    setBdOpen(true);
    setBreakdown(null);
    setBdError(null);
    setBdLoading(true);
    try {
      const res = await fetchInvoiceProfit(invoiceId);
      setBreakdown(res);
    } catch (e: unknown) {
      setBdError(e instanceof Error ? e.message : "Failed to load breakdown.");
    } finally {
      setBdLoading(false);
    }
  }, []);

  const retry = useCallback(() => setReloadTick((t) => t + 1), []);

  return (
    <div className="p-3 space-y-3">
      <ReportPageHeader
        title="Profit Report"
        description="Sale-invoice-wise profitability: revenue, cost, gross profit, and margin %."
      />

      {/* KPI cards (7 metrics, responsive 2 → 4 → 7 columns via flex-wrap) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPICard
          label="Labour Income"
          value={totals ? formatCurrency(totals.labour) : "—"}
          accentClass="text-[var(--text-main)]"
        />
        <KPICard
          label="Parts Revenue"
          value={totals ? formatCurrency(totals.parts) : "—"}
          accentClass="text-[var(--text-main)]"
        />
        <KPICard
          label="Discount"
          value={totals ? formatCurrency(totals.discount) : "—"}
          accentClass="text-amber-700"
        />
        <KPICard
          label="Cost"
          value={totals ? formatCurrency(totals.cost) : "—"}
          accentClass="text-red-700"
        />
        <KPICard
          label="Gross Profit"
          value={totals ? formatCurrency(totals.grossProfit) : "—"}
          accentClass="text-emerald-700"
        />
        <KPICard
          label="Net Profit"
          value={totals ? formatCurrency(totals.netProfit) : "—"}
          accentClass="text-emerald-700"
        />
        <KPICard
          label="Profit %"
          value={totals ? `${totals.profitPct}%` : "—"}
          accentClass={
            totals && totals.profitPct < 0 ? "text-red-700" : "text-emerald-700"
          }
          hint={
            totals
              ? `${formatInteger(totals.invoiceCount)} invoice${
                  totals.invoiceCount === 1 ? "" : "s"
                }`
              : undefined
          }
        />
      </div>

      {/* Toolbar */}
      <ReportToolbar
        filters={filters}
        searchPlaceholder="Search invoice no or customer…"
        actions={
          <ExportCSV
            filename="profit-report"
            rows={rows}
            columns={exportColumns}
          />
        }
      />

      {/* Table */}
      <ReportPanel
        title="Sale Invoice Wise Profit"
        actions={
          <span className="text-[11px] text-[var(--text-muted)]">
            {loading
              ? "Loading…"
              : `${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
          </span>
        }
        noPadding
      >
        <AsyncContent<ProfitInvoiceRow[]>
          loading={loading}
          error={error}
          data={data ? rows : null}
          onRetry={retry}
          emptyMessage="No invoices in the selected period."
        >
          {(list) => (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <SortableTH sortKey="date" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Date</SortableTH>
                  <SortableTH sortKey="invoiceNumber" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Invoice No</SortableTH>
                  <SortableTH>Job No</SortableTH>
                  <SortableTH sortKey="customer" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Customer</SortableTH>
                  <SortableTH align="right">Labour</SortableTH>
                  <SortableTH align="right">Parts</SortableTH>
                  <SortableTH align="right">Discount</SortableTH>
                  <SortableTH align="right" sortKey="revenue" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Revenue</SortableTH>
                  <SortableTH align="right" sortKey="cost" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Cost</SortableTH>
                  <SortableTH align="right" sortKey="profit" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Profit</SortableTH>
                  <SortableTH align="right">Action</SortableTH>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const profitClass =
                    r.profit > 0
                      ? "text-emerald-700"
                      : r.profit < 0
                        ? "text-red-700"
                        : "text-[var(--text-muted)]";
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--border)] hover:bg-[var(--bg-table-head)]"
                    >
                      <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">
                        {formatDate(r.date)}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-[var(--text-main)]">
                        {r.invoiceNumber}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">
                        {r.jobNumber ?? "—"}
                      </td>
                      <td className="px-3 py-1.5">{r.customerName}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCurrency(r.labour)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCurrency(r.parts)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">
                        {formatCurrency(r.discount)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                        {formatCurrency(r.revenue)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-red-700">
                        {formatCurrency(r.cost)}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums font-semibold ${profitClass}`}
                      >
                        {formatCurrency(r.profit)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => openBreakdown(r.id)}
                          className="text-[11px] text-[var(--accent)] hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totals && list.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--bg-table-head)] font-semibold">
                    <td className="px-3 py-1.5" colSpan={4}>
                      Grand Total
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatCurrency(totals.labour)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatCurrency(totals.parts)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">
                      {formatCurrency(totals.discount)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatCurrency(totals.revenue)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-700">
                      {formatCurrency(totals.cost)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                      {formatCurrency(totals.grossProfit)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          )}
        </AsyncContent>
      </ReportPanel>

      {/* Per-invoice breakdown */}
      <DrillDown
        open={bdOpen}
        onClose={() => setBdOpen(false)}
        title={
          breakdown
            ? `Invoice ${breakdown.invoice.invoiceNumber} • Profit Breakdown`
            : "Profit Breakdown"
        }
        subtitle={
          breakdown
            ? [
                breakdown.invoice.customer?.name,
                breakdown.invoice.jobCard?.jobNumber
                  ? `Job ${breakdown.invoice.jobCard.jobNumber}`
                  : null,
                breakdown.invoice.jobCard?.vehicleRegNo,
                formatDate(breakdown.invoice.date),
              ]
                .filter(Boolean)
                .join(" • ")
            : undefined
        }
        size="xl"
      >
        {bdError ? (
          <ErrorState
            message={bdError}
            onRetry={() => breakdown && openBreakdown(breakdown.invoice.id)}
          />
        ) : bdLoading || !breakdown ? (
          <LoadingSkeleton rows={6} />
        ) : (
          <div className="space-y-3">
            {/* Summary tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              <SummaryTile label="Labour" value={formatCurrency(breakdown.summary.labour)} />
              <SummaryTile label="Parts" value={formatCurrency(breakdown.summary.parts)} />
              <SummaryTile
                label="Discount"
                value={formatCurrency(breakdown.summary.discount)}
                accent="text-amber-700"
              />
              <SummaryTile
                label="Bill"
                value={formatCurrency(breakdown.summary.bill)}
              />
              <SummaryTile
                label="Revenue"
                value={formatCurrency(breakdown.summary.revenue)}
              />
              <SummaryTile
                label="Cost"
                value={formatCurrency(breakdown.summary.cost)}
                accent="text-red-700"
              />
              <SummaryTile
                label="Profit"
                value={
                  <>
                    {formatCurrency(breakdown.summary.profit)}
                    <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                      ({breakdown.summary.profitPct}%)
                    </span>
                  </>
                }
                accent={
                  breakdown.summary.profit < 0
                    ? "text-red-700"
                    : "text-emerald-700"
                }
              />
            </div>

            {/* Line breakdown */}
            {breakdown.lines.length === 0 ? (
              <EmptyState description="No line items on this invoice." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <tr>
                      <SortableTH>Code</SortableTH>
                      <SortableTH>Item</SortableTH>
                      <SortableTH align="right">Qty</SortableTH>
                      <SortableTH align="right">Rate</SortableTH>
                      <SortableTH align="right">Line Revenue</SortableTH>
                      <SortableTH align="right">Discount</SortableTH>
                      <SortableTH align="right">Net Revenue</SortableTH>
                      <SortableTH align="right">Unit Cost</SortableTH>
                      <SortableTH align="right">Line Cost</SortableTH>
                      <SortableTH align="right">Profit</SortableTH>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.lines.map((l) => {
                      const profitClass =
                        l.lineProfit > 0
                          ? "text-emerald-700"
                          : l.lineProfit < 0
                            ? "text-red-700"
                            : "text-[var(--text-muted)]";
                      return (
                        <tr
                          key={l.id}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="px-3 py-1.5 text-[var(--text-muted)]">
                            {l.itemCode ?? "—"}
                          </td>
                          <td className="px-3 py-1.5">
                            {l.itemName}
                            {!l.matched && l.itemCode && (
                              <span
                                className="ml-1 text-[10px] text-amber-700"
                                title="No matching part — cost taken as 0"
                              >
                                (no cost match)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {formatInteger(l.qty)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {formatCurrency(l.rate)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {formatCurrency(l.lineRevenue)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">
                            {formatCurrency(l.lineDiscount)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {formatCurrency(l.netLineRevenue)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {formatCurrency(l.unitCost)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-red-700">
                            {formatCurrency(l.lineCost)}
                          </td>
                          <td
                            className={`px-3 py-1.5 text-right tabular-nums font-semibold ${profitClass}`}
                          >
                            {formatCurrency(l.lineProfit)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DrillDown>
    </div>
  );
}
