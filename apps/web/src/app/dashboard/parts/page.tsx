"use client";

import AdminOnly from "@/components/AdminOnly";
import { blockDecimalKeys, blockDecimalPaste } from "@/lib/intInput";
import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useParts } from "@/hooks/useInventory";
import type { PartData } from "@/lib/api";

type FormState = {
  id: string | null;
  name: string;
  sku: string;
  costPrice: string;
  sellingPrice: string;
  stockQty: string;
  minStockLevel: string;
};

const empty: FormState = { id: null, name: "", sku: "", costPrice: "", sellingPrice: "", stockQty: "0", minStockLevel: "0" };

/* The catalogue runs to thousands of parts; a page is what the table shows at
   once, not what the shop owns. */
const PAGE_SIZE = 100;

function PartsPageInner() {
  const { data, loading, error, saving, fetch, create, update } = useParts();
  const [form, setForm] = useState<FormState>(empty);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 250);

  /* Search runs on the server. Filtering the loaded page in the browser meant
     only the 100 newest parts could ever be found — a search for anything
     older answered "No parts", which reads as "it does not exist" rather than
     "it was not loaded". */
  useEffect(() => {
    fetch(page, PAGE_SIZE, debouncedSearch.trim() || undefined);
  }, [fetch, page, debouncedSearch]);

  /* A new search starts from the first page, or page 4 of the old results
     would be requested for the new term. */
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  function pickRow(row: PartData) {
    setForm({
      id: row.id,
      name: row.name,
      sku: row.sku,
      costPrice: String(Number(row.costPrice) || ""),
      sellingPrice: String(Number(row.sellingPrice) || ""),
      stockQty: String(row.stockQty),
      minStockLevel: String(row.minStockLevel),
    });
    setMsg(null);
  }

  function reset() { setForm(empty); setMsg(null); }

  async function save() {
    setMsg(null);
    if (!form.name.trim() || !form.sku.trim()) { setMsg("Name and SKU are required."); return; }
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      costPrice: Number(form.costPrice) || 0,
      sellingPrice: Number(form.sellingPrice) || 0,
      minStockLevel: Number(form.minStockLevel) || 0,
      stockQty: Number(form.stockQty) || 0,
    };
    const r = form.id
      ? await update(form.id, { name: payload.name, sku: payload.sku, costPrice: payload.costPrice, sellingPrice: payload.sellingPrice, minStockLevel: payload.minStockLevel })
      : await create(payload);
    if (r) { setMsg(form.id ? "Part updated." : "Part created."); reset(); fetch(page, PAGE_SIZE, debouncedSearch.trim() || undefined); }
  }

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {/* LEFT FORM */}
      <div style={{ flex: "0 0 360px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="panel">
          <div className="panel-header"><span className="panel-title">Part Information</span></div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <Field label="Part Name">
              <input className="erp-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="SKU / Code">
              <input className="erp-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label="Purchase Rate">
              <input className="erp-input" type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste} step="1" value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
            </Field>
            <Field label="Selling Rate">
              <input className="erp-input" type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste} step="1" value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><span className="panel-title">Stock Information</span></div>
          <div style={{ padding: 8 }}>
            <Field label="Opening Stock Qty">
              <input className="erp-input" type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste} value={form.stockQty} disabled={!!form.id}
                onChange={(e) => setForm({ ...form, stockQty: e.target.value })} />
            </Field>
            <Field label="Min Stock Level">
              <input className="erp-input" type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste} value={form.minStockLevel}
                onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })} />
            </Field>
            {form.id && (
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                Stock changes only via purchases / job cards (audit trail).
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button className="erp-btn erp-btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : form.id ? "Update Part" : "Add Part"}
          </button>
          <button className="erp-btn erp-btn-default" onClick={reset}>Clear</button>
        </div>

        {msg && <div style={{ color: "#0050a0", fontSize: 11 }}>{msg}</div>}
        {error && <div style={{ color: "#9e2020", fontSize: 11 }}>{error}</div>}
      </div>

      {/* RIGHT LIST */}
      <div className="panel" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className="panel-header" style={{ gap: 8 }}>
          <span className="panel-title">Parts List ({total})</span>
          <input
            className="erp-input"
            placeholder="Search name / SKU…"
            style={{ maxWidth: 200, height: 22 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Name</th>
                <th>SKU</th>
                <th className="text-right">Purchase Rate</th>
                <th className="text-right">Selling Rate</th>
                <th className="text-right">Stock Qty</th>
                <th className="text-right">Min Stock</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="table-empty">Loading…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="table-empty">No parts.</td></tr>}
              {rows.map((p, i) => (
                <tr key={p.id} onClick={() => pickRow(p)} style={{ cursor: "pointer" }}>
                  <td>{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td>{p.name}</td>
                  <td>{p.sku}</td>
                  <td className="text-right">{Number(p.costPrice)}</td>
                  <td className="text-right">{Number(p.sellingPrice)}</td>
                  <td className="text-right">{p.stockQty}</td>
                  <td className="text-right">{p.minStockLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Without this the table simply stopped at 100 rows while the heading
            counted thousands, and nothing on screen said the rest existed. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
          borderTop: "1px solid var(--border)", fontSize: 11,
        }}>
          <span style={{ color: "var(--text-muted)" }}>
            {total === 0 ? "No parts" : `Showing ${firstShown}–${lastShown} of ${total}`}
            {debouncedSearch.trim() && ` matching “${debouncedSearch.trim()}”`}
          </span>
          <span style={{ flex: 1 }} />
          <button
            className="erp-btn erp-btn-default"
            style={{ padding: "1px 8px" }}
            disabled={page <= 1 || loading}
            onClick={() => setPage((n) => Math.max(1, n - 1))}
          >
            ‹ Prev
          </button>
          <span style={{ minWidth: 74, textAlign: "center" }}>Page {page} / {pageCount}</span>
          <button
            className="erp-btn erp-btn-default"
            style={{ padding: "1px 8px" }}
            disabled={page >= pageCount || loading}
            onClick={() => setPage((n) => Math.min(pageCount, n + 1))}
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field-group">
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

export default function PartsPage() {
  return (
    <AdminOnly>
      <PartsPageInner />
    </AdminOnly>
  );
}
