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
  /** Minimum visits to qualify as "repeat". */
  minVisits: z.coerce.number().int().min(1).max(100).default(2),
  /** Filter by classification bucket. */
  bucket: z.enum(["ALL", "FREQUENT", "MONTHLY", "OCCASIONAL"]).default("ALL"),
  sortBy: z
    .enum(["visits", "lastVisit", "avgGap", "name"])
    .default("visits"),
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

const DAY_MS = 86_400_000;

/**
 * Classify a customer by visit cadence.
 *   FREQUENT   → 5+ visits OR avg gap ≤ 30 days
 *   MONTHLY    → 3-4 visits (and avg gap ≤ 60 days)
 *   OCCASIONAL → 2 visits (or anything that didn't qualify above)
 */
type Bucket = "FREQUENT" | "MONTHLY" | "OCCASIONAL";

function classify(visits: number, avgGapDays: number | null): Bucket {
  if (visits >= 5) return "FREQUENT";
  if (avgGapDays !== null && avgGapDays <= 30 && visits >= 3) return "FREQUENT";
  if (visits >= 3 && (avgGapDays === null || avgGapDays <= 60)) return "MONTHLY";
  return "OCCASIONAL";
}

/* ─── Handler: repeat customers report ─────────────────── */

export async function getRepeatCustomersHandler(
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
  const { from, to, q, minVisits, bucket, sortBy, sortDir } = parsed.data;

  const dateFilter: Prisma.DateTimeFilter | undefined =
    from || to
      ? {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        }
      : undefined;

  const customerWhere: Prisma.CustomerWhereInput = {
    shopId,
    isDeleted: false,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  /* Also find customers who have a job card with a matching vehicle reg */
  let bikeMatchCustomerIds: string[] = [];
  if (q) {
    const bikeJobs = await prisma.jobCard.findMany({
      where: {
        shopId,
        isDeleted: false,
        vehicleRegNo: { contains: q, mode: "insensitive" },
      },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    bikeMatchCustomerIds = bikeJobs
      .map((j) => j.customerId)
      .filter((id): id is string => id !== null);
  }

  const customersByName = await prisma.customer.findMany({
    where: customerWhere,
    select: { id: true, name: true, phone: true },
  });

  /* Merge: customers matched by name/phone + customers matched by bike reg */
  let customers = customersByName;
  if (bikeMatchCustomerIds.length > 0) {
    const existing = new Set(customersByName.map((c) => c.id));
    const extra = await prisma.customer.findMany({
      where: {
        shopId,
        isDeleted: false,
        id: { in: bikeMatchCustomerIds.filter((id) => !existing.has(id)) },
      },
      select: { id: true, name: true, phone: true },
    });
    customers = [...customersByName, ...extra];
  }
  if (customers.length === 0) {
    res.json({
      totals: {
        totalRepeat: 0,
        frequent: 0,
        monthly: 0,
        occasional: 0,
        avgVisits: 0,
        avgGapDays: 0,
      },
      customers: [],
    });
    return;
  }

  const customerIds = customers.map((c) => c.id);

  /* Pull job-card visits in the window with vehicle reg for gap analysis */
  const jobCards = await prisma.jobCard.findMany({
    where: {
      shopId,
      isDeleted: false,
      customerId: { in: customerIds },
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    select: {
      customerId: true,
      createdAt: true,
      vehicleRegNo: true,
    },
  });

  /* Group by customer */
  const byCustomer = new Map<string, Date[]>();
  const bikesByCustomer = new Map<string, Set<string>>();
  for (const jc of jobCards) {
    const list = byCustomer.get(jc.customerId) ?? [];
    list.push(jc.createdAt);
    byCustomer.set(jc.customerId, list);
    if (jc.vehicleRegNo) {
      const set = bikesByCustomer.get(jc.customerId) ?? new Set<string>();
      set.add(jc.vehicleRegNo);
      bikesByCustomer.set(jc.customerId, set);
    }
  }

  const now = Date.now();

  const allRows = customers.map((c) => {
    const dates = (byCustomer.get(c.id) ?? []).sort(
      (a, b) => a.getTime() - b.getTime()
    );
    const visits = dates.length;
    const firstVisit = visits > 0 ? dates[0] : null;
    const lastVisit = visits > 0 ? dates[visits - 1] : null;

    /* Average gap = mean of consecutive deltas, in days. */
    let avgGapDays: number | null = null;
    if (visits >= 2 && firstVisit && lastVisit) {
      const totalSpan = lastVisit.getTime() - firstVisit.getTime();
      avgGapDays = round2(totalSpan / (visits - 1) / DAY_MS);
    }

    /* Days since last visit */
    const sinceLastDays =
      lastVisit !== null ? Math.floor((now - lastVisit.getTime()) / DAY_MS) : null;

    const bucketName = classify(visits, avgGapDays);
    const bikeSet = bikesByCustomer.get(c.id);
    const bikeCount = bikeSet?.size ?? 0;
    const bikes = bikeSet ? Array.from(bikeSet) : [];

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      visits,
      bikeCount,
      bikes,
      firstVisit: firstVisit?.toISOString() ?? null,
      lastVisit: lastVisit?.toISOString() ?? null,
      avgGapDays,
      sinceLastDays,
      bucket: bucketName,
    };
  });

  /* Apply min-visits + bucket filter (KPI totals computed *after* min-visits) */
  const repeatRows = allRows.filter((r) => r.visits >= minVisits);
  const filtered =
    bucket === "ALL" ? repeatRows : repeatRows.filter((r) => r.bucket === bucket);

  /* Sort */
  const dirMul = sortDir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "visits":
        cmp = a.visits - b.visits;
        break;
      case "lastVisit": {
        const av = a.lastVisit ? new Date(a.lastVisit).getTime() : 0;
        const bv = b.lastVisit ? new Date(b.lastVisit).getTime() : 0;
        cmp = av - bv;
        break;
      }
      case "avgGap": {
        // Customers with no avg gap (single visit) sort last regardless of dir
        if (a.avgGapDays === null && b.avgGapDays === null) cmp = 0;
        else if (a.avgGapDays === null) cmp = 1 * dirMul;
        else if (b.avgGapDays === null) cmp = -1 * dirMul;
        else cmp = a.avgGapDays - b.avgGapDays;
        break;
      }
    }
    return cmp * dirMul;
  });

  /* Totals over the post-minVisits set */
  const buckets = { FREQUENT: 0, MONTHLY: 0, OCCASIONAL: 0 } as Record<Bucket, number>;
  let visitsSum = 0;
  let gapSum = 0;
  let gapCount = 0;
  for (const r of repeatRows) {
    buckets[r.bucket as Bucket] += 1;
    visitsSum += r.visits;
    if (r.avgGapDays !== null) {
      gapSum += r.avgGapDays;
      gapCount += 1;
    }
  }

  res.json({
    totals: {
      totalRepeat: repeatRows.length,
      frequent: buckets.FREQUENT,
      monthly: buckets.MONTHLY,
      occasional: buckets.OCCASIONAL,
      avgVisits:
        repeatRows.length > 0 ? round2(visitsSum / repeatRows.length) : 0,
      avgGapDays: gapCount > 0 ? round2(gapSum / gapCount) : 0,
    },
    customers: filtered,
  });
}

/* ─── Handler: per-bike visit history ──────────────────── */

export async function getCustomerBikeHistoryHandler(
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
    select: { id: true, name: true, phone: true, email: true, createdAt: true },
  });
  if (!customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const jobCards = await prisma.jobCard.findMany({
    where: { shopId, customerId, isDeleted: false },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      jobNumber: true,
      title: true,
      status: true,
      vehicleRegNo: true,
      vehicleType: true,
      engineType: true,
      meterReading: true,
      mechanicAssigned: true,
      totalAmount: true,
      createdAt: true,
      invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
    },
  });

  /* Group by vehicleRegNo (unknown bikes go under "(no reg)") */
  type Visit = {
    id: string;
    jobNumber: string;
    title: string;
    status: string;
    mechanicAssigned: string | null;
    meterReading: number | null;
    totalAmount: number;
    invoiceNumber: string | null;
    invoiceTotal: number | null;
    createdAt: string;
    gapFromPrevDays: number | null;
  };

  const groups = new Map<
    string,
    {
      regNo: string;
      vehicleType: string | null;
      engineType: string | null;
      visits: Visit[];
    }
  >();

  for (const jc of jobCards) {
    const key = jc.vehicleRegNo ?? "(no reg)";
    let g = groups.get(key);
    if (!g) {
      g = {
        regNo: key,
        vehicleType: jc.vehicleType,
        engineType: jc.engineType,
        visits: [],
      };
      groups.set(key, g);
    }
    g.visits.push({
      id: jc.id,
      jobNumber: jc.jobNumber,
      title: jc.title,
      status: jc.status,
      mechanicAssigned: jc.mechanicAssigned,
      meterReading: jc.meterReading,
      totalAmount: toNum(jc.totalAmount),
      invoiceNumber: jc.invoice?.invoiceNumber ?? null,
      invoiceTotal: jc.invoice ? toNum(jc.invoice.totalAmount) : null,
      createdAt: jc.createdAt.toISOString(),
      gapFromPrevDays: null,
    });
  }

  /* Compute per-bike gap days (between consecutive visits, oldest→newest) */
  for (const g of groups.values()) {
    const asc = [...g.visits].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    let prev: number | null = null;
    for (const v of asc) {
      const ts = new Date(v.createdAt).getTime();
      v.gapFromPrevDays =
        prev === null ? null : Math.round((ts - prev) / DAY_MS);
      prev = ts;
    }
    /* Restore desc order for display */
    g.visits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /* Convert to array sorted by most-recent visit */
  const bikes = Array.from(groups.values()).sort((a, b) => {
    const ad = a.visits[0]?.createdAt ?? "";
    const bd = b.visits[0]?.createdAt ?? "";
    return bd.localeCompare(ad);
  });

  /* Overall stats */
  const totalVisits = jobCards.length;
  const totalSpend = jobCards.reduce(
    (acc, jc) => acc + toNum(jc.invoice?.totalAmount ?? jc.totalAmount),
    0
  );
  const dates = jobCards.map((jc) => jc.createdAt.getTime()).sort((a, b) => a - b);
  const avgGap =
    dates.length >= 2
      ? round2((dates[dates.length - 1] - dates[0]) / (dates.length - 1) / DAY_MS)
      : null;

  res.json({
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      createdAt: customer.createdAt.toISOString(),
    },
    summary: {
      totalVisits,
      totalSpend: round2(totalSpend),
      bikeCount: bikes.length,
      avgGapDays: avgGap,
      lastVisit:
        dates.length > 0
          ? new Date(dates[dates.length - 1]).toISOString()
          : null,
    },
    bikes,
  });
}
