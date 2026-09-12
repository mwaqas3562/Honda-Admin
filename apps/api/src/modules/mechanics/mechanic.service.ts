import { Prisma, MechanicStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { CreateMechanicInput, UpdateMechanicInput } from "./mechanic.schema";

const mechanicSelect = {
  id: true,
  shopId: true,
  name: true,
  phone: true,
  address: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MechanicSelect;

export type MechanicRecord = Prisma.MechanicGetPayload<{ select: typeof mechanicSelect }>;

export interface MechanicWithStats extends MechanicRecord {
  totalJobs: number;
  completedJobs: number;
  openJobs: number;
  earnings: number;
}

export async function listMechanics(
  shopId: string,
  opts: { status?: MechanicStatus; q?: string; includeStats?: boolean } = {},
): Promise<MechanicWithStats[]> {
  const where: Prisma.MechanicWhereInput = {
    shopId,
    isDeleted: false,
    ...(opts.status && { status: opts.status }),
    ...(opts.q && {
      OR: [
        { name: { contains: opts.q, mode: "insensitive" } },
        { phone: { contains: opts.q, mode: "insensitive" } },
      ],
    }),
  };

  const mechanics = await prisma.mechanic.findMany({
    where,
    select: mechanicSelect,
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  if (!opts.includeStats || mechanics.length === 0) {
    return mechanics.map((m) => ({ ...m, totalJobs: 0, completedJobs: 0, openJobs: 0, earnings: 0 }));
  }

  const ids = mechanics.map((m) => m.id);
  const grouped = await prisma.jobCard.groupBy({
    by: ["mechanicId", "status"],
    where: { shopId, isDeleted: false, mechanicId: { in: ids } },
    _count: { _all: true },
    _sum: { laborAmount: true },
  });

  const stats = new Map<string, { total: number; completed: number; open: number; earnings: number }>();
  for (const row of grouped) {
    if (!row.mechanicId) continue;
    const cur = stats.get(row.mechanicId) ?? { total: 0, completed: 0, open: 0, earnings: 0 };
    const c = row._count._all;
    cur.total += c;
    cur.earnings += Number(row._sum.laborAmount ?? 0);
    if (row.status === "COMPLETED") cur.completed += c;
    else if (row.status === "OPEN" || row.status === "IN_PROGRESS") cur.open += c;
    stats.set(row.mechanicId, cur);
  }

  return mechanics.map((m) => {
    const s = stats.get(m.id);
    return {
      ...m,
      totalJobs: s?.total ?? 0,
      completedJobs: s?.completed ?? 0,
      openJobs: s?.open ?? 0,
      earnings: s?.earnings ?? 0,
    };
  });
}

export async function getMechanic(id: string, shopId: string) {
  return prisma.mechanic.findFirst({
    where: { id, shopId, isDeleted: false },
    select: mechanicSelect,
  });
}

export async function createMechanic(shopId: string, userId: string, input: CreateMechanicInput) {
  return prisma.mechanic.create({
    data: {
      shopId,
      name: input.name.trim(),
      phone: input.phone ? input.phone.trim() : null,
      address: input.address ? input.address.trim() : null,
      status: input.status ?? "ACTIVE",
      createdById: userId,
    },
    select: mechanicSelect,
  });
}

export async function updateMechanic(id: string, shopId: string, input: UpdateMechanicInput) {
  const existing = await prisma.mechanic.findFirst({ where: { id, shopId, isDeleted: false } });
  if (!existing) return null;
  return prisma.mechanic.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.phone !== undefined && { phone: input.phone ? input.phone.trim() : null }),
      ...(input.address !== undefined && { address: input.address ? input.address.trim() : null }),
      ...(input.status !== undefined && { status: input.status }),
    },
    select: mechanicSelect,
  });
}

export async function setMechanicStatus(id: string, shopId: string, status: MechanicStatus) {
  const existing = await prisma.mechanic.findFirst({ where: { id, shopId, isDeleted: false } });
  if (!existing) return null;
  return prisma.mechanic.update({ where: { id }, data: { status }, select: mechanicSelect });
}

export async function deleteMechanic(id: string, shopId: string): Promise<{ deleted: boolean; reason?: string }> {
  const existing = await prisma.mechanic.findFirst({ where: { id, shopId, isDeleted: false } });
  if (!existing) return { deleted: false, reason: "not_found" };
  const linked = await prisma.jobCard.count({ where: { shopId, mechanicId: id, isDeleted: false } });
  if (linked > 0) return { deleted: false, reason: "linked_jobcards" };
  await prisma.mechanic.update({ where: { id }, data: { isDeleted: true } });
  return { deleted: true };
}

export async function isMechanicActive(id: string, shopId: string): Promise<boolean> {
  const m = await prisma.mechanic.findFirst({
    where: { id, shopId, isDeleted: false },
    select: { status: true },
  });
  return !!m && m.status === "ACTIVE";
}
