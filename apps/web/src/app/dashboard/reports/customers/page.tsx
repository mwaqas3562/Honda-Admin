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
  SummaryTile,
  type ExportColumn,
} from "@/components/reports";
import { useReportFilters } from "@/hooks/useReportFilters";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSortControl } from "@/hooks/useSortControl";
import {
  fetchCustomersReport,
  fetchCustomerTimeline,
} from "@/lib/customers-report-api";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import type {
  CustomerRow,
  CustomersReportResponse,
  CustomerTimelineResponse,
  TimelineEntry,
  TimelineKind,
} from "@/types/customer-report";

type SortKey = "name" | "visits" | "spend" | "lastVisit";

const KIND_META: Record<
  TimelineKind,
  { label: string; tone: BadgeTone; icon: string }
> = {
  SALE: { label: "Sale", tone: "emerald", icon: "💰" },
  SERVICE: { label: "Service", tone: "sky", icon: "🔧" },
  JOB_CARD: { label: "Job Card", tone: "amber", icon: "📋" },
};

export default function CustomersReportPage() {
  const filters = useReportFilters("today");
  const debouncedSearch = useDebouncedValue(filters.search, 250);

  const { sortBy, sortDir, toggleSort } = useSortControl<SortKey>({
    defaultKey: "spend",
    defaultDir: "desc",
    resolveDirForKey: (k) => (k === "name" ? "asc" : "desc"),
  });
  const onHeaderSort = toggleSort as (key: string) => void;

  const [data, setData] = useState<CustomersReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  /* Drill-down */
  const [tlOpen, setTlOpen] = useState(false);
  const [tlLoading, setTlLoading] = useState(false);
  const [tlError, setTlError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<CustomerTimelineResponse | null>(null);
  const [tlKindFilter, setTlKindFilter] = useState<"ALL" | TimelineKind>("ALL");

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchCustomersReport({
      q: debouncedSearch || undefined,
      sortBy,
      sortDir,
      from: filters.range.from?.toISOString(),
      to: filters.range.to?.toISOString(),
      signal: ctrl.signal,
    })
      .then((res) => setData(res))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load customers.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [debouncedSearch, sortBy, sortDir, filters.range.from, filters.range.to, reloadTick]);

  const rows = data?.customers ?? [];
  const totals = data?.totals;

  const exportColumns = useMemo<ExportColumn<CustomerRow>[]>(
    () => [
      { header: "Name", accessor: "name" },
      { header: "Phone", accessor: (r) => r.phone ?? "" },
      { header: "Email", accessor: (r) => r.email ?? "" },
      { header: "Visits", accessor: "visits" },
      { header: "Invoices", accessor: "invoiceCount" },
      { header: "Job Cards", accessor: "jobCount" },
      { header: "Total Spend", accessor: "totalSpend" },
      { header: "Last Visit", accessor: (r) => r.lastVisit ?? "" },
    ],
    []
  );

  const openTimeline = useCallback(async (customerId: string) => {
    setTlOpen(true);
    setTimeline(null);
    setTlError(null);
    setTlKindFilter("ALL");
    setTlLoading(true);
    try {
      const res = await fetchCustomerTimeline(customerId);
      setTimeline(res);
    } catch (e: unknown) {
      setTlError(e instanceof Error ? e.message : "Failed to load timeline.");
    } finally {
      setTlLoading(false);
    }
  }, []);

  const retry = useCallback(() => setReloadTick((t) => t + 1), []);

  const filteredEntries: TimelineEntry[] = useMemo(() => {
    if (!timeline) return [];
    if (tlKindFilter === "ALL") return timeline.entries;
    return timeline.entries.filter((e) => e.kind === tlKindFilter);
  }, [timeline, tlKindFilter]);

  return (
    <div className="p-3 space-y-3">
      <ReportPageHeader
        title="Customers Report"
        description="Customer base, revenue and average spend, with full per-customer activity timelines."
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPICard
          label="Total Customers"
          value={totals ? formatInteger(totals.totalCustomers) : "—"}
          accentClass="text-[var(--text-main)]"
        />
        <KPICard
          label="Total Revenue"
          value={totals ? formatCurrency(totals.totalRevenue) : "—"}
          accentClass="text-emerald-700"
          hint={
            totals
              ? `${formatInteger(totals.payingCustomers)} paying customer${
                  totals.payingCustomers === 1 ? "" : "s"
                }`
              : undefined
          }
        />
        <KPICard
          label="Avg Spend / Customer"
          value={totals ? formatCurrency(totals.avgSpend) : "—"}
          hint="Among paying customers in the selected period"
        />
      </div>

      {/* Toolbar */}
      <ReportToolbar
        filters={filters}
        searchPlaceholder="Search by name, phone, or Job#…"
        actions={
          <ExportCSV
            filename="customers-report"
            rows={rows}
            columns={exportColumns}
          />
        }
      />

      {/* Table */}
      <ReportPanel
        title="Customers"
        actions={
          <span className="text-[11px] text-[var(--text-muted)]">
            {loading
              ? "Loading…"
              : `${rows.length} customer${rows.length === 1 ? "" : "s"}`}
          </span>
        }
        noPadding
      >
        <AsyncContent<CustomerRow[]>
          loading={loading}
          error={error}
          data={data ? rows : null}
          onRetry={retry}
          emptyMessage="No customers match the current search."
        >
          {(list) => (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <SortableTH sortKey="name" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Customer Name</SortableTH>
                  <SortableTH>Phone</SortableTH>
                  <SortableTH align="right" sortKey="visits" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Visits</SortableTH>
                  <SortableTH align="right" sortKey="spend" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Total Spend</SortableTH>
                  <SortableTH sortKey="lastVisit" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Last Visit</SortableTH>
                  <SortableTH align="right">Action</SortableTH>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-[var(--border)] hover:bg-[var(--bg-table-head)]"
                  >
                    <td className="px-3 py-1.5 font-medium text-[var(--text-main)]">
                      {r.name}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--text-muted)]">
                      {r.phone ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatInteger(r.visits)}
                      {r.visits > 0 && (
                        <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                          ({r.invoiceCount}+{r.jobCount})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                      {formatCurrency(r.totalSpend)}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">
                      {r.lastVisit ? formatDate(r.lastVisit) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => openTimeline(r.id)}
                        className="text-[11px] text-[var(--accent)] hover:underline"
                      >
                        View timeline
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

      {/* Timeline drill-down */}
      <DrillDown
        open={tlOpen}
        onClose={() => setTlOpen(false)}
        title={timeline ? `${timeline.customer.name} • Timeline` : "Customer Timeline"}
        subtitle={
          timeline
            ? [
                timeline.customer.phone,
                timeline.customer.email,
                `Customer since ${formatDate(timeline.customer.createdAt)}`,
              ]
                .filter(Boolean)
                .join(" • ")
            : undefined
        }
        size="xl"
      >
        {tlError ? (
          <ErrorState
            message={tlError}
            onRetry={() => timeline && openTimeline(timeline.customer.id)}
          />
        ) : tlLoading || !timeline ? (
          <LoadingSkeleton rows={6} />
        ) : (
          <div className="space-y-3">
            {/* Summary chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SummaryTile
                label="Sales"
                value={formatInteger(timeline.summary.salesCount)}
              />
              <SummaryTile
                label="Services"
                value={formatInteger(timeline.summary.serviceCount)}
              />
              <SummaryTile
                label="Job Cards"
                value={formatInteger(timeline.summary.jobCardCount)}
              />
              <SummaryTile
                label="Total Spend"
                value={formatCurrency(timeline.summary.totalSpend)}
                accent="text-emerald-700"
              />
            </div>

            {/* Kind filter chips */}
            <div className="flex flex-wrap items-center gap-1">
              {(["ALL", "SALE", "SERVICE", "JOB_CARD"] as const).map((k) => {
                const active = tlKindFilter === k;
                const label =
                  k === "ALL"
                    ? `All (${timeline.entries.length})`
                    : KIND_META[k].label;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTlKindFilter(k)}
                    className={`px-2 py-1 text-[11px] border rounded-sm ${
                      active
                        ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                        : "bg-white text-[var(--text-main)] border-[var(--border)] hover:bg-[var(--bg-table-head)]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {filteredEntries.length === 0 ? (
              <EmptyState description="No activity recorded for this customer." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <tr>
                      <SortableTH>Date</SortableTH>
                      <SortableTH>Type</SortableTH>
                      <SortableTH>Reference</SortableTH>
                      <SortableTH>Details</SortableTH>
                      <SortableTH>Status</SortableTH>
                      <SortableTH align="right">Amount</SortableTH>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((e) => {
                      const meta = KIND_META[e.kind];
                      return (
                        <tr
                          key={`${e.kind}-${e.id}`}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">
                            {formatDate(e.date)}
                          </td>
                          <td className="px-3 py-1.5">
                            <Badge tone={meta.tone} icon={meta.icon}>
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-1.5 font-medium text-[var(--text-main)]">
                            {e.kind === "JOB_CARD"
                              ? `Job ${e.jobNumber}`
                              : e.invoiceNumber}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-muted)]">
                            {e.kind === "JOB_CARD" ? (
                              <>
                                {e.title}
                                {e.vehicleRegNo && (
                                  <span className="ml-1">
                                    · {e.vehicleRegNo}
                                  </span>
                                )}
                                {e.mechanicAssigned && (
                                  <span className="ml-1">
                                    · {e.mechanicAssigned}
                                  </span>
                                )}
                              </>
                            ) : e.jobNumber ? (
                              <>
                                {e.jobTitle ?? "—"}
                                <span className="ml-1">· Job {e.jobNumber}</span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className="inline-block px-2 py-0.5 text-[10px] border border-[var(--border)] bg-white rounded-sm">
                              {e.status}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                            {formatCurrency(e.totalAmount)}
                            {e.kind !== "JOB_CARD" && e.paidAmount < e.totalAmount && (
                              <div className="text-[10px] text-[var(--text-muted)]">
                                Paid {formatCurrency(e.paidAmount)}
                              </div>
                            )}
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
