"use client";

import { useMemo } from "react";
import type { InvoiceData, InvoiceItemData } from "@/lib/api";

type Props = {
  inv: InvoiceData;
};

/**
 * Pure 80mm thermal-receipt renderer. No fetching, no print triggers.
 * Used by the print page and the in-app preview modal.
 */
export default function InvoiceReceipt({ inv }: Props) {
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

  const shopName = inv.shop?.name ?? "Workshop";
  const shopAddress = inv.shop?.address ?? "";
  const shopPhone = inv.shop?.phone ?? "";

  return (
    <div className="receipt">
      {/* Header: Bill No, Date, Reg#, Customer */}
      <div className="center shop-name">{shopName}</div>
      {shopPhone && <div className="center">Ph: {shopPhone}</div>}
      <div className="row">
        <span>Bill No.:</span>
        <span className="bold">{inv.invoiceNumber}</span>
      </div>
      <div className="row">
        <span>Date:</span>
        <span>{date}</span>
      </div>
      {inv.jobCard?.vehicleRegNo && (
        <div className="row">
          <span>Reg#:</span>
          <span>{inv.jobCard.vehicleRegNo}</span>
        </div>
      )}

      {/* Parts Section */}
      {parts.length > 0 && (
        <>
          <div className="section-title">Parts</div>
          <table className="lines">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num" style={{ width: "8mm" }}>Qty</th>
                <th className="num" style={{ width: "13mm" }}>Rate</th>
                <th className="num" style={{ width: "14mm" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((it) => (
                <tr key={it.id}>
                  <td className="item-name">{it.itemName}</td>
                  <td className="num">{Number(it.qty)}</td>
                  <td className="num">{Math.round(Number(it.rate))}</td>
                  <td className="num">{Math.round(Number(it.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Labour Section as Z.Labour */}
      {labour.length > 0 && (
        <>
          <div className="section-title">Z.Labour</div>
          <table className="lines">
            <thead>
              <tr>
                <th>Description</th>
                <th className="num" style={{ width: "18mm" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {labour.map((it) => (
                <tr key={it.id}>
                  <td className="item-name">
                    {it.itemName}
                    {it.remarks ? <div className="muted">{it.remarks}</div> : null}
                  </td>
                  <td className="num">{Math.round(Number(it.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Totals Section */}
      <div className="totals">
        <div className="row">
          <span>Sub Total</span>
          <span>{subtotal}</span>
        </div>
        <div className="row">
          <span>Discount</span>
          <span>{discountAmt > 0 ? `-${discountAmt}` : "0"}</span>
        </div>
        <div className="row grand">
          <span>Grand Total</span>
          <span>{total}</span>
        </div>
      </div>
    </div>
  );
}

/** Shared receipt CSS — CBM 1000 80mm / 3-inch thermal printer. */
export const RECEIPT_CSS = `
* { box-sizing: border-box; }
.receipt {
  width: 80mm;
  margin: 0 auto;
  padding: 3mm 4mm;
  background: #fff;
  font-family: "Courier New", "Consolas", monospace;
  font-size: 10px;
  line-height: 1.3;
  color: #000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.receipt .center { text-align: center; }
.receipt .bold { font-weight: 700; }
.receipt .muted { color: #555; font-size: 9px; }
.receipt .shop-name { font-size: 13px; font-weight: 700; letter-spacing: 0.3px; }
.receipt .shop-sub { font-size: 9.5px; }
.receipt .dashed { border: 0; border-top: 1px dashed #000; margin: 3px 0; }
.receipt .row { display: flex; justify-content: space-between; gap: 4px; }
.receipt .section-title { text-align: center; font-weight: 700; margin: 3px 0 1px; font-size: 10px; }
.receipt table.lines { width: 100%; border-collapse: collapse; font-size: 9.5px; }
.receipt table.lines th, .receipt table.lines td { padding: 1px 0; vertical-align: top; }
.receipt table.lines th { border-bottom: 1px dashed #000; font-weight: 700; text-align: left; }
.receipt table.lines td.num, .receipt table.lines th.num { text-align: right; white-space: nowrap; }
.receipt .item-name { word-break: break-word; }
.receipt .totals { margin-top: 3px; font-size: 10px; }
.receipt .grand { font-size: 11.5px; font-weight: 700; }
.receipt .footer { text-align: center; margin-top: 6px; font-size: 9.5px; }
`;
