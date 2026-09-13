"use client";

import { useEffect, useState } from "react";
import {
  purchasesApi,
  vendorsApi,
  partsApi,
  type PurchaseReportsData,
  type VendorData,
  type PartData,
} from "@/lib/api";

export default function PurchaseReportsPage() {
  const [data, setData] = useState<PurchaseReportsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [from, setFrom] = useState(() => new Date().toLocaleDateString("en-GB")); // DD/MM/YYYY
  const [to, setTo] = useState(() => new Date().toLocaleDateString("en-GB")); // DD/MM/YYYY

  function dmyToISO(dmy: string, endOfDay = false): string | undefined {
    if (!dmy || !/^\d{2}\/\d{2}\/\d{4}$/.test(dmy)) return undefined;
    const [d, m, y] = dmy.split("/");
    const suffix = endOfDay ? "T23:59:59" : "";
    return new Date(`${y}-${m}-${d}${suffix}`).toISOString();
  }
  const [vendorId, setVendorId] = useState("");
  const [partId, setPartId] = useState("");
  const [vendors, setVendors] = useState<VendorData[]>([]);
  const [parts, setParts] = useState<PartData[]>([]);

  useEffect(() => {
    vendorsApi.list(1, 500).then((r) => setVendors(r.data));
    partsApi.list(1, 5000).then((r) => setParts(r.data));
  }, []);

  function load() {
    setLoading(true); setErr(null);
    purchasesApi.reports({
      from: dmyToISO(from),
      to:   dmyToISO(to, true),
      vendorId: vendorId || undefined,
      partId:   partId   || undefined,
    })
      .then(setData)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []); // eslint-disable-line

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <h1 className="page-title">Purchase Reports</h1>
        <span className="page-subtitle">Spend · History · Top Suppliers · Top Products</span>
      </div>

      <div className="panel">
        <div className="panel-header" style={{ gap: 6, flexWrap: "wrap" }}>
          <label style={{ fontSize: 11 }}>From <input type="text" className="erp-input" placeholder="DD/MM/YYYY"
            value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 100 }} /></label>
          <label style={{ fontSize: 11 }}>To <input type="text" className="erp-input" placeholder="DD/MM/YYYY"
            value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 100 }} /></label>
          <select className="erp-select" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">All suppliers</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
          </select>
          <select className="erp-select" value={partId} onChange={(e) => setPartId(e.target.value)}>
            <option value="">All products</option>
            {parts.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
          </select>
          <button className="erp-btn erp-btn-primary" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Apply"}
          </button>
          <button className="erp-btn erp-btn-default"
            onClick={() => { setFrom(""); setTo(""); setVendorId(""); setPartId(""); setTimeout(load, 0); }}>
            Reset
          </button>
        </div>
      </div>

      {err && <div style={{ color: "#9e2020", padding: 8 }}>{err}</div>}

      {data && (
        <>
          <div className="stat-grid" style={{ marginBottom: 8 }}>
            <Stat label="Total Purchase Value (RM)" value={fmt(data.totals.totalAll)} hint={`${data.totals.countAll} purchases`} color="stat-blue" />
            <Stat label="Received Spend" value={fmt(data.totals.totalReceived)} hint={`${data.totals.countReceived} POs`} color="stat-green" />
            <Stat label="Paid Spend" value={fmt(data.totals.totalPaid)} hint={`${data.totals.countPaid} POs`} color="stat-blue" />
            <Stat label="Draft Spend" value={fmt(data.totals.totalDraft)} hint={`${data.totals.countDraft} POs`} color="stat-yellow" />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-header"><span className="panel-title">Top Purchased Products</span></div>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Product</th><th>SKU</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Cost (RM)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.length === 0 && <tr><td colSpan={4} className="table-empty">No data.</td></tr>}
                  {data.topProducts.map((p) => (
                    <tr key={p.partId}>
                      <td>{p.name}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 10 }}>{p.sku}</td>
                      <td className="text-right">{p.quantity}</td>
                      <td className="text-right">{fmt(p.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-header"><span className="panel-title">Top Suppliers</span></div>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Supplier</th><th>Code</th>
                    <th className="text-right">POs</th>
                    <th className="text-right">Spend (RM)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topVendors.length === 0 && <tr><td colSpan={4} className="table-empty">No data.</td></tr>}
                  {data.topVendors.map((v) => (
                    <tr key={v.vendorId}>
                      <td>{v.name}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 10 }}>{v.code}</td>
                      <td className="text-right">{v.purchases}</td>
                      <td className="text-right">{fmt(v.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><span className="panel-title">Purchase History ({data.history.length})</span></div>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="text-right">Items</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Total (RM)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.history.length === 0 && <tr><td colSpan={7} className="table-empty">No purchases in range.</td></tr>}
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 600 }}>{h.purchaseNo}</td>
                    <td style={{ fontSize: 10 }}>{new Date(h.purchasedAt).toLocaleDateString("en-GB")}</td>
                    <td>{h.vendor.name}</td>
                    <td className="text-right">{h.itemCount}</td>
                    <td className="text-right">{h.quantity}</td>
                    <td className="text-right">{fmt(h.totalCost)}</td>
                    <td>
                      <span style={{
                        padding: "1px 6px", fontSize: 10, color: "#fff", borderRadius: 2, fontWeight: 600,
                        background: h.status === "PAID" ? "#0050a0" : h.status === "RECEIVED" ? "#0a7a30" :
                                    h.status === "DRAFT" ? "#6b7280" : "#9e2020",
                      }}>{h.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color: string }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div style={{ fontSize: 10, color: "#666" }}>{hint}</div>}
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
