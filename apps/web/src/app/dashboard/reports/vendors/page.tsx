"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AsyncContent,
  Badge,
  type BadgeTone,
  DrillDown,
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
  fetchVendorPurchases,
  fetchVendorsReport,
} from "@/lib/vendor-report-api";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import type {
  PurchaseStatusValue,
  VendorPurchasesResponse,
  VendorRow,
  VendorsReportResponse,
} from "@/types/vendor-report";

type SortKey = "spend" | "purchases" | "name" | "lastPurchase";

const STATUS_META: Record<PurchaseStatusValue, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Draft", tone: "amber" },
  RECEIVED: { label: "Received", tone: "emerald" },
  PAID: { label: "Paid", tone: "sky" },
  CANCELLED: { label: "Cancelled", tone: "red" },
};

export default function VendorsReportPage() {
  const filters = useReportFilters("today");
  const debouncedSearch = useDebouncedValue(filters.search, 250);

  const { sortBy, sortDir, toggleSort } = useSortControl<SortKey>({
    defaultKey: "spend",
    defaultDir: "desc",
    resolveDirForKey: (k) => (k === "name" ? "asc" : "desc"),
  });
  const onHeaderSort = toggleSort as (key: string) => void;

  const [data, setData] = useState<VendorsReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const fromIso = filters.range.from.toISOString();
  const toIso = filters.range.to.toISOString();

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchVendorsReport({
      q: debouncedSearch || undefined,
      from: fromIso,
      to: toIso,
      sortBy,
      sortDir,
      signal: ctrl.signal,
    })
      .then(setData)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load vendors.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [debouncedSearch, fromIso, toIso, sortBy, sortDir, reloadTick]);

  const rows = data?.vendors ?? [];
  const totals = data?.totals;

  const exportColumns = useMemo<ExportColumn<VendorRow>[]>(
    () => [
      { header: "Code", accessor: "code" },
      { header: "Vendor", accessor: "name" },
      { header: "Phone", accessor: (r) => r.phone ?? "" },
      { header: "Purchases", accessor: "purchases" },
      { header: "Received", accessor: "received" },
      { header: "Draft", accessor: "draft" },
      { header: "Quantity", accessor: "quantity" },
      { header: "Total Spend", accessor: "totalSpend" },
      { header: "Received Spend", accessor: "receivedSpend" },
      { header: "Last Purchase", accessor: (r) => r.lastPurchase ?? "" },
    ],
    []
  );

  const retry = useCallback(() => setReloadTick((t) => t + 1), []);

  /* Drill-down: vendor purchases */
  const [drillId, setDrillId] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<VendorPurchasesResponse | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [drillTick, setDrillTick] = useState(0);

  const openVendor = useCallback((id: string) => setDrillId(id), []);
  const closeDrill = useCallback(() => setDrillId(null), []);
  const retryDrill = useCallback(() => setDrillTick((t) => t + 1), []);

  useEffect(() => {
    if (!drillId) {
      setDrillData(null);
      setDrillError(null);
      return;
    }
    const ctrl = new AbortController();
    setDrillLoading(true);
    setDrillError(null);
    setDrillData(null);
    fetchVendorPurchases(drillId, ctrl.signal)
      .then(setDrillData)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setDrillError(
          e instanceof Error ? e.message : "Failed to load purchases."
        );
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setDrillLoading(false);
      });
    return () => ctrl.abort();
  }, [drillId, drillTick]);

  return (
    <div className="p-3 space-y-3">
      <ReportPageHeader
        title="Vendors Report"
        description="Vendor spend analytics: top suppliers by purchase volume, draft vs. received exposure, and per-vendor purchase history."
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard
          label="Vendors"
          value={totals ? formatInteger(totals.vendorCount) : "—"}
          hint={
            totals
              ? `${formatInteger(totals.activeVendors)} active`
              : undefined
          }
        />
        <KPICard
          label="Purchases"
          value={totals ? formatInteger(totals.purchaseCount) : "—"}
        />
        <KPICard
          label="Total Spend"
          value={totals ? formatCurrency(totals.totalSpend) : "—"}
        />
        <KPICard
          label="Received"
          value={totals ? formatCurrency(totals.receivedSpend) : "—"}
          accentClass="text-emerald-700"
        />
        <KPICard
          label="Draft / Pending"
          value={totals ? formatCurrency(totals.draftSpend) : "—"}
          accentClass="text-amber-700"
        />
      </div>

      {/* Toolbar */}
      <ReportToolbar
        filters={filters}
        searchPlaceholder="Search vendor name, code, or phone…"
        actions={
          <ExportCSV
            filename="vendors-report"
            rows={rows}
            columns={exportColumns}
          />
        }
      />

      {/* Table */}
      <ReportPanel
        title="Vendors"
        actions={
          <span className="text-[11px] text-[var(--text-muted)]">
            {loading
              ? "Loading…"
              : `${rows.length} vendor${rows.length === 1 ? "" : "s"}`}
          </span>
        }
        noPadding
      >
        <AsyncContent<VendorRow[]>
          loading={loading}
          error={error}
          data={data ? rows : null}
          onRetry={retry}
          emptyMessage="No vendors match the current search."
        >
          {(list) => (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <SortableTH>Code</SortableTH>
                    <SortableTH sortKey="name" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Vendor</SortableTH>
                    <SortableTH>Phone</SortableTH>
                    <SortableTH align="right" sortKey="purchases" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Purchases</SortableTH>
                    <SortableTH align="right">Received</SortableTH>
                    <SortableTH align="right">Draft</SortableTH>
                    <SortableTH align="right">Qty</SortableTH>
                    <SortableTH align="right" sortKey="spend" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Total Spend</SortableTH>
                    <SortableTH sortKey="lastPurchase" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Last Purchase</SortableTH>
                    <SortableTH align="right">Action</SortableTH>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--border)] hover:bg-[var(--bg-table-head)]"
                    >
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">{r.code}</td>
                      <td className="px-3 py-1.5 font-medium text-[var(--text-main)]">
                        {r.name}
                        {r.email && (
                          <div className="text-[10px] text-[var(--text-muted)]">{r.email}</div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">{r.phone ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatInteger(r.purchases)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{formatInteger(r.received)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">{formatInteger(r.draft)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatInteger(r.quantity)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                        {formatCurrency(r.totalSpend)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">
                        {r.lastPurchase ? formatDate(r.lastPurchase) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => openVendor(r.id)}
                          className="text-[11px] text-[var(--accent)] hover:underline"
                        >
                          View purchases
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncContent>
      </ReportPanel>

      {/* Vendor purchases drill-down */}
      <DrillDown
        open={drillId !== null}
        onClose={closeDrill}
        title={
          drillData
            ? `${drillData.vendor.name} • Purchases`
            : "Vendor Purchases"
        }
        subtitle={
          drillData
            ? [
                `Code ${drillData.vendor.code}`,
                drillData.vendor.phone,
                drillData.vendor.email,
              ]
                .filter(Boolean)
                .join(" • ")
            : undefined
        }
        size="xl"
      >
        {drillError ? (
          <ErrorState message={drillError} onRetry={retryDrill} />
        ) : drillLoading || !drillData ? (
          <LoadingSkeleton rows={6} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SummaryTile
                label="Purchases"
                value={formatInteger(drillData.summary.purchaseCount)}
              />
              <SummaryTile
                label="Total Quantity"
                value={formatInteger(drillData.summary.totalQuantity)}
              />
              <SummaryTile
                label="Total Spend"
                value={formatCurrency(drillData.summary.totalSpend)}
              />
              <SummaryTile
                label="Received"
                value={formatCurrency(drillData.summary.receivedSpend)}
                accent="text-emerald-700"
              />
            </div>

            {drillData.purchases.length === 0 ? (
              <div className="text-[12px] text-[var(--text-muted)] text-center py-6">
                No purchases recorded for this vendor.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <tr>
                      <SortableTH>Date</SortableTH>
                      <SortableTH>PO #</SortableTH>
                      <SortableTH>Part</SortableTH>
                      <SortableTH>SKU</SortableTH>
                      <SortableTH align="right">Qty</SortableTH>
                      <SortableTH align="right">Unit Cost</SortableTH>
                      <SortableTH align="right">Total Cost</SortableTH>
                      <SortableTH align="center">Status</SortableTH>
                    </tr>
                  </thead>
                  <tbody>
                    {drillData.purchases.flatMap((p) => {
                      const meta = STATUS_META[p.status];
                      return p.items.map((it) => (
                        <tr key={it.id} className="border-t border-[var(--border)]">
                          <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">
                            {formatDate(p.purchasedAt)}
                          </td>
                          <td className="px-3 py-1.5 font-medium">{p.purchaseNo}</td>
                          <td className="px-3 py-1.5">{it.part.name}</td>
                          <td className="px-3 py-1.5 text-[var(--text-muted)]">{it.part.sku}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {formatInteger(it.quantity)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {formatCurrency(it.costPrice)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                            {formatCurrency(it.totalPrice)}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </td>
                        </tr>
                      ));
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
