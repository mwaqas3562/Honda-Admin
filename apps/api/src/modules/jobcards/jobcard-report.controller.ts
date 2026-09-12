import type { Request, Response } from "express";
import { Prisma, JobCardStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

/* ─── Schema ───────────────────────────────────────────── */

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().optional(),
  status: z.enum(["ALL", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("ALL"),
  mechanic: z.string().optional(),
  sortBy: z
    .enum(["createdAt", "jobNumber", "customer", "total", "status", "turnaround"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const mechanicQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().optional(),
  sortBy: z.enum(["jobs", "revenue", "avgTurnaround", "name"]).default("revenue"),
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

/* ─── Handler: Job Cards report ────────────────────────── */

export async function getJobCardsReportHandler(
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
  const { from, to, q, status, mechanic, sortBy, sortDir } = parsed.data;

  const dateFilter: Prisma.DateTimeFilter | undefined =
    from || to
      ? {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        }
      : undefined;

  const where: Prisma.JobCardWhereInput = {
    shopId,
    isDeleted: false,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
    ...(status !== "ALL" ? { status: status as JobCardStatus } : {}),
    ...(mechanic ? { mechanicAssigned: mechanic } : {}),
    ...(q
      ? {
          AND: q.trim().split(/\s+/).filter(Boolean).map((t) => ({
            OR: [
              { jobNumber: { contains: t, mode: "insensitive" } },
              { vehicleRegNo: { contains: t, mode: "insensitive" } },
              { title: { contains: t, mode: "insensitive" } },
              { mechanicAssigned: { contains: t, mode: "insensitive" } },
              { customer: { name: { contains: t, mode: "insensitive" } } },
              { customer: { phone: { contains: t, mode: "insensitive" } } },
            ],
          })) as Prisma.JobCardWhereInput[],
        }
      : {}),
  };

  const jobs = await prisma.jobCard.findMany({
    where,
    select: {
      id: true,
      jobNumber: true,
      title: true,
      status: true,
      vehicleRegNo: true,
      mechanicAssigned: true,
      createdAt: true,
      updatedAt: true,
      laborAmount: true,
      partsAmount: true,
      totalAmount: true,
      customer: { select: { id: true, name: true, phone: true } },
      invoice: { select: { id: true, invoiceNumber: true, status: true } },
    },
  });

  const now = Date.now();
  const rows = jobs.map((j) => {
    const labour = toNum(j.laborAmount);
    const parts = toNum(j.partsAmount);
    const total = toNum(j.totalAmount);
    const ageDays = Math.floor((now - j.createdAt.getTime()) / DAY_MS);
    /** Turnaround = days from createdAt → updatedAt for completed jobs only. */
    const turnaroundDays =
      j.status === "COMPLETED"
        ? round2((j.updatedAt.getTime() - j.createdAt.getTime()) / DAY_MS)
        : null;

    return {
      id: j.id,
      jobNumber: j.jobNumber,
      title: j.title,
      status: j.status,
      vehicleRegNo: j.vehicleRegNo,
      mechanicAssigned: j.mechanicAssigned,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
      labour,
      parts,
      total,
      ageDays,
      turnaroundDays,
      customer: j.customer,
      invoice: j.invoice,
    };
  });

  /* Sort */
  const dirMul = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "createdAt":
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "jobNumber":
        cmp = a.jobNumber.localeCompare(b.jobNumber);
        break;
      case "customer":
        cmp = a.customer.name.localeCompare(b.customer.name);
        break;
      case "total":
        cmp = a.total - b.total;
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
      case "turnaround": {
        if (a.turnaroundDays === null && b.turnaroundDays === null) cmp = 0;
        else if (a.turnaroundDays === null) cmp = 1 * dirMul;
        else if (b.turnaroundDays === null) cmp = -1 * dirMul;
        else cmp = a.turnaroundDays - b.turnaroundDays;
        break;
      }
    }
    return cmp * dirMul;
  });

  /* Aggregates */
  const totals = {
    jobCount: rows.length,
    open: rows.filter((r) => r.status === "OPEN").length,
    inProgress: rows.filter((r) => r.status === "IN_PROGRESS").length,
    completed: rows.filter((r) => r.status === "COMPLETED").length,
    cancelled: rows.filter((r) => r.status === "CANCELLED").length,
    /** Open + In-Progress total amount (Work In Progress value) */
    wipValue: round2(
      rows
        .filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS")
        .reduce((s, r) => s + r.total, 0)
    ),
    completedValue: round2(
      rows.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.total, 0)
    ),
    totalLabour: round2(rows.reduce((s, r) => s + r.labour, 0)),
    totalParts: round2(rows.reduce((s, r) => s + r.parts, 0)),
    avgTurnaroundDays: (() => {
      const completed = rows.filter((r) => r.turnaroundDays !== null);
      if (completed.length === 0) return null;
      return round2(
        completed.reduce((s, r) => s + (r.turnaroundDays ?? 0), 0) / completed.length
      );
    })(),
  };

  const mechanics = Array.from(
    new Set(
      jobs
        .map((j) => j.mechanicAssigned?.trim())
        .filter((m): m is string => Boolean(m && m.length > 0))
    )
  ).sort();

  res.json({ totals, jobCards: rows, mechanics });
}

/* ─── Handler: Mechanics report (lightweight, group by name) ─── */

export async function getMechanicsReportHandler(
  req: Request,
  res: Response
): Promise<void> {
  const parsed = mechanicQuerySchema.safeParse(req.query);
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

  const jobs = await prisma.jobCard.findMany({
    where: {
      shopId,
      isDeleted: false,
      mechanicId: { not: null },
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    select: {
      mechanicId: true,
      mechanicAssigned: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      laborAmount: true,
      partsAmount: true,
      totalAmount: true,
    },
  });

  const masters = await prisma.mechanic.findMany({
    where: { shopId, isDeleted: false },
    select: { id: true, name: true, phone: true, status: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  type Bucket = {
    id: string;
    name: string;
    phone: string | null;
    status: "ACTIVE" | "INACTIVE";
    jobs: number;
    completed: number;
    open: number;
    revenue: number;
    labour: number;
    parts: number;
    turnaroundDaysList: number[];
  };
  const map = new Map<string, Bucket>();
  for (const m of masters) {
    map.set(m.id, {
      id: m.id,
      name: m.name,
      phone: m.phone,
      status: m.status,
      jobs: 0,
      completed: 0,
      open: 0,
      revenue: 0,
      labour: 0,
      parts: 0,
      turnaroundDaysList: [],
    });
  }
  for (const j of jobs) {
    if (!j.mechanicId) continue;
    const b = map.get(j.mechanicId);
    if (!b) continue;
    b.jobs += 1;
    if (j.status === "COMPLETED") {
      b.completed += 1;
      b.turnaroundDaysList.push(
        (j.updatedAt.getTime() - j.createdAt.getTime()) / DAY_MS
      );
    } else if (j.status === "OPEN" || j.status === "IN_PROGRESS") {
      b.open += 1;
    }
    b.revenue += toNum(j.totalAmount);
    b.labour += toNum(j.laborAmount);
    b.parts += toNum(j.partsAmount);
  }

  let rows = Array.from(map.values()).map((b) => ({
    id: b.id,
    name: b.name,
    phone: b.phone,
    status: b.status,
    jobs: b.jobs,
    completed: b.completed,
    open: b.open,
    revenue: round2(b.revenue),
    labour: round2(b.labour),
    earnings: round2(b.labour),
    parts: round2(b.parts),
    avgTurnaroundDays:
      b.turnaroundDaysList.length === 0
        ? null
        : round2(
            b.turnaroundDaysList.reduce((s, x) => s + x, 0) /
              b.turnaroundDaysList.length
          ),
  }));

  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(ql) ||
        (r.phone ?? "").toLowerCase().includes(ql)
    );
  }

  const dirMul = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "jobs":
        cmp = a.jobs - b.jobs;
        break;
      case "revenue":
        cmp = a.revenue - b.revenue;
        break;
      case "avgTurnaround": {
        if (a.avgTurnaroundDays === null && b.avgTurnaroundDays === null) cmp = 0;
        else if (a.avgTurnaroundDays === null) cmp = 1 * dirMul;
        else if (b.avgTurnaroundDays === null) cmp = -1 * dirMul;
        else cmp = a.avgTurnaroundDays - b.avgTurnaroundDays;
        break;
      }
    }
    return cmp * dirMul;
  });

  const totals = {
    mechanics: rows.length,
    totalJobs: rows.reduce((s, r) => s + r.jobs, 0),
    totalRevenue: round2(rows.reduce((s, r) => s + r.revenue, 0)),
    totalCompleted: rows.reduce((s, r) => s + r.completed, 0),
    totalOpen: rows.reduce((s, r) => s + r.open, 0),
  };

  res.json({ totals, mechanics: rows });
}

/* ─── Handler: Mechanic drill-down (job list) ─────────── */

export async function getMechanicJobsHandler(
  req: Request,
  res: Response
): Promise<void> {
  const shopId = shopIdFromReq(req);
  if (!shopId) {
    res.status(400).json({ message: "Shop scope required." });
    return;
  }
  const idOrName = String(req.params.name ?? "").trim();
  if (!idOrName) {
    res.status(400).json({ message: "Mechanic identifier required." });
    return;
  }

  // Resolve to a master record either by id or by exact name (legacy support).
  const master = await prisma.mechanic.findFirst({
    where: {
      shopId,
      isDeleted: false,
      OR: [{ id: idOrName }, { name: idOrName }],
    },
    select: { id: true, name: true, phone: true, address: true, status: true, createdAt: true },
  });
  if (!master) {
    res.status(404).json({ message: "Mechanic not found." });
    return;
  }

  // Optional date-range filter (createdAt of the job card).
  const fromRaw = req.query.from ? String(req.query.from) : undefined;
  const toRaw = req.query.to ? String(req.query.to) : undefined;
  const fromDate = fromRaw ? new Date(fromRaw) : undefined;
  const toDate = toRaw ? new Date(toRaw) : undefined;

  const jobs = await prisma.jobCard.findMany({
    where: {
      shopId,
      isDeleted: false,
      mechanicId: master.id,
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      jobNumber: true,
      title: true,
      status: true,
      vehicleRegNo: true,
      createdAt: true,
      updatedAt: true,
      laborAmount: true,
      partsAmount: true,
      totalAmount: true,
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  const totalLabour = jobs.reduce((s, j) => s + toNum(j.laborAmount), 0);
  const totalParts = jobs.reduce((s, j) => s + toNum(j.partsAmount), 0);
  const totalSale = jobs.reduce((s, j) => s + toNum(j.totalAmount), 0);

  res.json({
    mechanic: {
      id: master.id,
      name: master.name,
      phone: master.phone,
      address: master.address,
      status: master.status,
      createdAt: master.createdAt.toISOString(),
      jobCount: jobs.length,
      totalEarnings: round2(totalLabour),
      totalLabour: round2(totalLabour),
      totalParts: round2(totalParts),
      totalSale: round2(totalSale),
      from: fromDate ? fromDate.toISOString() : null,
      to: toDate ? toDate.toISOString() : null,
    },
    jobs: jobs.map((j) => ({
      id: j.id,
      jobNumber: j.jobNumber,
      title: j.title,
      status: j.status,
      vehicleRegNo: j.vehicleRegNo,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
      labour: toNum(j.laborAmount),
      parts: toNum(j.partsAmount),
      total: toNum(j.totalAmount),
      turnaroundDays:
        j.status === "COMPLETED"
          ? round2((j.updatedAt.getTime() - j.createdAt.getTime()) / DAY_MS)
          : null,
      customer: j.customer,
    })),
  });
}
