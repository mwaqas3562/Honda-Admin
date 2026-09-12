import type {
  VendorsReportResponse,
  VendorPurchasesResponse,
} from "@/types/vendor-report";

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
    throw new Error(body.message ?? `Vendor report API error ${res.status}`);
  }
  return (await res.json()) as T;
}

export type VendorsReportParams = {
  q?: string;
  from?: string;
  to?: string;
  sortBy?: "spend" | "purchases" | "name" | "lastPurchase";
  sortDir?: "asc" | "desc";
  signal?: AbortSignal;
};

export async function fetchVendorsReport(
  params: VendorsReportParams
): Promise<VendorsReportResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const res = await fetch(`${API_BASE}/vendors/report?${qs.toString()}`, {
    headers: authHeaders(),
    signal: params.signal,
  });
  return handle<VendorsReportResponse>(res);
}

export async function fetchVendorPurchases(
  vendorId: string,
  signal?: AbortSignal
): Promise<VendorPurchasesResponse> {
  const res = await fetch(`${API_BASE}/vendors/${vendorId}/purchases`, {
    headers: authHeaders(),
    signal,
  });
  return handle<VendorPurchasesResponse>(res);
}
