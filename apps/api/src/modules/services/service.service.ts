import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { CreateServiceInput, UpdateServiceInput } from "./service.schema";

const serviceSelect = {
  id: true,
  shopId: true,
  name: true,
  defaultPrice: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ServiceSelect;

export type ServiceRecord = Prisma.ServiceGetPayload<{ select: typeof serviceSelect }>;

export async function listServices(
  shopId: string,
  opts: { q?: string; activeOnly?: boolean } = {},
): Promise<ServiceRecord[]> {
  const where: Prisma.ServiceWhereInput = {
    shopId,
    isDeleted: false,
    ...(opts.activeOnly && { isActive: true }),
    ...(opts.q && {
      OR: [
        { name: { contains: opts.q, mode: "insensitive" } },
        { description: { contains: opts.q, mode: "insensitive" } },
      ],
    }),
  };
  return prisma.service.findMany({
    where,
    select: serviceSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 500,
  });
}

export async function getService(id: string, shopId: string) {
  return prisma.service.findFirst({
    where: { id, shopId, isDeleted: false },
    select: serviceSelect,
  });
}

export async function createService(
  shopId: string,
  userId: string,
  input: CreateServiceInput,
) {
  return prisma.service.create({
    data: {
      shopId,
      name: input.name.trim(),
      defaultPrice: input.defaultPrice ?? 0,
      description: input.description ? input.description.trim() : null,
      isActive: input.isActive ?? true,
      createdById: userId,
    },
    select: serviceSelect,
  });
}

export async function updateService(
  id: string,
  shopId: string,
  input: UpdateServiceInput,
) {
  const existing = await prisma.service.findFirst({
    where: { id, shopId, isDeleted: false },
  });
  if (!existing) return null;
  return prisma.service.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.defaultPrice !== undefined && { defaultPrice: input.defaultPrice }),
      ...(input.description !== undefined && {
        description: input.description ? input.description.trim() : null,
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select: serviceSelect,
  });
}

export async function deleteService(id: string, shopId: string): Promise<boolean> {
  const existing = await prisma.service.findFirst({
    where: { id, shopId, isDeleted: false },
  });
  if (!existing) return false;
  await prisma.service.update({ where: { id }, data: { isDeleted: true } });
  return true;
}
