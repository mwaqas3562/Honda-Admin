import type { Request, Response } from "express";
import { Prisma, ExpenseCategory } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

/* ─── Validation ───────────────────────────────────────── */

const categorySchema = z.nativeEnum(ExpenseCategory);

const createSchema = z.object({
  expenseDate: z.string().refine((s) => !Number.isNaN(new Date(s).getTime())),
  category: categorySchema,
  amount: z.coerce.number().int().nonnegative(),
  notes: z.string().max(500).optional().nullable(),
});

const updateSchema = createSchema.partial();

const listSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: categorySchema.optional(),
  sortBy: z
    .enum(["expenseDate", "category", "amount", "createdAt"])
    .default("expenseDate"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

/* ─── Helpers ──────────────────────────────────────────── */

function shopIdFromReq(req: Request): string | null {
  if (!req.user) return null;
  if (req.user.role === Role.SUPER_ADMIN) {
    return (req.headers["x-shop-id"] as string | undefined) ?? req.user.shopId ?? null;
  }
  return req.user.shopId ?? null;
}

function toNumber(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return Number(v.toString()) || 0;
}

function serialize(e: {
  id: string;
  shopId: string;
  expenseDate: Date;
  category: ExpenseCategory;
  amount: number;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: e.id,
    shopId: e.shopId,
    expenseDate: e.expenseDate.toISOString(),
    category: e.category,
    amount: toNumber(e.amount),
    notes: e.notes,
    createdById: e.createdById,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/* ─── Handlers ─────────────────────────────────────────── */

export async function listExpensesHandler(req: Request, res: Response): Promise<void> {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query.", errors: parsed.error.flatten() });
    return;
  }
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }

  const where: Prisma.ExpenseWhereInput = {
    isDeleted: false,
    shopId,
    ...(parsed.data.category ? { category: parsed.data.category } : {}),
    ...(parsed.data.from || parsed.data.to
      ? {
          expenseDate: {
            ...(parsed.data.from ? { gte: new Date(parsed.data.from) } : {}),
            ...(parsed.data.to ? { lte: new Date(parsed.data.to) } : {}),
          },
        }
      : {}),
  };

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: [{ [parsed.data.sortBy]: parsed.data.sortDir }, { createdAt: "desc" }],
  });

  const totals = { food: 0, utility: 0, misc: 0, grandTotal: 0 };
  for (const e of expenses) {
    const amt = toNumber(e.amount);
    totals.grandTotal += amt;
    switch (e.category) {
      case "FOOD":    totals.food += amt; break;
      case "UTILITY": totals.utility += amt; break;
      case "MISC":    totals.misc += amt; break;
    }
  }

  res.json({
    totals,
    expenses: expenses.map(serialize),
  });
}

export async function createExpenseHandler(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload.", errors: parsed.error.flatten() });
    return;
  }
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }

  const created = await prisma.expense.create({
    data: {
      shopId,
      expenseDate: new Date(parsed.data.expenseDate),
      category: parsed.data.category,
      amount: parsed.data.amount,
      notes: parsed.data.notes ?? null,
      createdById: req.user?.id ?? null,
    },
  });

  res.status(201).json(serialize(created));
}

export async function updateExpenseHandler(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload.", errors: parsed.error.flatten() });
    return;
  }
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }
  const id = String(req.params.id ?? "");
  const existing = await prisma.expense.findFirst({
    where: { id, isDeleted: false, shopId },
  });
  if (!existing) {
    res.status(404).json({ message: "Expense not found." });
    return;
  }

  const updated = await prisma.expense.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.expenseDate ? { expenseDate: new Date(parsed.data.expenseDate) } : {}),
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
      ...(parsed.data.amount !== undefined
        ? { amount: parsed.data.amount }
        : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes ?? null } : {}),
    },
  });

  res.json(serialize(updated));
}

export async function deleteExpenseHandler(req: Request, res: Response): Promise<void> {
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }
  const id = String(req.params.id ?? "");
  const existing = await prisma.expense.findFirst({
    where: { id, isDeleted: false, shopId },
  });
  if (!existing) {
    res.status(404).json({ message: "Expense not found." });
    return;
  }

  await prisma.expense.update({
    where: { id: existing.id },
    data: { isDeleted: true },
  });

  res.status(204).send();
}
