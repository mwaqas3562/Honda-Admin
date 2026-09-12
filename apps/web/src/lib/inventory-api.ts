import type {
  InventoryReportResponse,
  StockLedgerResponse,
} from "@/types/inventory";

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
    throw new Error(body.message ?? `Inventory API error ${res.status}`);
  }
  return (await res.json()) as T;
}

export type InventoryReportParams = {
  category?: string;
  status?: "ALL" | "IN_STOCK" | "LOW" | "OUT";
  q?: string;
  sortBy?: "name" | "stock" | "value" | "usage" | "category";
  sortDir?: "asc" | "desc";
  lowStock?: number;
  usageDays?: number;
  signal?: AbortSignal;
};

export async function fetchInventoryReport(
  params: InventoryReportParams
): Promise<InventoryReportResponse> {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  if (params.lowStock !== undefined) qs.set("lowStock", String(params.lowStock));
  if (params.usageDays !== undefined) qs.set("usageDays", String(params.usageDays));
  const res = await fetch(`${API_BASE}/inventory/report?${qs.toString()}`, {
    headers: authHeaders(),
    signal: params.signal,
  });
  return handle<InventoryReportResponse>(res);
}

export async function fetchPartLedger(
  partId: string,
  signal?: AbortSignal
): Promise<StockLedgerResponse> {
  const res = await fetch(`${API_BASE}/inventory/parts/${partId}/ledger`, {
    headers: authHeaders(),
    signal,
  });
  return handle<StockLedgerResponse>(res);
}
