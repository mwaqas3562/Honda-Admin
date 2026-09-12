import { Prisma } from "@prisma/client";
import { BusinessError } from "../../shared/errors/business-error";
import { prisma } from "../../config/prisma";
import type { CreateVendorInput, UpdateVendorInput } from "./vendor.schema";

const vendorSelect = {
  id: true, shopId: true, name: true, code: true, phone: true,
  email: true, address: true, createdAt: true, updatedAt: true,
} satisfies Prisma.VendorSelect;

export async function listVendors(shopId: string, page = 1, limit = 100, search?: string) {
  const skip = (page - 1) * limit;
  const tokens = search ? search.trim().split(/\s+/).filter(Boolean) : [];
  const where: Prisma.VendorWhereInput = {
    shopId, isDeleted: false,
    ...(tokens.length && {
      AND: tokens.map((t) => ({
        OR: [
          { name: { contains: t, mode: "insensitive" } },
          { code: { contains: t, mode: "insensitive" } },
          { phone: { contains: t, mode: "insensitive" } },
        ],
      })) as Prisma.VendorWhereInput[],
    }),
  };
  const [data, total] = await Promise.all([
    prisma.vendor.findMany({ where, select: vendorSelect, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.vendor.count({ where }),
  ]);
  return { data, total, page, limit };
}

export async function getVendor(id: string, shopId: string) {
  return prisma.vendor.findFirst({ where: { id, shopId, isDeleted: false }, select: vendorSelect });
}

export async function createVendor(shopId: string, userId: string, input: CreateVendorInput) {
  return prisma.vendor.create({
    data: {
      shopId,
      name: input.name,
      code: input.code,
      phone: input.phone ?? null,
      email: input.email ? input.email : null,
      address: input.address ?? null,
      createdById: userId,
    },
    select: vendorSelect,
  });
}

export async function updateVendor(id: string, shopId: string, input: UpdateVendorInput) {
  const existing = await prisma.vendor.findFirst({ where: { id, shopId, isDeleted: false } });
  if (!existing) return null;
  return prisma.vendor.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.code && { code: input.code }),
      ...(input.phone !== undefined && { phone: input.phone || null }),
      ...(input.email !== undefined && { email: input.email || null }),
      ...(input.address !== undefined && { address: input.address || null }),
    },
    select: vendorSelect,
  });
}

export async function softDeleteVendor(id: string, shopId: string) {
  const existing = await prisma.vendor.findFirst({ where: { id, shopId, isDeleted: false } });
  if (!existing) return null;
  const openPurchases = await prisma.purchase.count({
    where: { vendorId: id, shopId, isDeleted: false, status: { in: ["DRAFT", "RECEIVED"] } },
  });
  if (openPurchases > 0) {
    throw new BusinessError(`Cannot delete "${existing.name}" — referenced by ${openPurchases} active purchase(s).`);
  }
  return prisma.vendor.update({ where: { id }, data: { isDeleted: true } });
}
