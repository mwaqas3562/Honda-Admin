"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AsyncContent,
  Badge,
  type BadgeTone,
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
import { fetchJobCardsReport } from "@/lib/jobcard-report-api";
import { formatCurrency, formatDate, formatInteger, formatNumber } from "@/lib/formatters";
import type {
  JobCardReportRow,
  JobCardStatus,
  JobCardsReportResponse,
} from "@/types/jobcard-report";

type SortKey =
  | "createdAt"
  | "jobNumber"
  | "customer"
  | "total"
  | "status"
  | "turnaround";

type StatusFilter = "ALL" | JobCardStatus;

const STATUS_META: Record<JobCardStatus, { label: string; tone: BadgeTone }> = {
  OPEN: { label: "Open", tone: "sky" },
  IN_PROGRESS: { label: "In Progress", tone: "amber" },
  COMPLETED: { label: "Completed", tone: "emerald" },
  CANCELLED: { label: "Cancelled", tone: "red" },
};

/** "15 Sep 2026, 02:35 PM" — date and clock time, since two bills on the same
 *  day are told apart by the time. en-GB renders a lowercase "pm", so the
 *  meridiem is upper-cased to match the rest of the report's casing. */
function formatPaidAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d
    .toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

export default function JobCardsReportPage() {
  const filters = useReportFilters("today");
  const debouncedSearch = useDebouncedValue(filters.search, 250);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [mechanicFilter, setMechanicFilter] = useState<string>("");

  const { sortBy, sortDir, toggleSort } = useSortControl<SortKey>({
    defaultKey: "createdAt",
    defaultDir: "desc",
    resolveDirForKey: (k) =>
      k === "jobNumber" || k === "customer" || k === "status" ? "asc" : "desc",
  });
  const onHeaderSort = toggleSort as (key: string) => void;

  const [data, setData] = useState<JobCardsReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const fromIso = filters.range.from.toISOString();
  const toIso = filters.range.to.toISOString();

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchJobCardsReport({
      q: debouncedSearch || undefined,
      from: fromIso,
      to: toIso,
      status: statusFilter,
      mechanic: mechanicFilter || undefined,
      sortBy,
      sortDir,
      signal: ctrl.signal,
    })
      .then(setData)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load job cards.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [
    debouncedSearch,
    fromIso,
    toIso,
    statusFilter,
    mechanicFilter,
    sortBy,
    sortDir,
    reloadTick,
  ]);

  const rows = data?.jobCards ?? [];
  const totals = data?.totals;
  const mechanics = data?.mechanics ?? [];

  const exportColumns = useMemo<ExportColumn<JobCardReportRow>[]>(
    () => [
      { header: "Job No", accessor: "jobNumber" },
      { header: "Created", accessor: (r) => r.createdAt.slice(0, 10) },
      { header: "Status", accessor: "status" },
      { header: "Customer", accessor: (r) => r.customer.name },
      { header: "Vehicle", accessor: (r) => r.vehicleRegNo ?? "" },
      { header: "Mechanic", accessor: (r) => r.mechanicAssigned ?? "" },
      { header: "Title", accessor: "title" },
      { header: "Labour", accessor: "labour" },
      { header: "Parts", accessor: "parts" },
      { header: "Total", accessor: "total" },
      { header: "Age (days)", accessor: "ageDays" },
      {
        header: "Turnaround (days)",
        accessor: (r) => (r.turnaroundDays ?? "") as number | "",
      },
      {
        header: "Paid At",
        accessor: (r) => (r.invoice?.paidAt ? formatPaidAt(r.invoice.paidAt) : ""),
      },
      { header: "Invoice", accessor: (r) => r.invoice?.invoiceNumber ?? "" },
    ],
    []
  );

  const retry = useCallback(() => setReloadTick((t) => t + 1), []);

  /* Drill-down */
  /* The bill is the detail worth seeing — the drill-down repeated columns the
     table already shows, while the invoice carries the actual line items. */
  const router = useRouter();
  const openBill = useCallback((r: JobCardReportRow) => {
    if (r.invoice) {
      router.push(`/dashboard/sale-invoice?invoiceId=${r.invoice.id}`);
      return;
    }
    /* This report lists every status. The API refuses to invoice a closed
       card, so sending the user to a blank bill would only fail after the
       whole thing had been keyed in. */
    if (r.status === "COMPLETED" || r.status === "CANCELLED") return;
    router.push(`/dashboard/sale-invoice?jobCardId=${r.id}`);
  }, [router]);

  return (
    <div className="p-3 space-y-3">
      <ReportPageHeader
        title="Job Cards Report"
        description="Operational pipeline: status mix, work-in-progress value, turnaround time, and per-job breakdown."
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPICard
          label="Total Job Cards"
          value={totals ? formatInteger(totals.jobCount) : "—"}
        />
        <KPICard
          label="Open / In-Prog"
          value={
            totals
              ? `${formatInteger(totals.open)} / ${formatInteger(
                  totals.inProgress
                )}`
              : "—"
          }
          accentClass="text-amber-700"
        />
        <KPICard
          label="Completed"
          value={totals ? formatInteger(totals.completed) : "—"}
          accentClass="text-emerald-700"
        />
        <KPICard
          label="WIP Value"
          value={totals ? formatCurrency(totals.wipValue) : "—"}
          accentClass="text-amber-700"
          hint="Open + In-Progress"
        />
        <KPICard
          label="Completed Value"
          value={totals ? formatCurrency(totals.completedValue) : "—"}
          accentClass="text-emerald-700"
        />
        <KPICard
          label="Avg Turnaround"
          value={
            totals && totals.avgTurnaroundDays !== null
              ? `${formatNumber(totals.avgTurnaroundDays, { maximumFractionDigits: 2 })} d`
              : "—"
          }
          hint="Completed jobs only"
        />
      </div>

      {/* Toolbar */}
      <ReportToolbar
        filters={filters}
        searchPlaceholder="Search job no, vehicle, customer, or mechanic…"
        actions={
          <>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="border border-[var(--border)] rounded-sm px-2 py-1 text-[11px] bg-white"
              aria-label="Filter by status"
            >
              <option value="ALL">All status</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select
              value={mechanicFilter}
              onChange={(e) => setMechanicFilter(e.target.value)}
              className="border border-[var(--border)] rounded-sm px-2 py-1 text-[11px] bg-white"
              aria-label="Filter by mechanic"
            >
              <option value="">All mechanics</option>
              {mechanics.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ExportCSV
              filename="job-cards-report"
              rows={rows}
              columns={exportColumns}
            />
          </>
        }
      />

      {/* Table */}
      <ReportPanel
        title="Job Cards"
        actions={
          <span className="text-[11px] text-[var(--text-muted)]">
            {loading
              ? "Loading…"
              : `${rows.length} job card${rows.length === 1 ? "" : "s"}`}
          </span>
        }
        noPadding
      >
        <AsyncContent<JobCardReportRow[]>
          loading={loading}
          error={error}
          data={data ? rows : null}
          onRetry={retry}
          emptyMessage="No job cards match the current filters."
        >
          {(list) => (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <SortableTH sortKey="createdAt" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Created</SortableTH>
                    <SortableTH sortKey="jobNumber" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Job No</SortableTH>
                    <SortableTH align="center" sortKey="status" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Status</SortableTH>
                    <SortableTH sortKey="customer" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Customer</SortableTH>
                    <SortableTH>Vehicle</SortableTH>
                    <SortableTH>Mechanic</SortableTH>
                    <SortableTH align="right">Labour</SortableTH>
                    <SortableTH align="right">Parts</SortableTH>
                    <SortableTH align="right" sortKey="total" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Total</SortableTH>
                    <SortableTH align="right">Age</SortableTH>
                    <SortableTH align="right" sortKey="turnaround" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Turnaround</SortableTH>
                    <SortableTH>Paid At</SortableTH>
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
                        <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">
                          {formatDate(r.createdAt)}
                        </td>
                        <td className="px-3 py-1.5 font-medium text-[var(--text-main)]" title={r.title}>
                          {r.jobNumber}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </td>
                        <td className="px-3 py-1.5">
                          {r.customer.name}
                          {r.customer.phone && (
                            <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                              · {r.customer.phone}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-muted)]">
                          {r.vehicleRegNo ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-muted)]">
                          {r.mechanicAssigned ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatCurrency(r.labour)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatCurrency(r.parts)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {formatCurrency(r.total)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                          {formatInteger(r.ageDays)}d
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {r.turnaroundDays !== null
                            ? `${r.turnaroundDays}d`
                            : "—"}
                        </td>
                        {/* The moment payment was taken, not the bill's date —
                            the two differ whenever a bill is back-dated. */}
                        <td className="px-3 py-1.5 whitespace-nowrap text-[var(--text-muted)]">
                          {r.invoice?.paidAt ? formatPaidAt(r.invoice.paidAt) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => openBill(r)}
                            disabled={!r.invoice && (r.status === "COMPLETED" || r.status === "CANCELLED")}
                            className="text-[11px] text-[var(--accent)] hover:underline disabled:text-[var(--text-muted)] disabled:no-underline disabled:cursor-not-allowed"
                            title={
                              r.invoice ? `Open ${r.invoice.invoiceNumber}`
                                : r.status === "COMPLETED" || r.status === "CANCELLED"
                                  ? `${r.jobNumber} is ${meta.label.toLowerCase()} and has no invoice — it cannot be billed.`
                                  : "Raise a bill for this job card"
                            }
                          >
                            View
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

    </div>
  );
}
