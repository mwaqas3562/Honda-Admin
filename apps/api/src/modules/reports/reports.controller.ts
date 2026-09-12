import type { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

/* ─── Helpers ───────────────────────────────────────────── */

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  /** Compare-against window (in days) for trend %. Default = same length as range. */
  compare: z.coerce.number().int().min(1).optional(),
  /** Low-stock threshold (qty <= threshold). */
  lowStock: z.coerce.number().int().min(0).default(5),
  topN: z.coerce.number().int().min(1).max(50).default(10),
});

function parseRange(from?: string, to?: string) {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }
  return { from: fromDate, to: toDate };
}

function toNum(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  // Prisma.Decimal
  return Number(v.toString()) || 0;
}

function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function shopFilter(req: Request): Prisma.ShopWhereInput | { shopId?: string } {
  // Non-superadmin is constrained to their shop. SUPER_ADMIN may view all.
  if (req.user && req.user.role !== Role.SUPER_ADMIN && req.user.shopId) {
    return { shopId: req.user.shopId };
  }
  return {};
}

/* ─── Handler ───────────────────────────────────────────── */

export async function getOverviewHandler(req: Request, res: Response): Promise<void> {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query.", errors: parsed.error.flatten() });
    return;
  }
  const range = parseRange(parsed.data.from, parsed.data.to);
  if (!range) {
    res.status(400).json({ message: "Invalid date range." });
    return;
  }

  const rangeMs = range.to.getTime() - range.from.getTime();
  const compareMs = parsed.data.compare
    ? parsed.data.compare * 24 * 60 * 60 * 1000
    : rangeMs;
  const prev = {
    from: new Date(range.from.getTime() - compareMs),
    to: new Date(range.from.getTime()),
  };

  const scope = shopFilter(req) as { shopId?: string };
  const lowStockThreshold = parsed.data.lowStock;
  const topN = parsed.data.topN;

  const baseWhere = {
    isDeleted: false,
    ...(scope.shopId ? { shopId: scope.shopId } : {}),
  };

  const inRange = (field: string) => ({
    [field]: { gte: range.from, lte: range.to },
  });
  const inPrev = (field: string) => ({
    [field]: { gte: prev.from, lt: prev.to },
  });

  /* ── Inventory Value (current snapshot, not range-bound) ── */
  const partsAgg = await prisma.part.findMany({
    where: baseWhere,
    select: { stockQty: true, unitPrice: true },
  });
  const inventoryValue = partsAgg.reduce(
    (s, p) => s + p.stockQty * toNum(p.unitPrice),
    0
  );
  const lowStockCount = partsAgg.filter(
    (p) => p.stockQty <= lowStockThreshold
  ).length;

  /* ── Sales Revenue (Invoices, ISSUED/PARTIAL/PAID) ─────── */
  const salesWhere = {
    ...baseWhere,
    status: { in: ["ISSUED", "PARTIAL", "PAID"] as Array<"ISSUED" | "PARTIAL" | "PAID"> },
  };

  const [salesAggCur, salesAggPrev] = await Promise.all([
    prisma.invoice.aggregate({
      where: { ...salesWhere, ...inRange("createdAt") },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { ...salesWhere, ...inPrev("createdAt") },
      _sum: { totalAmount: true },
    }),
  ]);
  const salesRevenue = toNum(salesAggCur._sum.totalAmount);
  const salesRevenuePrev = toNum(salesAggPrev._sum.totalAmount);

  /* ── Purchase Costs (RECEIVED purchases) ─────────────── */
  const purchaseWhere = { ...baseWhere, status: "RECEIVED" as const };
  const [purAggCur, purAggPrev] = await Promise.all([
    prisma.purchase.aggregate({
      where: { ...purchaseWhere, ...inRange("purchasedAt") },
      _sum: { totalCost: true },
    }),
    prisma.purchase.aggregate({
      where: { ...purchaseWhere, ...inPrev("purchasedAt") },
      _sum: { totalCost: true },
    }),
  ]);
  const purchaseCosts = toNum(purAggCur._sum.totalCost);
  const purchaseCostsPrev = toNum(purAggPrev._sum.totalCost);

  /* ── Services Revenue (JobCard.laborAmount completed) ── */
  const serviceWhere = {
    ...baseWhere,
    status: { in: ["COMPLETED", "IN_PROGRESS"] as Array<"COMPLETED" | "IN_PROGRESS"> },
  };
  const [svcAggCur, svcAggPrev] = await Promise.all([
    prisma.jobCard.aggregate({
      where: { ...serviceWhere, ...inRange("createdAt") },
      _sum: { laborAmount: true },
    }),
    prisma.jobCard.aggregate({
      where: { ...serviceWhere, ...inPrev("createdAt") },
      _sum: { laborAmount: true },
    }),
  ]);
  const servicesRevenue = toNum(svcAggCur._sum.laborAmount);
  const servicesRevenuePrev = toNum(svcAggPrev._sum.laborAmount);

  /* ── Gross Profit = Sales - Purchase Costs (proxy COGS) ─ */
  const grossProfit = salesRevenue + servicesRevenue - purchaseCosts;
  const grossProfitPrev = salesRevenuePrev + servicesRevenuePrev - purchaseCostsPrev;

  /* ── CHART: daily sales trend (line) ─────────────────── */
  const dailyInvoices = await prisma.invoice.findMany({
    where: { ...salesWhere, ...inRange("createdAt") },
    select: { createdAt: true, totalAmount: true },
  });
  const dayBuckets = new Map<string, number>();
  // pre-fill missing days with 0 for a continuous chart
  for (
    let d = new Date(range.from);
    d <= range.to;
    d.setDate(d.getDate() + 1)
  ) {
    const key = d.toISOString().slice(0, 10);
    dayBuckets.set(key, 0);
  }
  for (const inv of dailyInvoices) {
    const key = inv.createdAt.toISOString().slice(0, 10);
    dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + toNum(inv.totalAmount));
  }
  const dailySales = Array.from(dayBuckets.entries()).map(([date, total]) => ({
    date,
    total: Math.floor(total),
  }));

  /* ── CHART: stock movement (pie) ─────────────────────── */
  const stockMovement = await prisma.stockLog.groupBy({
    by: ["logType"],
    where: { ...baseWhere, ...inRange("createdAt") },
    _sum: { changeQty: true },
    _count: { _all: true },
  });
  const stockMovementChart = stockMovement.map((g) => ({
    type: g.logType,
    count: g._count._all,
    qty: Math.abs(g._sum.changeQty ?? 0),
  }));

  /* ── CHART: top N parts (bar) — by qty issued (JOBCARD_OUT) */
  const topPartsRaw = await prisma.stockLog.groupBy({
    by: ["partId"],
    where: {
      ...baseWhere,
      logType: "JOBCARD_OUT",
      ...inRange("createdAt"),
    },
    _sum: { changeQty: true },
    orderBy: { _sum: { changeQty: "asc" } }, // most negative = most issued
    take: topN,
  });
  const partIds = topPartsRaw.map((p) => p.partId);
  const partRows = partIds.length
    ? await prisma.part.findMany({
        where: { id: { in: partIds } },
        select: { id: true, name: true, sku: true, unitPrice: true },
      })
    : [];
  const partMap = new Map(partRows.map((p) => [p.id, p]));
  const topParts = topPartsRaw.map((p) => {
    const part = partMap.get(p.partId);
    const qty = Math.abs(p._sum.changeQty ?? 0);
    const price = part ? toNum(part.unitPrice) : 0;
    return {
      partId: p.partId,
      name: part?.name ?? "(unknown)",
      sku: part?.sku ?? "",
      qty,
      revenue: Math.floor(qty * price),
    };
  });

  /* ── CHART: category breakdown ───────────────────────── *
   * No `category` column exists yet — derive a coarse breakdown
   * from job-card service codes (pipe-separated in serviceNotes).  */
  const completedJobs = await prisma.jobCard.findMany({
    where: {
      ...baseWhere,
      ...inRange("createdAt"),
      status: { in: ["COMPLETED", "IN_PROGRESS"] as Array<"COMPLETED" | "IN_PROGRESS"> },
    },
    select: { serviceNotes: true, laborAmount: true, partsAmount: true },
  });
  const categoryBuckets = new Map<string, number>();
  for (const j of completedJobs) {
    const codes = (j.serviceNotes ?? "")
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    const labour = toNum(j.laborAmount);
    if (codes.length === 0) {
      categoryBuckets.set("Other", (categoryBuckets.get("Other") ?? 0) + labour);
      continue;
    }
    const split = labour / codes.length;
    for (const code of codes) {
      // Coarse category: first word
      const cat = code.split(/\s+/)[0]?.toUpperCase() || "OTHER";
      categoryBuckets.set(cat, (categoryBuckets.get(cat) ?? 0) + split);
    }
  }
  const categoryBreakdown = Array.from(categoryBuckets.entries())
    .map(([category, value]) => ({
      category,
      value: Math.floor(value),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  /* ── Response ────────────────────────────────────────── */
  res.json({
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    compareRange: { from: prev.from.toISOString(), to: prev.to.toISOString() },
    metrics: {
      inventoryValue: {
        value: Math.floor(inventoryValue),
        trendPct: null,
        hint: `${partsAgg.length} parts`,
      },
      salesRevenue: {
        value: Math.floor(salesRevenue),
        trendPct: trendPct(salesRevenue, salesRevenuePrev),
        hint: `${salesAggCur._count._all} invoices`,
      },
      purchaseCosts: {
        value: Math.floor(purchaseCosts),
        trendPct: trendPct(purchaseCosts, purchaseCostsPrev),
      },
      servicesRevenue: {
        value: Math.floor(servicesRevenue),
        trendPct: trendPct(servicesRevenue, servicesRevenuePrev),
      },
      grossProfit: {
        value: Math.floor(grossProfit),
        trendPct: trendPct(grossProfit, grossProfitPrev),
      },
      lowStockCount: {
        value: lowStockCount,
        trendPct: null,
        hint: `Threshold ≤ ${lowStockThreshold}`,
      },
    },
    charts: {
      dailySales,
      stockMovement: stockMovementChart,
      topParts,
      categoryBreakdown,
    },
  });
}
