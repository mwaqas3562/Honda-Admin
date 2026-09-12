import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { CreateCustomerInput, UpdateCustomerInput } from "./customer.schema";

const customerSelect = {
  id: true, shopId: true, name: true, phone: true, email: true, address: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.CustomerSelect;

export async function listCustomers(shopId: string, page = 1, limit = 200, search?: string) {
  const skip = (page - 1) * limit;
  const tokens = search ? search.trim().split(/\s+/).filter(Boolean) : [];
  const where: Prisma.CustomerWhereInput = {
    shopId, isDeleted: false,
    ...(tokens.length && {
      AND: tokens.map((t) => ({
        OR: [
          { name: { contains: t, mode: "insensitive" } },
          { phone: { contains: t, mode: "insensitive" } },
          { jobCards: { some: { jobNumber: { contains: t, mode: "insensitive" }, isDeleted: false } } },
        ],
      })) as Prisma.CustomerWhereInput[],
    }),
  };
  const [data, total] = await Promise.all([
    prisma.customer.findMany({ where, select: customerSelect, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.customer.count({ where }),
  ]);
  return { data, total, page, limit };
}

export async function getCustomer(id: string, shopId: string) {
  return prisma.customer.findFirst({ where: { id, shopId, isDeleted: false }, select: customerSelect });
}

export async function createCustomer(shopId: string, userId: string, input: CreateCustomerInput) {
  return prisma.customer.create({
    data: {
      shopId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ? input.email : null,
      address: input.address ?? null,
      createdById: userId,
    },
    select: customerSelect,
  });
}

export async function updateCustomer(id: string, shopId: string, input: UpdateCustomerInput) {
  const existing = await prisma.customer.findFirst({ where: { id, shopId, isDeleted: false } });
  if (!existing) return null;
  return prisma.customer.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone || null }),
      ...(input.email !== undefined && { email: input.email || null }),
      ...(input.address !== undefined && { address: input.address || null }),
    },
    select: customerSelect,
  });
}
