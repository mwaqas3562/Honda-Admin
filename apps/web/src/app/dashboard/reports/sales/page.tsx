"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AsyncContent,
  ExportCSV,
  KPICard,
  ReportPageHeader,
  ReportPanel,
  ReportToolbar,
  SortableTH,
  type ExportColumn,
} from "@/components/reports";
import { useReportFilters } from "@/hooks/useReportFilters";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSortControl } from "@/hooks/useSortControl";
import { fetchProfitReport } from "@/lib/profit-report-api";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import type {
  ProfitInvoiceRow,
  ProfitReportResponse,
} from "@/types/profit-report";

type SortKey = "date" | "invoiceNumber" | "revenue" | "cost" | "profit" | "customer";

export default function SalesSummaryReportPage() {
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
        setError(e instanceof Error ? e.message : "Failed to load sales summary.");
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

  const totalQty = useMemo(
    () => rows.reduce((acc, r) => acc + (r.qty ?? 0), 0),
    [rows]
  );

  const exportColumns = useMemo<ExportColumn<ProfitInvoiceRow>[]>(
    () => [
      { header: "Date", accessor: (r) => r.date.slice(0, 10) },
      { header: "Job No", accessor: "invoiceNumber" },
      { header: "Customer", accessor: "customerName" },
      { header: "Bike No", accessor: (r) => r.vehicle ?? "" },
      { header: "Qty", accessor: "qty" },
      { header: "Labour", accessor: "labour" },
      { header: "Parts", accessor: "parts" },
      { header: "W.B Qty", accessor: "wheelBalanceQty" },
      { header: "W.B Sale", accessor: "wheelBalanceSale" },
      { header: "Bill Amount", accessor: "bill" },
      { header: "Rate", accessor: (r) => (r.qty > 0 ? Math.floor(r.parts / r.qty) : 0) },
      { header: "Discount", accessor: "discount" },
      { header: "Cost", accessor: "cost" },
      { header: "Profit", accessor: "profit" },
      { header: "Total", accessor: "bill" },
    ],
    []
  );

  const retry = useCallback(() => setReloadTick((t) => t + 1), []);

  return (
    <div className="p-3 space-y-3">
      <ReportPageHeader
        title="Sales Summary"
        description="Sale-invoice-wise summary with quantity, discount, cost, profit and total."
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPICard
          label="Invoices"
          value={totals ? formatInteger(totals.invoiceCount) : "—"}
        />
        <KPICard
          label="Discount"
          value={totals ? formatCurrency(totals.discount) : "—"}
          accentClass="text-amber-700"
        />
        <KPICard
          label="Net Amount"
          value={totals ? formatCurrency(totals.revenue) : "—"}
        />
        <KPICard
          label="Cost"
          value={totals ? formatCurrency(totals.cost) : "—"}
          accentClass="text-red-700"
        />
        <KPICard
          label="Profit"
          value={totals ? formatCurrency(totals.grossProfit) : "—"}
          accentClass={
            totals && totals.grossProfit < 0 ? "text-red-700" : "text-emerald-700"
          }
        />
        <KPICard
          label="Profit %"
          value={totals ? `${totals.profitPct}%` : "—"}
          accentClass={
            totals && totals.profitPct < 0 ? "text-red-700" : "text-emerald-700"
          }
        />
      </div>

      {/* Toolbar */}
      <ReportToolbar
        filters={filters}
        searchPlaceholder="Search invoice no or customer…"
        actions={
          <ExportCSV
            filename="sales-summary"
            rows={rows}
            columns={exportColumns}
          />
        }
      />

      {/* Table */}
      <ReportPanel
        title="Sales Summary"
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
                    <SortableTH
                      sortKey="date"
                      activeKey={sortBy}
                      direction={sortDir}
                      onSort={onHeaderSort}
                    >
                      Date
                    </SortableTH>
                    <SortableTH
                      sortKey="invoiceNumber"
                      activeKey={sortBy}
                      direction={sortDir}
                      onSort={onHeaderSort}
                    >
                      Job No
                    </SortableTH>
                    <SortableTH
                      sortKey="customer"
                      activeKey={sortBy}
                      direction={sortDir}
                      onSort={onHeaderSort}
                    >
                      Customer
                    </SortableTH>
                    <SortableTH>Bike No</SortableTH>
                    <SortableTH align="right">Qty</SortableTH>
                    <SortableTH align="right">Labour</SortableTH>
                    <SortableTH align="right">Parts</SortableTH>
                    <SortableTH align="right">W.B Qty</SortableTH>
                    <SortableTH align="right">W.B Sale</SortableTH>
                    <SortableTH align="right">Bill Amt</SortableTH>
                    <SortableTH align="right">Rate</SortableTH>
                    <SortableTH align="right">Discount</SortableTH>
                    <SortableTH
                      align="right"
                      sortKey="cost"
                      activeKey={sortBy}
                      direction={sortDir}
                      onSort={onHeaderSort}
                    >
                      Cost
                    </SortableTH>
                    <SortableTH
                      align="right"
                      sortKey="profit"
                      activeKey={sortBy}
                      direction={sortDir}
                      onSort={onHeaderSort}
                    >
                      Profit
                    </SortableTH>
                    <SortableTH
                      align="right"
                      sortKey="revenue"
                      activeKey={sortBy}
                      direction={sortDir}
                      onSort={onHeaderSort}
                    >
                      Total
                    </SortableTH>
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
                    const rate = r.qty > 0 ? Math.floor(r.parts / r.qty) : 0;
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
                        <td className="px-3 py-1.5">{r.customerName}</td>
                        <td className="px-3 py-1.5 text-[var(--text-muted)]">
                          {r.vehicle ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatInteger(r.qty)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-blue-700">
                          {formatCurrency(r.labour)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-indigo-700">
                          {formatCurrency(r.parts)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {r.wheelBalanceQty > 0 ? formatInteger(r.wheelBalanceQty) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {r.wheelBalanceSale > 0 ? formatCurrency(r.wheelBalanceSale) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {formatCurrency(r.bill)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {r.qty > 0 ? formatCurrency(rate) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">
                          {formatCurrency(r.discount)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-red-700">
                          {formatCurrency(r.cost)}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right tabular-nums font-semibold ${profitClass}`}
                        >
                          {formatCurrency(r.profit)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {formatCurrency(r.bill)}
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
                        {formatInteger(totalQty)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-blue-700">
                        {formatCurrency(totals.labour)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-indigo-700">
                        {formatCurrency(totals.parts)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatInteger(totals.wheelBalanceQty)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCurrency(totals.wheelBalanceSale)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                        {formatCurrency(totals.bill)}
                      </td>
                      <td className="px-3 py-1.5" />
                      <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">
                        {formatCurrency(totals.discount)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-red-700">
                        {formatCurrency(totals.cost)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                        {formatCurrency(totals.grossProfit)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCurrency(totals.bill)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </AsyncContent>
      </ReportPanel>

      {/* ── Brief Breakdown (matches legacy report footer) ── */}
      {totals && rows.length > 0 && (
        <ReportPanel title="Summary">
          <div className="max-w-md ml-auto space-y-1 text-[12px]">
            <BreakdownRow
              label="Total Labour"
              value={formatCurrency(totals.labour)}
            />
            <BreakdownRow
              label="Total Parts"
              value={formatCurrency(totals.parts)}
            />
            <BreakdownRow
              label="Wheel Balance Qty"
              value={formatInteger(totals.wheelBalanceQty)}
            />
            <BreakdownRow
              label="Wheel Balance Sale"
              value={formatCurrency(totals.wheelBalanceSale)}
            />
            <BreakdownRow
              label="Total Discount"
              value={`- ${formatCurrency(totals.discount)}`}
              valueClass="text-amber-700"
            />
            <div className="border-t border-[var(--border)] my-1" />
            <BreakdownRow
              label="Total Sale"
              value={formatCurrency(totals.revenue)}
              bold
            />
            <BreakdownRow
              label="Total Cost of Sale"
              value={formatCurrency(totals.cost)}
              valueClass="text-red-700"
            />
            <div className="border-t-2 border-[var(--border)] my-1" />
            <BreakdownRow
              label="Total Profit"
              value={formatCurrency(totals.grossProfit)}
              valueClass={
                totals.grossProfit < 0 ? "text-red-700" : "text-emerald-700"
              }
              bold
              big
            />
            <div className="text-right text-[10px] text-[var(--text-muted)] pt-1">
              Profit Margin: {totals.profitPct}%
              {" · "}
              {formatInteger(totals.invoiceCount)} invoice
              {totals.invoiceCount === 1 ? "" : "s"}
            </div>
          </div>
        </ReportPanel>
      )}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  valueClass = "",
  bold = false,
  big = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  bold?: boolean;
  big?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={`text-[var(--text-muted)] ${big ? "text-[13px]" : ""} ${
          bold ? "font-semibold text-[var(--text-main)]" : ""
        }`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${big ? "text-[15px]" : ""} ${
          bold ? "font-semibold" : ""
        } ${valueClass}`}
      >
        {value}
      </span>
    </div>
  );
}
