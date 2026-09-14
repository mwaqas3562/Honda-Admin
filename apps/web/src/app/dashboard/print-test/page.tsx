"use client";

import { useState } from "react";

/**
 * Printer calibration page.
 *
 * Receipts were coming out clipped on both edges, which means the layout is
 * wider than the print head actually covers. Rather than guess the paper size,
 * this prints rulers at a range of widths: whichever bars print complete tell
 * you the true printable width, and that number goes into the receipt.
 *
 * Open /dashboard/print-test, print it, and read off the widest complete bar.
 */
const WIDTHS = [48, 54, 58, 64, 68, 70, 72, 76, 80];

export default function PrintTestPage() {
  const [pageWidth, setPageWidth] = useState(80);

  return (
    <>
      <style jsx global>{`
        @page { size: ${pageWidth}mm auto; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .no-print { display: none !important; }
        }
        .cal {
          width: ${pageWidth}mm;
          margin: 0 auto;
          background: #fff;
          color: #000;
          font-family: "Courier New", monospace;
          font-size: 10px;
          padding: 2mm 0;
        }
        .cal .bar {
          background: #000;
          color: #fff;
          height: 5mm;
          line-height: 5mm;
          margin: 1.2mm 0;
          font-size: 9px;
          text-align: right;
          padding-right: 1mm;
          white-space: nowrap;
          overflow: hidden;
        }
        .cal .edge { display: flex; justify-content: space-between; font-weight: 700; }
      `}</style>

      <div className="no-print" style={{ padding: 16, fontFamily: "system-ui", maxWidth: 640 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Printer width calibration</h1>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
          Print this on the thermal printer. Each black bar is labelled with its width in
          millimetres. <strong>Find the widest bar that prints complete</strong> — with its
          number visible at the right-hand end and no ink running off either edge. That is
          your printable width.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
          The <code>|&lt;</code> and <code>&gt;|</code> markers should both be visible. If
          either is missing, the page itself is too wide — lower the page size below and
          print again.
        </p>
        <label style={{ fontSize: 13, display: "block", margin: "12px 0" }}>
          Page size:{" "}
          <select
            value={pageWidth}
            onChange={(e) => setPageWidth(Number(e.target.value))}
            style={{ padding: 4, fontSize: 13 }}
          >
            {[58, 72, 76, 80].map((w) => (
              <option key={w} value={w}>{w}mm</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => window.print()}
          style={{ padding: "8px 18px", fontSize: 14, cursor: "pointer" }}
        >
          🖨 Print calibration page
        </button>
      </div>

      <div className="cal">
        <div className="edge"><span>|&lt;</span><span>{pageWidth}mm page</span><span>&gt;|</span></div>
        {WIDTHS.filter((w) => w <= pageWidth).map((w) => (
          <div key={w} className="bar" style={{ width: `${w}mm` }}>{w}mm</div>
        ))}
        <div className="edge"><span>|&lt;</span><span>&gt;|</span></div>
        <div style={{ textAlign: "center", fontSize: 9, marginTop: "2mm" }}>
          widest complete bar = printable width
        </div>
      </div>
    </>
  );
}
