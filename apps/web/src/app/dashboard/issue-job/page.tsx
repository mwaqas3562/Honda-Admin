"use client";

import { blockDecimalKeys, blockDecimalPaste } from "@/lib/intInput";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useJobCards } from "@/hooks/useJobCards";
import type { JobCardData, JobCardStatus } from "@/lib/api";
import { mechanicsApi, jobCardsApi, servicesApi, type MechanicData, type ServiceData } from "@/lib/api";
import SmartSearch from "@/components/SmartSearch";

const VEHICLE_TYPES = ["CD 70", "CD 70 DRM", "CG-125", "CG-125 DRM", "CD-100", "PRIDOR", "DELUX", "Other"];

type FormState = {
  id: string | null;
  jobNumber: string;
  customerId: string;
  customerName: string;
  cellNo: string;
  vehicleRegNo: string;
  vehicleType: string;
  engineType: string;
  meterReading: string;
  mechanicId: string;
  mechanicAssigned: string;
  title: string;
  description: string;
  status: JobCardStatus;
  isFinal: boolean;
  finalizedAt: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
};

const empty: FormState = {
  id: null, jobNumber: "(auto)", customerId: "",
  customerName: "", cellNo: "",
  vehicleRegNo: "", vehicleType: "", engineType: "", meterReading: "",
  mechanicId: "", mechanicAssigned: "", title: "", description: "",
  status: "OPEN", isFinal: false, finalizedAt: null,
  invoiceId: null, invoiceNumber: null,
};

export default function IssueJobPage() {
  const router = useRouter();
  const { saving, error, fetch, create, update } = useJobCards();

  const [form, setForm] = useState<FormState>(empty);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const [serviceSearch, setServiceSearch] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [recent, setRecent] = useState<JobCardData[]>([]);
  const [mechanics, setMechanics] = useState<MechanicData[]>([]);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [lookupQuery, setLookupQuery] = useState("");
  const [nextJobNumber, setNextJobNumber] = useState<string>("…");

  useEffect(() => {
    refreshList();
    refreshMechanics();
    refreshServices();
    refreshNextJobNumber();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshNextJobNumber() {
    try {
      const r = await jobCardsApi.nextNumber();
      setNextJobNumber(r.nextNumber);
    } catch {
      // non-fatal
    }
  }

  async function refreshServices() {
    try {
      const r = await servicesApi.list({ activeOnly: true });
      setServices(r.data);
    } catch {
      // non-fatal
    }
  }

  async function refreshMechanics() {
    try {
      const r = await mechanicsApi.listActive();
      setMechanics(r.data);
    } catch {
      // non-fatal
    }
  }

  /** Recent list is a work queue, so completed cards are excluded — by the
   *  server, not by filtering a page client-side, which would leave the panel
   *  empty once the 20 newest cards happened to all be completed. */
  async function refreshList() {
    const r = await fetch(1, 20, undefined, undefined, undefined, true);
    if (r) setRecent(r.data);
  }

  /* ── Locked: finalised, invoiced, or closed (auto-completed by paid invoice). */
  const locked =
    form.id != null &&
    (form.isFinal || form.invoiceId != null || form.status === "COMPLETED" || form.status === "CANCELLED");

  function reset() {
    setForm(empty);
    setMsg(null);
    setLookupQuery("");
    setSelectedServiceIds(new Set());
    setServiceSearch("");
    refreshNextJobNumber();
  }

  /* When the user toggles services, recompute the Title field. */
  function toggleService(id: string) {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const names = services
        .filter((s) => next.has(s.id))
        .map((s) => s.name);
      setForm((f) => ({ ...f, title: names.join(", ") || f.title }));
      return next;
    });
  }

  /* Picking a previous Job Card pre-fills the customer + vehicle info. */
  function pickPreviousJob(j: JobCardData | null) {
    if (!j) {
      setForm((f) => ({ ...f, customerId: "", customerName: "", cellNo: "", vehicleRegNo: "" }));
      setLookupQuery("");
      return;
    }
    setForm((f) => ({
      ...f,
      customerId: j.customerId,
      customerName: j.customer.name,
      cellNo: j.customer.phone ?? "",
      vehicleRegNo: j.vehicleRegNo ?? f.vehicleRegNo,
      vehicleType: j.vehicleType ?? f.vehicleType,
      engineType: j.engineType ?? f.engineType,
    }));
    setLookupQuery(j.vehicleRegNo ?? "");
  }

  function pickRow(j: JobCardData) {
    setForm({
      id: j.id,
      jobNumber: j.jobNumber,
      customerId: j.customerId,
      customerName: j.customer.name,
      cellNo: j.customer.phone ?? "",
      vehicleRegNo: j.vehicleRegNo ?? "",
      vehicleType: j.vehicleType ?? "",
      engineType: j.engineType ?? "",
      meterReading: j.meterReading != null ? String(j.meterReading) : "",
      mechanicId: j.mechanicId ?? "",
      mechanicAssigned: j.mechanicAssigned ?? "",
      title: j.title,
      description: j.description ?? "",
      status: j.status,
      isFinal: j.isFinal,
      finalizedAt: j.finalizedAt,
      invoiceId: j.invoice?.id ?? null,
      invoiceNumber: j.invoice?.invoiceNumber ?? null,
    });
    setLookupQuery(`${j.jobNumber}${j.vehicleRegNo ? ` · ${j.vehicleRegNo}` : ""}`);
    setMsg(null);
  }

  async function save() {
    setMsg(null);
    if (!form.title.trim()) { setMsg("Title is required."); return; }

    const basePayload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      vehicleRegNo: form.vehicleRegNo.trim() || undefined,
      vehicleType: form.vehicleType || undefined,
      engineType: form.engineType.trim() || undefined,
      meterReading: form.meterReading ? Number(form.meterReading) : undefined,
      mechanicId: form.mechanicId || undefined,
    };

    if (form.id) {
      const updatePayload = {
        ...basePayload,
        mechanicId: form.mechanicId || null,
        /* Correcting a mistyped name or number updates the customer the card
           points at — see updateJobCard on the API side. */
        ...(form.customerName.trim() && { customerName: form.customerName.trim() }),
        ...(form.cellNo.trim() && { customerPhone: form.cellNo.trim() }),
      };
      const r = await update(form.id, updatePayload);
      if (r) {
        setMsg(`Updated ${r.jobNumber}`);
        reset();
        refreshList();
      }
      return;
    }

    /* Create — supply existing customerId OR walk-in name+phone. */
    const customerId = form.customerId || undefined;
    const customerName = customerId ? undefined : form.customerName.trim();
    const customerPhone = customerId ? undefined : form.cellNo.trim();

    if (!customerId && (!customerName || !customerPhone)) {
      setMsg("Provide an existing customer OR fill name and cell no.");
      return;
    }

    const r = await create({ ...basePayload, customerId, customerName, customerPhone });
    if (r) {
      setMsg(`Created ${r.jobNumber}`);
      reset();
      refreshList();
    }
  }

  /* A job card exists to be billed, so a row in the list goes straight to its
   * bill: the invoice if one was raised, otherwise a new one for this card. */
  function openBill(j: JobCardData) {
    router.push(j.invoice
      ? `/dashboard/sale-invoice?invoiceId=${j.invoice.id}`
      : `/dashboard/sale-invoice?jobCardId=${j.id}`);
  }

  function generateInvoice() {
    if (!form.id) return;
    if (form.invoiceId) {
      router.push(`/dashboard/sale-invoice?invoiceId=${form.invoiceId}`);
      return;
    }
    router.push(`/dashboard/sale-invoice?jobCardId=${form.id}`);
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {/* LEFT - FORM */}
      <div style={{ flex: "0 0 480px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="panel">
          <div style={{ padding: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontWeight: 600, minWidth: 60 }}>Job No.</span>
            <input className="erp-input" readOnly value={form.id ? form.jobNumber : nextJobNumber} style={{ maxWidth: 160 }} />
            <span style={{ flex: 1 }} />
            <span style={{ fontWeight: 600 }}>Date</span>
            <input className="erp-input" readOnly value={new Date().toLocaleString()} style={{ maxWidth: 180 }} />
          </div>
        </div>

        {form.id && (
          <div className="panel" style={{ background: locked ? "#fff8e1" : "#eef5ff" }}>
            <div style={{ padding: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{
                padding: "2px 8px", background: statusBg(form.status),
                color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 2,
              }}>{statusLabel(form.status)}</span>
              {form.isFinal && (
                <span style={{
                  padding: "2px 8px", background: "#b45309",
                  color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 2,
                }}>🔒 FINAL</span>
              )}
              {form.invoiceNumber && (
                <span style={{ fontSize: 11, color: "#0050a0", fontWeight: 600 }}>
                  Invoice: {form.invoiceNumber}
                </span>
              )}
              {locked && (
                <span style={{ fontSize: 11, color: "#7a5500" }}>
                  Read-only — Job Card is {form.invoiceId ? "invoiced" : form.status.toLowerCase()}.
                </span>
              )}
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-header"><span className="panel-title">Customer Information</span></div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <Field label="Reg. No. (Vehicle)">
              {form.id ? (
                /* Editing an existing card: this is the bike's registration,
                   not a lookup. Searching here would offer to load a different
                   job card, which is not what Edit is for. */
                <input
                  className="erp-input"
                  value={form.vehicleRegNo}
                  disabled={locked}
                  onChange={(e) => setForm((f) => ({ ...f, vehicleRegNo: e.target.value.toUpperCase() }))}
                  placeholder="Vehicle registration"
                />
              ) : (
              <SmartSearch<JobCardData>
                value={lookupQuery || form.vehicleRegNo}
                onChange={(q) => {
                  setLookupQuery(q);
                  // Live-update the reg no while typing so manual entry works too.
                  if (!form.id) setForm((f) => ({ ...f, vehicleRegNo: q.toUpperCase() }));
                }}
                fetcher={async (q, signal) => {
                  const term = q.trim();
                  if (!term) return [];
                  const r = await jobCardsApi.list(1, 30, undefined, term);
                  if (signal.aborted) return [];
                  /* The server already matches reg no, customer name and
                   * phone. Keep reg-no and phone hits so a returning customer
                   * can be found by the number they call from. */
                  const lower = term.toLowerCase();
                  const digits = term.replace(/\D/g, "");
                  return r.data.filter((j) => {
                    const reg = (j.vehicleRegNo ?? "").toLowerCase();
                    const phone = (j.customer.phone ?? "").replace(/\D/g, "");
                    return reg.includes(lower) || (digits.length >= 3 && phone.includes(digits));
                  });
                }}
                columns={[
                  { label: "Reg No", width: 120, mono: true, render: (j) => j.vehicleRegNo ?? "—" },
                  { label: "Customer", width: "1.2fr", render: (j) => j.customer.name },
                  { label: "Phone", width: 115, mono: true, render: (j) => j.customer.phone ?? "—" },
                  /* Several visits can share a reg no or a phone; the date is
                   * what tells them apart. */
                  { label: "Date", width: 90, mono: true,
                    render: (j) => new Date(j.createdAt).toLocaleDateString("en-GB",
                      { day: "2-digit", month: "short", year: "2-digit" }) },
                  { label: "Last Job", width: 110, mono: true, render: (j) => j.jobNumber },
                ]}
                keyOf={(j) => j.id}
                onPick={(j) => pickPreviousJob(j)}
                onClear={() => pickPreviousJob(null)}
                placeholder="Type vehicle reg or mobile number…"
                disabled={locked || form.id != null}
                inputClassName="erp-input"
                width="100%"
                dropdownMinWidth={560}
                onNoResultEnter={() => {
                  /* No matching bike found — clear only customer fields but
                     keep the typed vehicle reg so it carries over to the form. */
                  setForm((f) => ({
                    ...f,
                    customerId: "",
                    customerName: "",
                    cellNo: "",
                    vehicleRegNo: lookupQuery.trim(),
                  }));
                  if (customerNameRef.current) customerNameRef.current.focus();
                }}
              />
              )}
            </Field>
            <Field label="Customer Name">
              <input
                className="erp-input"
                ref={customerNameRef}
                value={form.customerName}
                disabled={locked || (!form.id && !!form.customerId)}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
            </Field>
            <Field label="Cell No.">
              <input className="erp-input" value={form.cellNo}
                disabled={locked || (!form.id && !!form.customerId)}
                maxLength={11}
                onChange={(e) => setForm({ ...form, cellNo: e.target.value.slice(0, 11) })} />
            </Field>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <div className="panel" style={{ flex: "0 0 130px" }}>
            <div className="panel-header"><span className="panel-title">Vehicle Type</span></div>
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {VEHICLE_TYPES.map((vt) => (
                <label key={vt} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, opacity: locked ? 0.6 : 1 }}>
                  <input type="radio" name="vehicleType" disabled={locked}
                    checked={form.vehicleType === vt}
                    onChange={() => setForm((f) => ({
                      ...f,
                      vehicleType: vt,
                      // Auto-fill Engine Type when empty or when it currently matches another vehicle type.
                      engineType: !f.engineType || VEHICLE_TYPES.includes(f.engineType) ? vt : f.engineType,
                    }))} />
                  {vt}
                </label>
              ))}
            </div>
          </div>

          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-header"><span className="panel-title">Vehicle / Service Info.</span></div>
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <Field label="Engine Type">
                <input className="erp-input" value={form.engineType} disabled={locked}
                  onChange={(e) => setForm({ ...form, engineType: e.target.value })} />
              </Field>
              <Field label="Meter Reading (KM)">
                <input className="erp-input" type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste} value={form.meterReading} disabled={locked}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setForm({ ...form, meterReading: e.target.value })} />
              </Field>
              <Field label="Mechanic Assigned">
                <select
                  className="erp-select"
                  value={form.mechanicId}
                  disabled={locked}
                  onChange={(e) => {
                    const id = e.target.value;
                    const m = mechanics.find((x) => x.id === id);
                    setForm({
                      ...form,
                      mechanicId: id,
                      mechanicAssigned: m?.name ?? "",
                    });
                  }}
                >
                  <option value="">— None —</option>
                  {mechanics.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.phone ? ` (${m.phone})` : ""}
                    </option>
                  ))}
                  {/* Show legacy assigned mechanic if it's no longer active so the form still displays it */}
                  {form.mechanicId &&
                    !mechanics.some((m) => m.id === form.mechanicId) &&
                    form.mechanicAssigned && (
                      <option value={form.mechanicId}>
                        {form.mechanicAssigned} (inactive)
                      </option>
                    )}
                </select>
              </Field>
              <Field label="Title (Service)">
                <input className="erp-input" value={form.title} disabled={locked}
                  placeholder="e.g. Full Service, Oil Change, Brake Repair…"
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label="Description">
                <textarea className="erp-input" rows={2} value={form.description} disabled={locked}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!locked && (
            <button className="erp-btn erp-btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : form.id ? "Update Job" : "Save Job"}
            </button>
          )}
          {form.id && !form.invoiceId && form.status !== "COMPLETED" && form.status !== "CANCELLED" && (
            <button className="erp-btn erp-btn-primary" onClick={generateInvoice} style={{ background: "#0a7a30" }}>
              Generate Invoice
            </button>
          )}
          {form.id && form.invoiceId && (
            <button className="erp-btn erp-btn-default" onClick={generateInvoice}>
              View Invoice {form.invoiceNumber}
            </button>
          )}
          <button className="erp-btn erp-btn-default" onClick={reset}>New / Refresh</button>
        </div>

        {msg && <div style={{ color: "#0050a0", fontSize: 11 }}>{msg}</div>}
        {error && <div style={{ color: "#9e2020", fontSize: 11 }}>{error}</div>}
      </div>

      {/* RIGHT — Services checklist + Recent Job Cards */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
          <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="panel-title">
              Services ({selectedServiceIds.size}/{services.length} selected)
            </span>
            <a href="/dashboard/services" style={{ fontSize: 10, color: "#0050a0" }}>
              Manage →
            </a>
          </div>
          <div style={{ padding: "4px 8px" }}>
            <input
              className="erp-input"
              placeholder="Search services…"
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ overflowY: "auto", height: 300 }}>
            {services.length === 0 ? (
              <div style={{ padding: 8, fontSize: 11, color: "#888" }}>
                No services defined. <a href="/dashboard/services" style={{ color: "#0050a0" }}>Add services</a> to use this checklist.
              </div>
            ) : (
              <table className="erp-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    <th>Service</th>
                    <th className="text-right" style={{ width: 110 }}>Labour Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {services.filter((s) => !serviceSearch || s.name.toLowerCase().includes(serviceSearch.toLowerCase())).map((s) => {
                    const checked = selectedServiceIds.has(s.id);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => !locked && toggleService(s.id)}
                        style={{
                          cursor: locked ? "not-allowed" : "pointer",
                          background: checked ? "#e7f1fb" : undefined,
                          opacity: locked ? 0.6 : 1,
                        }}
                      >
                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            disabled={locked}
                            checked={checked}
                            onChange={() => toggleService(s.id)}
                          />
                        </td>
                        <td style={{ fontWeight: checked ? 600 : 400 }}>{s.name}</td>
                        <td className="text-right" style={{
                          fontFamily: "monospace",
                          color: checked ? "#0050a0" : "#666",
                          fontWeight: checked ? 700 : 400,
                        }}>
                          {s.defaultPrice > 0 ? s.defaultPrice : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="panel-header">
            <span className="panel-title">Recent Job Cards ({recent.length})</span>
          </div>
          <div style={{ overflow: "auto", flex: 1 }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Job No</th>
                  <th>Customer</th>
                  <th>Reg No</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Invoice</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 && <tr><td colSpan={7} className="table-empty">No job cards yet.</td></tr>}
                {recent.map((j) => (
                  <tr key={j.id} onClick={() => openBill(j)} style={{ cursor: "pointer" }}
                      title="Open this job card's bill">
                    <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{j.jobNumber}</td>
                    <td>{j.customer.name}</td>
                    <td>{j.vehicleRegNo ?? "-"}</td>
                    <td>{j.title}</td>
                    <td>
                      <span style={{
                        padding: "1px 6px", background: statusBg(j.status),
                        color: "#fff", fontSize: 10, borderRadius: 2,
                      }}>{statusLabel(j.status)}</span>
                    </td>
                    <td style={{ fontFamily: "monospace" }}>
                      {j.invoice?.invoiceNumber
                        ? j.invoice.invoiceNumber
                        : <span style={{ color: "#aaa" }}>{j.jobNumber}</span>}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="erp-btn erp-btn-default"
                        style={{ padding: "1px 8px", fontSize: 10 }}
                        onClick={(e) => { e.stopPropagation(); pickRow(j); }}
                        title="Load this job card into the form"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Open=Yellow, In Progress=Blue, Completed=Green, Cancelled=Red */
function statusBg(s: JobCardStatus): string {
  switch (s) {
    case "OPEN": return "#d97706";
    case "IN_PROGRESS": return "#0050a0";
    case "COMPLETED": return "#0a7a30";
    case "CANCELLED": return "#9e2020";
  }
}

function statusLabel(s: JobCardStatus): string {
  switch (s) {
    case "OPEN": return "Open";
    case "IN_PROGRESS": return "In Progress";
    case "COMPLETED": return "Completed";
    case "CANCELLED": return "Cancelled";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field-group">
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}
