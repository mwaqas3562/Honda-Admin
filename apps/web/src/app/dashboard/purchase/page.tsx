"use client";

import { blockDecimalKeys, blockDecimalPaste } from "@/lib/intInput";
import { useMemo, useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  partsApi,
  purchasesApi,
  vendorsApi,
  type PartData,
  type PurchaseItemPayload,
  type PurchaseData,
  type VendorData,
} from "@/lib/api";
import SmartSearch from "@/components/SmartSearch";

type AddedItem = {
  rowId: string;
  partId: string;
  sku: string;
  name: string;
  stockQty: number;
  qty: number;
  rate: number;
  total: number;
};

const newRowId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function PurchasePage() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading…</div>}>
      <PurchaseScreen />
    </Suspense>
  );
}

function PurchaseScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // header
  const [vendorId, setVendorId] = useState("");
  const [vendorLabel, setVendorLabel] = useState("");
  const [notes, setNotes] = useState("");

  // entry row
  const [partSearch, setPartSearch] = useState("");
  const [entryPart, setEntryPart] = useState<PartData | null>(null);
  const [entryQty, setEntryQty] = useState<number>(1);
  const [entryRate, setEntryRate] = useState<number>(0);

  // added items
  const [items, setItems] = useState<AddedItem[]>([]);

  // totals
  const [cashPaid, setCashPaid] = useState<number>(0);
  const [salesTax, setSalesTax] = useState<number>(0);

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nextPurchaseNo, setNextPurchaseNo] = useState<string>("…");

  /* An existing purchase opens read-only. It has already moved stock, so
     editing one would need the movement reversed and re-applied — a different
     job from this screen, which exists to enter new stock. */
  const [openedPurchase, setOpenedPurchase] = useState<PurchaseData | null>(null);
  const [poSearch, setPoSearch] = useState("");
  const viewing = openedPurchase !== null;

  const partSearchRef = useRef<HTMLInputElement | null>(null);
  const qtyRef = useRef<HTMLInputElement | null>(null);
  const rateRef = useRef<HTMLInputElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { partSearchRef.current?.focus(); }, []);

  function refreshNextPurchaseNo() {
    purchasesApi.nextNumber().then((r) => setNextPurchaseNo(r.nextNumber)).catch(() => {});
  }
  useEffect(refreshNextPurchaseNo, []);

  const netTotal = useMemo(() => items.reduce((s, i) => s + i.total, 0), [items]);
  const totalQty = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);
  const total = netTotal + (Number(salesTax) || 0);
  const entryTotal = (Number(entryQty) || 0) * (Number(entryRate) || 0);

  function pickPart(p: PartData) {
    setEntryPart(p);
    setPartSearch(`${p.sku} · ${p.name}`);
    setEntryQty(1);
    setEntryRate(Number(p.costPrice ?? 0));
    setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, 0);
  }

  function clearEntry() {
    setEntryPart(null);
    setPartSearch("");
    setEntryQty(1);
    setEntryRate(0);
  }

  function addItem() {
    setErr(null);
    setMsg(null);
    if (!entryPart) {
      setErr("Pick an item first.");
      return;
    }
    const q = Number(entryQty);
    const r = Number(entryRate);
    if (!q || q < 1) {
      setErr("Qty must be at least 1.");
      return;
    }
    if (r < 0) {
      setErr("Rate cannot be negative.");
      return;
    }
    if (items.some((i) => i.partId === entryPart.id)) {
      setErr("Item already added — remove it first to change qty/rate.");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        rowId: newRowId(),
        partId: entryPart.id,
        sku: entryPart.sku,
        name: entryPart.name,
        stockQty: entryPart.stockQty,
        qty: q,
        rate: r,
        total: q * r,
      },
    ]);
    clearEntry();
    setTimeout(() => { partSearchRef.current?.focus(); }, 0);
  }

  function removeItem(rowId: string) {
    setItems((prev) => prev.filter((i) => i.rowId !== rowId));
  }

  function updateItem(rowId: string, field: "qty" | "rate", raw: string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.rowId !== rowId) return i;
        const qty  = field === "qty"  ? Math.max(1, parseInt(raw, 10) || 1) : i.qty;
        const rate = field === "rate" ? Math.max(0, parseFloat(raw) || 0)   : i.rate;
        return { ...i, qty, rate, total: qty * rate };
      })
    );
  }

  /* One path into the read-only view, shared by ?purchaseId and the search box,
     so both always show the same thing. */
  const applyPurchase = useCallback((po: PurchaseData) => {
    setOpenedPurchase(po);
    setVendorId(po.vendorId);
    setVendorLabel(po.vendor?.name ?? "");
    setNotes(po.notes ?? "");
    setItems(po.items.map((i) => ({
      rowId: i.id,
      partId: i.partId,
      sku: i.part?.sku ?? "",
      name: i.part?.name ?? "",
      stockQty: 0,
      qty: i.receivedQty || i.quantity,
      rate: Number(i.costPrice),
      total: Math.round((i.receivedQty || i.quantity) * Number(i.costPrice)),
    })));
    setErr(null);
    setMsg(null);
  }, []);

  /* Opened by id, the way Sale Invoice opens a bill with ?invoiceId. */
  useEffect(() => {
    const id = searchParams.get("purchaseId");
    if (!id) { setOpenedPurchase(null); return; }
    let cancelled = false;
    purchasesApi.get(id)
      .then((po) => { if (!cancelled) applyPurchase(po); })
      .catch((e) => { if (!cancelled) setErr((e as Error).message); });
    return () => { cancelled = true; };
  }, [searchParams, applyPurchase]);

  /* Opening from the search box puts the id in the URL, so the view survives a
     refresh and the link can be shared the way a bill's can. */
  function openPurchase(po: PurchaseData) {
    setPoSearch("");
    applyPurchase(po);
    router.replace(`/dashboard/purchase?purchaseId=${po.id}`);
  }

  /* Leaving the view means dropping ?purchaseId too, or the effect reloads it. */
  function startNewPurchase() {
    resetAll();
    setOpenedPurchase(null);
    if (searchParams.get("purchaseId")) router.replace("/dashboard/purchase");
  }

  function resetAll() {
    setVendorId("");
    setVendorLabel("");
    setNotes("");
    setItems([]);
    setCashPaid(0);
    setSalesTax(0);
    clearEntry();
    setMsg(null);
    setErr(null);
  }

  async function save() {
    setMsg(null);
    setErr(null);
    if (!vendorId) {
      setErr("Supplier is required.");
      return;
    }
    if (items.length === 0) {
      setErr("Add at least one item.");
      return;
    }

    const payload: PurchaseItemPayload[] = items.map((i) => ({
      partId: i.partId,
      quantity: i.qty,
      costPrice: i.rate,
      receivedQty: i.qty,
    }));

    setSaving(true);
    try {
      await purchasesApi.create({
        vendorId,
        status: "RECEIVED",
        notes: notes.trim() || undefined,
        items: payload,
      });
      setMsg("Purchase saved. Stock updated.");
      resetAll();
      refreshNextPurchaseNo();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <h1 className="page-title">Purchase</h1>
        <span className="page-subtitle">Quick stock-in entry</span>
        <span style={{ marginLeft: 16, fontSize: 13, fontWeight: 600, color: "#555" }}>
          PO# <span style={{ fontFamily: "monospace", color: "#1a3c6e", fontSize: 15 }}>
            {openedPurchase ? openedPurchase.purchaseNo : nextPurchaseNo}
          </span>
        </span>
        {viewing && (
          <span style={{
            marginLeft: 12, fontSize: 11, fontWeight: 600, padding: "2px 8px",
            borderRadius: 2, background: "#1a3c6e", color: "#fff",
          }}>
            SAVED — view only
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Link href="/dashboard/reports/purchases" className="erp-btn erp-btn-default">
          Purchase Reports →
        </Link>
      </div>

      {/* Open an existing purchase, the way Sale Invoice opens a bill. */}
      <div className="si-row" style={{
        background: "#f8fafc", padding: "6px 8px", borderRadius: 4,
        border: "1px solid #d6e0ec", marginTop: 6, display: "flex", alignItems: "center", gap: 8,
      }}>
        <label className="si-lbl" style={{ width: 120, color: "#0050a0", fontWeight: 700 }}>
          Search Purchase
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SmartSearch<PurchaseData>
            value={poSearch}
            onChange={setPoSearch}
            fetcher={async (q, signal) => {
              const term = q.trim();
              if (!term) return [];
              const r = await purchasesApi.list(1, 30, { search: term });
              if (signal.aborted) return [];
              return r.data;
            }}
            columns={[
              { label: "PO #", width: 120, mono: true, render: (po) => po.purchaseNo },
              { label: "Supplier", width: "1.2fr", render: (po) => po.vendor?.name ?? "—" },
              { label: "Items", width: 70, align: "right", render: (po) => String(po.items?.length ?? 0) },
              { label: "Total", width: 100, align: "right", mono: true,
                render: (po) => Number(po.totalCost).toLocaleString() },
              { label: "Status", width: 90, render: (po) => po.status },
              { label: "Date", width: 95, mono: true,
                render: (po) => new Date(po.purchasedAt).toLocaleDateString("en-GB",
                  { day: "2-digit", month: "short", year: "2-digit" }) },
            ]}
            keyOf={(po) => po.id}
            onPick={openPurchase}
            placeholder="Type PO number or supplier name…"
            inputClassName="erp-input"
            width="100%"
            dropdownMinWidth={620}
          />
        </div>
        {viewing && (
          <button className="erp-btn erp-btn-default" type="button" onClick={startNewPurchase}>
            ✕ Close
          </button>
        )}
      </div>

      <div className="panel" style={{ marginTop: 6 }}>
        <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* ── Header row: Supplier + Notes ──────────── */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ width: 80, fontSize: 11, fontWeight: 600 }}>Supplier:</label>
            <div style={{ flex: 1, maxWidth: 460 }}>
              <SmartSearch<VendorData>
                disabled={viewing}
                value={vendorLabel}
                onChange={setVendorLabel}
                fetcher={async (q, signal) => {
                  const r = await vendorsApi.list(1, 30, q);
                  if (signal.aborted) return [];
                  return r.data;
                }}
                columns={[
                  { label: "Code", width: 100, mono: true, render: (v) => v.code },
                  { label: "Name", width: "1.4fr", render: (v) => v.name },
                  { label: "Phone", width: 130, mono: true, render: (v) => v.phone ?? "—" },
                  { label: "Email", width: "1.2fr", render: (v) => v.email ?? "—" },
                ]}
                keyOf={(v) => v.id}
                onPick={(v) => {
                  setVendorId(v.id);
                  setVendorLabel(`${v.code} — ${v.name}`);
                }}
                onClear={() => {
                  setVendorId("");
                  setVendorLabel("");
                }}
                placeholder="Search code, name, or phone…"
                inputClassName="erp-input"
                width="100%"
                dropdownMinWidth={620}
              />
            </div>
            <label style={{ fontSize: 11, fontWeight: 600 }}>Notes:</label>
            <input
              className="erp-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ flex: 1 }}
              placeholder="Optional"
            />
          </div>

          {/* ── Entry row (single line) ──────────────── */}
          <div className="si-row si-item-entry" style={{ flexWrap: "nowrap" }}>
            <label className="si-lbl">Item Name</label>
            <div style={{ width: 780, minWidth: 0, flexShrink: 0 }}>
              <SmartSearch<PartData>
                disabled={viewing}
                value={partSearch}
                onChange={setPartSearch}
                fetcher={async (q, signal) => {
                  const r = await partsApi.list(1, 50, q);
                  if (signal.aborted) return [];
                  return r.data;
                }}
                columns={[
                  { label: "SKU", width: 120, mono: true, render: (p) => p.sku },
                  { label: "Name", width: "1fr", render: (p) => p.name },
                  {
                    label: "Stock",
                    width: 80,
                    align: "right",
                    render: (p) => (
                      <span
                        style={{
                          color:
                            p.stockQty <= 0
                              ? "#c00"
                              : p.stockQty <= p.minStockLevel
                              ? "#d97706"
                              : "#080",
                          fontWeight: 600,
                        }}
                      >
                        {p.stockQty}
                        {p.stockQty <= p.minStockLevel ? " \u26A0" : ""}
                      </span>
                    ),
                  },
                  {
                    label: "Cost",
                    width: 90,
                    align: "right",
                    render: (p) => Number(p.costPrice ?? 0),
                  },
                ]}
                keyOf={(p) => p.id}
                onPick={pickPart}
                onClear={clearEntry}
                placeholder="Search item name or SKU…"
                width="100%"
                dropdownMinWidth={620}
                inputRef={partSearchRef}
              />
            </div>
            <label className="si-lbl" style={{ marginLeft: 8 }}>Qty. Bal.</label>
            <input className="si-input si-input-yellow" style={{ width: 65 }} value={entryPart ? entryPart.stockQty : 0} readOnly />
            <label className="si-lbl" style={{ marginLeft: 8 }}>Qty:</label>
            <input ref={qtyRef} className="si-input" style={{ width: 65 }} type="number"
              onKeyDown={(e) => { blockDecimalKeys(e); if (e.key === "Enter") { e.preventDefault(); rateRef.current?.focus(); rateRef.current?.select(); } }}
              onPaste={blockDecimalPaste} min={1}
              value={entryQty} disabled={viewing} onFocus={(e) => e.target.select()}
              onChange={(e) => setEntryQty(Number(e.target.value))} />
            <label className="si-lbl" style={{ marginLeft: 8 }}>Rate:</label>
            <input ref={rateRef} className="si-input si-input-yellow" style={{ width: 90 }} type="number"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBtnRef.current?.focus(); } }}
              step="0.01" min={0}
              value={entryRate} disabled={viewing} onFocus={(e) => e.target.select()}
              onChange={(e) => setEntryRate(Number(e.target.value))} />
            <label className="si-lbl" style={{ marginLeft: 8 }}>Total:</label>
            <input className="si-input si-input-yellow" style={{ width: 95 }} value={entryTotal || 0} readOnly />
            <button ref={addBtnRef} className="erp-btn erp-btn-primary" type="button" disabled={viewing} style={{ marginLeft: 8, whiteSpace: "nowrap" }} onClick={addItem}>Add</button>
          </div>

          {/* ── Items table ─────────────────────────── */}
          <table className="erp-table" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Item</th>
                <th style={{ width: 110 }}>SKU</th>
                <th className="text-right" style={{ width: 70 }}>Qty</th>
                <th className="text-right" style={{ width: 90 }}>Rate</th>
                <th className="text-right" style={{ width: 100 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: "#9e2020", fontStyle: "italic", padding: 20, textAlign: "center" }}>
                    Press Enter on Items Box to view Items Search
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.rowId}>
                    <td className="text-center">
                      <button
                        className="erp-btn-danger-sm"
                        type="button"
                        disabled={viewing}
                        onClick={() => removeItem(it.rowId)}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </td>
                    <td>{it.name}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 10 }}>{it.sku}</td>
                    <td className="text-right" style={{ padding: "2px 4px" }}>
                      <input
                        className="erp-input"
                        type="number"
                        min={1}
                        value={it.qty}
                        onKeyDown={blockDecimalKeys}
                        onPaste={blockDecimalPaste}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateItem(it.rowId, "qty", e.target.value)}
                        style={{ width: 60, textAlign: "right", padding: "1px 4px", fontSize: 11 }}
                      />
                    </td>
                    <td className="text-right" style={{ padding: "2px 4px" }}>
                      <input
                        className="erp-input si-input-yellow"
                        type="number"
                        min={0}
                        step={0.01}
                        value={it.rate}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateItem(it.rowId, "rate", e.target.value)}
                        style={{ width: 80, textAlign: "right", padding: "1px 4px", fontSize: 11 }}
                      />
                    </td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{it.total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* ── Footer summary: Total Qty + Net/Cash/Tax/Total ── */}
          <div style={{ display: "flex", gap: 24, alignItems: "flex-end", marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Total Qty:</label>
              <input
                className="erp-input"
                readOnly
                value={totalQty || ""}
                style={{ width: 100, background: "#fce8f5", fontWeight: 700 }}
              />
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "grid", gridTemplateColumns: "auto 120px", gap: 6, fontSize: 11 }}>
              <label style={{ fontWeight: 700, alignSelf: "center", textAlign: "right" }}>Net Total :</label>
              <input className="erp-input" readOnly value={netTotal || 0} style={{ fontWeight: 700 }} />

              <label style={{ fontWeight: 700, alignSelf: "center", textAlign: "right" }}>Cash Paid :</label>
              <input
                className="erp-input"
                type="number"
                onKeyDown={blockDecimalKeys}
                onPaste={blockDecimalPaste}
                min={0}
                step={1}
                value={cashPaid}
                onChange={(e) => setCashPaid(Number(e.target.value))}
                onFocus={(e) => e.target.select()}
              />

              <label style={{ fontWeight: 700, alignSelf: "center", textAlign: "right" }}>Sales Tax :</label>
              <input
                className="erp-input"
                type="number"
                onKeyDown={blockDecimalKeys}
                onPaste={blockDecimalPaste}
                min={0}
                step={1}
                value={salesTax}
                onChange={(e) => setSalesTax(Number(e.target.value))}
                onFocus={(e) => e.target.select()}
              />

              <label style={{ fontWeight: 700, alignSelf: "center", textAlign: "right" }}>Total :</label>
              <input className="erp-input" readOnly value={total || 0} style={{ fontWeight: 700, background: "#ffe6c8" }} />
            </div>
          </div>

          {/* ── Action buttons ──────────────────────── */}
          <div style={{ display: "flex", gap: 8, borderTop: "1px solid #d6dbe2", paddingTop: 8, marginTop: 4 }}>
            <button className="erp-btn erp-btn-default" type="button" onClick={startNewPurchase}>
              📄 Add New
            </button>
            <button
              className="erp-btn erp-btn-primary"
              type="button"
              onClick={save}
              disabled={saving || viewing}
              title={viewing ? "This purchase is already saved and its stock posted." : undefined}
            >
              {saving ? "Saving…" : "💾 Save"}
            </button>
            <span style={{ flex: 1 }} />
            {msg && <span style={{ color: "#0a7a30", fontSize: 11, alignSelf: "center" }}>{msg}</span>}
            {err && <span style={{ color: "#9e2020", fontSize: 11, alignSelf: "center" }}>{err}</span>}
          </div>
          {!viewing && (
            <div style={{ fontSize: 10, color: "#0a7a30" }}>
              Stock will be increased immediately on save.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
