import type {
  CashEntry,
  CashEntryType,
  CashListResponse,
} from "@/types/cash";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

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
    throw new Error(body.message ?? `Cash API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type ListCashParams = {
  from?: Date;
  to?: Date;
  type?: CashEntryType;
  sortBy?: "entryDate" | "type" | "amount" | "createdAt";
  sortDir?: "asc" | "desc";
  signal?: AbortSignal;
};

export async function listCashEntries(
  params: ListCashParams
): Promise<CashListResponse> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from.toISOString());
  if (params.to) qs.set("to", params.to.toISOString());
  if (params.type) qs.set("type", params.type);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);

  const res = await fetch(`${API_BASE}/cash-entries?${qs.toString()}`, {
    headers: authHeaders(),
    signal: params.signal,
  });
  return handle<CashListResponse>(res);
}

export async function getCashEntriesByDay(
  date: string,
  signal?: AbortSignal
): Promise<{ date: string; entries: CashEntry[] }> {
  const res = await fetch(`${API_BASE}/cash-entries/by-day/${date}`, {
    headers: authHeaders(),
    signal,
  });
  return handle(res);
}

export type CashEntryInput = {
  entryDate: string;
  type: CashEntryType;
  amount: number;
  notes?: string | null;
};

export async function createCashEntry(input: CashEntryInput): Promise<CashEntry> {
  const res = await fetch(`${API_BASE}/cash-entries`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return handle<CashEntry>(res);
}

export async function updateCashEntry(
  id: string,
  input: Partial<CashEntryInput>
): Promise<CashEntry> {
  const res = await fetch(`${API_BASE}/cash-entries/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return handle<CashEntry>(res);
}

export async function deleteCashEntry(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/cash-entries/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handle<void>(res);
}
