import type { Request, Response } from "express";
import { Prisma, CashEntryType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

/* ─── Validation ────────────────────────────────────────── */

const cashTypeSchema = z.nativeEnum(CashEntryType);

const createSchema = z.object({
  entryDate: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), {
    message: "Invalid entryDate",
  }),
  type: cashTypeSchema,
  amount: z.coerce.number().int().nonnegative(),
  notes: z.string().max(500).optional().nullable(),
});

const updateSchema = createSchema.partial();

const listSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  type: cashTypeSchema.optional(),
  sortBy: z.enum(["entryDate", "type", "amount", "createdAt"]).default("entryDate"),
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

function serialize(entry: {
  id: string;
  shopId: string;
  entryDate: Date;
  type: CashEntryType;
  amount: number;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: entry.id,
    shopId: entry.shopId,
    entryDate: entry.entryDate.toISOString(),
    type: entry.type,
    amount: toNumber(entry.amount),
    notes: entry.notes,
    createdById: entry.createdById,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

/* ─── Handlers ─────────────────────────────────────────── */

export async function listCashEntriesHandler(req: Request, res: Response): Promise<void> {
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

  const where: Prisma.CashEntryWhereInput = {
    isDeleted: false,
    shopId,
    ...(parsed.data.type ? { type: parsed.data.type } : {}),
    ...(parsed.data.from || parsed.data.to
      ? {
          entryDate: {
            ...(parsed.data.from ? { gte: new Date(parsed.data.from) } : {}),
            ...(parsed.data.to ? { lte: new Date(parsed.data.to) } : {}),
          },
        }
      : {}),
  };

  const entries = await prisma.cashEntry.findMany({
    where,
    orderBy: [{ [parsed.data.sortBy]: parsed.data.sortDir }, { createdAt: "desc" }],
  });

  /* Aggregate per-day summary */
  const dayMap = new Map<
    string,
    {
      date: string;
      sales: number;
      expenses: number;
      online: number;
      cashInHand: number;
      takeHome: number;
      count: number;
    }
  >();

  for (const e of entries) {
    const key = e.entryDate.toISOString().slice(0, 10);
    let day = dayMap.get(key);
    if (!day) {
      day = {
        date: key,
        sales: 0,
        expenses: 0,
        online: 0,
        cashInHand: 0,
        takeHome: 0,
        count: 0,
      };
      dayMap.set(key, day);
    }
    const amt = toNumber(e.amount);
    day.count += 1;
    switch (e.type) {
      case "SALE":          day.sales += amt; break;
      case "EXPENSE":       day.expenses += amt; break;
      case "ONLINE":        day.online += amt; break;
      case "CASH_IN_HAND":  day.cashInHand += amt; break;
      case "TAKE_HOME":     day.takeHome += amt; break;
    }
  }

  const days = Array.from(dayMap.values()).sort((a, b) =>
    parsed.data.sortDir === "asc"
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date)
  );

  /* Range totals */
  const totals = entries.reduce(
    (acc, e) => {
      const amt = toNumber(e.amount);
      switch (e.type) {
        case "SALE":          acc.sales += amt; break;
        case "EXPENSE":       acc.expenses += amt; break;
        case "ONLINE":        acc.online += amt; break;
        case "CASH_IN_HAND":  acc.cashInHand += amt; break;
        case "TAKE_HOME":     acc.takeHome += amt; break;
      }
      return acc;
    },
    { sales: 0, expenses: 0, online: 0, cashInHand: 0, takeHome: 0 }
  );

  res.json({
    totals,
    days,
    entries: entries.map(serialize),
  });
}

export async function getCashEntriesByDayHandler(req: Request, res: Response): Promise<void> {
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }
  const dayStr = String(req.params.date ?? "");
  const day = new Date(dayStr);
  if (Number.isNaN(day.getTime())) {
    res.status(400).json({ message: "Invalid date." });
    return;
  }
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);

  const entries = await prisma.cashEntry.findMany({
    where: {
      isDeleted: false,
      shopId,
      entryDate: { gte: start, lte: end },
    },
    orderBy: [{ createdAt: "asc" }],
    include: {
      createdBy: { select: { id: true, fullName: true, email: true } },
    },
  });

  res.json({
    date: start.toISOString().slice(0, 10),
    entries: entries.map((e) => ({
      ...serialize(e),
      createdBy: e.createdBy
        ? { id: e.createdBy.id, fullName: e.createdBy.fullName, email: e.createdBy.email }
        : null,
    })),
  });
}

export async function createCashEntryHandler(req: Request, res: Response): Promise<void> {
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

  const created = await prisma.cashEntry.create({
    data: {
      shopId,
      entryDate: new Date(parsed.data.entryDate),
      type: parsed.data.type,
      amount: parsed.data.amount,
      notes: parsed.data.notes ?? null,
      createdById: req.user?.id ?? null,
    },
  });

  res.status(201).json(serialize(created));
}

export async function updateCashEntryHandler(req: Request, res: Response): Promise<void> {
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

  const existing = await prisma.cashEntry.findFirst({
    where: { id: String(req.params.id ?? ""), isDeleted: false, shopId },
  });
  if (!existing) {
    res.status(404).json({ message: "Cash entry not found." });
    return;
  }

  const updated = await prisma.cashEntry.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.entryDate ? { entryDate: new Date(parsed.data.entryDate) } : {}),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(parsed.data.amount !== undefined
        ? { amount: parsed.data.amount }
        : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes ?? null } : {}),
    },
  });

  res.json(serialize(updated));
}

export async function deleteCashEntryHandler(req: Request, res: Response): Promise<void> {
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }
  const existing = await prisma.cashEntry.findFirst({
    where: { id: String(req.params.id ?? ""), isDeleted: false, shopId },
  });
  if (!existing) {
    res.status(404).json({ message: "Cash entry not found." });
    return;
  }

  await prisma.cashEntry.update({
    where: { id: existing.id },
    data: { isDeleted: true },
  });

  res.status(204).send();
}
