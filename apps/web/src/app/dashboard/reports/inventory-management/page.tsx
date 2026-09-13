"use client";

import { formatNumber } from "@/lib/formatters";
import AdminOnly from "@/components/AdminOnly";
import { blockDecimalKeys, blockDecimalPaste } from "@/lib/intInput";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import SmartSearch from "@/components/SmartSearch";
import ExportCSV, { type ExportColumn } from "@/components/reports/ExportCSV";
import {
  inventoryMgmtApi,
  partsApi,
  stockLogsApi,
  type BulkUploadRow,
  type InventoryReportsData,
  type InventoryReportRow,
  type PartData,
  type StockLogListResponse,
} from "@/lib/api";

type Tab = "list" | "bulk" | "adjust" | "reports" | "history";

function InventoryManagementPageInner() {
  const [tab, setTab] = useState<Tab>("list");

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <h1 className="page-title">Inventory Management</h1>
        <span className="page-subtitle">
          Centralised control of products, stock and pricing
        </span>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #d6dbe2", marginBottom: 8 }}>
        <TabBtn active={tab === "list"}    onClick={() => setTab("list")}>Inventory List</TabBtn>
        <TabBtn active={tab === "bulk"}    onClick={() => setTab("bulk")}>Bulk Upload</TabBtn>
        <TabBtn active={tab === "adjust"}  onClick={() => setTab("adjust")}>Stock Adjustment</TabBtn>
        <TabBtn active={tab === "reports"} onClick={() => setTab("reports")}>Inventory Reports</TabBtn>
        <TabBtn active={tab === "history"} onClick={() => setTab("history")}>Stock History</TabBtn>
      </div>

      {tab === "list"    && <InventoryList />}
      {tab === "bulk"    && <BulkUpload />}
      {tab === "adjust"  && <StockAdjustment />}
      {tab === "reports" && <InventoryReports />}
      {tab === "history" && <StockHistory />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        border: "none", borderBottom: active ? "3px solid #0050a0" : "3px solid transparent",
        background: active ? "#eef5ff" : "transparent",
        color: active ? "#0050a0" : "#333",
      }}>
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────
 * 1. INVENTORY LIST
 * ────────────────────────────────────────────────────── */
function InventoryList() {
  const [parts, setParts] = useState<PartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "LOW" | "OUT">("ALL");
  const [sortKey, setSortKey] = useState<"name" | "stock" | "value" | "profit">("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function reload() {
    setLoading(true);
    partsApi.list(1, 5000, search.trim() || undefined)
      .then((r) => setParts(r.data))
      .finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [search]); // eslint-disable-line

  const rows = useMemo(() => {
    let r = parts.map((p) => {
      const cost = Number(p.costPrice) || 0;
      const sell = Number(p.sellingPrice) || 0;
      const stock = p.stockQty;
      const value = stock * cost;
      const margin = cost > 0 ? ((sell - cost) / cost) * 100 : 0;
      const status: "IN" | "LOW" | "OUT" =
        stock === 0 ? "OUT" : stock <= p.minStockLevel ? "LOW" : "IN";
      return { ...p, cost, sell, value, margin, status };
    });
    if (filter === "LOW") r = r.filter((x) => x.status === "LOW");
    if (filter === "OUT") r = r.filter((x) => x.status === "OUT");
    r.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "stock") cmp = a.stockQty - b.stockQty;
      else if (sortKey === "value") cmp = a.value - b.value;
      else cmp = a.margin - b.margin;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [parts, filter, sortKey, sortDir]);

  const totalProducts = parts.length;
  const totalValue    = parts.reduce((s, p) => s + p.stockQty * (Number(p.costPrice) || 0), 0);
  const lowCount      = rows.filter((r) => r.status === "LOW").length;

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 8 }}>
        <Stat label="Total Products" value={String(totalProducts)} color="stat-blue" />
        <Stat label="Stock Value (RM)" value={fmt(totalValue)} color="stat-green" />
        <Stat label="Low Stock" value={String(lowCount)} color="stat-yellow" />
      </div>

      <div className="panel">
        <div className="panel-header" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="erp-input" placeholder="Search name or SKU…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 240 }} />
          <select className="erp-select" value={filter} onChange={(e) => setFilter(e.target.value as "ALL" | "LOW" | "OUT")}>
            <option value="ALL">All stock</option>
            <option value="LOW">Low stock</option>
            <option value="OUT">Out of stock</option>
          </select>
          <span style={{ flex: 1 }} />
          {/* Exports exactly what is on screen — the active search, filter and
            * sort all apply, so a "Low stock" view exports only those rows. */}
          <ExportCSV
            filename="inventory"
            rows={rows}
            label="Export CSV"
            columns={[
              { header: "Product", accessor: (r) => r.name },
              { header: "SKU", accessor: (r) => r.sku },
              { header: "Cost", accessor: (r) => r.cost },
              { header: "Sale", accessor: (r) => r.sell },
              { header: "Margin %", accessor: (r) => r.margin.toFixed(1) },
              { header: "Stock", accessor: (r) => r.stockQty },
              { header: "Min Level", accessor: (r) => r.minStockLevel },
              { header: "Stock Value", accessor: (r) => r.value },
              { header: "Status", accessor: (r) =>
                  r.status === "IN" ? "In Stock" : r.status === "LOW" ? "Low Stock" : "Out of Stock" },
            ]}
          />
          <button className="erp-btn erp-btn-default" onClick={reload}>Refresh</button>
        </div>
        <table className="erp-table">
          <thead>
            <tr>
              <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>Product</Th>
              <th>SKU</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Sale</th>
              <Th onClick={() => toggleSort("profit")} active={sortKey === "profit"} dir={sortDir} className="text-right">Margin %</Th>
              <Th onClick={() => toggleSort("stock")} active={sortKey === "stock"} dir={sortDir} className="text-right">Stock</Th>
              <th className="text-right">Min</th>
              <Th onClick={() => toggleSort("value")} active={sortKey === "value"} dir={sortDir} className="text-right">Stock Value</Th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="table-empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="table-empty">No products.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id} style={{
                background: p.status === "OUT" ? "#fde2e2" : p.status === "LOW" ? "#fff8e1" : undefined,
              }}>
                <td>{p.name}</td>
                <td style={{ fontFamily: "monospace", fontSize: 10 }}>{p.sku}</td>
                <td className="text-right">{fmt(p.cost)}</td>
                <td className="text-right">{fmt(p.sell)}</td>
                <td className="text-right" style={{ color: p.margin >= 0 ? "#0a7a30" : "#9e2020", fontWeight: 600 }}>
                  {formatNumber(p.margin, { maximumFractionDigits: 2 })}
                </td>
                <td className="text-right" style={{ fontWeight: 600 }}>{p.stockQty}</td>
                <td className="text-right">{p.minStockLevel}</td>
                <td className="text-right">{fmt(p.value)}</td>
                <td>
                  <span style={{
                    padding: "1px 6px", fontSize: 10, color: "#fff", borderRadius: 2,
                    background: p.status === "OUT" ? "#9e2020" : p.status === "LOW" ? "#d97706" : "#0a7a30",
                  }}>
                    {p.status === "IN" ? "In Stock" : p.status === "LOW" ? "Low Stock" : "Out of Stock"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
 * 2. BULK UPLOAD (with column mapping)
 * ────────────────────────────────────────────────────── */

type RawSheet = {
  headers: string[];
  records: Record<string, unknown>[];
  fileName: string;
};

type FieldKey = "sku" | "name" | "category" | "costPrice" | "sellingPrice" | "stockQty" | "minStockLevel";

type FieldDef = {
  key: FieldKey;
  label: string;
  required: boolean;
  type: "string" | "number";
  /** Lower-cased aliases to auto-suggest mapping. */
  aliases: string[];
};

const FIELD_DEFS: FieldDef[] = [
  { key: "sku",            label: "SKU / Part Number", required: true,  type: "string", aliases: ["sku", "part number", "partnumber", "part no", "partno", "part #", "part_no", "code", "item code", "itemcode", "part code", "partcode", "product code"] },
  { key: "name",           label: "Name / Description", required: true,  type: "string", aliases: ["name", "item name", "itemname", "product", "product name", "description", "title"] },
  { key: "category",       label: "Category",        required: false, type: "string", aliases: ["category", "type", "group"] },
  { key: "costPrice",      label: "Cost / Purchase Rate",      required: false, type: "number", aliases: ["costprice", "cost price", "cost_price", "cost", "purchase price", "purchaseprice", "buy price", "purchase rate", "purchaserate", "purchase_rate"] },
  { key: "sellingPrice",   label: "Selling / Sale Price",   required: false, type: "number", aliases: ["sellingprice", "selling price", "selling_price", "price", "sale price", "saleprice", "sale_price", "mrp", "rate"] },
  { key: "stockQty",       label: "Stock / Balance Stock",  required: false, type: "number", aliases: ["stockqty", "stock qty", "stock_qty", "stock", "qty", "quantity", "balance", "on hand", "onhand", "balance stock", "balancestock", "balance_stock", "closing stock", "closingstock"] },
  { key: "minStockLevel",  label: "Min Stock", required: false, type: "number", aliases: ["minstocklevel", "min stock level", "min_stock_level", "min stock", "minstock", "min_stock", "min", "minimum", "reorder level", "reorderlevel"] },
];

const IGNORE = "__ignore__";

function autoMapHeaders(headers: string[]): Record<FieldKey, string> {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const out = {} as Record<FieldKey, string>;
  const used = new Set<string>();
  for (const def of FIELD_DEFS) {
    const match = headers.find((h) => {
      if (used.has(h)) return false;
      const n = norm(h);
      return def.aliases.some((a) => norm(a) === n);
    });
    out[def.key] = match ?? IGNORE;
    if (match) used.add(match);
  }
  return out;
}

function toStrCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}
function toNumCell(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

function buildRowsFromMapping(
  records: Record<string, unknown>[],
  mapping: Record<FieldKey, string>
): { rows: BulkUploadRow[]; skipped: number } {
  const rows: BulkUploadRow[] = [];
  let skipped = 0;
  for (const rec of records) {
    const sku = mapping.sku !== IGNORE ? toStrCell(rec[mapping.sku]) : "";
    const name = mapping.name !== IGNORE ? toStrCell(rec[mapping.name]) : "";
    if (!sku || !name) { skipped += 1; continue; }
    const get = (k: FieldKey) => (mapping[k] !== IGNORE ? rec[mapping[k]] : undefined);
    rows.push({
      sku,
      name,
      category: mapping.category !== IGNORE ? toStrCell(get("category")) || null : undefined,
      costPrice: mapping.costPrice !== IGNORE ? toNumCell(get("costPrice")) : undefined,
      sellingPrice: mapping.sellingPrice !== IGNORE ? toNumCell(get("sellingPrice")) : undefined,
      stockQty: mapping.stockQty !== IGNORE ? toNumCell(get("stockQty")) : undefined,
      minStockLevel: mapping.minStockLevel !== IGNORE ? toNumCell(get("minStockLevel")) : undefined,
    });
  }
  return { rows, skipped };
}

function BulkUpload() {
  const [raw, setRaw] = useState<RawSheet | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, string> | null>(null);
  const [rows, setRows] = useState<BulkUploadRow[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);

  const [stockMode, setStockMode] = useState<"OVERWRITE" | "ADD">("OVERWRITE");
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    summary: { total: number; created: number; updated: number; failed: number };
    errors: { row: number; sku: string; message: string }[];
  } | null>(null);

  function resetAll() {
    setRaw(null);
    setMapping(null);
    setRows([]);
    setSkippedCount(0);
    setParseError(null);
    setResult(null);
  }

  function handleFile(file: File) {
    resetAll();
    const lower = file.name.toLowerCase();
    const isExcel =
      lower.endsWith(".xlsx") ||
      lower.endsWith(".xls") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel";

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const sheet: RawSheet = isExcel
          ? readXLSX(reader.result as ArrayBuffer, file.name)
          : readCSV(String(reader.result ?? ""), file.name);
        if (sheet.records.length === 0) {
          throw new Error("File has no data rows.");
        }
        if (sheet.headers.length === 0) {
          throw new Error("Could not detect header row.");
        }
        setRaw(sheet);
        setMapping(autoMapHeaders(sheet.headers));
      } catch (e) {
        setParseError((e as Error).message);
      }
    };
    reader.onerror = () => setParseError("Failed to read file.");
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }

  function applyMapping() {
    if (!raw || !mapping) return;
    setParseError(null);
    if (mapping.sku === IGNORE || mapping.name === IGNORE) {
      setParseError("SKU and Name columns must be mapped.");
      return;
    }
    const { rows: built, skipped } = buildRowsFromMapping(raw.records, mapping);
    if (built.length === 0) {
      setParseError("No valid rows after applying mapping (SKU and Name are required on every row).");
      setRows([]);
      setSkippedCount(skipped);
      return;
    }
    setRows(built);
    setSkippedCount(skipped);
  }

  // Recompute rows whenever the mapping changes (live preview).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (raw && mapping && mapping.sku !== IGNORE && mapping.name !== IGNORE) {
      const { rows: built, skipped } = buildRowsFromMapping(raw.records, mapping);
      setRows(built);
      setSkippedCount(skipped);
      setParseError(null);
    } else {
      setRows([]);
      setSkippedCount(0);
    }
  }, [raw, mapping]);

  async function upload() {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      const r = await inventoryMgmtApi.bulkUpload({ stockMode, rows });
      setResult(r);
    } catch (e) {
      setParseError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const headers = ["sku", "name", "category", "costPrice", "sellingPrice", "stockQty", "minStockLevel"];
    const sample = ["OIL-10W30", "Engine Oil 10W30", "Lubricant", 18, 28, 50, 10];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, "inventory-template.xlsx");
  }

  function downloadCSVTemplate() {
    const csv = "sku,name,category,costPrice,sellingPrice,stockQty,minStockLevel\n" +
      "OIL-10W30,Engine Oil 10W30,Lubricant,18,28,50,10\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "inventory-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadErrors() {
    if (!result || result.errors.length === 0) return;
    const csv = "row,sku,message\n" +
      result.errors.map((e) => `${e.row},"${e.sku.replace(/"/g, '""')}","${e.message.replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bulk-upload-errors.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const previewRecords = raw?.records.slice(0, 5) ?? [];

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Upload Inventory CSV / Excel</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="erp-btn erp-btn-default" onClick={downloadTemplate}>Excel Template</button>
          <button className="erp-btn erp-btn-default" onClick={downloadCSVTemplate}>CSV Template</button>
        </div>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, color: "#555" }}>
          Accepted: <code>.csv</code>, <code>.xlsx</code>, <code>.xls</code>. After upload, map your columns
          to the inventory fields. Existing rows are matched by <strong>SKU</strong>.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {raw && (
            <span style={{ fontSize: 11, color: "#444" }}>
              <strong>{raw.fileName}</strong> · {raw.records.length} data row{raw.records.length === 1 ? "" : "s"} · {raw.headers.length} columns
            </span>
          )}
          {raw && (
            <button className="erp-btn erp-btn-default" onClick={resetAll}>Clear</button>
          )}
          <label style={{ fontSize: 12, marginLeft: "auto" }}>
            Stock update mode:{" "}
            <select className="erp-select" value={stockMode} onChange={(e) => setStockMode(e.target.value as "OVERWRITE" | "ADD")}>
              <option value="OVERWRITE">Overwrite stock</option>
              <option value="ADD">Add to existing stock</option>
            </select>
          </label>
        </div>

        {parseError && <div style={{ color: "#9e2020", fontSize: 12 }}>{parseError}</div>}

        {/* Column mapping UI */}
        {raw && mapping && (
          <div className="panel" style={{ background: "#fafbfd" }}>
            <div className="panel-header"><span className="panel-title">Map columns</span></div>
            <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
              {FIELD_DEFS.map((f) => (
                <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11 }}>
                  <span style={{ fontWeight: 600 }}>
                    {f.label}{f.required && <span style={{ color: "#c0392b" }}> *</span>}
                    <span style={{ color: "#888", fontWeight: 400 }}> ({f.type})</span>
                  </span>
                  <select
                    className="erp-select"
                    value={mapping[f.key]}
                    onChange={(e) =>
                      setMapping((m) => (m ? { ...m, [f.key]: e.target.value } : m))
                    }
                  >
                    <option value={IGNORE}>— ignore —</option>
                    {raw.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ padding: "0 10px 10px", fontSize: 11, color: "#555", display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="erp-btn erp-btn-default" onClick={applyMapping}>Re-apply mapping</button>
              {skippedCount > 0 && (
                <span style={{ color: "#7a5500" }}>
                  {skippedCount} row{skippedCount === 1 ? "" : "s"} skipped (missing SKU or Name).
                </span>
              )}
            </div>

            {/* Raw sheet preview to help user pick the right columns */}
            <div style={{ padding: "0 10px 10px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Source preview (first 5 rows)</div>
              <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #e0e3e7" }}>
                <table className="erp-table" style={{ fontSize: 10 }}>
                  <thead>
                    <tr>{raw.headers.map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {previewRecords.map((rec, i) => (
                      <tr key={i}>
                        {raw.headers.map((h) => (
                          <td key={h}>{toStrCell(rec[h])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Mapped Preview ({rows.length} rows)</div>
            <div style={{ maxHeight: 240, overflow: "auto" }}>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>SKU</th><th>Name</th><th>Category</th>
                    <th className="text-right">Cost</th><th className="text-right">Sale</th>
                    <th className="text-right">Stock</th><th className="text-right">Min</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "monospace", fontSize: 10 }}>{r.sku}</td>
                      <td>{r.name}</td>
                      <td>{r.category ?? ""}</td>
                      <td className="text-right">{r.costPrice ?? ""}</td>
                      <td className="text-right">{r.sellingPrice ?? ""}</td>
                      <td className="text-right">{r.stockQty ?? ""}</td>
                      <td className="text-right">{r.minStockLevel ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && (
                <div style={{ fontSize: 10, color: "#666", padding: 4 }}>… {rows.length - 50} more rows</div>
              )}
            </div>
            <button className="erp-btn erp-btn-primary" onClick={upload} disabled={busy}>
              {busy ? "Uploading…" : `Upload ${rows.length} rows`}
            </button>
          </>
        )}

        {result && (
          <div style={{ background: "#f3f6fa", padding: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Upload Summary</div>
            <div>Total rows: {result.summary.total}</div>
            <div style={{ color: "#0a7a30" }}>Created: {result.summary.created}</div>
            <div style={{ color: "#0050a0" }}>Updated: {result.summary.updated}</div>
            <div style={{ color: "#9e2020" }}>Failed: {result.summary.failed}</div>
            {result.errors.length > 0 && (
              <button className="erp-btn erp-btn-default" onClick={downloadErrors} style={{ marginTop: 8 }}>
                Download Errors CSV
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* Read XLSX/XLS into raw {headers, records}. Does NOT enforce schema. */
function readXLSX(buf: ArrayBuffer, fileName: string): RawSheet {
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook contains no sheets.");
  const sheet = wb.Sheets[sheetName];
  // Read raw 2-D array first to detect headers even when blank cells exist.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  if (aoa.length === 0) return { headers: [], records: [], fileName };
  const rawHeaders = (aoa[0] ?? []).map((v) => String(v ?? "").trim());
  // De-duplicate empty / repeated headers so they remain selectable.
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, idx) => {
    const base = h || `Column ${idx + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
  const records: Record<string, unknown>[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    if (row.every((v) => v === "" || v === null || v === undefined)) continue;
    const rec: Record<string, unknown> = {};
    headers.forEach((h, i) => { rec[h] = row[i] ?? ""; });
    records.push(rec);
  }
  return { headers, records, fileName };
}

/* CSV reader with quoted-field support → raw {headers, records}. */
function readCSV(text: string, fileName: string): RawSheet {
  const rows = parseCSVText(text);
  if (rows.length === 0) return { headers: [], records: [], fileName };
  const rawHeaders = rows[0].map((s) => s.trim());
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, idx) => {
    const base = h || `Column ${idx + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
  const records: Record<string, unknown>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((v) => v === "")) continue;
    const rec: Record<string, unknown> = {};
    headers.forEach((h, i) => { rec[h] = row[i] ?? ""; });
    records.push(rec);
  }
  return { headers, records, fileName };
}

/* Tiny CSV tokenizer that respects double-quoted fields and escaped quotes. */
function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cur.push(field); field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        cur.push(field); field = "";
        rows.push(cur); cur = [];
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

/* ─────────────────────────────────────────────────────────
 * 3. STOCK ADJUSTMENT
 * ────────────────────────────────────────────────────── */
function StockAdjustment() {
  /* The product is chosen through a server-side search rather than a preloaded
   * <select>. The old dropdown fetched the first 1000 parts, so anything beyond
   * that was simply unselectable, and scrolling a list that long to find one
   * item was slow besides. */
  const [selected, setSelected] = useState<PartData | null>(null);
  const [partQuery, setPartQuery] = useState("");
  const [type, setType] = useState<"ADD" | "REMOVE">("ADD");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const partId = selected?.id ?? "";

  async function submit() {
    setMsg(null); setErr(null);
    if (!partId) { setErr("Select a product."); return; }
    if (!reason.trim()) { setErr("Reason is required."); return; }
    setBusy(true);
    try {
      const r = await inventoryMgmtApi.adjust({ partId, type, quantity: qty, reason: reason.trim() });
      setMsg(`Stock updated. ${r.part.name} now ${r.part.stockQty}.`);
      /* Keep the part selected so several adjustments can be made in a row,
       * with the stock line reflecting what just happened. */
      partsApi.get(partId).then(setSelected).catch(() => {});
      setQty(1); setReason("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 560 }}>
      <div className="panel-header"><span className="panel-title">Manual Stock Adjustment</span></div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Field label="Product">
          <SmartSearch<PartData>
            value={partQuery}
            onChange={setPartQuery}
            placeholder="Search product by name or SKU…"
            minChars={1}
            dropdownMinWidth={520}
            fetcher={async (q) => (await partsApi.list(1, 25, q.trim())).data}
            keyOf={(p) => p.id}
            onPick={(p) => { setSelected(p); setPartQuery(`${p.name} (${p.sku})`); }}
            showClear
            onClear={() => { setSelected(null); setPartQuery(""); }}
            emptyMessage="No matching product."
            columns={[
              { label: "Item Name", render: (p) => p.name },
              { label: "SKU", width: 110, mono: true, render: (p) => p.sku },
              { label: "Stock", width: 70, align: "right", render: (p) => p.stockQty },
            ]}
          />
        </Field>
        {selected && (
          <div style={{ fontSize: 11, color: "#555" }}>
            Current stock: <strong>{selected.stockQty}</strong> · Min level: {selected.minStockLevel}
          </div>
        )}
        <Field label="Adjustment Type">
          <select className="erp-select" value={type} onChange={(e) => setType(e.target.value as "ADD" | "REMOVE")}>
            <option value="ADD">+ Add Stock</option>
            <option value="REMOVE">− Remove Stock</option>
          </select>
        </Field>
        <Field label="Quantity">
          <input className="erp-input" type="number" onKeyDown={blockDecimalKeys} onPaste={blockDecimalPaste} min={1} value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
        </Field>
        <Field label="Reason">
          <input className="erp-input" value={reason} placeholder="e.g. Damaged, Manual correction, Stock take"
            onChange={(e) => setReason(e.target.value)} />
        </Field>
        <button className="erp-btn erp-btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Apply Adjustment"}
        </button>
        {msg && <div style={{ color: "#0a7a30", fontSize: 12 }}>{msg}</div>}
        {err && <div style={{ color: "#9e2020", fontSize: 12 }}>{err}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * 4. INVENTORY REPORTS
 * ────────────────────────────────────────────────────── */

/** Supplier-facing columns: what to order and how much, nothing commercial. */
const REORDER_COLUMNS: ExportColumn<InventoryReportRow>[] = [
  { header: "Product", accessor: (r) => r.name },
  { header: "SKU", accessor: (r) => r.sku },
  { header: "Category", accessor: (r) => r.category ?? "" },
  { header: "Stock In Hand", accessor: (r) => r.stockQty },
  { header: "Min Level", accessor: (r) => r.minStockLevel },
  { header: "Suggested Order Qty", accessor: (r) => Math.max(r.minStockLevel - r.stockQty, 1) },
  { header: "Status", accessor: (r) => (r.stockQty === 0 ? "Out of Stock" : "Low Stock") },
];
function InventoryReports() {
  const [data, setData] = useState<InventoryReportsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    inventoryMgmtApi.reports(50)
      .then(setData)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !data) return <div style={{ padding: 12 }}>Loading…</div>;
  if (err) return <div style={{ padding: 12, color: "#9e2020" }}>{err}</div>;
  if (!data) return null;

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 8 }}>
        <Stat label="Total Products" value={String(data.totals.totalProducts)} color="stat-blue" />
        <Stat label="Stock Value (RM)" value={fmt(data.totals.totalValue)} color="stat-green" />
        <Stat label="Potential Profit (RM)" value={fmt(data.totals.potentialProfit)} color="stat-blue" />
        <Stat label="Low Stock" value={String(data.totals.lowStockCount)} color="stat-yellow" />
        <Stat label="Out of Stock" value={String(data.totals.outOfStockCount)} color="stat-red" />
      </div>

      {/* Everything needing replenishment, in one file to send a supplier.
        * Deliberately excludes cost and margin — a vendor seeing your buying
        * price and markup weakens the next negotiation. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <ExportCSV
          filename="reorder-list"
          label={`Export Reorder List (${data.outOfStock.length + data.lowStock.length})`}
          rows={[...data.outOfStock, ...data.lowStock]}
          columns={REORDER_COLUMNS}
        />
        <span style={{ fontSize: 11, color: "#555" }}>
          Out-of-stock and low-stock items with suggested order quantities.
        </span>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-header" style={{ gap: 8 }}>
            <span className="panel-title">Out of Stock ({data.outOfStock.length})</span>
            <span style={{ flex: 1 }} />
            <ExportCSV filename="out-of-stock" label="Export" rows={data.outOfStock} columns={REORDER_COLUMNS} />
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Product</th><th>SKU</th>
                <th className="text-right">Min</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.outOfStock.length === 0 && <tr><td colSpan={4} className="table-empty">All products in stock.</td></tr>}
              {data.outOfStock.map((p) => (
                <tr key={p.id} style={{ background: "#fde2e2" }}>
                  <td>{p.name}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 10 }}>{p.sku}</td>
                  <td className="text-right">{p.minStockLevel}</td>
                  <td className="text-right">{fmt(p.costPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-header" style={{ gap: 8 }}>
            <span className="panel-title">Low Stock ({data.lowStock.length})</span>
            <span style={{ flex: 1 }} />
            <ExportCSV filename="low-stock" label="Export" rows={data.lowStock} columns={REORDER_COLUMNS} />
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Product</th><th>SKU</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Min</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.lowStock.length === 0 && <tr><td colSpan={5} className="table-empty">No low-stock products.</td></tr>}
              {data.lowStock.map((p) => (
                <tr key={p.id} style={{ background: "#fff8e1" }}>
                  <td>{p.name}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 10 }}>{p.sku}</td>
                  <td className="text-right" style={{ color: "#7a5500", fontWeight: 600 }}>{p.stockQty}</td>
                  <td className="text-right">{p.minStockLevel}</td>
                  <td className="text-right">{fmt(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
 * 5. STOCK HISTORY
 * ────────────────────────────────────────────────────── */
function StockHistory() {
  const [logs, setLogs] = useState<StockLogListResponse | null>(null);
  const [filter, setFilter] = useState<"" | "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT">("");
  const [loading, setLoading] = useState(false);

  function reload() {
    setLoading(true);
    stockLogsApi.list(1, 200, filter ? { logType: filter } : undefined)
      .then(setLogs)
      .finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [filter]); // eslint-disable-line

  return (
    <div className="panel">
      <div className="panel-header" style={{ gap: 8 }}>
        <span className="panel-title">Stock Movement History</span>
        <select className="erp-select" value={filter} onChange={(e) => setFilter(e.target.value as "" | "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT")}>
          <option value="">All types</option>
          <option value="PURCHASE_IN">Purchase In</option>
          <option value="JOBCARD_OUT">Sales Out</option>
          <option value="ADJUSTMENT">Adjustment</option>
        </select>
        <span style={{ flex: 1 }} />
        <button className="erp-btn erp-btn-default" onClick={reload}>Refresh</button>
      </div>
      <table className="erp-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Product</th>
            <th>Type</th>
            <th className="text-right">Change</th>
            <th className="text-right">Balance</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={6} className="table-empty">Loading…</td></tr>}
          {!loading && (!logs || logs.data.length === 0) && (
            <tr><td colSpan={6} className="table-empty">No stock movements.</td></tr>
          )}
          {logs?.data.map((l) => (
            <tr key={l.id}>
              <td style={{ fontSize: 10 }}>{new Date(l.createdAt).toLocaleString()}</td>
              <td>{l.part.name} <span style={{ fontFamily: "monospace", fontSize: 10, color: "#666" }}>({l.part.sku})</span></td>
              <td>
                <span style={{
                  padding: "1px 6px", fontSize: 10, color: "#fff", borderRadius: 2,
                  background: l.logType === "PURCHASE_IN" ? "#0a7a30" :
                             l.logType === "JOBCARD_OUT" ? "#9e2020" : "#7a5500",
                }}>
                  {l.logType === "PURCHASE_IN" ? "IN" : l.logType === "JOBCARD_OUT" ? "OUT" : "ADJ"}
                </span>
              </td>
              <td className="text-right" style={{
                color: l.changeQty > 0 ? "#0a7a30" : "#9e2020", fontWeight: 600,
              }}>
                {l.changeQty > 0 ? "+" : ""}{l.changeQty}
              </td>
              <td className="text-right">{l.balanceQty}</td>
              <td style={{ fontSize: 10 }}>{l.notes ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────── */
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
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

function Th({
  children, onClick, active, dir, className,
}: {
  children: React.ReactNode; onClick: () => void; active: boolean;
  dir: "asc" | "desc"; className?: string;
}) {
  return (
    <th className={className} onClick={onClick}
      style={{ cursor: "pointer", userSelect: "none" }}>
      {children}
      {active && <span style={{ marginLeft: 4, fontSize: 9 }}>{dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

function fmt(n: number) {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InventoryManagementPage() {
  return (
    <AdminOnly>
      <InventoryManagementPageInner />
    </AdminOnly>
  );
}
