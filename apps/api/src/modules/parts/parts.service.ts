import { Prisma } from "@prisma/client";
import { BusinessError } from "../../shared/errors/business-error";
import { prisma } from "../../config/prisma";
import type { CreatePartInput, UpdatePartInput } from "./parts.schema";

const partSelect = {
  id: true,
  shopId: true,
  name: true,
  sku: true,
  category: true,
  stockQty: true,
  costPrice: true,
  unitPrice: true,
  sellingPrice: true,
  minStockLevel: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PartSelect;

export async function listParts(shopId: string, page = 1, limit = 100, search?: string) {
  const skip = (page - 1) * limit;
  const tokens = search ? search.trim().split(/\s+/).filter(Boolean) : [];
  const where: Prisma.PartWhereInput = {
    shopId,
    isDeleted: false,
    ...(tokens.length && {
      AND: tokens.map((t) => ({
        OR: [
          { name: { contains: t, mode: "insensitive" } },
          { sku: { contains: t, mode: "insensitive" } },
        ],
      })) as Prisma.PartWhereInput[],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.part.findMany({ where, select: partSelect, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.part.count({ where }),
  ]);
  return { data, total, page, limit };
}

export async function getPart(id: string, shopId: string) {
  return prisma.part.findFirst({ where: { id, shopId, isDeleted: false }, select: partSelect });
}

export async function createPart(shopId: string, userId: string, input: CreatePartInput) {
  const cost = input.costPrice ?? input.unitPrice ?? 0;
  return prisma.part.create({
    data: {
      shopId,
      name: input.name,
      sku: input.sku,
      category: input.category ?? null,
      costPrice: cost,
      unitPrice: input.unitPrice ?? cost,
      sellingPrice: input.sellingPrice ?? 0,
      minStockLevel: input.minStockLevel ?? 5,
      stockQty: input.stockQty,
      createdById: userId,
    },
    select: partSelect,
  });
}

export async function updatePart(id: string, shopId: string, input: UpdatePartInput) {
  const existing = await prisma.part.findFirst({ where: { id, shopId, isDeleted: false } });
  if (!existing) return null;
  return prisma.part.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.sku && { sku: input.sku }),
      ...(input.category !== undefined && { category: input.category ?? null }),
      ...(input.costPrice !== undefined && { costPrice: input.costPrice, unitPrice: input.costPrice }),
      ...(input.unitPrice !== undefined && { unitPrice: input.unitPrice }),
      ...(input.sellingPrice !== undefined && { sellingPrice: input.sellingPrice }),
      ...(input.minStockLevel !== undefined && { minStockLevel: input.minStockLevel }),
      ...(input.stockQty !== undefined && { stockQty: input.stockQty }),
    },
    select: partSelect,
  });
}

export async function softDeletePart(id: string, shopId: string) {
  const existing = await prisma.part.findFirst({ where: { id, shopId, isDeleted: false } });
  if (!existing) return null;
  if (existing.stockQty > 0) {
    throw new BusinessError(
      `Cannot delete "${existing.name}" — it still has ${existing.stockQty} in stock. Adjust stock to 0 first.`,
    );
  }
  const [openPurchases, openInvoiceItems] = await Promise.all([
    prisma.purchase.count({
      where: { shopId, isDeleted: false, status: { in: ["DRAFT", "RECEIVED"] }, items: { some: { partId: id } } },
    }),
    prisma.invoiceItem.count({
      where: { partId: id, invoice: { shopId, isDeleted: false, status: { not: "VOID" } } },
    }),
  ]);
  if (openPurchases > 0) {
    throw new BusinessError(`Cannot delete "${existing.name}" — referenced by ${openPurchases} active purchase(s).`);
  }
  if (openInvoiceItems > 0) {
    throw new BusinessError(`Cannot delete "${existing.name}" — referenced by ${openInvoiceItems} active invoice line(s).`);
  }
  return prisma.part.update({ where: { id }, data: { isDeleted: true } });
}
