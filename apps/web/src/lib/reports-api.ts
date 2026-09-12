import type {
  CategoryBreakdownPoint,
  DailySalesPoint,
  ReportsOverviewResponse,
  StockMovementPoint,
  TopPartPoint,
} from "@/types/reports";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("wpm_token");
}

export async function fetchReportsOverview(params: {
  from?: Date;
  to?: Date;
  lowStock?: number;
  topN?: number;
  signal?: AbortSignal;
}): Promise<ReportsOverviewResponse> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from.toISOString());
  if (params.to) qs.set("to", params.to.toISOString());
  if (params.lowStock !== undefined) qs.set("lowStock", String(params.lowStock));
  if (params.topN !== undefined) qs.set("topN", String(params.topN));

  const token = getToken();
  const res = await fetch(`${API_BASE}/reports/overview?${qs.toString()}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: params.signal,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("wpm_token");
      localStorage.removeItem("wpm_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login");
      }
    }
    throw new Error(body.message ?? `Reports API error ${res.status}`);
  }

  return (await res.json()) as ReportsOverviewResponse;
}

export type {
  CategoryBreakdownPoint,
  DailySalesPoint,
  ReportsOverviewResponse,
  StockMovementPoint,
  TopPartPoint,
};
