import { Prisma } from "@prisma/client";
import { BusinessError } from "../../shared/errors/business-error";
import { prisma } from "../../config/prisma";
import { formatPurchaseNumber, nextSequence } from "../../shared/utils/sequence";
import type {
  CreatePurchaseInput,
  PurchaseItemInput,
  ReceivePurchaseInput,
  UpdatePurchaseInput,
} from "./purchase.schema";

export async function peekNextPurchaseNumber(shopId: string): Promise<string> {
  const row = await prisma.numberSequence.findUnique({
    where: { shopId_kind: { shopId, kind: "PURCHASE" } },
    select: { lastValue: true },
  });
  return formatPurchaseNumber((row?.lastValue ?? 0) + 1);
}

const purchaseSelect = {
  id: true, shopId: true, purchaseNo: true, vendorId: true,
  totalCost: true, status: true, notes: true,
  purchasedAt: true, receivedAt: true, paidAt: true,
  createdAt: true, updatedAt: true,
  vendor: { select: { id: true, name: true, code: true, phone: true } },
  items: {
    select: {
      id: true, partId: true,
      quantity: true, receivedQty: true,
      costPrice: true, totalPrice: true,
      part: { select: { id: true, name: true, sku: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.PurchaseSelect;

/** Bill = sum(receivedQty × costPrice). Items not yet received don't affect bill. */
function billFromItems(items: { receivedQty: number; costPrice: number | string | Prisma.Decimal }[]): number {
  return items.reduce(
    (s, i) => s + i.receivedQty * Number(i.costPrice),
    0
  );
}

export async function listPurchases(
  shopId: string,
  page = 1,
  limit = 100,
  filters: { status?: string; vendorId?: string; from?: Date; to?: Date; search?: string } = {}
) {
  const skip = (page - 1) * limit;
  const where: Prisma.PurchaseWhereInput = {
    shopId,
    isDeleted: false,
    ...(filters.status ? { status: filters.status as Prisma.EnumPurchaseStatusFilter["equals"] } : {}),
    ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
    ...(filters.from || filters.to
      ? {
          purchasedAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { purchaseNo: { contains: filters.search, mode: "insensitive" } },
            { vendor: { name: { contains: filters.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [data, total] = await Promise.all([
    prisma.purchase.findMany({ where, select: purchaseSelect, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.purchase.count({ where }),
  ]);
  return { data, total, page, limit };
}

export async function getPurchase(id: string, shopId: string) {
  return prisma.purchase.findFirst({
    where: { id, shopId, isDeleted: false },
    select: purchaseSelect,
  });
}

/* ─── Stock log helper: write a single delta row + update part stock ──
 * Negative deltas use a conditional update so stock can never go negative. */
async function writeStockDelta(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string,
  purchaseId: string,
  partId: string,
  delta: number,
  notes: string | null
) {
  if (delta === 0) return;

  if (delta < 0) {
    const result = await tx.part.updateMany({
      where: { id: partId, shopId, isDeleted: false, stockQty: { gte: -delta } },
      data: { stockQty: { increment: delta } },
    });
    if (result.count === 0) {
      const part = await tx.part.findFirst({
        where: { id: partId, shopId, isDeleted: false },
        select: { name: true, sku: true, stockQty: true },
      });
      const label = part ? `${part.name} (${part.sku})` : `Unknown product (id=${partId})`;
      throw new BusinessError(
        `Cannot reduce stock by ${-delta} for ${label}: only ${part?.stockQty ?? 0} on hand.`
      );
    }
  } else {
    await tx.part.update({
      where: { id: partId },
      data: { stockQty: { increment: delta } },
    });
  }

  const after = await tx.part.findUnique({
    where: { id: partId },
    select: { stockQty: true },
  });
  await tx.stockLog.create({
    data: {
      shopId,
      partId,
      changeQty: delta,
      balanceQty: after?.stockQty ?? 0,
      logType: delta > 0 ? "PURCHASE_IN" : "ADJUSTMENT",
      purchaseId,
      notes,
      createdById: userId,
    },
  });
}

export async function createPurchase(
  shopId: string,
  userId: string,
  input: CreatePurchaseInput
) {
  return prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.findFirst({
      where: { id: input.vendorId, shopId, isDeleted: false },
      select: { id: true },
    });
    if (!vendor) throw new BusinessError("Vendor not found in this shop.");

    const partIds = Array.from(new Set(input.items.map((i) => i.partId)));
    const parts = await tx.part.findMany({
      where: { id: { in: partIds }, shopId, isDeleted: false },
      select: { id: true },
    });
    if (parts.length !== partIds.length) {
      throw new BusinessError("One or more parts were not found in this shop.");
    }

    // If status is RECEIVED/PAID and no per-line receivedQty given, default to full ordered qty.
    const willStockIn = input.status === "RECEIVED" || input.status === "PAID";
    const itemsWithReceived = input.items.map((i) => {
      let received = i.receivedQty ?? (willStockIn ? i.quantity : 0);
      if (received > i.quantity) received = i.quantity;
      return { ...i, receivedQty: received };
    });

    const seq = await nextSequence(tx, shopId, "PURCHASE");
    const purchaseNo = formatPurchaseNumber(seq);
    const total = billFromItems(itemsWithReceived);
    const now = new Date();
    const anyReceived = itemsWithReceived.some((i) => i.receivedQty > 0);
    // Auto-promote DRAFT → RECEIVED if user supplied receivedQty on create
    const finalStatus =
      input.status === "DRAFT" && anyReceived ? "RECEIVED" : input.status;

    const purchase = await tx.purchase.create({
      data: {
        shopId,
        purchaseNo,
        vendorId: input.vendorId,
        status: finalStatus,
        notes: input.notes ?? null,
        totalCost: total,
        receivedAt: anyReceived ? now : null,
        paidAt: finalStatus === "PAID" ? now : null,
        createdById: userId,
        items: {
          create: itemsWithReceived.map((i) => ({
            partId: i.partId,
            quantity: i.quantity,
            receivedQty: i.receivedQty,
            costPrice: i.costPrice,
            totalPrice: i.receivedQty * i.costPrice, // line total = received × cost
          })),
        },
      },
      select: purchaseSelect,
    });

    // Apply stock-in for any line that has receivedQty > 0 at creation
    for (const it of itemsWithReceived) {
      if (it.receivedQty > 0) {
        await writeStockDelta(tx, shopId, userId, purchase.id, it.partId, it.receivedQty, null);
      }
    }

    return purchase;
  }, { maxWait: 15000, timeout: 30000 });
}

export async function updatePurchase(
  id: string,
  shopId: string,
  userId: string,
  input: UpdatePurchaseInput
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.purchase.findFirst({
      where: { id, shopId, isDeleted: false },
      include: { items: true },
    });
    if (!existing) return null;

    const hasReceiptHistory = existing.items.some((i) => i.receivedQty > 0);

    // Disallow line-item replacement once anything has been received.
    if (hasReceiptHistory && input.items) {
      throw new BusinessError(
        "Line items cannot be replaced once any quantity has been received. Use the Receive flow to adjust received quantities."
      );
    }

    if (input.vendorId && input.vendorId !== existing.vendorId) {
      const v = await tx.vendor.findFirst({
        where: { id: input.vendorId, shopId, isDeleted: false },
        select: { id: true },
      });
      if (!v) throw new BusinessError("Vendor not found in this shop.");
    }

    if (input.items && !hasReceiptHistory) {
      const partIds = Array.from(new Set(input.items.map((i) => i.partId)));
      const parts = await tx.part.findMany({
        where: { id: { in: partIds }, shopId, isDeleted: false },
        select: { id: true },
      });
      if (parts.length !== partIds.length) {
        throw new BusinessError("One or more parts were not found in this shop.");
      }
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchaseItem.createMany({
        data: input.items.map((i) => ({
          purchaseId: id,
          partId: i.partId,
          quantity: i.quantity,
          receivedQty: 0,
          costPrice: i.costPrice,
          totalPrice: 0,
        })),
      });
    }

    // Status transitions
    const wasStocked = existing.items.some((i) => i.receivedQty > 0);
    const newStatus = input.status ?? existing.status;
    const now = new Date();

    // Auto-stock when flipping to RECEIVED/PAID with no prior receipts: receive everything
    if (
      (newStatus === "RECEIVED" || newStatus === "PAID") &&
      !wasStocked
    ) {
      const refreshed = await tx.purchaseItem.findMany({
        where: { purchaseId: id },
      });
      for (const it of refreshed) {
        if (it.quantity > 0) {
          await tx.purchaseItem.update({
            where: { id: it.id },
            data: {
              receivedQty: it.quantity,
              totalPrice: it.quantity * Number(it.costPrice),
            },
          });
          await writeStockDelta(tx, shopId, userId, id, it.partId, it.quantity, null);
        }
      }
    }

    // Reverting to DRAFT/CANCELLED: zero everything out and reverse stock
    if (
      (newStatus === "DRAFT" || newStatus === "CANCELLED") &&
      wasStocked
    ) {
      for (const it of existing.items) {
        if (it.receivedQty > 0) {
          await writeStockDelta(
            tx, shopId, userId, id, it.partId, -it.receivedQty,
            `Purchase reverted to ${newStatus}`
          );
          await tx.purchaseItem.update({
            where: { id: it.id },
            data: { receivedQty: 0, totalPrice: 0 },
          });
        }
      }
    }

    // Recompute totalCost from current line items
    const refreshedItems = await tx.purchaseItem.findMany({ where: { purchaseId: id } });
    const newTotal = billFromItems(refreshedItems);

    const updated = await tx.purchase.update({
      where: { id },
      data: {
        ...(input.vendorId ? { vendorId: input.vendorId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        totalCost: newTotal,
        status: newStatus,
        ...(newStatus === "RECEIVED" && !existing.receivedAt ? { receivedAt: now } : {}),
        ...(newStatus === "PAID"
          ? { paidAt: now, ...(existing.receivedAt ? {} : { receivedAt: now }) }
          : {}),
        ...(newStatus === "DRAFT" || newStatus === "CANCELLED"
          ? { paidAt: null, receivedAt: null }
          : {}),
      },
      select: purchaseSelect,
    });

    return updated;
  }, { maxWait: 15000, timeout: 30000 });
}

/* ─── Partial receive: update receivedQty per line (deltas applied) ─── */
export async function receivePurchase(
  id: string,
  shopId: string,
  userId: string,
  input: ReceivePurchaseInput
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.purchase.findFirst({
      where: { id, shopId, isDeleted: false },
      include: { items: true },
    });
    if (!existing) return null;
    if (existing.status === "CANCELLED") {
      throw new BusinessError("Cannot receive items on a cancelled purchase.");
    }
    if (existing.status === "PAID") {
      throw new BusinessError("Purchase is already paid; revert to RECEIVED first to adjust received quantities.");
    }

    /* Reject duplicate itemId in payload — would otherwise apply stale deltas twice. */
    const seenIds = new Set<string>();
    for (const ip of input.items) {
      if (seenIds.has(ip.itemId)) {
        throw new BusinessError(`Duplicate line item ${ip.itemId} in receive payload.`);
      }
      seenIds.add(ip.itemId);
    }

    const itemMap = new Map(existing.items.map((i) => [i.id, i]));
    for (const ip of input.items) {
      const item = itemMap.get(ip.itemId);
      if (!item) throw new BusinessError(`Line item ${ip.itemId} does not belong to this purchase.`);
      if (ip.remove) {
        if (item.receivedQty > 0) {
          throw new BusinessError(`Cannot remove ${item.partId}: items already received. Set received qty to 0 first.`);
        }
        continue;
      }
      if (ip.receivedQty > item.quantity) {
        throw new BusinessError(
          `Received qty (${ip.receivedQty}) cannot exceed ordered qty (${item.quantity}) for ${item.partId}.`
        );
      }
    }

    // Apply per-line deltas
    for (const ip of input.items) {
      const item = itemMap.get(ip.itemId)!;
      if (ip.remove) {
        await tx.purchaseItem.delete({ where: { id: item.id } });
        continue;
      }
      const newCost = ip.costPrice ?? Number(item.costPrice);
      const delta = ip.receivedQty - item.receivedQty;
      const costChanged = newCost !== Number(item.costPrice);
      if (delta !== 0) {
        await writeStockDelta(
          tx, shopId, userId, id, item.partId, delta,
          delta > 0 ? null : "Received qty corrected downward"
        );
      }
      if (delta !== 0 || costChanged) {
        await tx.purchaseItem.update({
          where: { id: item.id },
          data: {
            receivedQty: ip.receivedQty,
            costPrice: newCost,
            totalPrice: ip.receivedQty * newCost,
          },
        });
      }
    }

    // Recompute totals & status
    const refreshed = await tx.purchaseItem.findMany({ where: { purchaseId: id } });
    const total = billFromItems(refreshed);
    const anyReceived = refreshed.some((i) => i.receivedQty > 0);
    const allReceived = refreshed.every((i) => i.receivedQty === i.quantity);

    let newStatus: typeof existing.status = existing.status;
    if (!anyReceived) newStatus = "DRAFT";
    else if (allReceived) newStatus = "RECEIVED";
    else newStatus = "RECEIVED"; // partial still considered RECEIVED state for downstream filters

    const now = new Date();
    const updated = await tx.purchase.update({
      where: { id },
      data: {
        totalCost: total,
        status: newStatus,
        receivedAt: anyReceived ? (existing.receivedAt ?? now) : null,
        ...(newStatus === "DRAFT" ? { paidAt: null } : {}),
      },
      select: purchaseSelect,
    });
    return updated;
  }, { maxWait: 15000, timeout: 30000 });
}

export async function setPurchaseStatus(
  id: string,
  shopId: string,
  userId: string,
  status: "DRAFT" | "RECEIVED" | "PAID" | "CANCELLED"
) {
  return updatePurchase(id, shopId, userId, { status });
}

export async function softDeletePurchase(id: string, shopId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.purchase.findFirst({
      where: { id, shopId, isDeleted: false },
      include: { items: true },
    });
    if (!existing) return null;

    // Reverse only what was actually received
    for (const it of existing.items) {
      if (it.receivedQty > 0) {
        await writeStockDelta(
          tx, shopId, userId, id, it.partId, -it.receivedQty,
          "Purchase deleted"
        );
      }
    }

    return tx.purchase.update({ where: { id }, data: { isDeleted: true } });
  }, { maxWait: 15000, timeout: 30000 });
}

/* ─── Reports ─────────────────────────────────────────────────── */

export async function purchaseReports(
  shopId: string,
  filters: { from?: Date; to?: Date; vendorId?: string; partId?: string }
) {
  const purchaseWhere: Prisma.PurchaseWhereInput = {
    shopId,
    isDeleted: false,
    ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
    ...(filters.from || filters.to
      ? {
          purchasedAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const purchases = await prisma.purchase.findMany({
    where: purchaseWhere,
    select: {
      id: true,
      purchaseNo: true,
      status: true,
      totalCost: true,
      purchasedAt: true,
      vendor: { select: { id: true, name: true, code: true } },
      items: {
        where: filters.partId ? { partId: filters.partId } : undefined,
        select: {
          partId: true, quantity: true, receivedQty: true, totalPrice: true,
          part: { select: { id: true, name: true, sku: true } },
        },
      },
    },
    orderBy: { purchasedAt: "desc" },
  });

  const filtered = filters.partId
    ? purchases.filter((p) => p.items.length > 0)
    : purchases;

  let totalAll = 0, totalReceived = 0, totalDraft = 0, totalPaid = 0;
  let countAll = 0, countReceived = 0, countDraft = 0, countPaid = 0;

  for (const p of filtered) {
    const t = Number(p.totalCost);
    countAll += 1;
    totalAll += t;
    if (p.status === "RECEIVED") { countReceived += 1; totalReceived += t; }
    else if (p.status === "DRAFT") { countDraft += 1; totalDraft += t; }
    else if (p.status === "PAID") { countPaid += 1; totalPaid += t; }
  }

  type Row = { partId: string; name: string; sku: string; quantity: number; cost: number };
  const map = new Map<string, Row>();
  for (const p of filtered) {
    if (p.status === "CANCELLED") continue;
    for (const it of p.items) {
      const r = map.get(it.partId) ?? {
        partId: it.partId, name: it.part.name, sku: it.part.sku, quantity: 0, cost: 0,
      };
      r.quantity += it.receivedQty;
      r.cost += Number(it.totalPrice);
      map.set(it.partId, r);
    }
  }
  const topProducts = Array.from(map.values()).sort((a, b) => b.cost - a.cost).slice(0, 20);

  type VRow = { vendorId: string; name: string; code: string; purchases: number; spend: number };
  const vmap = new Map<string, VRow>();
  for (const p of filtered) {
    if (p.status === "CANCELLED") continue;
    const r = vmap.get(p.vendor.id) ?? {
      vendorId: p.vendor.id, name: p.vendor.name, code: p.vendor.code, purchases: 0, spend: 0,
    };
    r.purchases += 1;
    r.spend += Number(p.totalCost);
    vmap.set(p.vendor.id, r);
  }
  const topVendors = Array.from(vmap.values()).sort((a, b) => b.spend - a.spend).slice(0, 20);

  return {
    totals: {
      countAll, countReceived, countDraft, countPaid,
      totalAll: round2(totalAll),
      totalReceived: round2(totalReceived),
      totalDraft: round2(totalDraft),
      totalPaid: round2(totalPaid),
    },
    history: filtered.slice(0, 200).map((p) => ({
      id: p.id,
      purchaseNo: p.purchaseNo,
      status: p.status,
      totalCost: Number(p.totalCost),
      purchasedAt: p.purchasedAt.toISOString(),
      vendor: p.vendor,
      itemCount: p.items.length,
      quantity: p.items.reduce((s, i) => s + i.quantity, 0),
      receivedQty: p.items.reduce((s, i) => s + i.receivedQty, 0),
    })),
    topProducts: topProducts.map((r) => ({ ...r, cost: round2(r.cost) })),
    topVendors:  topVendors.map((r) => ({ ...r, spend: round2(r.spend) })),
  };
}

function round2(n: number): number {
  return Math.floor(n);
}
