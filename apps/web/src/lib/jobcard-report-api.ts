import type {
  JobCardsReportResponse,
  MechanicsReportResponse,
  MechanicJobsResponse,
} from "@/types/jobcard-report";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

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
    throw new Error(body.message ?? `Job-card report API error ${res.status}`);
  }
  return (await res.json()) as T;
}

export type JobCardsReportParams = {
  q?: string;
  from?: string;
  to?: string;
  status?: "ALL" | "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  mechanic?: string;
  sortBy?: "createdAt" | "jobNumber" | "customer" | "total" | "status" | "turnaround";
  sortDir?: "asc" | "desc";
  signal?: AbortSignal;
};

export async function fetchJobCardsReport(
  params: JobCardsReportParams
): Promise<JobCardsReportResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.status) qs.set("status", params.status);
  if (params.mechanic) qs.set("mechanic", params.mechanic);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const res = await fetch(`${API_BASE}/jobcards/report?${qs.toString()}`, {
    headers: authHeaders(),
    signal: params.signal,
  });
  return handle<JobCardsReportResponse>(res);
}

export type MechanicsReportParams = {
  q?: string;
  from?: string;
  to?: string;
  sortBy?: "jobs" | "revenue" | "avgTurnaround" | "name";
  sortDir?: "asc" | "desc";
  signal?: AbortSignal;
};

export async function fetchMechanicsReport(
  params: MechanicsReportParams
): Promise<MechanicsReportResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const res = await fetch(`${API_BASE}/jobcards/mechanics?${qs.toString()}`, {
    headers: authHeaders(),
    signal: params.signal,
  });
  return handle<MechanicsReportResponse>(res);
}

export async function fetchMechanicJobs(
  idOrName: string,
  opts: { from?: string; to?: string; signal?: AbortSignal } = {}
): Promise<MechanicJobsResponse> {
  const qs = new URLSearchParams();
  if (opts.from) qs.set("from", opts.from);
  if (opts.to) qs.set("to", opts.to);
  const url =
    `${API_BASE}/jobcards/mechanics/${encodeURIComponent(idOrName)}` +
    (qs.toString() ? `?${qs.toString()}` : "");
  const res = await fetch(url, { headers: authHeaders(), signal: opts.signal });
  return handle<MechanicJobsResponse>(res);
}
