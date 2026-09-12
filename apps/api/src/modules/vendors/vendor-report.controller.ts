import type { Request, Response } from "express";
import { Prisma, PurchaseStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

/* ─── Schema ───────────────────────────────────────────── */

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().optional(),
  sortBy: z
    .enum(["spend", "purchases", "name", "lastPurchase"])
    .default("spend"),
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

function toNum(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return Number(v.toString()) || 0;
}

function round2(n: number): number {
  return Math.floor(n);
}

/* ─── Handler: Vendors report ──────────────────────────── */

export async function getVendorsReportHandler(
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
  const { from, to, q, sortBy, sortDir } = parsed.data;

  const dateFilter: Prisma.DateTimeFilter | undefined =
    from || to
      ? {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        }
      : undefined;

  const vendors = await prisma.vendor.findMany({
    where: {
      shopId,
      isDeleted: false,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      code: true,
      phone: true,
      email: true,
    },
  });

  if (vendors.length === 0) {
    res.json({
      totals: {
        vendorCount: 0,
        purchaseCount: 0,
        totalSpend: 0,
        receivedSpend: 0,
        draftSpend: 0,
      },
      vendors: [],
    });
    return;
  }

  const purchases = await prisma.purchase.findMany({
    where: {
      shopId,
      isDeleted: false,
      vendorId: { in: vendors.map((v) => v.id) },
      ...(dateFilter ? { purchasedAt: dateFilter } : {}),
    },
    select: {
      vendorId: true,
      totalCost: true,
      status: true,
      purchasedAt: true,
      items: { select: { quantity: true } },
    },
  });

  type Agg = {
    purchases: number;
    received: number;
    draft: number;
    cancelled: number;
    totalSpend: number;
    receivedSpend: number;
    draftSpend: number;
    quantity: number;
    lastPurchase: Date | null;
  };
  const map = new Map<string, Agg>();
  for (const p of purchases) {
    const a: Agg = map.get(p.vendorId) ?? {
      purchases: 0,
      received: 0,
      draft: 0,
      cancelled: 0,
      totalSpend: 0,
      receivedSpend: 0,
      draftSpend: 0,
      quantity: 0,
      lastPurchase: null,
    };
    a.purchases += 1;
    a.quantity += p.items.reduce((s, i) => s + i.quantity, 0);
    const cost = toNum(p.totalCost);
    a.totalSpend += cost;
    if (p.status === "RECEIVED" || p.status === "PAID") {
      a.received += 1;
      a.receivedSpend += cost;
    } else if (p.status === "DRAFT") {
      a.draft += 1;
      a.draftSpend += cost;
    } else {
      a.cancelled += 1;
    }
    if (!a.lastPurchase || p.purchasedAt > a.lastPurchase) {
      a.lastPurchase = p.purchasedAt;
    }
    map.set(p.vendorId, a);
  }

  const rows = vendors.map((v) => {
    const a = map.get(v.id);
    return {
      id: v.id,
      name: v.name,
      code: v.code,
      phone: v.phone,
      email: v.email,
      purchases: a?.purchases ?? 0,
      received: a?.received ?? 0,
      draft: a?.draft ?? 0,
      cancelled: a?.cancelled ?? 0,
      quantity: a?.quantity ?? 0,
      totalSpend: round2(a?.totalSpend ?? 0),
      receivedSpend: round2(a?.receivedSpend ?? 0),
      draftSpend: round2(a?.draftSpend ?? 0),
      lastPurchase: a?.lastPurchase ? a.lastPurchase.toISOString() : null,
    };
  });

  const dirMul = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "purchases":
        cmp = a.purchases - b.purchases;
        break;
      case "spend":
        cmp = a.totalSpend - b.totalSpend;
        break;
      case "lastPurchase": {
        const av = a.lastPurchase ? new Date(a.lastPurchase).getTime() : 0;
        const bv = b.lastPurchase ? new Date(b.lastPurchase).getTime() : 0;
        cmp = av - bv;
        break;
      }
    }
    return cmp * dirMul;
  });

  const totals = {
    vendorCount: rows.length,
    activeVendors: rows.filter((r) => r.purchases > 0).length,
    purchaseCount: rows.reduce((s, r) => s + r.purchases, 0),
    totalSpend: round2(rows.reduce((s, r) => s + r.totalSpend, 0)),
    receivedSpend: round2(rows.reduce((s, r) => s + r.receivedSpend, 0)),
    draftSpend: round2(rows.reduce((s, r) => s + r.draftSpend, 0)),
  };

  res.json({ totals, vendors: rows });
}

/* ─── Handler: Vendor purchases drill-down ─────────────── */

export async function getVendorPurchasesHandler(
  req: Request,
  res: Response
): Promise<void> {
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }
  const vendorId = String(req.params.id ?? "");
  if (!vendorId) {
    res.status(400).json({ message: "Vendor id required." });
    return;
  }

  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, shopId, isDeleted: false },
    select: { id: true, name: true, code: true, phone: true, email: true },
  });
  if (!vendor) {
    res.status(404).json({ message: "Vendor not found." });
    return;
  }

  const purchases = await prisma.purchase.findMany({
    where: { shopId, vendorId, isDeleted: false },
    orderBy: { purchasedAt: "desc" },
    select: {
      id: true,
      purchaseNo: true,
      totalCost: true,
      status: true,
      purchasedAt: true,
      items: {
        select: {
          id: true, quantity: true, costPrice: true, totalPrice: true,
          part: { select: { id: true, name: true, sku: true } },
        },
      },
    },
  });

  res.json({
    vendor,
    summary: {
      purchaseCount: purchases.length,
      totalSpend: round2(
        purchases.reduce((s, p) => s + toNum(p.totalCost), 0)
      ),
      receivedSpend: round2(
        purchases
          .filter((p) => p.status === ("RECEIVED" as PurchaseStatus) || p.status === ("PAID" as PurchaseStatus))
          .reduce((s, p) => s + toNum(p.totalCost), 0)
      ),
      totalQuantity: purchases.reduce(
        (s, p) => s + p.items.reduce((ss, i) => ss + i.quantity, 0),
        0
      ),
    },
    purchases: purchases.map((p) => ({
      id: p.id,
      purchaseNo: p.purchaseNo,
      quantity: p.items.reduce((s, i) => s + i.quantity, 0),
      totalCost: toNum(p.totalCost),
      status: p.status,
      purchasedAt: p.purchasedAt.toISOString(),
      items: p.items.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        costPrice: toNum(i.costPrice),
        totalPrice: toNum(i.totalPrice),
        part: i.part,
      })),
    })),
  });
}
