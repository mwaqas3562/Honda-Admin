"use client";

import { useEffect, useState } from "react";
import { useStockLogs, useParts } from "@/hooks/useInventory";

export default function StockLogsPage() {
  const { data, loading, error, fetch } = useStockLogs();
  const { data: parts, fetch: fetchParts } = useParts();
  const [partId, setPartId] = useState("");
  const [logType, setLogType] = useState<"" | "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT">("");

  useEffect(() => {
    fetch(1, 200);
    fetchParts(1, 500);
  }, [fetch, fetchParts]);

  function applyFilter() {
    fetch(1, 200, {
      partId: partId || undefined,
      logType: logType || undefined,
    });
  }

  const rows = data?.data ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="panel">
        <div className="panel-header"><span className="panel-title">Stock Movement Filters</span></div>
        <div style={{ padding: 8, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field-group" style={{ maxWidth: 260 }}>
            <span className="field-label">Part</span>
            <select className="erp-select" value={partId} onChange={(e) => setPartId(e.target.value)}>
              <option value="">— All Parts —</option>
              {(parts?.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
          </div>
          <div className="field-group" style={{ maxWidth: 200 }}>
            <span className="field-label">Type</span>
            <select className="erp-select" value={logType}
              onChange={(e) => setLogType(e.target.value as typeof logType)}>
              <option value="">— All —</option>
              <option value="PURCHASE_IN">PURCHASE_IN</option>
              <option value="JOBCARD_OUT">JOBCARD_OUT</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
            </select>
          </div>
          <button className="erp-btn erp-btn-primary" onClick={applyFilter}>Apply</button>
          <button className="erp-btn erp-btn-default" onClick={() => { setPartId(""); setLogType(""); fetch(1, 200); }}>
            Reset
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Stock Logs ({data?.total ?? 0})</span>
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Date</th>
                <th>Part</th>
                <th>Type</th>
                <th className="text-right">Change</th>
                <th className="text-right">Balance</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="table-empty">Loading…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="table-empty">No stock logs.</td></tr>}
              {rows.map((l, i) => (
                <tr key={l.id}>
                  <td>{i + 1}</td>
                  <td>{new Date(l.createdAt).toLocaleString()}</td>
                  <td>{l.part.name} ({l.part.sku})</td>
                  <td>{l.logType}</td>
                  <td className="text-right" style={{ color: l.changeQty < 0 ? "#9e2020" : "#0a7a30", fontWeight: 600 }}>
                    {l.changeQty > 0 ? "+" : ""}{l.changeQty}
                  </td>
                  <td className="text-right">{l.balanceQty}</td>
                  <td>{l.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && <div style={{ color: "#9e2020", fontSize: 11 }}>{error}</div>}
    </div>
  );
}
