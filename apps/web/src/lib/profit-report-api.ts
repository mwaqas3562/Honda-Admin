import type {
  InvoiceProfitBreakdown,
  ProfitReportResponse,
} from "@/types/profit-report";

import { API_BASE } from "@/lib/api-base";

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return { "Content-Type": "application/json" };
  const token = localStorage.getItem("wpm_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("wpm_token");
      localStorage.removeItem("wpm_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login");
      }
    }
    throw new Error(body.message ?? `Profit report API error ${res.status}`);
  }
  return (await res.json()) as T;
}

export type ProfitReportParams = {
  q?: string;
  from?: string;
  to?: string;
  sortBy?: "date" | "invoiceNumber" | "revenue" | "cost" | "profit" | "customer";
  sortDir?: "asc" | "desc";
  signal?: AbortSignal;
};

export async function fetchProfitReport(
  params: ProfitReportParams
): Promise<ProfitReportResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const res = await fetch(`${API_BASE}/reports/profit?${qs.toString()}`, {
    headers: authHeaders(),
    signal: params.signal,
  });
  return handle<ProfitReportResponse>(res);
}

export async function fetchInvoiceProfit(
  invoiceId: string,
  signal?: AbortSignal
): Promise<InvoiceProfitBreakdown> {
  const res = await fetch(
    `${API_BASE}/reports/profit/invoices/${invoiceId}`,
    { headers: authHeaders(), signal }
  );
  return handle<InvoiceProfitBreakdown>(res);
}
