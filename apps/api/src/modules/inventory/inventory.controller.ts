import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

/* ─── Types ────────────────────────────────────────────── */

type StockStatus = "ALL" | "IN_STOCK" | "LOW" | "OUT";
type SortKey = "name" | "stock" | "value" | "usage" | "category";

const querySchema = z.object({
  category: z.string().optional(),
  status: z.enum(["ALL", "IN_STOCK", "LOW", "OUT"]).default("ALL"),
  q: z.string().optional(),
  sortBy: z.enum(["name", "stock", "value", "usage", "category"]).default("value"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  lowStock: z.coerce.number().int().min(0).default(5),
  /** Window for usage calculation, in days. Default 90. */
  usageDays: z.coerce.number().int().min(1).max(3650).default(90),
});

/* ─── Helpers ──────────────────────────────────────────── */

function shopIdFromReq(req: Request): string | null {
  if (!req.user) return null;
  if (req.user.role === Role.SUPER_ADMIN) {
    return (req.headers["x-shop-id"] as string | undefined) ?? req.user.shopId ?? null;
  }
  return req.user.shopId ?? null;
}

function toNum(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return Number(v.toString()) || 0;
}

function classify(qty: number, threshold: number): "IN_STOCK" | "LOW" | "OUT" {
  if (qty <= 0) return "OUT";
  if (qty <= threshold) return "LOW";
  return "IN_STOCK";
}

/* ─── Handlers ─────────────────────────────────────────── */

export async function getInventoryReportHandler(
  req: Request,
  res: Response
): Promise<void> {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query.", errors: parsed.error.flatten() });
    return;
  }
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }

  const { category, status, q, sortBy, sortDir, lowStock, usageDays } = parsed.data;

  /* ── Load parts with optional filters ────────────────── */
  const where: Prisma.PartWhereInput = {
    isDeleted: false,
    shopId,
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const parts = await prisma.part.findMany({
    where,
    select: {
      id: true,
      name: true,
      sku: true,
      category: true,
      stockQty: true,
      unitPrice: true,
      sellingPrice: true,
    },
  });

  /* ── Compute usage (qty issued via JOBCARD_OUT in the last `usageDays`) ── */
  const usageSince = new Date();
  usageSince.setDate(usageSince.getDate() - usageDays);

  const usageRows = parts.length
    ? await prisma.stockLog.groupBy({
        by: ["partId"],
        where: {
          shopId,
          isDeleted: false,
          logType: "JOBCARD_OUT",
          createdAt: { gte: usageSince },
          partId: { in: parts.map((p) => p.id) },
        },
        _sum: { changeQty: true },
      })
    : [];
  const usageMap = new Map(
    usageRows.map((u) => [u.partId, Math.abs(u._sum.changeQty ?? 0)])
  );

  /* ── Build table rows ────────────────────────────────── */
  let rows = parts.map((p) => {
    const cost = toNum(p.unitPrice);
    const sell = toNum(p.sellingPrice);
    const stock = p.stockQty;
    const value = stock * cost;
    const potential = stock * Math.max(0, sell - cost);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      stockQty: stock,
      cost,
      sellingPrice: sell,
      value: Math.floor(value),
      potentialProfit: Math.floor(potential),
      usage: usageMap.get(p.id) ?? 0,
      status: classify(stock, lowStock),
    };
  });

  /* ── Apply status filter ─────────────────────────────── */
  if (status !== "ALL") {
    rows = rows.filter((r) => r.status === status);
  }

  /* ── Sort ────────────────────────────────────────────── */
  const dirMul = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":     cmp = a.name.localeCompare(b.name); break;
      case "stock":    cmp = a.stockQty - b.stockQty; break;
      case "value":    cmp = a.value - b.value; break;
      case "usage":    cmp = a.usage - b.usage; break;
      case "category": cmp = (a.category ?? "").localeCompare(b.category ?? ""); break;
    }
    return cmp * dirMul;
  });

  /* ── Aggregates ──────────────────────────────────────── */
  // NOTE: aggregate over the unfiltered set so KPI cards show shop-wide totals
  // even when the user is filtering the table.
  const totals = parts.reduce(
    (acc, p) => {
      const cost = toNum(p.unitPrice);
      const sell = toNum(p.sellingPrice);
      const value = p.stockQty * cost;
      const potential = p.stockQty * Math.max(0, sell - cost);
      acc.totalParts += 1;
      acc.inventoryValue += value;
      acc.potentialProfit += potential;
      const cls = classify(p.stockQty, lowStock);
      if (cls === "LOW") acc.lowStock += 1;
      if (cls === "OUT") acc.outOfStock += 1;
      return acc;
    },
    { totalParts: 0, inventoryValue: 0, potentialProfit: 0, lowStock: 0, outOfStock: 0 }
  );

  /* ── Distinct categories for filter dropdown ─────────── */
  const categoriesRaw = await prisma.part.findMany({
    where: { shopId, isDeleted: false, NOT: { category: null } },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  const categories = categoriesRaw
    .map((c) => c.category)
    .filter((c): c is string => Boolean(c));

  res.json({
    totals: {
      totalParts: totals.totalParts,
      inventoryValue: Math.floor(totals.inventoryValue),
      potentialProfit: Math.floor(totals.potentialProfit),
      lowStock: totals.lowStock,
      outOfStock: totals.outOfStock,
    },
    parts: rows,
    categories,
    usageWindowDays: usageDays,
    lowStockThreshold: lowStock,
  });
}

/* ── Drill-down: stock ledger for a single part ─────────── */

export async function getPartLedgerHandler(req: Request, res: Response): Promise<void> {
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }
  const partId = String(req.params.id ?? "");

  const part = await prisma.part.findFirst({
    where: { id: partId, shopId, isDeleted: false },
    select: {
      id: true, name: true, sku: true, category: true,
      stockQty: true, unitPrice: true, sellingPrice: true,
    },
  });
  if (!part) {
    res.status(404).json({ message: "Part not found." });
    return;
  }

  const logs = await prisma.stockLog.findMany({
    where: { shopId, partId, isDeleted: false },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: {
      createdBy: { select: { id: true, fullName: true } },
      purchase: { select: { id: true } },
      jobCard:  { select: { id: true, jobNumber: true } },
    },
  });

  res.json({
    part: {
      id: part.id,
      name: part.name,
      sku: part.sku,
      category: part.category,
      stockQty: part.stockQty,
      cost: toNum(part.unitPrice),
      sellingPrice: toNum(part.sellingPrice),
    },
    logs: logs.map((l) => ({
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      logType: l.logType,
      changeQty: l.changeQty,
      balanceQty: l.balanceQty,
      notes: l.notes,
      purchaseId: l.purchase?.id ?? null,
      jobCardId: l.jobCard?.id ?? null,
      jobNumber: l.jobCard?.jobNumber ?? null,
      createdBy: l.createdBy
        ? { id: l.createdBy.id, fullName: l.createdBy.fullName }
        : null,
    })),
  });
}
