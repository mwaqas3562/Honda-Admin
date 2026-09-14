"use client";

import { useMemo } from "react";
import type { InvoiceData, InvoiceItemData } from "@/lib/api";
import { RECEIPT_WIDTH_MM, RECEIPT_SIDE_PAD_MM, RECEIPT_LEFT_MM } from "@/lib/receipt-size";

type Props = {
  inv: InvoiceData;
};

const money = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Thermal receipt, laid out to match the bill the workshop printed from its
 * previous software: centred shop block, bill number and date on one line,
 * Parts and Z.Labour sections each under a dashed rule, and right-aligned
 * totals.
 *
 * Single source of truth for the printed bill — used by the print page and the
 * in-app preview, so the two cannot drift apart.
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

  const date = new Date(inv.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "2-digit",
  });
  const subtotal = Math.round(Number(inv.subtotal) + Number(inv.discountAmt));
  const discountAmt = Math.round(Number(inv.discountAmt));
  const total = Math.round(Number(inv.totalAmount));

  const shopName = inv.shop?.name ?? "Workshop";
  const shopAddress = inv.shop?.address ?? "";
  const shopPhone = inv.shop?.phone ?? "";
  const meterReading = inv.jobCard?.meterReading ?? null;

  const rows = (items: InvoiceItemData[]) =>
    items.map((it) => (
      <tr key={it.id}>
        <td className="item-name">{it.itemName}</td>
        <td className="num">{Number(it.qty)}</td>
        <td className="num">{money(Number(it.rate))}</td>
        <td className="num">{money(Number(it.total))}</td>
      </tr>
    ));

  return (
    <div className="receipt">
      {/* Shop identity */}
      <div className="shop-name">{shopName}</div>
      {shopAddress && <div className="shop-sub">{shopAddress}</div>}
      {shopPhone && <div className="shop-sub ph">Ph. {shopPhone}</div>}

      <hr className="dashed" />

      {/* Bill meta */}
      <div className="meta">
        <div className="meta-row">
          <span><b>Bill No.</b> {inv.invoiceNumber}</span>
          <span><b>Date</b> {date}</span>
        </div>
        {meterReading != null && (
          <div className="meta-row">
            <span><b>Meter</b> {money(meterReading)} KM</span>
          </div>
        )}
        {inv.jobCard?.vehicleRegNo && (
          <div className="meta-row"><span><b>Reg#</b> {inv.jobCard.vehicleRegNo}</span></div>
        )}
        <div className="meta-row"><span><b>Customer</b> {inv.customer?.name ?? "Walk-in"}</span></div>
      </div>

      {/* Line items */}
      <table className="lines">
        <colgroup>
          <col />
          <col style={{ width: "7mm" }} />
          <col style={{ width: "12mm" }} />
          <col style={{ width: "13mm" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Total</th>
          </tr>
        </thead>

        {parts.length > 0 && (
          <tbody>
            <tr className="section"><td colSpan={4}>Parts</td></tr>
            {rows(parts)}
          </tbody>
        )}

        {labour.length > 0 && (
          <tbody>
            <tr className="section"><td colSpan={4}>Z.Labour</td></tr>
            {rows(labour)}
          </tbody>
        )}
      </table>

      <hr className="dotted" />

      {/* Totals */}
      <table className="totals">
        <tbody>
          <tr><td>Sub Total</td><td className="num">{money(subtotal)}</td></tr>
          <tr><td>Discount</td><td className="num">{discountAmt > 0 ? money(discountAmt) : "0"}</td></tr>
          <tr className="grand"><td>Grand Total</td><td className="num">{money(total)}</td></tr>
        </tbody>
      </table>

      <div className="footer" dir="rtl" lang="ur">آپ کی تشریف آوری کا شکریہ</div>
    </div>
  );
}

/* Receipt CSS. Width comes from receipt-size.ts, measured against the shop's
 * own printer rather than a spec sheet — see that file for why. */
export const RECEIPT_CSS = `
.receipt * { box-sizing: border-box; }
.receipt {
  width: ${RECEIPT_WIDTH_MM}mm;
  /* Left-aligned at the head's printable origin, not centred: centring splits
     any width error across both edges, which is what lost the left column. */
  margin: 0 0 0 ${RECEIPT_LEFT_MM}mm;
  padding: 2mm ${RECEIPT_SIDE_PAD_MM}mm;
  background: #fff;
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 8.5px;
  line-height: 1.35;
  color: #000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.receipt .shop-name {
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.2px;
}
.receipt .shop-sub { text-align: center; font-size: 8px; line-height: 1.3; }
.receipt .shop-sub.ph { margin-top: 1mm; }
.receipt .dashed { border: 0; border-top: 1px dashed #000; margin: 1.6mm 0; }
.receipt .dotted { border: 0; border-top: 1px dotted #000; margin: 1.6mm 0; }

.receipt .meta { font-size: 9px; }
.receipt .meta-row { display: flex; justify-content: space-between; gap: 3mm; padding: 0.3mm 0; }
.receipt .meta-row b { font-weight: 700; }

.receipt table.lines { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 1.4mm; }
.receipt table.lines th {
  border-top: 1px solid #000; border-bottom: 1px solid #000;
  font-weight: 700; text-align: left; padding: 0.7mm 0; font-size: 9px;
}
.receipt table.lines td { padding: 0.55mm 0; vertical-align: top; }
.receipt table.lines td.num, .receipt table.lines th.num { text-align: right; white-space: nowrap; }
.receipt .item-name { word-break: break-word; overflow-wrap: anywhere; padding-right: 1mm; }
.receipt tr.section td {
  font-weight: 700; font-size: 9px;
  padding-top: 1.6mm; padding-bottom: 0.6mm;
  border-bottom: 1px dashed #000;
}

.receipt table.totals { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 0.6mm; }
.receipt table.totals td { padding: 0.5mm 0; font-weight: 700; }
.receipt table.totals td.num { text-align: right; white-space: nowrap; }
.receipt table.totals tr.grand td { font-size: 10.5px; padding-top: 1mm; }

.receipt .footer {
  text-align: center;
  margin-top: 3mm;
  font-family: "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Urdu Typesetting",
               "Segoe UI", Tahoma, Arial, sans-serif;
  direction: rtl;
  unicode-bidi: isolate;
  font-size: 11px;
  line-height: 1.9;
}
`;
