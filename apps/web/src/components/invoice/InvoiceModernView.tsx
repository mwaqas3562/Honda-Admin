"use client";

import { useMemo } from "react";
import type { InvoiceData, InvoiceItemData } from "@/lib/api";

type Props = { inv: InvoiceData };

function fmt(n: number) {
  return n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * On-screen invoice preview styled like a clean thermal-receipt:
 *  - circular logo badge + bold shop name on top
 *  - centered address / phone
 *  - --- PARTS --- / --- LABOUR --- section dividers
 *  - clean totals with bold Grand Total / Balance Due
 * Print remains the 80mm thermal layout in InvoiceReceipt.
 */
export default function InvoiceModernView({ inv }: Props) {
  const { parts, labour } = useMemo(() => {
    const p: InvoiceItemData[] = [];
    const l: InvoiceItemData[] = [];
    for (const it of inv.items ?? []) {
      if (it.partId) p.push(it);
      else l.push(it);
    }
    return { parts: p, labour: l };
  }, [inv]);

  const date = new Date(inv.createdAt).toLocaleDateString("en-GB");
  const subtotal = Math.round(Number(inv.subtotal) + Number(inv.discountAmt));
  const discountAmt = Math.round(Number(inv.discountAmt));
  const total = Math.round(Number(inv.totalAmount));
  const paid = Math.round(Number(inv.paidAmount));
  const balance = total - paid;

  const shopName = inv.shop?.name ?? "Workshop";
  const shopAddress = inv.shop?.address ?? "";
  const shopPhone = inv.shop?.phone ?? "";

  const initials = shopName
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <div style={{
      background: "#fff", color: "#111827",
      fontFamily: '"Segoe UI", Arial, sans-serif',
      fontSize: 13, padding: "26px 30px",
      width: 560, maxWidth: "100%",
      boxShadow: "0 0 12px rgba(0,0,0,0.18)", borderRadius: 4,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "#dc2626", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 18, letterSpacing: 1, flexShrink: 0,
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}>{initials || "WS"}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: 0.5, lineHeight: 1.1 }}>
          {shopName}
        </div>
      </div>

      {(shopAddress || shopPhone) && (
        <div style={{ textAlign: "center", color: "#475569", fontSize: 12, marginTop: 4 }}>
          {shopAddress && <div>{shopAddress}</div>}
          {shopPhone && <div>Phone: {shopPhone}</div>}
        </div>
      )}

      <div style={{ borderTop: "2px solid #0f172a", margin: "14px 0 10px" }} />

      {/* Bill meta */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12.5 }}>
        <Meta label="Bill No" value={inv.invoiceNumber} bold />
        <Meta label="Date" value={date} align="right" />
        {inv.jobCard?.vehicleRegNo && (
          <div style={{ gridColumn: "1 / -1" }}>
            <Meta label="Vehicle" value={inv.jobCard.vehicleRegNo} />
          </div>
        )}
        <Meta label="Customer" value={inv.customer?.name ?? "Walk-in"} />
        {inv.jobCard && (
          <Meta
            label="Meter Reading"
            value={inv.jobCard.meterReading != null ? `${inv.jobCard.meterReading.toLocaleString()} km` : "—"}
          />
        )}
      </div>

      {parts.length > 0 && <Section title="Parts"><ItemTable items={parts} /></Section>}
      {labour.length > 0 && <Section title="Labour"><ItemTable items={labour} /></Section>}
      {parts.length === 0 && labour.length === 0 && (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: 20 }}>No items.</div>
      )}

      {/* Totals */}
      <div style={{ borderTop: "1px dashed #94a3b8", marginTop: 12, paddingTop: 8 }}>
        <Total label="Sub Total" value={fmt(subtotal)} />
        {discountAmt > 0 && (
          <Total label={`Discount (${Math.round(Number(inv.discountPct))}%)`} value={`-${fmt(discountAmt)}`} />
        )}
        {paid > 0 && <Total label="Paid" value={fmt(paid)} />}
        <div style={{
          display: "flex", justifyContent: "space-between",
          marginTop: 6, paddingTop: 6, borderTop: "1.5px solid #0f172a",
          fontSize: 16, fontWeight: 800, color: "#0f172a",
        }}>
          <span>{paid > 0 ? "Balance Due" : "Grand Total"}</span>
          <span>Rs. {fmt(paid > 0 ? balance : total)}</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
        <span style={{
          padding: "3px 14px", borderRadius: 12,
          fontSize: 11, fontWeight: 700, letterSpacing: 1,
          background: inv.status === "PAID" ? "#dcfce7" : inv.status === "DRAFT" ? "#fef3c7" : "#dbeafe",
          color: inv.status === "PAID" ? "#166534" : inv.status === "DRAFT" ? "#92400e" : "#1e40af",
        }}>{inv.status}</span>
      </div>

      <div style={{
        marginTop: 14, paddingTop: 10, borderTop: "1px dashed #cbd5e1",
        textAlign: "center", color: "#64748b", fontSize: 11.5, fontStyle: "italic",
      }}>
        Thank you for your business!
      </div>
    </div>
  );
}

function Meta({ label, value, bold = false, align = "left" }:
  { label: string; value: string; bold?: boolean; align?: "left" | "right" }) {
  return (
    <div style={{ textAlign: align }}>
      <span style={{ color: "#64748b" }}>{label}: </span>
      <span style={{ color: "#0f172a", fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        textAlign: "center", fontWeight: 700, fontSize: 12,
        color: "#0f172a", letterSpacing: 1.5, position: "relative",
      }}>
        <span style={{ position: "absolute", left: 0, top: "50%", width: "38%", borderTop: "1px dashed #94a3b8" }} />
        <span style={{ background: "#fff", padding: "0 10px", position: "relative", zIndex: 1 }}>
          {title.toUpperCase()}
        </span>
        <span style={{ position: "absolute", right: 0, top: "50%", width: "38%", borderTop: "1px dashed #94a3b8" }} />
      </div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

function ItemTable({ items }: { items: InvoiceItemData[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
      <thead>
        <tr style={{ color: "#475569", borderBottom: "1px solid #cbd5e1" }}>
          <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600 }}>Item</th>
          <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, width: 50 }}>Qty</th>
          <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, width: 70 }}>Rate</th>
          <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, width: 80 }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.id} style={{ borderBottom: "1px dotted #e2e8f0" }}>
            <td style={{ padding: "5px 6px" }}>
              {it.itemName}
              {it.remarks ? <div style={{ color: "#64748b", fontSize: 11 }}>{it.remarks}</div> : null}
            </td>
            <td style={{ padding: "5px 6px", textAlign: "right" }}>{Number(it.qty)}</td>
            <td style={{ padding: "5px 6px", textAlign: "right" }}>{fmt(Math.round(Number(it.rate)))}</td>
            <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 600 }}>{fmt(Math.round(Number(it.total)))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#475569" }}>
      <span>{label}</span>
      <span style={{ color: "#0f172a", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
