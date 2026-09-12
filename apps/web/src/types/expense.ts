export type ExpenseCategory = "FOOD" | "UTILITY" | "RENT" | "MISC";

export type ExpenseCategoryMeta = {
  value: ExpenseCategory;
  label: string;
  icon: string;
  /** Tailwind classes for the badge (bg / text / border). */
  badgeClass: string;
  /** Tailwind text color for amounts in this category. */
  amountClass: string;
};

export const EXPENSE_CATEGORIES: ExpenseCategoryMeta[] = [
  {
    value: "FOOD",
    label: "Food",
    icon: "🍔",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
    amountClass: "text-amber-800",
  },
  {
    value: "UTILITY",
    label: "Utility",
    icon: "💡",
    badgeClass: "bg-sky-100 text-sky-900 border-sky-300",
    amountClass: "text-sky-800",
  },
  {
    value: "RENT",
    label: "Rent",
    icon: "🏠",
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    amountClass: "text-emerald-800",
  },
  {
    value: "MISC",
    label: "Misc",
    icon: "📦",
    badgeClass: "bg-violet-100 text-violet-900 border-violet-300",
    amountClass: "text-violet-800",
  },
];

export const CATEGORY_META: Record<ExpenseCategory, ExpenseCategoryMeta> =
  Object.fromEntries(
    EXPENSE_CATEGORIES.map((c) => [c.value, c])
  ) as Record<ExpenseCategory, ExpenseCategoryMeta>;

export type Expense = {
  id: string;
  shopId: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseTotals = {
  food: number;
  utility: number;
  misc: number;
  grandTotal: number;
};

export type ExpenseListResponse = {
  totals: ExpenseTotals;
  expenses: Expense[];
};
