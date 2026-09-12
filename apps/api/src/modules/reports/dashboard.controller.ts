import type { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

/* ─── Helpers ───────────────────────────────────────────── */

const querySchema = z.object({
  /** Trend window in days. Default 7. */
  days: z.coerce.number().int().min(1).max(180).default(7),
  /** Top-N for top-selling products. Default 5. */
  topN: z.coerce.number().int().min(1).max(50).default(5),
});

function toNum(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return Number(v.toString()) || 0;
}

function shopScope(req: Request): string | undefined {
  if (req.user && req.user.role !== Role.SUPER_ADMIN && req.user.shopId) {
    return req.user.shopId;
  }
  return undefined;
}

/* ─── Dashboard handler ─────────────────────────────────── */

export async function getDashboardHandler(req: Request, res: Response): Promise<void> {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query.", errors: parsed.error.flatten() });
    return;
  }

  const { days, topN } = parsed.data;
  const shopId = shopScope(req);
  const baseWhere = { isDeleted: false, ...(shopId ? { shopId } : {}) };

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const trendStart = new Date(startOfToday);
  trendStart.setDate(trendStart.getDate() - (days - 1));

  /* ── A. Today summary ──────────────────────────────── */
  const [
    jobsCreatedToday,
    jobsCompletedToday,
    invoicesPaidToday,
  ] = await Promise.all([
    prisma.jobCard.count({
      where: { ...baseWhere, createdAt: { gte: startOfToday, lt: endOfToday } },
    }),
    prisma.jobCard.count({
      where: {
        ...baseWhere,
        status: "COMPLETED",
        updatedAt: { gte: startOfToday, lt: endOfToday },
      },
    }),
    prisma.invoice.aggregate({
      where: {
        ...baseWhere,
        status: "PAID",
        issuedAt: { gte: startOfToday, lt: endOfToday },
      },
      _sum: { totalAmount: true, totalProfit: true },
      _count: { _all: true },
    }),
  ]);

  /* ── B. Job status overview ───────────────────────── */
  const statusGroups = await prisma.jobCard.groupBy({
    by: ["status"],
    where: baseWhere,
    _count: { _all: true },
  });
  const statusCounts = {
    OPEN: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  } as Record<string, number>;
  for (const g of statusGroups) statusCounts[g.status] = g._count._all;

  /* ── C. Sales trend (last N days) ─────────────────── */
  const trendInvoices = await prisma.invoice.findMany({
    where: {
      ...baseWhere,
      status: "PAID",
      issuedAt: { gte: trendStart, lt: endOfToday },
    },
    select: { issuedAt: true, totalAmount: true, totalProfit: true },
  });
  const dayBuckets = new Map<string, { revenue: number; profit: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(trendStart);
    d.setDate(d.getDate() + i);
    dayBuckets.set(d.toISOString().slice(0, 10), { revenue: 0, profit: 0 });
  }
  for (const inv of trendInvoices) {
    if (!inv.issuedAt) continue;
    const key = inv.issuedAt.toISOString().slice(0, 10);
    const bucket = dayBuckets.get(key);
    if (!bucket) continue;
    bucket.revenue += toNum(inv.totalAmount);
    bucket.profit  += toNum(inv.totalProfit);
  }
  const salesTrend = Array.from(dayBuckets.entries()).map(([date, v]) => ({
    date,
    revenue: Math.floor(v.revenue),
    profit: Math.floor(v.profit),
  }));

  /* ── D. Low stock alert ───────────────────────────── */
  const lowStockRaw = await prisma.$queryRaw<
    Array<{ id: string; name: string; sku: string; stockQty: number; minStockLevel: number }>
  >(Prisma.sql`
    SELECT id, name, sku, "stockQty", "minStockLevel"
    FROM "Part"
    WHERE "isDeleted" = false
      ${shopId ? Prisma.sql`AND "shopId" = ${shopId}` : Prisma.empty}
      AND "stockQty" <= "minStockLevel"
    ORDER BY "stockQty" ASC, name ASC
    LIMIT 50
  `);
  const lowStock = lowStockRaw.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    stockQty: Number(p.stockQty),
    minStockLevel: Number(p.minStockLevel),
  }));

  /* ── E. Top-selling products (within trend window) ── */
  const topItemsRaw = await prisma.invoiceItem.groupBy({
    by: ["partId", "itemName"],
    where: {
      partId: { not: null },
      invoice: {
        ...baseWhere,
        status: "PAID",
        issuedAt: { gte: trendStart, lt: endOfToday },
      },
    },
    _sum: { qty: true, total: true, profit: true },
    orderBy: { _sum: { total: "desc" } },
    take: topN,
  });
  const topItems = topItemsRaw.map((r) => ({
    partId: r.partId,
    itemName: r.itemName,
    qty: r._sum.qty ?? 0,
    revenue: toNum(r._sum.total),
    profit: toNum(r._sum.profit),
  }));

  /* ── Response ─────────────────────────────────────── */
  res.json({
    today: {
      jobsCreated: jobsCreatedToday,
      jobsCompleted: jobsCompletedToday,
      invoicesPaid: invoicesPaidToday._count._all,
      revenue: toNum(invoicesPaidToday._sum.totalAmount),
      profit: toNum(invoicesPaidToday._sum.totalProfit),
    },
    jobStatus: {
      open: statusCounts.OPEN,
      inProgress: statusCounts.IN_PROGRESS,
      completed: statusCounts.COMPLETED,
      cancelled: statusCounts.CANCELLED,
    },
    salesTrend,
    lowStock,
    topItems,
    range: { days, from: trendStart.toISOString(), to: endOfToday.toISOString() },
  });
}
