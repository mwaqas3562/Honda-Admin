import type {
  CustomerBikeHistoryResponse,
  RepeatCustomersResponse,
} from "@/types/repeat-customers";

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
    throw new Error(body.message ?? `Repeat customers API error ${res.status}`);
  }
  return (await res.json()) as T;
}

export type RepeatCustomersParams = {
  q?: string;
  from?: string;
  to?: string;
  minVisits?: number;
  bucket?: "ALL" | "FREQUENT" | "MONTHLY" | "OCCASIONAL";
  sortBy?: "visits" | "lastVisit" | "avgGap" | "name";
  sortDir?: "asc" | "desc";
  signal?: AbortSignal;
};

export async function fetchRepeatCustomers(
  params: RepeatCustomersParams
): Promise<RepeatCustomersResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.minVisits !== undefined) qs.set("minVisits", String(params.minVisits));
  if (params.bucket) qs.set("bucket", params.bucket);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const res = await fetch(`${API_BASE}/customers/repeat?${qs.toString()}`, {
    headers: authHeaders(),
    signal: params.signal,
  });
  return handle<RepeatCustomersResponse>(res);
}

export async function fetchCustomerBikeHistory(
  customerId: string,
  signal?: AbortSignal
): Promise<CustomerBikeHistoryResponse> {
  const res = await fetch(
    `${API_BASE}/customers/${customerId}/bikes`,
    { headers: authHeaders(), signal }
  );
  return handle<CustomerBikeHistoryResponse>(res);
}
