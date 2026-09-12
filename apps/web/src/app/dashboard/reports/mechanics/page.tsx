"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import {
  AsyncContent,
  DrillDown,
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
  fetchMechanicJobs,
  fetchMechanicsReport,
} from "@/lib/jobcard-report-api";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import {
  mechanicsApi,
  type MechanicData,
  type MechanicStatus,
} from "@/lib/api";
import type {
  MechanicJobsResponse,
  MechanicRow,
  MechanicsReportResponse,
} from "@/types/jobcard-report";

type SortKey = "jobs" | "revenue" | "avgTurnaround" | "name";
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

type FormState = {
  name: string;
  phone: string;
  address: string;
  status: MechanicStatus;
};

const EMPTY_FORM: FormState = { name: "", phone: "", address: "", status: "ACTIVE" };

export default function MechanicsReportPage() {
  const toast = useToast();
  const filters = useReportFilters("today");
  const debouncedSearch = useDebouncedValue(filters.search, 250);

  const { sortBy, sortDir, toggleSort } = useSortControl<SortKey>({
    defaultKey: "revenue",
    defaultDir: "desc",
    resolveDirForKey: (k) => (k === "name" ? "asc" : "desc"),
  });
  const onHeaderSort = toggleSort as (key: string) => void;

  const [data, setData] = useState<MechanicsReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const fromIso = filters.range.from.toISOString();
  const toIso = filters.range.to.toISOString();

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchMechanicsReport({
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
        setError(e instanceof Error ? e.message : "Failed to load mechanics.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [debouncedSearch, fromIso, toIso, sortBy, sortDir, reloadTick]);

  const allRows = data?.mechanics ?? [];
  const rows = useMemo(
    () =>
      statusFilter === "ALL"
        ? allRows
        : allRows.filter((r) => r.status === statusFilter),
    [allRows, statusFilter]
  );
  const totals = data?.totals;

  const exportColumns = useMemo<ExportColumn<MechanicRow>[]>(
    () => [
      { header: "Mechanic", accessor: "name" },
      { header: "Phone", accessor: (r) => r.phone ?? "" },
      { header: "Status", accessor: "status" },
      { header: "Jobs", accessor: "jobs" },
      { header: "Completed", accessor: "completed" },
      { header: "Open", accessor: "open" },
      { header: "Earnings (Labour)", accessor: "earnings" },
      { header: "Parts", accessor: "parts" },
      { header: "Revenue", accessor: "revenue" },
      {
        header: "Avg Turnaround (days)",
        accessor: (r) => (r.avgTurnaroundDays ?? "") as number | "",
      },
    ],
    []
  );

  const retry = useCallback(() => setReloadTick((t) => t + 1), []);
  const refresh = useCallback(() => setReloadTick((t) => t + 1), []);

  /* ── CRUD modal state ── */
  const [editing, setEditing] = useState<MechanicData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = async (id: string) => {
    setFormError(null);
    try {
      const m = await mechanicsApi.get(id);
      setEditing(m);
      setForm({
        name: m.name,
        phone: m.phone ?? "",
        address: m.address ?? "",
        status: m.status,
      });
      setShowForm(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load mechanic.");
    }
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        status: form.status,
      };
      if (editing) {
        await mechanicsApi.update(editing.id, payload);
      } else {
        await mechanicsApi.create(payload);
      }
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      refresh();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save mechanic.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: MechanicRow) => {
    const next: MechanicStatus = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (
      !confirm(
        `Set ${row.name} to ${next}?${
          next === "INACTIVE"
            ? "\nInactive mechanics cannot be assigned to new job cards."
            : ""
        }`
      )
    )
      return;
    try {
      await mechanicsApi.setStatus(row.id, next);
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update status.");
    }
  };

  const removeMechanic = async (row: MechanicRow) => {
    if (!confirm(`Delete mechanic "${row.name}"? This cannot be undone.`)) return;
    try {
      await mechanicsApi.remove(row.id);
      refresh();
    } catch (e: unknown) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Cannot delete mechanic — set status to INACTIVE instead."
      );
    }
  };

  /* Drill-down: jobs for one mechanic */
  const [drillId, setDrillId] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<MechanicJobsResponse | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [drillTick, setDrillTick] = useState(0);

  const openMechanic = useCallback((id: string) => setDrillId(id), []);
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
    fetchMechanicJobs(drillId, { from: fromIso, to: toIso, signal: ctrl.signal })
      .then(setDrillData)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setDrillError(e instanceof Error ? e.message : "Failed to load jobs.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setDrillLoading(false);
      });
    return () => ctrl.abort();
  }, [drillId, drillTick, fromIso, toIso]);

  return (
    <div className="p-3 space-y-3">
      <ReportPageHeader
        title="Mechanics"
        description="Master list of mechanics. This is the single source of truth — Job Cards and Sales Invoices read directly from here."
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            + Add Mechanic
          </button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KPICard label="Mechanics" value={totals ? formatInteger(totals.mechanics) : "—"} />
        <KPICard label="Total Jobs" value={totals ? formatInteger(totals.totalJobs) : "—"} />
        <KPICard
          label="Completed"
          value={totals ? formatInteger(totals.totalCompleted) : "—"}
          accentClass="text-emerald-700"
        />
        <KPICard
          label="Open"
          value={totals ? formatInteger(totals.totalOpen) : "—"}
          accentClass="text-amber-700"
        />
        <KPICard
          label="Total Revenue"
          value={totals ? formatCurrency(totals.totalRevenue) : "—"}
          accentClass="text-emerald-700"
        />
      </div>

      {/* Toolbar with status filter */}
      <ReportToolbar
        filters={filters}
        searchPlaceholder="Search by name or phone…"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-[11px]"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            <ExportCSV filename="mechanics-report" rows={rows} columns={exportColumns} />
          </div>
        }
      />

      {/* Table */}
      <ReportPanel
        title="Mechanics"
        actions={
          <span className="text-[11px] text-[var(--text-muted)]">
            {loading
              ? "Loading…"
              : `${rows.length} mechanic${rows.length === 1 ? "" : "s"}`}
          </span>
        }
        noPadding
      >
        <AsyncContent<MechanicRow[]>
          loading={loading}
          error={error}
          data={data ? rows : null}
          onRetry={retry}
          emptyMessage="No mechanics yet. Click + Add Mechanic to create one."
        >
          {(list) => (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <SortableTH sortKey="name" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Mechanic</SortableTH>
                    <SortableTH>Phone</SortableTH>
                    <SortableTH align="center">Status</SortableTH>
                    <SortableTH align="right" sortKey="jobs" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Jobs</SortableTH>
                    <SortableTH align="right">Completed</SortableTH>
                    <SortableTH align="right">Open</SortableTH>
                    <SortableTH align="right">Earnings</SortableTH>
                    <SortableTH align="right" sortKey="revenue" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Revenue</SortableTH>
                    <SortableTH align="right" sortKey="avgTurnaround" activeKey={sortBy} direction={sortDir} onSort={onHeaderSort}>Avg TAT</SortableTH>
                    <SortableTH align="right">Actions</SortableTH>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-t border-[var(--border)] hover:bg-[var(--bg-table-head)] ${
                        r.status === "INACTIVE" ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 font-medium text-[var(--text-main)]">
                        {r.name}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">
                        {r.phone ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${
                            r.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-zinc-200 text-zinc-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatInteger(r.jobs)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                        {formatInteger(r.completed)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">
                        {formatInteger(r.open)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCurrency(r.earnings)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                        {formatCurrency(r.revenue)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.avgTurnaroundDays !== null
                          ? `${r.avgTurnaroundDays}d`
                          : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openMechanic(r.id)}
                          className="text-[11px] text-[var(--accent)] hover:underline mr-2"
                        >
                          Jobs
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(r.id)}
                          className="text-[11px] text-blue-600 hover:underline mr-2"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(r)}
                          className={`text-[11px] hover:underline mr-2 ${
                            r.status === "ACTIVE" ? "text-amber-600" : "text-emerald-600"
                          }`}
                        >
                          {r.status === "ACTIVE" ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMechanic(r)}
                          className="text-[11px] text-red-600 hover:underline"
                        >
                          Delete
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

      {/* Add/Edit modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeForm}
        >
          <form
            onSubmit={submitForm}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg bg-[var(--bg-panel)] p-4 shadow-xl space-y-3"
          >
            <h3 className="text-[14px] font-semibold">
              {editing ? "Edit Mechanic" : "Add Mechanic"}
            </h3>
            <div className="space-y-2">
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Name *
                </span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[12px]"
                  required
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Phone
                </span>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[12px]"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Address
                </span>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                  rows={2}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[12px]"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Status
                </span>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, status: e.target.value as MechanicStatus }))
                  }
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[12px]"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
            </div>
            {formError && (
              <p className="text-[11px] text-red-600">{formError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded border border-[var(--border)] px-3 py-1.5 text-[12px] hover:bg-[var(--bg-table-head)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Add mechanic"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drill-down */}
      <DrillDown
        open={drillId !== null}
        onClose={closeDrill}
        title={drillData ? `${drillData.mechanic.name} • Jobs` : "Mechanic"}
        subtitle={
          drillData
            ? `${formatInteger(drillData.mechanic.jobCount)} job${
                drillData.mechanic.jobCount === 1 ? "" : "s"
              } in selected period`
            : undefined
        }
        size="lg"
      >
        {drillError ? (
          <ErrorState message={drillError} onRetry={retryDrill} />
        ) : drillLoading || !drillData ? (
          <LoadingSkeleton rows={6} />
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <KPICard
                label="Total Jobs"
                value={formatInteger(drillData.mechanic.jobCount)}
              />
              <KPICard
                label="Total Sale"
                value={formatCurrency(drillData.mechanic.totalSale)}
                accentClass="text-emerald-700"
              />
              <KPICard
                label="Total Labour"
                value={formatCurrency(drillData.mechanic.totalLabour)}
                accentClass="text-blue-700"
              />
              <KPICard
                label="Total Parts"
                value={formatCurrency(drillData.mechanic.totalParts)}
                accentClass="text-amber-700"
              />
            </div>

            {drillData.jobs.length === 0 ? (
              <div className="text-[12px] text-[var(--text-muted)] text-center py-6">
                No jobs found for this mechanic in the selected period.
              </div>
            ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="bg-[var(--bg-table-head)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <SortableTH>Date</SortableTH>
                  <SortableTH>Job No</SortableTH>
                  <SortableTH>Status</SortableTH>
                  <SortableTH>Customer</SortableTH>
                  <SortableTH>Vehicle</SortableTH>
                  <SortableTH align="right">Labour</SortableTH>
                  <SortableTH align="right">Total</SortableTH>
                  <SortableTH align="right">Turnaround</SortableTH>
                </tr>
              </thead>
              <tbody>
                {drillData.jobs.map((j) => (
                  <tr key={j.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">
                      {formatDate(j.createdAt)}
                    </td>
                    <td className="px-3 py-1.5 font-medium">{j.jobNumber}</td>
                    <td className="px-3 py-1.5">{j.status}</td>
                    <td className="px-3 py-1.5">{j.customer.name}</td>
                    <td className="px-3 py-1.5 text-[var(--text-muted)]">
                      {j.vehicleRegNo ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatCurrency(j.labour)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatCurrency(j.total)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {j.turnaroundDays !== null
                        ? `${j.turnaroundDays}d`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            )}
          </>
        )}
      </DrillDown>
    </div>
  );
}
