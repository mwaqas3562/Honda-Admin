import type {
  CustomersReportResponse,
  CustomerTimelineResponse,
} from "@/types/customer-report";

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
    throw new Error(body.message ?? `Customers report API error ${res.status}`);
  }
  return (await res.json()) as T;
}

export type CustomersReportParams = {
  q?: string;
  sortBy?: "name" | "visits" | "spend" | "lastVisit";
  sortDir?: "asc" | "desc";
  from?: string;
  to?: string;
  signal?: AbortSignal;
};

export async function fetchCustomersReport(
  params: CustomersReportParams
): Promise<CustomersReportResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const res = await fetch(`${API_BASE}/customers/report?${qs.toString()}`, {
    headers: authHeaders(),
    signal: params.signal,
  });
  return handle<CustomersReportResponse>(res);
}

export async function fetchCustomerTimeline(
  customerId: string,
  signal?: AbortSignal
): Promise<CustomerTimelineResponse> {
  const res = await fetch(
    `${API_BASE}/customers/${customerId}/timeline`,
    { headers: authHeaders(), signal }
  );
  return handle<CustomerTimelineResponse>(res);
}
