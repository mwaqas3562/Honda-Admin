"use client";

import { useMemo } from "react";
import type { InvoiceData, InvoiceItemData } from "@/lib/api";

type Props = {
  inv: InvoiceData;
};

/**
 * Pure 80mm thermal-receipt renderer. No fetching, no print triggers.
 * Single source of truth for the printed bill — used by the print page and
 * by the in-app preview modal, so the two cannot drift apart.
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
  const meterReading = inv.jobCard?.meterReading ?? null;

  return (
    <div className="receipt">
      {/* Shop identity */}
      <div className="center shop-name">{shopName}</div>
      {shopAddress && <div className="center shop-sub">{shopAddress}</div>}
      {shopPhone && <div className="center shop-sub">Ph: {shopPhone}</div>}

      <hr className="dashed" />

      {/* Bill meta */}
      <div className="row">
        <span>Bill No.:</span>
        <span className="bold">{inv.invoiceNumber}</span>
      </div>
      <div className="row">
        <span>Date:</span>
        <span>{date}</span>
      </div>
      {meterReading != null && (
        <div className="row">
          <span>Meter Reading:</span>
          <span>{meterReading} KM</span>
        </div>
      )}
      {inv.jobCard?.vehicleRegNo && (
        <div className="row">
          <span>Reg#:</span>
          <span>{inv.jobCard.vehicleRegNo}</span>
        </div>
      )}
      <div className="row">
        <span>Customer:</span>
        <span>{inv.customer?.name ?? "Walk-in"}</span>
      </div>
      {inv.cellNo && (
        <div className="row">
          <span>Cell:</span>
          <span>{inv.cellNo}</span>
        </div>
      )}

      {/* Parts */}
      {parts.length > 0 && (
        <>
          <div className="section-title">Parts</div>
          <table className="lines parts">
            <colgroup>
              <col />
              <col style={{ width: "7mm" }} />
              <col style={{ width: "13mm" }} />
              <col style={{ width: "15mm" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                <th className="num">Total</th>
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

      {/* Labour */}
      {labour.length > 0 && (
        <>
          <div className="section-title">Z.Labour</div>
          <table className="lines labour">
            <colgroup>
              <col />
              <col style={{ width: "18mm" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Description</th>
                <th className="num">Amount</th>
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

      {/* Totals */}
      <hr className="dashed" />
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

      <div className="footer" dir="rtl" lang="ur">آپ کی تشریف آوری کا شکریہ</div>
    </div>
  );
}

/* Shared receipt CSS — 80mm roll, 72mm printable area (576 dots @ 203dpi).
 *
 * The page is laid out at 72mm, the *printable* width, not 80mm, the paper
 * width. The print head only covers 72mm, so a wider layout is either clipped
 * at the right edge — which is what turned "Total" into "Tota" and 670 into
 * 67C on earlier bills — or silently shrunk by the browser's fit-to-page
 * scaling, which makes the text smaller than intended. Matching the printable
 * width exactly avoids both.
 *
 * `table-layout: fixed` keeps a long part name from pushing the number
 * columns past that edge. */
export const RECEIPT_CSS = `
* { box-sizing: border-box; }
.receipt {
  width: 72mm;
  margin: 0 auto;
  padding: 3mm 1.5mm;
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
.receipt .shop-sub { font-size: 9px; line-height: 1.25; }
.receipt .dashed { border: 0; border-top: 1px dashed #000; margin: 3px 0; }
.receipt .row { display: flex; justify-content: space-between; gap: 4px; }
.receipt .section-title { text-align: center; font-weight: 700; margin: 3px 0 1px; font-size: 10px; }
.receipt table.lines {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 9.5px;
}
.receipt table.lines th, .receipt table.lines td { padding: 1px 0; vertical-align: top; }
.receipt table.lines th { border-bottom: 1px dashed #000; font-weight: 700; text-align: left; }
.receipt table.lines td.num, .receipt table.lines th.num { text-align: right; white-space: nowrap; }
.receipt .item-name { word-break: break-word; overflow-wrap: anywhere; }
.receipt .totals { margin-top: 3px; font-size: 10px; }
.receipt .grand { font-size: 11.5px; font-weight: 700; margin-top: 2px; }
.receipt .footer {
  text-align: center;
  margin-top: 6px;
  /* Courier/Consolas carry no Urdu glyphs — fall back through the
   * Nastaliq faces shipped on Windows POS machines, then any Arabic-capable
   * system font, so the line never renders as empty boxes. */
  font-family: "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Urdu Typesetting",
               "Segoe UI", Tahoma, Arial, sans-serif;
  direction: rtl;
  unicode-bidi: isolate;
  font-size: 12px;
  line-height: 1.9;
}
`;
