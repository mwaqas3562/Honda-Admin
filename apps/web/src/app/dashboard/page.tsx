"use client";

import { useEffect, useMemo, useState } from "react";
import { dashboardApi, type DashboardData } from "@/lib/api";

const DAY_OPTIONS = [7, 14, 30];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    dashboardApi.get(days, 5)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const fmt = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const trendMax = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...data.salesTrend.map((d) => d.revenue));
  }, [data]);

  return (
    <div className="page-wrapper">
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <span className="page-subtitle">Real-time workshop analytics</span>
        </div>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 11, fontWeight: 600 }}>Trend:</label>
        <select className="erp-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {DAY_OPTIONS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>

      {error && <div style={{ color: "#9e2020", fontSize: 12, padding: 8 }}>{error}</div>}
      {loading && !data && <div style={{ padding: 8, fontSize: 12 }}>Loading…</div>}

      {data && (
        <>
          {/* ── A. Today summary ───────────────────────── */}
          <h2 style={{ fontSize: 13, marginTop: 4, marginBottom: 6, fontWeight: 700 }}>Today</h2>
          <div className="stat-grid">
            <Stat label="Jobs Created" value={String(data.today.jobsCreated)} color="stat-blue" />
            <Stat label="Jobs Completed" value={String(data.today.jobsCompleted)} color="stat-green" />
            <Stat label="Invoices Paid" value={String(data.today.invoicesPaid)} color="stat-yellow" />
            <Stat label="Revenue (RM)" value={fmt(data.today.revenue)} color="stat-blue" />
            <Stat label="Profit (RM)" value={fmt(data.today.profit)} color="stat-green" />
          </div>

          {/* ── B. Job status overview ─────────────────── */}
          <h2 style={{ fontSize: 13, marginTop: 12, marginBottom: 6, fontWeight: 700 }}>Job Status Overview</h2>
          <div className="stat-grid">
            <Stat label="Open" value={String(data.jobStatus.open)} color="stat-yellow" />
            <Stat label="In Progress" value={String(data.jobStatus.inProgress)} color="stat-blue" />
            <Stat label="Completed" value={String(data.jobStatus.completed)} color="stat-green" />
            <Stat label="Cancelled" value={String(data.jobStatus.cancelled)} color="stat-red" />
          </div>

          {/* ── C. Sales trend ─────────────────────────── */}
          <div className="panel mt-3">
            <div className="panel-header">
              <span className="panel-title">Revenue & Profit · Last {data.range.days} Days</span>
            </div>
            <div style={{ padding: 12, display: "flex", alignItems: "flex-end", gap: 4, height: 160 }}>
              {data.salesTrend.map((d) => {
                const revH = trendMax > 0 ? (d.revenue / trendMax) * 130 : 0;
                const proH = trendMax > 0 ? (d.profit / trendMax) * 130 : 0;
                return (
                  <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 130 }}>
                      <div title={`Revenue: ${fmt(d.revenue)}`}
                        style={{ width: 14, height: revH, background: "#0050a0", borderRadius: "2px 2px 0 0" }} />
                      <div title={`Profit: ${fmt(d.profit)}`}
                        style={{ width: 14, height: Math.max(0, proH), background: "#0a7a30", borderRadius: "2px 2px 0 0" }} />
                    </div>
                    <span style={{ fontSize: 9, color: "#666" }}>{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, padding: "0 12px 8px", fontSize: 10 }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#0050a0", marginRight: 4 }} />Revenue</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#0a7a30", marginRight: 4 }} />Profit</span>
            </div>
          </div>

          {/* ── Bottom row: low stock + top items ──────── */}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-header">
                <span className="panel-title">Low Stock Alert ({data.lowStock.length})</span>
                <a href="/dashboard/parts" className="panel-action">Manage Parts</a>
              </div>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>SKU</th>
                    <th className="text-right">Stock</th>
                    <th className="text-right">Min</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowStock.length === 0 && (
                    <tr><td colSpan={4} className="table-empty">All stock levels healthy.</td></tr>
                  )}
                  {data.lowStock.map((p) => (
                    <tr key={p.id} style={{ background: p.stockQty === 0 ? "#fde2e2" : "#fff8e1" }}>
                      <td>{p.name}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 10 }}>{p.sku}</td>
                      <td className="text-right" style={{ color: p.stockQty === 0 ? "#9e2020" : "#7a5500", fontWeight: 600 }}>
                        {p.stockQty}
                      </td>
                      <td className="text-right">{p.minStockLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-header">
                <span className="panel-title">Top Selling · Last {data.range.days} Days</span>
              </div>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topItems.length === 0 && (
                    <tr><td colSpan={4} className="table-empty">No paid product sales in this window.</td></tr>
                  )}
                  {data.topItems.map((it, i) => (
                    <tr key={`${it.partId ?? "x"}-${i}`}>
                      <td>{it.itemName}</td>
                      <td className="text-right">{it.qty}</td>
                      <td className="text-right">{fmt(it.revenue)}</td>
                      <td className="text-right" style={{ color: "#0a7a30", fontWeight: 600 }}>{fmt(it.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
