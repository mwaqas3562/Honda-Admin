import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

/* ─── Schema ───────────────────────────────────────────── */

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().optional(),
  sortBy: z
    .enum(["date", "invoiceNumber", "revenue", "cost", "profit", "customer"])
    .default("date"),
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

/* ─── Profit Report ────────────────────────────────────── */
/**
 * Per-invoice profit, mirroring the legacy "Sale Invoice Wise Profit"
 * Crystal report:
 *   Labour   = jobCard.laborAmount   (0 if invoice has no job card)
 *   Parts    = invoice.subtotal - labour
 *   Discount = invoice.discountAmt
 *   Bill     = invoice.totalAmount
 *   Cost     = Σ (item.qty × matched Part.unitPrice)        — matched by sku/itemCode
 *   Profit   = Bill - Discount - Cost   (== Revenue - Cost in net-of-discount terms)
 *
 * Drill-down returns the full per-line breakdown of one invoice with
 * matched cost, line revenue, discount allocation, and line profit.
 */
export async function getProfitReportHandler(
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

  const where: Prisma.InvoiceWhereInput = {
    shopId,
    isDeleted: false,
    status: { not: "VOID" },
    ...(dateFilter ? { issuedAt: dateFilter } : {}),
    ...(q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const invoices = await prisma.invoice.findMany({
    where,
    select: {
      id: true,
      invoiceNumber: true,
      issuedAt: true,
      createdAt: true,
      subtotal: true,
      discountAmt: true,
      totalAmount: true,
      totalCost: true,
      customer: { select: { id: true, name: true } },
      jobCard: {
        select: {
          id: true,
          jobNumber: true,
          laborAmount: true,
          vehicleRegNo: true,
        },
      },
      items: {
        select: { itemCode: true, itemName: true, qty: true, rate: true, total: true, costPrice: true },
      },
    },
  });

  /* Build rows — cost is taken from the per-item snapshot (costPrice on InvoiceItem),
   * which is captured at sale time so historical profit doesn't drift if Part.unitPrice
   * is later edited. */
  let rows = invoices.map((inv) => {
    const labour = toNum(inv.jobCard?.laborAmount);
    const subtotal = toNum(inv.subtotal);
    const discount = toNum(inv.discountAmt);
    const bill = toNum(inv.totalAmount);
    const parts = Math.max(0, subtotal - labour);

    let cost = 0;
    let qty = 0;
    let wheelBalanceQty = 0;
    let wheelBalanceSale = 0;
    for (const it of inv.items) {
      cost += toNum(it.costPrice) * it.qty;
      qty += it.qty;
      if (it.itemName && it.itemName.toLowerCase().includes("wheel balance")) {
        wheelBalanceQty += it.qty;
        wheelBalanceSale += toNum(it.total);
      }
    }
    cost = round2(cost);
    const revenue = round2(bill - discount);
    const profit = round2(revenue - cost);

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      date: (inv.issuedAt ?? inv.createdAt).toISOString(),
      customerId: inv.customer?.id ?? null,
      customerName: inv.customer?.name ?? "—",
      jobCardId: inv.jobCard?.id ?? null,
      jobNumber: inv.jobCard?.jobNumber ?? null,
      vehicle: inv.jobCard?.vehicleRegNo ?? null,
      qty,
      labour: round2(labour),
      parts: round2(parts),
      discount: round2(discount),
      bill: round2(bill),
      revenue,
      cost,
      profit,
      wheelBalanceQty,
      wheelBalanceSale: round2(wheelBalanceSale),
    };
  });

  /* Sort */
  const dirMul = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "date":          cmp = a.date.localeCompare(b.date); break;
      case "invoiceNumber": cmp = a.invoiceNumber.localeCompare(b.invoiceNumber); break;
      case "customer":      cmp = a.customerName.localeCompare(b.customerName); break;
      case "revenue":       cmp = a.revenue - b.revenue; break;
      case "cost":          cmp = a.cost - b.cost; break;
      case "profit":        cmp = a.profit - b.profit; break;
    }
    return cmp * dirMul;
  });

  /* Totals */
  const totals = rows.reduce(
    (acc, r) => {
      acc.labour += r.labour;
      acc.parts += r.parts;
      acc.discount += r.discount;
      acc.bill += r.bill;
      acc.revenue += r.revenue;
      acc.cost += r.cost;
      acc.profit += r.profit;
      acc.wheelBalanceQty += r.wheelBalanceQty;
      acc.wheelBalanceSale += r.wheelBalanceSale;
      return acc;
    },
    { labour: 0, parts: 0, discount: 0, bill: 0, revenue: 0, cost: 0, profit: 0, wheelBalanceQty: 0, wheelBalanceSale: 0 }
  );
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
    totals[k] = round2(totals[k]);
  }
  // Net profit = gross profit minus discount given (already excluded from revenue).
  // Here we surface both as the same number; consumers can override if expense
  // allocation is later introduced. Profit % is over revenue (bill - discount).
  const profitPct = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  res.json({
    totals: {
      labour: totals.labour,
      parts: totals.parts,
      discount: totals.discount,
      bill: totals.bill,
      revenue: totals.revenue,
      cost: totals.cost,
      grossProfit: totals.profit,
      netProfit: totals.profit,
      profitPct: round2(profitPct),
      invoiceCount: rows.length,
      wheelBalanceQty: totals.wheelBalanceQty,
      wheelBalanceSale: round2(totals.wheelBalanceSale),
    },
    invoices: rows,
  });
}

/* ─── Drill-down: invoice line breakdown ───────────────── */

export async function getInvoiceProfitBreakdownHandler(
  req: Request,
  res: Response
): Promise<void> {
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }
  const invoiceId = String(req.params.id ?? "");

  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, shopId, isDeleted: false },
    select: {
      id: true,
      invoiceNumber: true,
      issuedAt: true,
      createdAt: true,
      subtotal: true,
      discountPct: true,
      discountAmt: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
      customer: { select: { id: true, name: true, phone: true } },
      jobCard: {
        select: {
          id: true, jobNumber: true, title: true, laborAmount: true,
          partsAmount: true, vehicleRegNo: true, mechanicAssigned: true,
        },
      },
      items: {
        select: {
          id: true, itemCode: true, itemName: true, qty: true,
          rate: true, total: true, remarks: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!inv) {
    res.status(404).json({ message: "Invoice not found." });
    return;
  }

  const skus = inv.items
    .map((i) => i.itemCode)
    .filter((s): s is string => Boolean(s));
  const partMap = new Map<string, { unitPrice: number; sellingPrice: number }>();
  if (skus.length) {
    const parts = await prisma.part.findMany({
      where: { shopId, isDeleted: false, sku: { in: skus } },
      select: { sku: true, unitPrice: true, sellingPrice: true },
    });
    for (const p of parts) {
      partMap.set(p.sku, {
        unitPrice: toNum(p.unitPrice),
        sellingPrice: toNum(p.sellingPrice),
      });
    }
  }

  const subtotal = toNum(inv.subtotal);
  const discount = toNum(inv.discountAmt);
  const bill = toNum(inv.totalAmount);
  const labour = toNum(inv.jobCard?.laborAmount);

  const lines = inv.items.map((it) => {
    const matched = it.itemCode ? partMap.get(it.itemCode) ?? null : null;
    const unitCost = matched?.unitPrice ?? 0;
    const lineRevenue = toNum(it.total);
    const lineCost = round2(unitCost * it.qty);
    // Allocate discount proportionally to line revenue share of subtotal
    const share = subtotal > 0 ? lineRevenue / subtotal : 0;
    const lineDiscount = round2(discount * share);
    const netLineRevenue = round2(lineRevenue - lineDiscount);
    const lineProfit = round2(netLineRevenue - lineCost);
    return {
      id: it.id,
      itemCode: it.itemCode,
      itemName: it.itemName,
      qty: it.qty,
      rate: toNum(it.rate),
      lineRevenue: round2(lineRevenue),
      lineDiscount,
      netLineRevenue,
      unitCost: round2(unitCost),
      lineCost,
      lineProfit,
      matched: Boolean(matched),
      remarks: it.remarks,
    };
  });

  const cost = round2(lines.reduce((a, l) => a + l.lineCost, 0));
  const revenue = round2(bill - discount);
  const profit = round2(revenue - cost);
  const profitPct = revenue > 0 ? round2((profit / revenue) * 100) : 0;
  const parts = round2(Math.max(0, subtotal - labour));

  res.json({
    invoice: {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      date: (inv.issuedAt ?? inv.createdAt).toISOString(),
      status: inv.status,
      customer: inv.customer,
      jobCard: inv.jobCard
        ? {
            id: inv.jobCard.id,
            jobNumber: inv.jobCard.jobNumber,
            title: inv.jobCard.title,
            vehicleRegNo: inv.jobCard.vehicleRegNo,
            mechanicAssigned: inv.jobCard.mechanicAssigned,
          }
        : null,
      subtotal: round2(subtotal),
      discountPct: toNum(inv.discountPct),
      discountAmt: round2(discount),
      totalAmount: round2(bill),
      paidAmount: toNum(inv.paidAmount),
    },
    summary: {
      labour: round2(labour),
      parts,
      discount: round2(discount),
      bill: round2(bill),
      revenue,
      cost,
      profit,
      profitPct,
    },
    lines,
  });
}
