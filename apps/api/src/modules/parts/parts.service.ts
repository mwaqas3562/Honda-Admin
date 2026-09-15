import { Prisma } from "@prisma/client";
import { BusinessError } from "../../shared/errors/business-error";
import { prisma } from "../../config/prisma";
import type { CreatePartInput, UpdatePartInput } from "./parts.schema";

/** Ranking needs every match in hand to sort them, so the cap has to clear the
 *  largest page any caller asks for — the Inventory Management report requests
 *  5,000. A cap below that silently drops parts from the report while `total`
 *  still counts them, which is exactly the bug that once hid 715 parts. */
const RANK_CANDIDATE_CAP = 10000;

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

  /* No search term: the plain catalogue listing, newest first. */
  if (!tokens.length) {
    const [data, total] = await Promise.all([
      prisma.part.findMany({ where, select: partSelect, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.part.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  /* Searching is ranked rather than ordered by age, because "cd 70 brake"
   * should surface the brake shoe the shop fits every week, not whichever
   * matching part was typed into the catalogue most recently.
   *
   * Ranking happens here rather than in SQL because the score blends three
   * things the database cannot compare directly, and a search narrows the
   * 2,000-part catalogue to a handful. The cap stops a single-letter query
   * from pulling the whole table into memory. */
  const candidates = await prisma.part.findMany({
    where, select: partSelect, orderBy: { createdAt: "desc" },
    /* Take one more than the page needs so a truncated set can be detected. */
    take: Math.max(RANK_CANDIDATE_CAP, skip + limit),
  });
  const total = await prisma.part.count({ where });

  /* How often each candidate has actually been sold — the usage signal. */
  const usage = new Map<string, number>();
  if (candidates.length) {
    const rows = await prisma.invoiceItem.groupBy({
      by: ["partId"],
      where: { partId: { in: candidates.map((c) => c.id) } },
      _count: { partId: true },
    });
    for (const r of rows) if (r.partId) usage.set(r.partId, r._count.partId);
  }

  const scored = candidates
    .map((part) => {
      const name = part.name.toLowerCase();
      const sku = (part.sku ?? "").toLowerCase();

      /* Relevance dominates: a weak match should never outrank a strong one
       * on popularity alone. */
      let relevance = 0;
      for (const token of tokens) {
        const tk = token.toLowerCase();
        if (sku === tk) relevance += 100;
        else if (name === tk) relevance += 90;
        else if (sku.startsWith(tk)) relevance += 60;
        else if (name.startsWith(tk)) relevance += 50;
        else if (new RegExp(`\\b${tk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(name)) relevance += 35;
        else relevance += 15;
      }

      /* Log-scaled so a part sold 500 times beats one sold 50, without
       * swamping relevance the way a raw count would. */
      const popularity = Math.log10(1 + (usage.get(part.id) ?? 0)) * 15;

      /* Stock is the tie-breaker the shop asked for: among equally good
       * matches, offer what is actually on the shelf. Out of stock sinks. */
      const availability = part.stockQty > 0 ? Math.min(part.stockQty, 50) * 0.1 : -8;

      return { part, score: relevance + popularity + availability, used: usage.get(part.id) ?? 0 };
    })
    .sort((a, b) =>
      b.score - a.score ||
      b.used - a.used ||
      b.part.stockQty - a.part.stockQty ||
      a.part.name.localeCompare(b.part.name));

  return { data: scored.slice(skip, skip + limit).map((s) => s.part), total, page, limit };
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
