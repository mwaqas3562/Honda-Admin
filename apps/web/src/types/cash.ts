export type CashEntryType =
  | "SALE"
  | "EXPENSE"
  | "ONLINE"
  | "CASH_IN_HAND"
  | "TAKE_HOME";

export const CASH_ENTRY_TYPES: { value: CashEntryType; label: string }[] = [
  { value: "SALE", label: "Sales" },
  { value: "EXPENSE", label: "Expense" },
  { value: "ONLINE", label: "Online Cash" },
  { value: "CASH_IN_HAND", label: "Cash in Hand" },
  { value: "TAKE_HOME", label: "Take-Home Cash" },
];

export type CashEntry = {
  id: string;
  shopId: string;
  entryDate: string;
  type: CashEntryType;
  amount: number;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; fullName: string; email: string } | null;
};

export type CashDaySummary = {
  date: string;
  sales: number;
  expenses: number;
  online: number;
  cashInHand: number;
  takeHome: number;
  count: number;
};

export type CashTotals = {
  sales: number;
  expenses: number;
  online: number;
  cashInHand: number;
  takeHome: number;
};

export type CashListResponse = {
  totals: CashTotals;
  days: CashDaySummary[];
  entries: CashEntry[];
};
