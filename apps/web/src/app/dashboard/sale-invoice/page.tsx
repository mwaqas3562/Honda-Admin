"use client";

import { blockDecimalKeys, blockDecimalPaste } from "@/lib/intInput";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInvoiceDelete, useInvoiceSave } from "@/hooks/useInvoice";
import { useParts } from "@/hooks/useInventory";
import { useUserRole } from "@/hooks/useUserRole";
import { jobCardsApi, partsApi, servicesApi, invoiceApi, type InvoiceData, type JobCardData, type PartData, type ServiceData } from "@/lib/api";
import SmartSearch from "@/components/SmartSearch";
import InvoicePreviewModal from "@/components/invoice/InvoicePreviewModal";

export type InvoiceLineItem = {
  id: string;
  partId?: string | null;
  costPrice?: number;
  itemCode: string;
  itemName: string;
  qty: number;
  rate: number;
  total: number;
  remarks: string;
};

const TODAY = new Date().toISOString().slice(0, 10);
const emptyEntry = (): Omit<InvoiceLineItem, "id" | "total"> => ({
  partId: null, costPrice: 0,
  itemCode: "", itemName: "", qty: 1, rate: 0, remarks: "",
});

export default function SaleInvoicePage() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading…</div>}>
      <SaleInvoiceInner />
    </Suspense>
  );
}

function SaleInvoiceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectJobCardId = searchParams.get("jobCardId");
  const preselectInvoiceId = searchParams.get("invoiceId");

  /* ── Job Card search/selection ───────────────────────────── */
  const [jcSearch, setJcSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobCardData | null>(null);
  /* ── Parts catalogue (for product picker) ──────────────── */
  const { data: partsList, fetch: fetchParts } = useParts();
  useEffect(() => { fetchParts(1, 500); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const parts: PartData[] = partsList?.data ?? [];
  const [extraParts, setExtraParts] = useState<PartData[]>([]);
  const [partQuery, setPartQuery] = useState("");
  const [pickedPart, setPickedPart] = useState<PartData | null>(null);
  const partsById = useMemo(
    () => new Map([...parts, ...extraParts].map((p) => [p.id, p])),
    [parts, extraParts]
  );

  /* ── Invoice form state ──────────────────────────────────── */
  const [date, setDate]           = useState(TODAY);
  const [jobDetail, setJobDetail] = useState("");
  const [cellNo, setCellNo]       = useState("");
  const [saleTerm, setSaleTerm]   = useState("BY CASH");
  const [entry, setEntry]         = useState(emptyEntry());
  const [items, setItems]         = useState<InvoiceLineItem[]>([]);
  const [labourEntry, setLabourEntry] = useState<{ name: string; description: string; amount: number }>(
    { name: "", description: "", amount: 0 }
  );
  const [discountAmt, setDiscountAmt] = useState(0);
  const [cashRcv, setCashRcv]     = useState(0);
  const [savedId, setSavedId]     = useState<string | null>(null);
  const [savedNo, setSavedNo]     = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<string>("DRAFT");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [autoPrint, setAutoPrint] = useState(false);

  /* ── Invoice search (load existing invoice) ────────────── */
  const [invSearch, setInvSearch] = useState("");
  const invSearchResultsRef = useRef<InvoiceData[]>([]);
  const [meterReading, setMeterReading] = useState("");

  /* ── Refs for keyboard navigation in parts entry ─────── */
  const partSearchRef = useRef<HTMLInputElement | null>(null);
  const qtyRef = useRef<HTMLInputElement | null>(null);
  const rateRef = useRef<HTMLInputElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);

  /* Read-only view mode: completed (non-DRAFT) loaded invoice. */
  const isView = !!savedId && savedStatus !== "DRAFT";

  const { save, update, saving, error: saveError } = useInvoiceSave();
  const { remove, deleting, error: deleteError } = useInvoiceDelete();
  const { canDelete } = useUserRole();

  /* ── Pre-select if URL has ?jobCardId ────────────────────── */
  useEffect(() => {
    if (!preselectJobCardId) return;
    let cancelled = false;
    (async () => {
      try {
        const j = await jobCardsApi.get(preselectJobCardId);
        if (!cancelled) selectJob(j);
      } catch { /* ignored */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectJobCardId]);

  /* ── Load existing invoice if URL has ?invoiceId ───────── */
  useEffect(() => {
    if (!preselectInvoiceId) return;
    let cancelled = false;
    (async () => {
      try {
        const inv = await invoiceApi.get(preselectInvoiceId);
        if (cancelled) return;
        applyLoadedInvoice(inv);
        // Pre-fill the linked Job Card.
        if (inv.jobCard) {
          const j = await jobCardsApi.get(inv.jobCard.id).catch(() => null);
          if (!cancelled && j) selectJob(j);
        }
      } catch (e: unknown) {
        if (!cancelled) setStatusMsg(e instanceof Error ? e.message : "Failed to load invoice.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectInvoiceId]);

  /* Hydrate form state from a fetched invoice. Shared by URL preselect
     and the in-page Search Invoice picker. */
  function applyLoadedInvoice(inv: InvoiceData) {
    setSavedId(inv.id);
    setSavedNo(inv.invoiceNumber);
    setSavedStatus(inv.status);
    setDiscountAmt(Math.round(Number(inv.discountAmt ?? 0)));
    setCashRcv(Number(inv.paidAmount));
    setSaleTerm(inv.saleTerm ?? "BY CASH");
    setJobDetail(inv.jobDetail ?? "");
    setCellNo(inv.cellNo ?? "");
    setMeterReading(inv.jobCard?.meterReading != null ? String(inv.jobCard.meterReading) : "");
    setItems(
      inv.items.map((i) => {
        const qty = Number(i.qty);
        const rate = Number(i.rate);
        const total = Number(i.total);
        return {
          id: crypto.randomUUID(),
          partId: i.partId ?? null,
          costPrice: Number(i.costPrice ?? 0),
          itemCode: i.itemCode ?? "",
          itemName: i.itemName,
          qty,
          rate,
          total: total || qty * rate,
          remarks: i.remarks ?? "",
        };
      }),
    );
    setStatusMsg(`Loaded: ${inv.invoiceNumber} (${inv.status})`);
  }

  async function loadInvoiceById(id: string) {
    try {
      const inv = await invoiceApi.get(id);
      applyLoadedInvoice(inv);
      if (inv.jobCard) {
        const j = await jobCardsApi.get(inv.jobCard.id).catch(() => null);
        if (j) selectJob(j);
      }
      setInvSearch("");
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "Failed to load invoice.");
    }
  }

  /* ── Close dropdown on outside click ── (handled by SmartSearch) */

  function selectJob(j: JobCardData) {
    setSelectedJob(j);
    setJcSearch(`${j.jobNumber} — ${j.customer.name}`);
    setCellNo(j.customer.phone ?? "");
    setJobDetail(j.title);
    setMeterReading(j.meterReading != null ? String(j.meterReading) : "");
    // Auto-seed labour items from the services selected on the Job Card.
    // The Job Card's `title` is set as a comma-joined list of service names
    // when services are picked from the checklist on the Issue Job screen.
    // We skip seeding when loading an existing invoice (savedId set) or when
    // labour items already exist on the form.
    if (savedId) return;
    setTimeout(() => partSearchRef.current?.focus(), 0);
    const names = (j.title || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    void (async () => {
      try {
        const r = await servicesApi.list({ activeOnly: true });
        const byName = new Map<string, ServiceData>();
        for (const s of r.data) byName.set(s.name.toLowerCase(), s);
        const matched = names
          .map((n) => byName.get(n.toLowerCase()))
          .filter((s): s is ServiceData => !!s);
        if (matched.length === 0) return;
        setItems((prev) => {
          // Don't seed if the user already has labour items.
          if (prev.some((i) => !i.partId)) return prev;
          const seeded = matched.map((s) => ({
            id: crypto.randomUUID(),
            partId: null,
            costPrice: 0,
            itemCode: "",
            itemName: s.name,
            qty: 1,
            rate: s.defaultPrice,
            total: s.defaultPrice,
            remarks: s.description ?? "",
          }));
          return [...prev, ...seeded];
        });
      } catch {
        /* silent — seeding is a convenience, not critical */
      }
    })();
  }

  function clearJob() {
    setSelectedJob(null);
    setJcSearch("");
    setCellNo("");
    setJobDetail("");
  }

  /* ── Money math ──────────────────────────────────────────── */
  const partItems   = useMemo(() => items.filter((i) => !!i.partId), [items]);
  const labourItems = useMemo(() => items.filter((i) => !i.partId), [items]);
  const partsTotal  = partItems.reduce((s, i) => s + i.total, 0);
  const labourTotal = labourItems.reduce((s, i) => s + i.total, 0);
  const gross       = partsTotal + labourTotal;
  const effectiveDiscount = Math.min(Math.max(0, Math.floor(discountAmt)), gross);
  const subTotal    = gross - effectiveDiscount;
  const balance     = subTotal - cashRcv;
  // Qty. Bal. should show inventory count for selected part
  const qtyBal = pickedPart ? pickedPart.stockQty : 0;
  const entryTotal  = Number(entry.qty) * Number(entry.rate);

  /* ── Stock validation: total demand vs current stock per part ─── */
  const stockWarnings = useMemo(() => {
    const demand = new Map<string, number>();
    for (const i of items) {
      if (!i.partId) continue;
      demand.set(i.partId, (demand.get(i.partId) ?? 0) + i.qty);
    }
    const warnings: string[] = [];
    for (const [pid, qty] of demand) {
      const p = partsById.get(pid);
      if (!p) continue;
      if (qty > p.stockQty) {
        warnings.push(`${p.name}: need ${qty}, in stock ${p.stockQty}`);
      }
    }
    return warnings;
  }, [items, partsById]);

  function pickPart(part: PartData | null) {
    if (!part) {
      setEntry((p) => ({ ...p, partId: null, itemCode: "", itemName: "", rate: 0, costPrice: 0 }));
      setPickedPart(null);
      setPartQuery("");
      return;
    }
    if (!partsById.has(part.id)) setExtraParts((p) => [...p, part]);
    setEntry((p) => ({
      ...p,
      partId: part.id,
      itemCode: part.sku,
      itemName: part.name,
      rate: Number(part.sellingPrice) || Number(part.unitPrice) || 0,
      costPrice: Number(part.costPrice) || 0,
    }));
    setPickedPart(part);
    setPartQuery(part.name); // Show picked part in search field
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  function addItem() {
    if (!entry.itemName.trim()) return;
    setItems((p) => [...p, { ...entry, id: crypto.randomUUID(), total: entryTotal }]);
    setEntry(emptyEntry());
    setPickedPart(null);
    setPartQuery("");
    setTimeout(() => partSearchRef.current?.focus(), 0);
  }

  function addLabour() {
    const name = labourEntry.name.trim();
    const amount = Math.max(0, Math.floor(Number(labourEntry.amount) || 0));
    if (!name) { setStatusMsg("Service name is required."); return; }
    if (amount <= 0) { setStatusMsg("Labour amount must be greater than 0."); return; }
    setItems((p) => [...p, {
      id: crypto.randomUUID(),
      partId: null,
      costPrice: 0,
      itemCode: "",
      itemName: name,
      qty: 1,
      rate: amount,
      total: amount,
      remarks: labourEntry.description.trim(),
    }]);
    setLabourEntry({ name: "", description: "", amount: 0 });
  }

  function resetForm() {
    clearJob();
    setDate(TODAY); setSaleTerm("BY CASH"); setEntry(emptyEntry());
    setItems([]); setDiscountAmt(0); setCashRcv(0);
    setLabourEntry({ name: "", description: "", amount: 0 });
    setSavedId(null); setSavedNo(null); setStatusMsg(null);
    setSavedStatus("DRAFT"); setMeterReading("");
    setPartQuery(""); setInvSearch("");
    if (searchParams.get("jobCardId") || searchParams.get("invoiceId")) {
      router.replace("/dashboard/sale-invoice");
    }
  }

  function buildPayload(asPaid = false) {
    const grossNow = items.reduce((s, i) => s + Number(i.qty) * Number(i.rate), 0);
    const safeDisc = Math.min(Math.max(0, Math.floor(discountAmt)), grossNow);
    const pct = grossNow > 0 ? (safeDisc / grossNow) * 100 : 0;
    return {
      jobCardId: selectedJob!.id,
      jobDetail,
      cellNo,
      saleTerm,
      discountPct: pct,
      paidAmount: cashRcv,
      status: asPaid ? ("PAID" as const) : ("DRAFT" as const),
      items: items.map((i) => ({
        partId: i.partId ?? undefined,
        itemCode: i.itemCode || undefined,
        itemName: i.itemName,
        qty: i.qty,
        rate: i.rate,
        costPrice: i.costPrice,
        remarks: i.remarks || undefined,
      })),
    };
  }

  async function handleSave() {
    if (!selectedJob) { setStatusMsg("Select a Job Card first."); return; }
    if (items.length === 0) { setStatusMsg("Add at least one item."); return; }
    // Existing DRAFT → update in place. Otherwise create a new invoice.
    if (savedId && savedStatus === "DRAFT") {
      const grossNow = items.reduce((s, i) => s + Number(i.qty) * Number(i.rate), 0);
      const safeDisc = Math.min(Math.max(0, Math.floor(discountAmt)), grossNow);
      const pct = grossNow > 0 ? (safeDisc / grossNow) * 100 : 0;
      const inv = await update(savedId, {
        jobDetail,
        cellNo,
        saleTerm,
        discountPct: pct,
        paidAmount: cashRcv,
        status: "DRAFT",
        items: items.map((i) => ({
          partId: i.partId ?? undefined,
          itemCode: i.itemCode || undefined,
          itemName: i.itemName,
          qty: i.qty,
          rate: i.rate,
          costPrice: i.costPrice,
          remarks: i.remarks || undefined,
        })),
      });
      if (inv) {
        setSavedStatus(inv.status);
        setStatusMsg(`Updated draft: ${inv.invoiceNumber}`);
      }
      return;
    }
    const inv = await save(buildPayload(false));
    if (inv) {
      setSavedId(inv.id);
      setSavedNo(inv.invoiceNumber);
      setSavedStatus(inv.status);
      setStatusMsg(`Saved: ${inv.invoiceNumber}`);
    }
  }

  async function handlePay() {
    if (stockWarnings.length > 0) {
      setStatusMsg(`Insufficient stock — ${stockWarnings.join("; ")}`);
      return;
    }
    if (!savedId) {
      if (!selectedJob) { setStatusMsg("Select a Job Card first."); return; }
      if (items.length === 0) { setStatusMsg("Add at least one item."); return; }
      const inv = await save(buildPayload(true));
      if (inv) {
        setSavedId(inv.id);
        setSavedNo(inv.invoiceNumber);
        setSavedStatus(inv.status);
        setStatusMsg(`Paid: ${inv.invoiceNumber}. Stock deducted, Job Card auto-completed.`);
        fetchParts(1, 500);
        setAutoPrint(true);
        setPreviewOpen(true);
      }
      return;
    }
    const inv = await update(savedId, { status: "PAID", paidAmount: cashRcv });
    if (inv) {
      setSavedStatus(inv.status);
      setStatusMsg(`Paid: ${inv.invoiceNumber}. Stock deducted, Job Card auto-completed.`);
      fetchParts(1, 500);
      setAutoPrint(true);
      setPreviewOpen(true);
    }
  }

  async function handleDelete() {
    if (!canDelete) { setStatusMsg("You are not allowed to delete invoices."); return; }
    if (!savedId) { setStatusMsg("No saved invoice to delete."); return; }
    if (!confirm("Delete this invoice?")) return;
    const ok = await remove(savedId);
    if (ok) { resetForm(); setStatusMsg("Invoice deleted."); }
  }

  const customerName = selectedJob?.customer.name ?? "";
  const vehicleReg   = selectedJob?.vehicleRegNo ?? "";
  const invNoDisplay = savedNo ?? "(auto on save)";

  return (
    <div className="si-wrapper">
      <div className="si-titlebar">
        <span className="si-title">SALE INVOICE</span>
        <div className="si-titlebar-right">
          <span className="si-time">
            Time : {new Date().toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      <div className="si-form-area">

        {/* Row 0 — Search existing invoice (Job No / Invoice No / Customer Name) */}
        <div className="si-row" style={{ background: "#f8fafc", padding: "6px 8px", borderRadius: 4, border: "1px solid #d6e0ec" }}>
          <label className="si-lbl" style={{ width: 110, color: "#0050a0", fontWeight: 700 }}>
            Search Invoice
          </label>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SmartSearch<InvoiceData>
              value={invSearch}
              onChange={(q) => setInvSearch(q)}
              fetcher={async (q, signal) => {
                const term = q.trim().toLowerCase();
                if (!term) { invSearchResultsRef.current = []; return []; }
                const r = await invoiceApi.list(1, 50, term);
                if (signal.aborted) return [];
                const filtered = r.data.filter((i) =>
                  (i.invoiceNumber ?? "").toLowerCase().includes(term) ||
                  (i.jobCard?.jobNumber ?? "").toLowerCase().includes(term) ||
                  (i.customer?.name ?? "").toLowerCase().includes(term) ||
                  (i.jobCard?.vehicleRegNo ?? "").toLowerCase().includes(term)
                );
                invSearchResultsRef.current = filtered;
                return filtered;
              }}
              columns={[
                { label: "Invoice #", width: 120, mono: true, render: (i) => i.invoiceNumber },
                { label: "Job No", width: 110, mono: true, render: (i) => i.jobCard?.jobNumber ?? "—" },
                { label: "Customer", width: "1.2fr", render: (i) => i.customer?.name ?? "—" },
                { label: "Vehicle", width: 100, mono: true, render: (i) => i.jobCard?.vehicleRegNo ?? "—" },
                {
                  label: "Status",
                  width: 80,
                  render: (i) => (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                      background: i.status === "PAID" ? "#dcfce7"
                        : i.status === "DRAFT" ? "#fef3c7" : "#e5e7eb",
                      color: i.status === "PAID" ? "#166534"
                        : i.status === "DRAFT" ? "#92400e" : "#374151",
                    }}>{i.status}</span>
                  ),
                },
                { label: "Date", width: 90, mono: true, render: (i) => (i.createdAt ?? "").slice(0, 10) },
              ]}
              keyOf={(i) => i.id}
              onPick={(i) => loadInvoiceById(i.id)}
              onClear={() => setInvSearch("")}
              onNoResultEnter={() => {
                const results = invSearchResultsRef.current;
                if (results.length > 0) loadInvoiceById(results[0].id);
              }}
              placeholder="Type Job No to search invoice…"
              inputClassName="si-input"
              width="100%"
              dropdownMinWidth={680}
              emptyMessage="No invoice found"
            />
          </div>
        </div>

        {/* Row 1 — Inv #, Job No (searchable), Date */}
        <div className="si-row">
          <label className="si-lbl" style={{ width: 70 }}>Inv. #</label>
          <input className="si-input si-input-blue" value={invNoDisplay} readOnly style={{ width: 160 }} />

          <label className="si-lbl" style={{ width: 70, marginLeft: 16 }}>Job No</label>
          <div style={{ width: 320 }}>
            <SmartSearch<JobCardData>
              value={jcSearch}
              onChange={(q) => {
                setJcSearch(q);
                if (selectedJob) setSelectedJob(null);
              }}
              fetcher={async (q, signal) => {
                const r = await jobCardsApi.list(1, 50, undefined, q.trim() || undefined);
                if (signal.aborted) return [];
                return r.data.filter((j) => j.status === "OPEN" || j.status === "IN_PROGRESS");
              }}
              columns={[
                { label: "Job No", width: 130, mono: true, render: (j) => j.jobNumber },
                { label: "Reg No", width: 100, mono: true, render: (j) => j.vehicleRegNo ?? "—" },
                { label: "Customer", width: "1.2fr", render: (j) => j.customer.name },
                { label: "Phone", width: 110, mono: true, render: (j) => j.customer.phone ?? "—" },
                { label: "Title", width: "1fr", render: (j) => j.title },
              ]}
              keyOf={(j) => j.id}
              onPick={(j) => selectJob(j)}
              onClear={() => clearJob()}
              placeholder="Search Job# / customer / vehicle…"
              disabled={!!savedId}
              showClear={!selectedJob || !savedId}
              inputClassName="si-input"
              width="100%"
              dropdownMinWidth={620}
              emptyMessage="No Job Cards found."
            />
          </div>

          <div className="si-spacer" />
          <label className="si-lbl" style={{ whiteSpace: "nowrap" }}>Entry Date :</label>
          <input className="si-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 140 }} />
        </div>

        {/* Row 2 — Customer, Cell No, Vehicle Reg, Meter (one line) */}
        <div className="si-row" style={{ flexWrap: "nowrap" }}>
          <label className="si-lbl" style={{ width: 70, flexShrink: 0 }}>Customer</label>
          <input className="si-input" style={{ flex: 1, minWidth: 0 }} value={customerName} readOnly placeholder="(auto from Job Card)" />
          <label className="si-lbl" style={{ marginLeft: 8, flexShrink: 0 }}>Cell No:</label>
          <input className="si-input" style={{ width: 110, flexShrink: 0 }} value={cellNo}
            onChange={(e) => setCellNo(e.target.value)} />
          <label className="si-lbl" style={{ marginLeft: 8, flexShrink: 0 }}>Bike Reg:</label>
          <input className="si-input" style={{ width: 110, flexShrink: 0 }} value={vehicleReg} readOnly />
          <label className="si-lbl" style={{ marginLeft: 8, flexShrink: 0 }}>Meter (KM):</label>
          <input
            className={isView ? "si-input si-input-plain" : "si-input si-input-yellow"}
            style={{ width: 90, flexShrink: 0 }}
            type="number"
            min={0}
            value={meterReading}
            readOnly={isView}
            placeholder="e.g. 12500"
            onFocus={(e) => e.target.select()}
            onChange={(e) => setMeterReading(e.target.value)}
          />
        </div>
        <div className="si-row">
          <label className="si-lbl" style={{ width: 70 }}>Jobs Detail:</label>
          <input className="si-input" style={{ flex: 1 }} value={jobDetail}
            onChange={(e) => setJobDetail(e.target.value)} />
          <label className="si-lbl" style={{ marginLeft: 24, whiteSpace: "nowrap" }}>Sale Term :</label>
          <select className="si-select" style={{ width: 140, marginLeft: 6 }}
            value={saleTerm} onChange={(e) => setSaleTerm(e.target.value)}>
            <option>BY CASH</option>
            <option>BY ONLINE</option>
          </select>
        </div>

        {/* Row 4 — Cell No */}
        {/* Row 5 — Meter Reading */}
        {/* (merged into Row 2 above) */}

        {/* Item entry */}
        {!isView && (
        <div className="si-row si-item-entry" style={{ flexWrap: "nowrap" }}>
          <label className="si-lbl">Item Name</label>
          <div style={{ width: 780, minWidth: 0, flexShrink: 0 }}>
            <SmartSearch<PartData>
              value={partQuery}
              onChange={(q) => {
                setPartQuery(q);
                setEntry((p) => ({ ...p, itemName: q }));
                setPickedPart(null); // Clear picked part if user types
              }}
              fetcher={async (q, signal) => {
                const r = await partsApi.list(1, 50, q);
                if (signal.aborted) return [];
                return r.data;
              }}
              columns={[
                { label: "SKU", width: 110, mono: true, render: (p) => p.sku },
                { label: "Name", width: "1fr", render: (p) => p.name },
                {
                  label: "Stock",
                  width: 80,
                  align: "right",
                  render: (p) => (
                    <span style={{ color: p.stockQty <= 0 ? "#c00" : p.stockQty <= p.minStockLevel ? "#d97706" : "#080", fontWeight: 600 }}>
                      {p.stockQty}{p.stockQty <= p.minStockLevel ? " \u26A0" : ""}
                    </span>
                  ),
                },
                {
                  label: "Purchase",
                  width: 90,
                  align: "right",
                  render: (p) => Number(p.costPrice ?? 0),
                },
                {
                  label: "Sale",
                  width: 90,
                  align: "right",
                  render: (p) => Number(p.sellingPrice ?? p.unitPrice ?? 0),
                },
              ]}
              keyOf={(p) => p.id}
              onPick={(p) => pickPart(p)}
              onClear={() => pickPart(null)}
              placeholder="Search item name or SKU…"
              width="100%"
              dropdownMinWidth={780}
              inputRef={partSearchRef}
            />
          </div>
          <label className="si-lbl" style={{ marginLeft: 8 }}>Qty. Bal.</label>
          <input className="si-input si-input-yellow" style={{ width: 60 }} value={qtyBal} readOnly />
          <label className="si-lbl" style={{ marginLeft: 8 }}>Qty:</label>
          <input className="si-input" style={{ width: 55 }} type="number" onKeyDown={(e) => { blockDecimalKeys(e); if (e.key === "Enter") { e.preventDefault(); rateRef.current?.focus(); } }} onPaste={blockDecimalPaste} min={1} value={entry.qty}
            ref={qtyRef}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setEntry((p) => ({ ...p, qty: Number(e.target.value) }))} />
          <label className="si-lbl" style={{ marginLeft: 8 }}>Sale Rate:</label>
          <input className="si-input si-input-yellow" style={{ width: 75 }} type="number" onKeyDown={(e) => { blockDecimalKeys(e); if (e.key === "Enter") { e.preventDefault(); addBtnRef.current?.focus(); } }} onPaste={blockDecimalPaste} step="1" value={entry.rate}
            ref={rateRef}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setEntry((p) => ({ ...p, rate: Number(e.target.value) }))} />
          <label className="si-lbl" style={{ marginLeft: 8 }}>Total:</label>
          <input className="si-input si-input-yellow" style={{ width: 85 }} value={entryTotal} readOnly />
          <button ref={addBtnRef} className="erp-btn erp-btn-primary" type="button" style={{ marginLeft: 8, whiteSpace: "nowrap" }} onClick={addItem}>Add</button>
        </div>
        )}

        {/* Items table */}
        {stockWarnings.length > 0 && (
          <div style={{
            padding: "6px 10px", background: "#fde2e2", color: "#9e2020",
            fontSize: 11, fontWeight: 600, borderRadius: 2, margin: "6px 0",
          }}>
            ⚠ Insufficient stock — {stockWarnings.join("; ")}
          </div>
        )}
        <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "#444" }}>
          PARTS
        </div>
        <table className="erp-table si-items-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Item Name</th>
              <th style={{ width: 70 }} className="text-right">Qty</th>
              <th style={{ width: 90 }} className="text-right">Rate</th>
              <th style={{ width: 100 }} className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {partItems.length === 0 ? (
              <tr><td className="si-star">*</td><td colSpan={4} style={{ color: "#888", fontStyle: "italic" }}>No parts added.</td></tr>
            ) : (
              partItems.map((item) => (
                <tr key={item.id}>
                  <td className="text-center">
                    {!isView && (
                      <button className="erp-btn-danger-sm"
                        onClick={() => setItems((p) => p.filter((i) => i.id !== item.id))}>✕</button>
                    )}
                  </td>
                  <td>{item.itemName} {item.itemCode ? `(${item.itemCode})` : ""}</td>
                  <td className="text-right">
                    {!isView ? (
                      <input
                        className="si-input"
                        type="number"
                        min={1}
                        style={{ width: 60, textAlign: "right" }}
                        value={item.qty}
                        onChange={e => {
                          const qty = Number(e.target.value);
                          setItems(items => items.map(i => i.id === item.id ? { ...i, qty, total: qty * i.rate } : i));
                        }}
                      />
                    ) : (
                      item.qty
                    )}
                  </td>
                  <td className="text-right">
                    {!isView ? (
                      <input
                        className="si-input"
                        type="number"
                        min={0}
                        style={{ width: 70, textAlign: "right" }}
                        value={item.rate}
                        onChange={e => {
                          const rate = Number(e.target.value);
                          setItems(items => items.map(i => i.id === item.id ? { ...i, rate, total: rate * i.qty } : i));
                        }}
                      />
                    ) : (
                      item.rate
                    )}
                  </td>
                  <td className="text-right">{item.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Labour entry */}
        <div style={{
          marginTop: 10, padding: 8,
          background: "#f7faff", border: "1px solid #c6d4ec", borderRadius: 4,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0050a0", marginBottom: 6 }}>
            LABOUR / SERVICE
            <span style={{ fontWeight: 400, color: "#666", marginLeft: 8 }}>
              (no stock deduction)
            </span>
          </div>
          {!isView && (
          <div className="si-row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label className="si-lbl" style={{ width: 70 }}>Service</label>
            <div style={{ width: 280 }}>
              <SmartSearch<ServiceData>
                value={labourEntry.name}
                onChange={(q) => setLabourEntry((p) => ({ ...p, name: q }))}
                fetcher={async (q, signal) => {
                  const r = await servicesApi.list({ q: q.trim() || undefined, activeOnly: true });
                  if (signal.aborted) return [];
                  return r.data;
                }}
                columns={[
                  { label: "Service", width: "1.4fr", render: (s) => s.name },
                  {
                    label: "Default Rate",
                    width: 110,
                    align: "right",
                    mono: true,
                    render: (s) => (s.defaultPrice > 0 ? s.defaultPrice : "—"),
                  },
                  {
                    label: "Description",
                    width: "1fr",
                    render: (s) => s.description ?? "—",
                  },
                ]}
                keyOf={(s) => s.id}
                onPick={(s) =>
                  setLabourEntry((p) => ({
                    ...p,
                    name: s.name,
                    amount: s.defaultPrice > 0 ? s.defaultPrice : p.amount,
                    description: p.description || s.description || "",
                  }))
                }
                onClear={() => setLabourEntry((p) => ({ ...p, name: "" }))}
                placeholder="Type or pick a service…"
                inputClassName="si-input"
                width="100%"
                dropdownMinWidth={520}
                emptyMessage="No services found. Type a custom service name."
              />
            </div>

            <label className="si-lbl" style={{ marginLeft: 6 }}>Description</label>
            <input
              className="si-input"
              placeholder="(optional)"
              value={labourEntry.description}
              style={{ flex: 1, minWidth: 160 }}
              onChange={(e) => setLabourEntry((p) => ({ ...p, description: e.target.value }))}
            />

            <label className="si-lbl" style={{ marginLeft: 6 }}>Amount</label>
            <input
              className="si-input si-input-yellow"
              type="number"
              min={0}
              step={1}
              onKeyDown={blockDecimalKeys}
              onPaste={blockDecimalPaste}
              onFocus={(e) => e.target.select()}
              value={labourEntry.amount}
              style={{ width: 100 }}
              onChange={(e) => setLabourEntry((p) => ({ ...p, amount: Number(e.target.value) }))}
            />
            <button
              className="erp-btn erp-btn-primary"
              type="button"
              style={{ marginLeft: 6 }}
              onClick={addLabour}
            >
              + Add Labour
            </button>
          </div>
          )}

          <table className="erp-table si-items-table" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Service</th>
                <th>Description</th>
                <th style={{ width: 100 }} className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {labourItems.length === 0 ? (
                <tr>
                  <td className="si-star">*</td>
                  <td colSpan={3} style={{ color: "#888", fontStyle: "italic" }}>
                    No labour added.
                  </td>
                </tr>
              ) : (
                labourItems.map((item) => (
                  <tr key={item.id}>
                    <td className="text-center">
                      {!isView && (
                        <button className="erp-btn-danger-sm"
                          onClick={() => setItems((p) => p.filter((i) => i.id !== item.id))}>✕</button>
                      )}
                    </td>
                    <td>{item.itemName}</td>
                    <td>{item.remarks}</td>
                    <td className="text-right">
                      {!isView ? (
                        <input
                          className="si-input"
                          type="number"
                          min={0}
                          style={{ width: 80, textAlign: "right" }}
                          value={item.rate}
                          onChange={e => {
                            const rate = Number(e.target.value);
                            setItems(items => items.map(i => i.id === item.id ? { ...i, rate, total: rate * i.qty } : i));
                          }}
                        />
                      ) : (
                        item.total
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom totals */}
        <div className="si-bottom">
          <div className="si-summary">
            <div className="si-sum-row">
              <span className="si-sum-lbl">Parts Total</span>
              <input className="si-input si-input-plain" value={partsTotal} readOnly style={{ width: 110 }} />
            </div>
            <div className="si-sum-row">
              <span className="si-sum-lbl">Labour Total</span>
              <input className="si-input si-input-plain" value={labourTotal} readOnly style={{ width: 110 }} />
            </div>
            <div className="si-sum-row">
              <span className="si-sum-lbl">Total</span>
              <input className="si-input si-input-plain" value={gross} readOnly style={{ width: 110 }} />
            </div>
            <div className="si-sum-row">
              <span className="si-sum-lbl">Discount</span>
              <input className={isView ? "si-input si-input-plain" : "si-input si-input-yellow"} type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste} min={0} step={1}
                value={discountAmt}
                readOnly={isView}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setDiscountAmt(Number(e.target.value))} style={{ width: 110 }} />
            </div>
            <div className="si-sum-row">
              <span className="si-sum-lbl">Sub Total</span>
              <input className="si-input si-input-cyan" value={subTotal} readOnly style={{ width: 110 }} />
            </div>
            <div className="si-sum-row">
              <span className="si-sum-lbl">Cash Receiv.</span>
              <input className={isView ? "si-input si-input-plain" : "si-input"} type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste} step="1" min={0}
                value={cashRcv}
                readOnly={isView}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setCashRcv(Number(e.target.value))} style={{ width: 110 }} />
            </div>
            <div className="si-sum-row">
              <span className="si-sum-lbl">Balance</span>
              <input className="si-input si-input-plain" value={balance} readOnly style={{ width: 110 }} />
            </div>
          </div>
        </div>

      </div>

      <div className="si-footer">
        <button className="si-foot-btn" type="button" onClick={resetForm}>📄 Add New</button>
        {!isView && (
          <>
            <button className="si-foot-btn erp-btn-primary" type="button" onClick={handleSave}
              disabled={saving || (!!savedId && savedStatus !== "DRAFT")}>
              {saving ? "Saving…" : savedId && savedStatus === "DRAFT" ? "💾 Update Draft" : "💾 Save Draft"}
            </button>
            <button className="si-foot-btn" type="button" onClick={handlePay} disabled={saving}
              style={{ background: "#0a7a30", color: "#fff" }}>
              {saving ? "…" : "✓ Mark as Paid"}
            </button>
            {canDelete && (
              <button className="si-foot-btn si-foot-delete" type="button" onClick={handleDelete}
                disabled={deleting || !savedId}>
                {deleting ? "Deleting…" : "✕ Delete"}
              </button>
            )}
          </>
        )}
        <button className="si-foot-btn" type="button" onClick={() => {
          if (!savedId) { setStatusMsg("Save the invoice before previewing."); return; }
          setAutoPrint(false); setPreviewOpen(true);
        }}>🖨 Preview</button>
        {isView && (
          <button className="si-foot-btn" type="button" onClick={resetForm}
            style={{ background: "#475569", color: "#fff" }}>
            ⎋ Exit
          </button>
        )}
        {(statusMsg || saveError || deleteError) && (
          <span className={`si-status-msg ${saveError || deleteError ? "si-status-error" : "si-status-ok"}`}>
            {saveError ?? deleteError ?? statusMsg}
          </span>
        )}
      </div>

      {previewOpen && savedId && (
        <InvoicePreviewModal
          invoiceId={savedId}
          status={savedStatus}
          canMarkPaid
          marking={saving}
          onMarkPaid={async () => { await handlePay(); }}
          onClose={() => { setPreviewOpen(false); setAutoPrint(false); }}
          autoPrint={autoPrint}
        />
      )}

    </div>
  );
}
