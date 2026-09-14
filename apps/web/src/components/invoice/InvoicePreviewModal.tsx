"use client";

import { useEffect, useRef, useState } from "react";
import { invoiceApi, type InvoiceData } from "@/lib/api";
import InvoiceReceipt, { RECEIPT_CSS } from "./InvoiceReceipt";
import { RECEIPT_PAGE_MM } from "@/lib/receipt-size";
import InvoiceModernView from "./InvoiceModernView";

type Props = {
  invoiceId: string;
  status: string;
  canMarkPaid: boolean;
  marking?: boolean;
  onMarkPaid: () => void;
  onClose: () => void;
  /** Bump this number to fire a print. Each new value prints once, so the
   *  same invoice can be reprinted as many times as needed. */
  printSignal?: number;
};

export default function InvoicePreviewModal({
  invoiceId,
  status,
  canMarkPaid,
  marking = false,
  onMarkPaid,
  onClose,
  printSignal = 0,
}: Props) {
  const [inv, setInv] = useState<InvoiceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Fetch invoice */
  useEffect(() => {
    let cancelled = false;
    invoiceApi.get(invoiceId)
      .then((d) => { if (!cancelled) setInv(d); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed to load invoice"); });
    return () => { cancelled = true; };
  }, [invoiceId]);

  /* Print whenever the signal changes and the invoice is loaded. Tracking the
   * last printed value means a repeated bump reprints, while a re-render with
   * the same value does not. */
  const lastPrinted = useRef(0);
  useEffect(() => {
    if (!inv || !printSignal || printSignal === lastPrinted.current) return;
    lastPrinted.current = printSignal;
    const t = setTimeout(() => handlePrint(), 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printSignal, inv]);

  /* Close on Esc */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handlePrint() {
    document.body.classList.add("ipm-printing");
    const cleanup = () => {
      document.body.classList.remove("ipm-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <style jsx global>{`
        ${RECEIPT_CSS}
        /* Hide the thermal receipt on screen — it only exists for printing. */
        #ipm-print-area { display: none; }
        @media print {
          @page { size: ${RECEIPT_PAGE_MM}mm auto; margin: 0; }
          body.ipm-printing * { visibility: hidden !important; }
          /* belt and braces: the shell is hidden outright, not just made
           * invisible, so it cannot reserve space on the page */
          body.ipm-printing .sidebar, body.ipm-printing .topbar { display: none !important; }
          body.ipm-printing #ipm-print-area, body.ipm-printing #ipm-print-area * { visibility: visible !important; }
          body.ipm-printing #ipm-print-area {
            display: block !important;
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: ${RECEIPT_PAGE_MM}mm !important;
            margin: 0 !important; padding: 0 !important;
            background: #fff !important;
          }
          /* Only the shadow goes. The receipt's own left margin is what clears
             the print head's dead zone, so it must survive. */
          body.ipm-printing #ipm-print-area .receipt { box-shadow: none !important; }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 6, width: 820, maxWidth: "100%",
          maxHeight: "92vh", display: "flex", flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "10px 14px", borderBottom: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>
            Invoice Preview
            <span style={{
              marginLeft: 10, fontSize: 11, fontWeight: 600,
              padding: "2px 8px", borderRadius: 10,
              background: status === "PAID" ? "#dcfce7" : status === "DRAFT" ? "#fef3c7" : "#dbeafe",
              color: status === "PAID" ? "#166534" : status === "DRAFT" ? "#92400e" : "#1e40af",
            }}>
              {status}
            </span>
          </div>
          <button
            type="button" onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body — modern A4 view on screen; thermal receipt is hidden but used for print */}
        <div style={{ flex: 1, overflow: "auto", background: "#e5e7eb", padding: 20 }}>
          {error && (
            <div style={{ color: "#b91c1c", fontFamily: "monospace" }}>Error: {error}</div>
          )}
          {!inv && !error && (
            <div style={{ color: "#555", fontFamily: "monospace", textAlign: "center" }}>Loading…</div>
          )}
          {inv && (
            <>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <InvoiceModernView inv={inv} />
              </div>
              {/* Hidden thermal receipt — only rendered to the printer. */}
              <div id="ipm-print-area">
                <InvoiceReceipt inv={inv} />
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: 10, borderTop: "1px solid #e5e7eb",
          display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap",
        }}>
          <button
            type="button" onClick={onClose}
            className="erp-btn"
            style={{ padding: "6px 14px" }}
          >
            Close
          </button>
          {canMarkPaid && status !== "PAID" && (
            <button
              type="button" onClick={onMarkPaid} disabled={marking || !inv}
              className="erp-btn"
              style={{ padding: "6px 14px", background: "#0a7a30", color: "#fff", border: "none", borderRadius: 4 }}
            >
              {marking ? "…" : "✓ Mark as Paid"}
            </button>
          )}
          <button
            type="button" onClick={handlePrint} disabled={!inv}
            className="erp-btn erp-btn-primary"
            style={{ padding: "6px 14px" }}
          >
            🖨 Print
          </button>
        </div>
      </div>
    </div>
  );
}
