"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { invoiceApi, type InvoiceData } from "@/lib/api";
import InvoiceReceipt, { RECEIPT_CSS } from "@/components/invoice/InvoiceReceipt";
import { RECEIPT_PAGE_MM, RECEIPT_WIDTH_MM } from "@/lib/receipt-size";

/**
 * Standalone print view. Renders the shared InvoiceReceipt so the printed
 * output is identical to the in-app preview — this page used to carry its own
 * copy of the receipt markup, and the two had already drifted apart.
 *
 * `?embed=1` suppresses the automatic print dialog and the on-screen button,
 * for when the page is displayed inside another view.
 */
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

  if (error) return <div style={{ padding: 24, fontFamily: "monospace" }}>Error: {error}</div>;
  if (!inv) return <div style={{ padding: 24, fontFamily: "monospace" }}>Loading…</div>;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        ${RECEIPT_CSS}

        /* Paper and printable width both come from receipt-size.ts, measured
           against the shop's own printer rather than its spec sheet. */
        @page {
          size: ${RECEIPT_PAGE_MM}mm auto;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            width: ${RECEIPT_PAGE_MM}mm !important;
          }
          .no-print { display: none !important; }

          /* This route sits under /dashboard, so it inherits the app shell.
             Printed as-is the sidebar takes most of the paper and squeezes the
             receipt into a column a few characters wide. Strip the chrome and
             let the receipt own the page. */
          .sidebar, .topbar { display: none !important; }
          .erp-shell, .erp-main, .erp-content {
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            width: ${RECEIPT_PAGE_MM}mm !important;
            min-width: 0 !important;
            max-width: none !important;
            background: #fff !important;
            overflow: visible !important;
          }

          .receipt {
            margin: 0 !important;
            box-shadow: none !important;
          }
        }

        /* On-screen preview only — the paper itself has no grey backdrop. */
        body { background: #e0e0e0; }
        .receipt { margin: 12px auto; box-shadow: 0 0 6px rgba(0,0,0,0.18); }
        .print-btn {
          display: block; margin: 10px auto; padding: 5px 16px;
          font-size: 12px; font-family: inherit;
          background: #003a80; color: #fff; border: none;
          cursor: pointer; border-radius: 3px;
        }
      `,
        }}
      />

      {!embed && (
        <button className="print-btn no-print" onClick={() => window.print()}>
          🖨 Print
        </button>
      )}

      <InvoiceReceipt inv={inv} />
    </>
  );
}
