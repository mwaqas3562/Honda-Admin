"use client";

import { blockDecimalKeys, blockDecimalPaste } from "@/lib/intInput";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
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
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSortControl } from "@/hooks/useSortControl";
import {
  fetchCustomerBikeHistory,
  fetchRepeatCustomers,
} from "@/lib/repeat-customers-api";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import type {
  BikeGroup,
  CustomerBikeHistoryResponse,
  RepeatBucket,
  RepeatCustomerRow,
  RepeatCustomersResponse,
} from "@/types/repeat-customers";

type SortKey = "visits" | "lastVisit" | "avgGap" | "name";
type BucketFilter = "ALL" | RepeatBucket;

const BUCKET_META: Record<RepeatBucket, { label: string; tone: BadgeTone }> = {
  FREQUENT: { label: "Frequent", tone: "emerald" },
  MONTHLY: { label: "Monthly", tone: "sky" },
  OCCASIONAL: { label: "Occasional", tone: "amber" },
};

const STALE_THRESHOLD_DAYS = 90;

/* ─── Page ──────────────────────────────────────────────── */

export default function RepeatCustomersPage() {
  const filters = useReportFilters("thisYear");
  const debouncedSearch = useDebouncedValue(filters.search, 250);

  const [minVisits, setMinVisits] = useState(2);
  const [bucket, setBucket] = useState<BucketFilter>("ALL");
  const { sortBy, sortDir, toggleSort } = useSortControl<SortKey>({
    defaultKey: "visits",
    defaultDir: "desc",
    resolveDirForKey: (k) => (k === "name" || k === "avgGap" ? "asc" : "desc"),
  });
  // Cast to the SortableTH-compatible shape (TKey extends string).
  const onHeaderSort = toggleSort as (key: string) => void;

  const [data, setData] = useState<RepeatCustomersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  /* Drill-down state is intentionally separate from the table state so opening
   * the modal does not re-render the main table. */
  const [drillCustomerId, setDrillCustomerId] = useState<string | null>(null);
  const [history, setHistory] = useState<CustomerBikeHistoryResponse | null>(
    null
  );
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [drillReloadTick, setDrillReloadTick] = useState(0);

  const fromIso = filters.range.from.toISOString();
  const toIso = filters.range.to.toISOString();

  /* ── Main fetch ──────────────────────────────────────── */
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchRepeatCustomers({
      q: debouncedSearch || undefined,
      from: fromIso,
      to: toIso,
      minVisits,
      bucket,
      sortBy,
      sortDir,
      signal: ctrl.signal,
    })
      .then(setData)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [debouncedSearch, fromIso, toIso, minVisits, bucket, sortBy, sortDir, reloadTick]);

  /* ── Drill-down fetch ────────────────────────────────── */
  useEffect(() => {
    if (!drillCustomerId) return;
    const ctrl = new AbortController();
    setHistory(null);
    setDrillError(null);
    setDrillLoading(true);
    fetchCustomerBikeHistory(drillCustomerId, ctrl.signal)
      .then(setHistory)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setDrillError(e instanceof Error ? e.message : "Failed to load history.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setDrillLoading(false);
      });
    return () => ctrl.abort();
  }, [drillCustomerId, drillReloadTick]);

  const rows = data?.customers ?? [];
  const totals = data?.totals;

  const exportColumns = useMemo<ExportColumn<RepeatCustomerRow>[]>(
    () => [
      { header: "Customer", accessor: "name" },
      { header: "Phone", accessor: (r) => r.phone ?? "" },
      { header: "Bucket", accessor: "bucket" },
      { header: "Visits", accessor: "visits" },
      { header: "Bikes", accessor: "bikeCount" },
      { header: "Bike No", accessor: (r) => (r.bikes ?? []).join(", ") },
      { header: "First Visit", accessor: (r) => r.firstVisit ?? "" },
      { header: "Last Visit", accessor: (r) => r.lastVisit ?? "" },
      { header: "Avg Gap (days)", accessor: (r) => r.avgGapDays ?? "" },
      { header: "Days Since Last", accessor: (r) => r.sinceLastDays ?? "" },
    ],
    []
  );

  const openHistory = useCallback(
    (customerId: string) => setDrillCustomerId(customerId),
    []
  );
  const closeDrill = useCallback(() => setDrillCustomerId(null), []);
  const retry = useCallback(() => setReloadTick((t) => t + 1), []);
  const retryDrill = useCallback(() => setDrillReloadTick((t) => t + 1), []);

  return (
    <div className="p-3 space-y-3">
      <ReportPageHeader
        title="Repeat Customers Analysis"
        description="Identify frequent, monthly, and occasional customers; analyse visit gaps to reactivate dormant accounts."
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          label="Repeat Customers"
          value={totals ? formatInteger(totals.totalRepeat) : "—"}
          accentClass="text-[var(--text-main)]"
          hint={`Min ${minVisits} visit${minVisits === 1 ? "" : "s"}`}
        />
        <KPICard
          label="Frequent"
          value={totals ? formatInteger(totals.frequent) : "—"}
          accentClass="text-emerald-700"
          hint="5+ visits or ≤30d gap"
        />
        <KPICard
          label="Monthly"
          value={totals ? formatInteger(totals.monthly) : "—"}
          accentClass="text-sky-700"
          hint="3-4 visits, ≤60d gap"
        />
        <KPICard
          label="Occasional"
          value={totals ? formatInteger(totals.occasional) : "—"}
          accentClass="text-amber-700"
          hint="2 visits or sparse"
        />
        <KPICard
          label="Avg Visits"
          value={totals ? totals.avgVisits : "—"}
          accentClass="text-[var(--text-main)]"
        />
        <KPICard
          label="Avg Gap (days)"
          value={
            totals
              ? totals.avgGapDays > 0
                ? totals.avgGapDays
                : "—"
              : "—"
          }
          accentClass="text-[var(--text-main)]"
        />
      </div>

      {/* Toolbar */}
      <ReportToolbar
        filters={filters}
        searchPlaceholder="Search by name, phone or bike no…"
        actions={
          <>
            <label className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
              Min visits
              <input
                type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste}
                min={1}
                max={50}
                value={minVisits}
                onChange={(e) =>
                  setMinVisits(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-14 border border-[var(--border)] rounded-sm px-2 py-1 text-[11px] bg-white"
              />
            </label>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as BucketFilter)}
              className="border border-[var(--border)] rounded-sm px-2 py-1 text-[11px] bg-white"
              aria-label="Filter by bucket"
            >
              <option value="ALL">All buckets</option>
              <option value="FREQUENT">Frequent</option>
              <option value="MONTHLY">Monthly</option>
              <option value="OCCASIONAL">Occasional</option>
            </select>
            <ExportCSV
              filename="repeat-customers"
              rows={rows}
              columns={exportColumns}
            />
          </>
        }
      />

      {/* Table */}
      <ReportPanel
        title="Repeat Customers"
        actions={
          <span className="text-[11px] text-[var(--text-muted)]">
            {loading
              ? "Loading…"
              : `${rows.length} customer${rows.length === 1 ? "" : "s"}`}
          </span>
        }
        noPadding
      >
        <AsyncContent<RepeatCustomerRow[]>
          loading={loading}
          error={error}
          data={data ? rows : null}
          emptyMessage="No customers match these filters."
          onRetry={retry}
        >
          {(list) => (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <SortableTH sortKey="name" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>
                      Customer
                    </SortableTH>
                    <SortableTH>Phone</SortableTH>
                    <SortableTH align="center">Bucket</SortableTH>
                    <SortableTH align="right" sortKey="visits" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>
                      Visit Count
                    </SortableTH>
                    <SortableTH align="right">Bikes</SortableTH>
                    <SortableTH>Bike No</SortableTH>
                    <SortableTH sortKey="lastVisit" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>
                      Last Visit
                    </SortableTH>
                    <SortableTH align="right" sortKey="avgGap" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>
                      Avg Gap
                    </SortableTH>
                    <SortableTH align="right">Days Since</SortableTH>
                    <SortableTH align="right">Action</SortableTH>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <RepeatRow key={r.id} row={r} onView={openHistory} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncContent>
      </ReportPanel>

      {/* Per-bike history drill-down */}
      <DrillDown
        open={drillCustomerId !== null}
        onClose={closeDrill}
        title={
          history
            ? `${history.customer.name} • Per-Bike Visit History`
            : "Per-Bike Visit History"
        }
        subtitle={
          history
            ? [
                history.customer.phone,
                `${history.summary.totalVisits} visit${
                  history.summary.totalVisits === 1 ? "" : "s"
                }`,
                `${history.summary.bikeCount} bike${
                  history.summary.bikeCount === 1 ? "" : "s"
                }`,
                history.summary.avgGapDays !== null
                  ? `Avg gap ${history.summary.avgGapDays}d`
                  : null,
              ]
                .filter(Boolean)
                .join(" • ")
            : undefined
        }
        size="xl"
      >
        {drillError ? (
          <ErrorState message={drillError} onRetry={retryDrill} />
        ) : drillLoading || !history ? (
          <LoadingSkeleton rows={6} />
        ) : history.bikes.length === 0 ? (
          <EmptyState description="No bike visits recorded for this customer." />
        ) : (
          <div className="space-y-4">
            {history.bikes.map((bike) => (
              <BikeSection key={bike.regNo} bike={bike} />
            ))}
          </div>
        )}
      </DrillDown>
    </div>
  );
}

/* ─── Memoised sub-components ──────────────────────────── */

type RepeatRowProps = {
  row: RepeatCustomerRow;
  onView: (id: string) => void;
};

const RepeatRow = memo(function RepeatRow({ row, onView }: RepeatRowProps) {
  const meta = BUCKET_META[row.bucket];
  const stale =
    row.sinceLastDays !== null && row.sinceLastDays > STALE_THRESHOLD_DAYS;
  return (
    <tr className="border-t border-[var(--border)] hover:bg-[var(--bg-table-head)]">
      <td className="px-3 py-1.5 font-medium text-[var(--text-main)]">{row.name}</td>
      <td className="px-3 py-1.5 text-[var(--text-muted)]">{row.phone ?? "—"}</td>
      <td className="px-3 py-1.5 text-center">
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
        {formatInteger(row.visits)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {formatInteger(row.bikeCount)}
      </td>
      <td className="px-3 py-1.5 text-[var(--text-muted)]">
        {row.bikes?.length > 0 ? row.bikes.join(", ") : "—"}
      </td>
      <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">
        {row.lastVisit ? formatDate(row.lastVisit) : "—"}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {row.avgGapDays !== null ? `${row.avgGapDays}d` : "—"}
      </td>
      <td
        className={`px-3 py-1.5 text-right tabular-nums ${
          stale ? "text-red-700 font-medium" : ""
        }`}
      >
        {row.sinceLastDays !== null ? `${formatInteger(row.sinceLastDays)}d` : "—"}
      </td>
      <td className="px-3 py-1.5 text-right">
        <button
          type="button"
          onClick={() => onView(row.id)}
          className="text-[11px] text-[var(--accent)] hover:underline"
        >
          View bikes
        </button>
      </td>
    </tr>
  );
});

const BikeSection = memo(function BikeSection({ bike }: { bike: BikeGroup }) {
  return (
    <section className="border border-[var(--border)] rounded-sm overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[var(--bg-table-head)] border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span aria-hidden>🏍️</span>
          <span className="text-[12px] font-semibold text-[var(--text-main)]">
            {bike.regNo}
          </span>
          {bike.vehicleType && (
            <span className="text-[11px] text-[var(--text-muted)]">
              · {bike.vehicleType}
            </span>
          )}
          {bike.engineType && (
            <span className="text-[11px] text-[var(--text-muted)]">
              · {bike.engineType}
            </span>
          )}
        </div>
        <span className="text-[11px] text-[var(--text-muted)]">
          {bike.visits.length} visit{bike.visits.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <SortableTH>Date</SortableTH>
              <SortableTH>Job No</SortableTH>
              <SortableTH>Service</SortableTH>
              <SortableTH>Mechanic</SortableTH>
              <SortableTH align="right">Meter</SortableTH>
              <SortableTH align="right">Gap</SortableTH>
              <SortableTH>Status</SortableTH>
              <SortableTH>Invoice</SortableTH>
              <SortableTH align="right">Amount</SortableTH>
            </tr>
          </thead>
          <tbody>
            {bike.visits.map((v) => (
              <tr key={v.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">
                  {formatDate(v.createdAt)}
                </td>
                <td className="px-3 py-1.5 font-medium">{v.jobNumber}</td>
                <td className="px-3 py-1.5">{v.title}</td>
                <td className="px-3 py-1.5 text-[var(--text-muted)]">
                  {v.mechanicAssigned ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                  {v.meterReading !== null ? formatInteger(v.meterReading) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                  {v.gapFromPrevDays !== null
                    ? `${formatInteger(v.gapFromPrevDays)}d`
                    : "—"}
                </td>
                <td className="px-3 py-1.5">
                  <Badge tone="neutral">{v.status}</Badge>
                </td>
                <td className="px-3 py-1.5 text-[var(--text-muted)]">
                  {v.invoiceNumber ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                  {formatCurrency(v.invoiceTotal ?? v.totalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});
