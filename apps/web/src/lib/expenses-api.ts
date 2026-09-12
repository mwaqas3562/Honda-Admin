import type {
  Expense,
  ExpenseCategory,
  ExpenseListResponse,
} from "@/types/expense";

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
    throw new Error(body.message ?? `Expenses API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type ListExpensesParams = {
  from?: Date;
  to?: Date;
  category?: ExpenseCategory;
  sortBy?: "expenseDate" | "category" | "amount" | "createdAt";
  sortDir?: "asc" | "desc";
  signal?: AbortSignal;
};

export async function listExpenses(
  params: ListExpensesParams
): Promise<ExpenseListResponse> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from.toISOString());
  if (params.to) qs.set("to", params.to.toISOString());
  if (params.category) qs.set("category", params.category);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const res = await fetch(`${API_BASE}/expenses?${qs.toString()}`, {
    headers: authHeaders(),
    signal: params.signal,
  });
  return handle<ExpenseListResponse>(res);
}

export type ExpenseInput = {
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  notes?: string | null;
};

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const res = await fetch(`${API_BASE}/expenses`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return handle<Expense>(res);
}

export async function updateExpense(
  id: string,
  input: Partial<ExpenseInput>
): Promise<Expense> {
  const res = await fetch(`${API_BASE}/expenses/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return handle<Expense>(res);
}

export async function deleteExpense(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/expenses/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handle<void>(res);
}
