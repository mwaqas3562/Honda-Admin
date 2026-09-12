import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

/* ─── Schemas ──────────────────────────────────────────── */

const listQuerySchema = z.object({
  q: z.string().optional(),
  sortBy: z.enum(["name", "visits", "spend", "lastVisit"]).default("spend"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  /** Optional date range (ISO) applied to invoices/job cards. */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
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

/* ─── Customers report ─────────────────────────────────── */

export async function getCustomersReportHandler(
  req: Request,
  res: Response
): Promise<void> {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query.", errors: parsed.error.flatten() });
    return;
  }
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }

  const { q, sortBy, sortDir, from, to } = parsed.data;

  const dateFilter: Prisma.DateTimeFilter | undefined =
    from || to
      ? {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        }
      : undefined;

  const tokens = q ? q.trim().split(/\s+/).filter(Boolean) : [];
  const customerWhere: Prisma.CustomerWhereInput = {
    shopId,
    isDeleted: false,
    ...(tokens.length
      ? {
          AND: tokens.map((t) => ({
            OR: [
              { name: { contains: t, mode: "insensitive" } },
              { phone: { contains: t, mode: "insensitive" } },
              {
                jobCards: {
                  some: {
                    isDeleted: false,
                    jobNumber: { contains: t, mode: "insensitive" },
                  },
                },
              },
            ],
          })) as Prisma.CustomerWhereInput[],
        }
      : {}),
  };

  const customers = await prisma.customer.findMany({
    where: customerWhere,
    select: { id: true, name: true, phone: true, email: true, createdAt: true },
  });

  /* Aggregate invoices per customer */
  const invoiceWhere: Prisma.InvoiceWhereInput = {
    shopId,
    isDeleted: false,
    status: { not: "VOID" },
    ...(dateFilter ? { issuedAt: dateFilter } : {}),
    ...(customers.length ? { customerId: { in: customers.map((c) => c.id) } } : {}),
  };

  const invoiceAgg = customers.length
    ? await prisma.invoice.groupBy({
        by: ["customerId"],
        where: invoiceWhere,
        _sum: { totalAmount: true },
        _count: { _all: true },
        _max: { issuedAt: true, createdAt: true },
      })
    : [];

  const invoiceMap = new Map(
    invoiceAgg.map((a) => [
      a.customerId,
      {
        spend: toNum(a._sum.totalAmount),
        invoiceCount: a._count._all,
        lastInvoice: a._max.issuedAt ?? a._max.createdAt ?? null,
      },
    ])
  );

  /* Aggregate job cards per customer (visits) */
  const jobCardWhere: Prisma.JobCardWhereInput = {
    shopId,
    isDeleted: false,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
    ...(customers.length ? { customerId: { in: customers.map((c) => c.id) } } : {}),
  };

  const jobAgg = customers.length
    ? await prisma.jobCard.groupBy({
        by: ["customerId"],
        where: jobCardWhere,
        _count: { _all: true },
        _max: { createdAt: true },
      })
    : [];

  const jobMap = new Map(
    jobAgg.map((a) => [
      a.customerId,
      {
        jobCount: a._count._all,
        lastJob: a._max.createdAt ?? null,
      },
    ])
  );

  /* Build rows */
  let rows = customers.map((c) => {
    const inv = invoiceMap.get(c.id);
    const job = jobMap.get(c.id);
    const visits = (inv?.invoiceCount ?? 0) + (job?.jobCount ?? 0);
    const spend = inv?.spend ?? 0;
    const lastInv = inv?.lastInvoice ? new Date(inv.lastInvoice).getTime() : 0;
    const lastJob = job?.lastJob ? new Date(job.lastJob).getTime() : 0;
    const lastVisitMs = Math.max(lastInv, lastJob);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      visits,
      invoiceCount: inv?.invoiceCount ?? 0,
      jobCount: job?.jobCount ?? 0,
      totalSpend: Math.floor(spend),
      lastVisit: lastVisitMs ? new Date(lastVisitMs).toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    };
  });

  /* Sort */
  const dirMul = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "visits":
        cmp = a.visits - b.visits;
        break;
      case "spend":
        cmp = a.totalSpend - b.totalSpend;
        break;
      case "lastVisit": {
        const av = a.lastVisit ? new Date(a.lastVisit).getTime() : 0;
        const bv = b.lastVisit ? new Date(b.lastVisit).getTime() : 0;
        cmp = av - bv;
        break;
      }
    }
    return cmp * dirMul;
  });

  /* Totals */
  const totalCustomers = rows.length;
  const totalRevenue = rows.reduce((acc, r) => acc + r.totalSpend, 0);
  const payingCustomers = rows.filter((r) => r.totalSpend > 0).length;
  const avgSpend = payingCustomers > 0 ? totalRevenue / payingCustomers : 0;

  res.json({
    totals: {
      totalCustomers,
      totalRevenue: Math.floor(totalRevenue),
      avgSpend: Math.floor(avgSpend),
      payingCustomers,
    },
    customers: rows,
  });
}

/* ─── Drill-down: customer timeline ────────────────────── */

export async function getCustomerTimelineHandler(
  req: Request,
  res: Response
): Promise<void> {
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }
  const customerId = String(req.params.id ?? "");

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shopId, isDeleted: false },
    select: {
      id: true, name: true, phone: true, email: true, address: true,
      createdAt: true,
    },
  });
  if (!customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const [invoices, jobCards] = await Promise.all([
    prisma.invoice.findMany({
      where: { shopId, customerId, isDeleted: false },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        issuedAt: true,
        createdAt: true,
        jobCardId: true,
        jobCard: { select: { id: true, jobNumber: true, title: true } },
      },
    }),
    prisma.jobCard.findMany({
      where: { shopId, customerId, isDeleted: false },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        jobNumber: true,
        title: true,
        status: true,
        totalAmount: true,
        vehicleRegNo: true,
        mechanicAssigned: true,
        createdAt: true,
      },
    }),
  ]);

  /* Build a unified timeline:
   *   - Invoice without jobCard ⇒ "SALE"
   *   - Invoice with jobCard    ⇒ "SERVICE"
   *   - JobCard                 ⇒ "JOB_CARD"
   */
  type TimelineEntry =
    | {
        kind: "SALE" | "SERVICE";
        id: string;
        date: string;
        invoiceNumber: string;
        status: string;
        totalAmount: number;
        paidAmount: number;
        jobNumber: string | null;
        jobTitle: string | null;
      }
    | {
        kind: "JOB_CARD";
        id: string;
        date: string;
        jobNumber: string;
        title: string;
        status: string;
        totalAmount: number;
        vehicleRegNo: string | null;
        mechanicAssigned: string | null;
      };

  const entries: TimelineEntry[] = [];
  for (const inv of invoices) {
    entries.push({
      kind: inv.jobCardId ? "SERVICE" : "SALE",
      id: inv.id,
      date: (inv.issuedAt ?? inv.createdAt).toISOString(),
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      totalAmount: toNum(inv.totalAmount),
      paidAmount: toNum(inv.paidAmount),
      jobNumber: inv.jobCard?.jobNumber ?? null,
      jobTitle: inv.jobCard?.title ?? null,
    });
  }
  for (const jc of jobCards) {
    entries.push({
      kind: "JOB_CARD",
      id: jc.id,
      date: jc.createdAt.toISOString(),
      jobNumber: jc.jobNumber,
      title: jc.title,
      status: jc.status,
      totalAmount: toNum(jc.totalAmount),
      vehicleRegNo: jc.vehicleRegNo,
      mechanicAssigned: jc.mechanicAssigned,
    });
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  /* Per-customer summary numbers */
  const summary = {
    salesCount: entries.filter((e) => e.kind === "SALE").length,
    serviceCount: entries.filter((e) => e.kind === "SERVICE").length,
    jobCardCount: entries.filter((e) => e.kind === "JOB_CARD").length,
    totalSpend: invoices
      .filter((i) => i.status !== "VOID")
      .reduce((acc, i) => acc + toNum(i.totalAmount), 0),
  };
  summary.totalSpend = Math.floor(summary.totalSpend);

  res.json({
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      createdAt: customer.createdAt.toISOString(),
    },
    summary,
    entries,
  });
}
