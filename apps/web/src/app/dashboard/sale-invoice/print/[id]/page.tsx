"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { invoiceApi, type InvoiceData, type InvoiceItemData } from "@/lib/api";

export default function InvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const embed = searchParams?.get("embed") === "1";
  const id = params?.id;
  const [inv, setInv] = useState<InvoiceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    invoiceApi
      .get(id)
      .then((data) => {
        setInv(data);
        if (!embed) setTimeout(() => window.print(), 350);
      })
      .catch((e) => setError(e?.message ?? "Failed to load invoice"));
  }, [id, embed]);

  const { parts, labour } = useMemo(() => {
    const p: InvoiceItemData[] = [];
    const l: InvoiceItemData[] = [];
    for (const it of inv?.items ?? []) {
      if (it.partId) p.push(it);
      else l.push(it);
    }
    return { parts: p, labour: l };
  }, [inv]);

  if (error) return <div style={{ padding: 24, fontFamily: "monospace" }}>Error: {error}</div>;
  if (!inv) return <div style={{ padding: 24, fontFamily: "monospace" }}>Loading…</div>;

  const date = new Date(inv.createdAt).toLocaleDateString("en-GB");
  const subtotal = Math.round(Number(inv.subtotal) + Number(inv.discountAmt));
  const discountAmt = Math.round(Number(inv.discountAmt));
  const total = Math.round(Number(inv.totalAmount));

  const shopName = inv.shop?.name ?? "Workshop";
  const shopAddress = inv.shop?.address ?? "";
  const shopPhone = inv.shop?.phone ?? "";

  return (
    <>
      <style jsx global>{`
        /* ── CBM 1000  80 mm / 3-inch thermal ── */
        @page {
          size: 80mm auto;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            width: 80mm !important;
          }
          .no-print { display: none !important; }
          .receipt {
            margin: 0 !important;
            box-shadow: none !important;
            width: 80mm !important;
            padding: 2mm 3mm !important;
          }
        }
        * { box-sizing: border-box; }
        body {
          background: #e0e0e0;
          font-family: "Courier New", "Consolas", monospace;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .receipt {
          width: 80mm;
          margin: 12px auto;
          padding: 3mm 4mm;
          background: #fff;
          font-size: 10px;
          line-height: 1.3;
          box-shadow: 0 0 6px rgba(0,0,0,0.18);
        }
        .center { text-align: center; }
        .bold { font-weight: 700; }
        .muted { color: #555; font-size: 9px; }
        .shop-name { font-size: 13px; font-weight: 700; letter-spacing: 0.3px; }
        .shop-sub  { font-size: 9.5px; }
        .dashed { border: 0; border-top: 1px dashed #000; margin: 3px 0; }
        .row { display: flex; justify-content: space-between; gap: 4px; }
        .section-title {
          text-align: center; font-weight: 700;
          margin: 3px 0 1px; font-size: 10px;
        }
        table.lines { width: 100%; border-collapse: collapse; font-size: 9.5px; }
        table.lines th,
        table.lines td  { padding: 1px 0; vertical-align: top; }
        table.lines th  { border-bottom: 1px dashed #000; font-weight: 700; text-align: left; }
        table.lines td.num,
        table.lines th.num { text-align: right; white-space: nowrap; }
        .item-name { word-break: break-word; }
        .totals { margin-top: 3px; font-size: 10px; }
        .grand { font-size: 11.5px; font-weight: 700; }
        .footer { text-align: center; margin-top: 6px; font-size: 9.5px; }
        .print-btn {
          display: block; margin: 10px auto; padding: 5px 16px;
          font-size: 12px; font-family: inherit;
          background: #003a80; color: #fff; border: none;
          cursor: pointer; border-radius: 3px;
        }
      `}</style>

      <button className="print-btn no-print" onClick={() => window.print()} style={{ display: embed ? "none" : undefined }}>
        🖨 Print
      </button>

      <div className="receipt">
        <div className="center shop-name">{shopName}</div>
        {shopAddress && <div className="center">{shopAddress}</div>}
        {shopPhone && <div className="center">Ph: {shopPhone}</div>}

        <hr className="dashed" />

        <div className="row">
          <span>Bill No:</span>
          <span className="bold">{inv.invoiceNumber}</span>
        </div>
        <div className="row">
          <span>Date:</span>
          <span>{date}</span>
        </div>
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
        {inv.jobCard?.vehicleRegNo && (
          <div className="row">
            <span>Vehicle:</span>
            <span>{inv.jobCard.vehicleRegNo}</span>
          </div>
        )}

        {parts.length > 0 && (
          <>
            <hr className="dashed" />
            <div className="section-title">--- Parts ---</div>
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

        {labour.length > 0 && (
          <>
            <hr className="dashed" />
            <div className="section-title">--- Labour ---</div>
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

        <hr className="dashed" />
        <div className="totals">
          <div className="row">
            <span>Sub Total:</span>
            <span>{subtotal}</span>
          </div>
          {discountAmt > 0 && (
            <div className="row">
              <span>Discount:</span>
              <span>-{discountAmt}</span>
            </div>
          )}
          <hr className="dashed" />
          <div className="row grand">
            <span>Grand Total:</span>
            <span>{total}</span>
          </div>
        </div>

        <hr className="dashed" />
        <div className="footer">
          <div className="bold">Thank you for your business!</div>
        </div>
      </div>
    </>
  );
}
