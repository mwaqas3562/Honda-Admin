import { Prisma } from "@prisma/client";
import { BusinessError } from "../../shared/errors/business-error";
import { prisma } from "../../config/prisma";
import {
  formatInvoiceNumber,
  nextSequence,
} from "../../shared/utils/sequence";
import type {
  CreateInvoiceInput,
  InvoiceItemInput,
  UpdateInvoiceInput,
} from "./invoice.schema";

const invoiceSelect = {
  id: true,
  invoiceNumber: true,
  shopId: true,
  customerId: true,
  jobCardId: true,
  jobDetail: true,
  cellNo: true,
  saleTerm: true,
  subtotal: true,
  discountPct: true,
  discountAmt: true,
  totalAmount: true,
  totalCost: true,
  totalProfit: true,
  paidAmount: true,
  status: true,
  stockDeducted: true,
  issuedAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, phone: true } },
  shop: { select: { id: true, name: true, address: true, phone: true } },
  jobCard: {
    select: {
      id: true,
      jobNumber: true,
      vehicleRegNo: true,
      meterReading: true,
      status: true,
      isFinal: true,
    },
  },
  items: {
    select: {
      id: true,
      partId: true,
      itemCode: true,
      itemName: true,
      qty: true,
      rate: true,
      total: true,
      costPrice: true,
      profit: true,
      remarks: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

/** Lean projection for list endpoints — omits `items[]` to keep payload & query cost low. */
const invoiceListSelect = {
  id: true,
  invoiceNumber: true,
  shopId: true,
  customerId: true,
  jobCardId: true,
  jobDetail: true,
  cellNo: true,
  saleTerm: true,
  subtotal: true,
  discountPct: true,
  discountAmt: true,
  totalAmount: true,
  totalCost: true,
  totalProfit: true,
  paidAmount: true,
  status: true,
  stockDeducted: true,
  issuedAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, phone: true } },
  jobCard: {
    select: {
      id: true,
      jobNumber: true,
      vehicleRegNo: true,
      meterReading: true,
      status: true,
      isFinal: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

/* ─── Helpers ──────────────────────────────────────────── */

type ResolvedItem = {
  partId: string | null;
  itemCode: string | null;
  itemName: string;
  qty: number;
  rate: number;
  costPrice: number;
  total: number;
  profit: number;
  remarks: string | null;
};

/**
 * Resolve every input line:
 *  - If `partId` is supplied, load the Part and snapshot its costPrice/sku/name.
 *  - Otherwise treat the line as a free-text service/labour entry.
 * Throws if a partId references a non-existent / cross-shop part.
 */
async function resolveItems(
  tx: Prisma.TransactionClient,
  shopId: string,
  items: InvoiceItemInput[]
): Promise<ResolvedItem[]> {
  const partIds = Array.from(
    new Set(items.map((i) => i.partId).filter((x): x is string => !!x))
  );
  const parts = partIds.length
    ? await tx.part.findMany({
        where: { id: { in: partIds }, shopId, isDeleted: false },
        select: { id: true, name: true, sku: true, costPrice: true },
      })
    : [];
  const partsById = new Map(parts.map((p) => [p.id, p]));

  return items.map((i) => {
    const part = i.partId ? partsById.get(i.partId) : undefined;
    if (i.partId && !part) {
      throw new BusinessError(`Product not found in this shop (id=${i.partId}).`);
    }
    const cost = i.costPrice ?? (part ? Number(part.costPrice) : 0);
    const total = i.qty * i.rate;
    const profit = total - cost * i.qty;
    return {
      partId: part?.id ?? null,
      itemCode: i.itemCode ?? part?.sku ?? null,
      itemName: i.itemName || part?.name || "",
      qty: i.qty,
      rate: i.rate,
      costPrice: cost,
      total,
      profit,
      remarks: i.remarks ?? null,
    };
  });
}

function calcInvoiceTotals(
  items: ResolvedItem[],
  discountPct: number
) {
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const totalCost = items.reduce((s, i) => s + i.costPrice * i.qty, 0);
  const discountAmt = (subtotal * discountPct) / 100;
  const totalAmount = subtotal - discountAmt;
  const totalProfit = totalAmount - totalCost;
  return { subtotal, totalCost, discountAmt, totalAmount, totalProfit };
}

/**
 * Validate that we have enough stock for all product lines, then deduct it
 * and write StockLog rows. Idempotent at the call-site: caller must check
 * `Invoice.stockDeducted` before invoking.
 *
 * Uses an atomic conditional UPDATE per part (`updateMany WHERE stockQty >= qty`)
 * so concurrent invoice payments cannot drive stock negative.
 */
async function deductStock(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string,
  invoiceNumber: string,
  invoiceId: string,
  jobCardId: string | null,
  items: ResolvedItem[]
) {
  /* Aggregate per-part demand (in case the same part appears on multiple lines). */
  const demand = new Map<string, number>();
  for (const i of items) {
    if (!i.partId) continue;
    demand.set(i.partId, (demand.get(i.partId) ?? 0) + i.qty);
  }
  if (demand.size === 0) return;

  /* Atomically decrement only when sufficient stock exists. If the conditional
   * update affects 0 rows we know stock is insufficient and we abort. */
  for (const [partId, needed] of demand) {
    const result = await tx.part.updateMany({
      where: { id: partId, shopId, isDeleted: false, stockQty: { gte: needed } },
      data: { stockQty: { decrement: needed } },
    });
    if (result.count === 0) {
      const part = await tx.part.findFirst({
        where: { id: partId, shopId, isDeleted: false },
        select: { name: true, sku: true, stockQty: true },
      });
      const label = part ? `${part.name} (${part.sku})` : `Unknown product (id=${partId})`;
      const have = part?.stockQty ?? 0;
      throw new BusinessError(`Insufficient stock — ${label}: need ${needed}, in stock ${have}`);
    }

    const after = await tx.part.findUnique({
      where: { id: partId },
      select: { stockQty: true },
    });
    await tx.stockLog.create({
      data: {
        shopId,
        partId,
        changeQty: -needed,
        balanceQty: after?.stockQty ?? 0,
        logType: "JOBCARD_OUT",
        notes: `Invoice ${invoiceNumber}`,
        jobCardId: jobCardId ?? null,
        createdById: userId,
      },
    });
  }

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { stockDeducted: true },
  });
}

/**
 * Recompute and persist JobCard.partsAmount / laborAmount / totalAmount
 * from the linked invoice's line items. Call after any invoice mutation.
 */
async function syncJobCardAmounts(
  tx: Prisma.TransactionClient,
  jobCardId: string,
) {
  const inv = await tx.invoice.findFirst({
    where: { jobCardId, isDeleted: false },
    select: {
      totalAmount: true,
      items: { select: { partId: true, total: true } },
    },
  });
  if (!inv) {
    await tx.jobCard.update({
      where: { id: jobCardId },
      data: { partsAmount: 0, laborAmount: 0, totalAmount: 0 },
    });
    return;
  }
  let partsAmount = 0;
  let laborAmount = 0;
  for (const it of inv.items) {
    if (it.partId) partsAmount += it.total;
    else laborAmount += it.total;
  }
  await tx.jobCard.update({
    where: { id: jobCardId },
    data: {
      partsAmount,
      laborAmount,
      totalAmount: inv.totalAmount,
    },
  });
}

/**
 * Allocate a real invoice number (consumes the per-shop sequence). Used
 * lazily on DRAFT → non-DRAFT transition so abandoned drafts don't leave gaps.
 */
async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  shopId: string,
) {
  const seq = await nextSequence(tx, shopId, "INVOICE");
  return formatInvoiceNumber(seq);
}

/* ─── List / Get ───────────────────────────────────────── */

export async function listInvoices(
  shopId: string,
  page = 1,
  limit = 50,
  q?: string
) {
  const skip = (page - 1) * limit;
  const term = q?.trim();
  const where: Prisma.InvoiceWhereInput = {
    shopId,
    isDeleted: false,
    ...(term
      ? {
          OR: [
            { invoiceNumber: { contains: term, mode: "insensitive" } },
            { customer: { name: { contains: term, mode: "insensitive" } } },
            { jobCard: { jobNumber: { contains: term, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [data, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: invoiceListSelect,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);
  return { data, total, page, limit };
}

export async function getInvoice(id: string, shopId: string) {
  return prisma.invoice.findFirst({
    where: { id, shopId, isDeleted: false },
    select: invoiceSelect,
  });
}

/* ─── Create ───────────────────────────────────────────── */

/**
 * Create a Sales Invoice. Strict workflow:
 *  - jobCardId is required and must be active (not COMPLETED/CANCELLED, not invoiced).
 *  - customerId is auto-filled from the Job Card.
 *  - Item costPrice is snapshotted from the linked Part (or supplied explicitly).
 *  - When status=PAID, stock is validated & deducted and the Job Card auto-completes.
 */
export async function createInvoice(
  shopId: string,
  userId: string,
  input: CreateInvoiceInput
) {
  return prisma.$transaction(async (tx) => {
    const jobCard = await tx.jobCard.findFirst({
      where: { id: input.jobCardId, shopId, isDeleted: false },
      select: {
        id: true,
        jobNumber: true,
        customerId: true,
        status: true,
        isFinal: true,
        invoice: { select: { id: true } },
      },
    });
    if (!jobCard) throw new BusinessError("Job Card not found in this shop.");
    if (jobCard.status === "COMPLETED") {
      throw new BusinessError("Job Card is already completed.");
    }
    if (jobCard.status === "CANCELLED") {
      throw new BusinessError("Job Card is cancelled.");
    }
    if (jobCard.invoice) {
      throw new BusinessError("This Job Card already has an invoice.");
    }

    const items = await resolveItems(tx, shopId, input.items);
    const { subtotal, totalCost, discountAmt, totalAmount, totalProfit } =
      calcInvoiceTotals(items, input.discountPct);

    /* Invoice number mirrors the linked Job Card number (1-to-1 relationship). */
    const invoiceNumber = jobCard.jobNumber;

    const entryDate = input.entryDate ? new Date(input.entryDate) : null;
    const created = await tx.invoice.create({
      data: {
        shopId,
        customerId: jobCard.customerId,
        jobCardId: jobCard.id,
        invoiceNumber,
        jobDetail: input.jobDetail ?? null,
        cellNo: input.cellNo ?? null,
        saleTerm: input.saleTerm,
        subtotal,
        discountPct: input.discountPct,
        discountAmt,
        totalAmount,
        totalCost,
        totalProfit,
        paidAmount: input.paidAmount,
        status: input.status,
        /* A back-dated bill is issued on its own date, not today. */
        issuedAt: input.status === "PAID" ? (entryDate ?? new Date()) : null,
        ...(entryDate && { createdAt: entryDate }),
        createdById: userId,
        items: {
          create: items.map((i) => ({
            partId: i.partId,
            itemCode: i.itemCode,
            itemName: i.itemName,
            qty: i.qty,
            rate: i.rate,
            total: i.total,
            costPrice: i.costPrice,
            profit: i.profit,
            remarks: i.remarks,
          })),
        },
      },
      select: invoiceSelect,
    });

    if (input.status === "PAID") {
      await deductStock(tx, shopId, userId, invoiceNumber, created.id, jobCard.id, items);
      await tx.jobCard.update({
        where: { id: jobCard.id },
        data: { status: "COMPLETED" },
      });
    } else {
      await tx.jobCard.update({
        where: { id: jobCard.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    /* B4: write JobCard partsAmount / laborAmount / totalAmount snapshot. */
    await syncJobCardAmounts(tx, jobCard.id);

    /* Re-read to capture stockDeducted flag if set. */
    return tx.invoice.findUnique({ where: { id: created.id }, select: invoiceSelect });
  }, { maxWait: 15000, timeout: 30000 });
}

/* ─── Update ───────────────────────────────────────────── */

/**
 * Update a Sales Invoice. When the invoice transitions to PAID for the first
 * time the linked Job Card is auto-completed and stock is deducted (once).
 * Items can only be edited while the invoice is still DRAFT.
 */
export async function updateInvoice(
  id: string,
  shopId: string,
  userId: string,
  input: UpdateInvoiceInput
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id, shopId, isDeleted: false },
      select: {
        id: true,
        invoiceNumber: true,
        jobCardId: true,
        status: true,
        stockDeducted: true,
        subtotal: true,
        discountAmt: true,
        totalAmount: true,
        totalCost: true,
        totalProfit: true,
        discountPct: true,
        paidAmount: true,
      },
    });
    if (!existing) return null;

    /* ─── Status state-machine ───────────────────────────────
     * Allowed transitions:
     *   DRAFT     → DRAFT, ISSUED, PAID, VOID
     *   ISSUED    → ISSUED, PARTIAL, PAID, VOID
     *   PARTIAL   → PARTIAL, PAID, VOID
     *   PAID      → PAID, VOID  (VOID restores stock)
     *   VOID      → VOID         (terminal)
     */
    if (input.status && input.status !== existing.status) {
      const allowed: Record<typeof existing.status, ReadonlyArray<typeof existing.status>> = {
        DRAFT:   ["DRAFT", "ISSUED", "PAID", "VOID"],
        ISSUED:  ["ISSUED", "PARTIAL", "PAID", "VOID"],
        PARTIAL: ["PARTIAL", "PAID", "VOID"],
        PAID:    ["PAID", "VOID"],
        VOID:    ["VOID"],
      };
      if (!allowed[existing.status].includes(input.status)) {
        throw new BusinessError(
          `Invalid status transition: ${existing.status} → ${input.status}.`
        );
      }
    }

    const editingItems = input.items && input.items.length > 0;
    if (editingItems && existing.status !== "DRAFT") {
      throw new BusinessError("Items cannot be edited after the invoice is issued.");
    }

    const discountPct = input.discountPct ?? Number(existing.discountPct);
    const paidAmount = input.paidAmount ?? Number(existing.paidAmount);

    let totals = {
      subtotal: Number(existing.subtotal),
      totalCost: Number(existing.totalCost),
      discountAmt: Number(existing.discountAmt),
      totalAmount: Number(existing.totalAmount),
      totalProfit: Number(existing.totalProfit),
    };

    let resolvedItems: ResolvedItem[] | null = null;
    if (editingItems) {
      resolvedItems = await resolveItems(tx, shopId, input.items!);
      totals = calcInvoiceTotals(resolvedItems, discountPct);
    } else if (input.discountPct !== undefined) {
      /* Re-apply discount over existing subtotal/totalCost. */
      const subtotal = totals.subtotal;
      const totalCost = totals.totalCost;
      const discountAmt = (subtotal * discountPct) / 100;
      const totalAmount = subtotal - discountAmt;
      totals = {
        subtotal,
        totalCost,
        discountAmt,
        totalAmount,
        totalProfit: totalAmount - totalCost,
      };
    }

    const transitioningToPaid =
      input.status === "PAID" && existing.status !== "PAID";
    const transitioningToVoid =
      input.status === "VOID" && existing.status !== "VOID";

    /* B6: Invoice number is always allocated on create. No re-allocation needed. */
    const invoiceNumberUpdate: string | undefined = undefined;

    const updated = await tx.invoice.update({
      where: { id },
      data: {
        ...(invoiceNumberUpdate ? { invoiceNumber: invoiceNumberUpdate } : {}),
        /* Editing a draft can move it to a different business date. */
        ...(input.entryDate && { createdAt: new Date(input.entryDate) }),
        ...(input.jobDetail !== undefined && { jobDetail: input.jobDetail }),
        ...(input.cellNo !== undefined && { cellNo: input.cellNo }),
        ...(input.saleTerm && { saleTerm: input.saleTerm }),
        ...(input.status && {
          status: input.status,
          ...(transitioningToPaid
            ? { issuedAt: input.entryDate ? new Date(input.entryDate) : new Date() }
            : input.status === "PAID" && input.entryDate
              /* Re-dating an already-paid bill moves issuedAt too, so the
               * sales report and the dashboard trend keep agreeing. */
              ? { issuedAt: new Date(input.entryDate) }
              : {}),
        }),
        discountPct,
        paidAmount,
        subtotal: totals.subtotal,
        discountAmt: totals.discountAmt,
        totalAmount: totals.totalAmount,
        totalCost: totals.totalCost,
        totalProfit: totals.totalProfit,
        ...(resolvedItems && {
          items: {
            deleteMany: {},
            create: resolvedItems.map((i) => ({
              partId: i.partId,
              itemCode: i.itemCode,
              itemName: i.itemName,
              qty: i.qty,
              rate: i.rate,
              total: i.total,
              costPrice: i.costPrice,
              profit: i.profit,
              remarks: i.remarks,
            })),
          },
        }),
      },
      select: invoiceSelect,
    });

    if (transitioningToPaid) {
      if (!existing.stockDeducted) {
        const itemsForStock =
          resolvedItems ??
          (await tx.invoiceItem.findMany({
            where: { invoiceId: id },
            select: {
              partId: true,
              itemName: true,
              qty: true,
              rate: true,
              costPrice: true,
              total: true,
              profit: true,
              itemCode: true,
              remarks: true,
            },
          })).map<ResolvedItem>((r) => ({
            partId: r.partId,
            itemCode: r.itemCode,
            itemName: r.itemName,
            qty: r.qty,
            rate: Number(r.rate),
            costPrice: Number(r.costPrice),
            total: Number(r.total),
            profit: Number(r.profit),
            remarks: r.remarks,
          }));

        await deductStock(tx, shopId, userId, existing.invoiceNumber, id, existing.jobCardId, itemsForStock);
      }
      if (existing.jobCardId) {
        await tx.jobCard.update({
          where: { id: existing.jobCardId },
          data: { status: "COMPLETED" },
        });
      }
    }

    if (transitioningToVoid && existing.stockDeducted) {
      /* Restore stock for every line: each part gets its qty added back. */
      const lines = await tx.invoiceItem.findMany({
        where: { invoiceId: id },
        select: { partId: true, qty: true },
      });
      const restore = new Map<string, number>();
      for (const l of lines) {
        if (!l.partId) continue;
        restore.set(l.partId, (restore.get(l.partId) ?? 0) + l.qty);
      }
      for (const [partId, qty] of restore) {
        await tx.part.update({
          where: { id: partId },
          data: { stockQty: { increment: qty } },
        });
        const after = await tx.part.findUnique({
          where: { id: partId },
          select: { stockQty: true },
        });
        await tx.stockLog.create({
          data: {
            shopId,
            partId,
            changeQty: qty,
            balanceQty: after?.stockQty ?? 0,
            logType: "ADJUSTMENT",
            notes: `Invoice ${existing.invoiceNumber} voided`,
            jobCardId: existing.jobCardId ?? null,
            createdById: userId,
          },
        });
      }
      await tx.invoice.update({
        where: { id },
        data: { stockDeducted: false },
      });
      if (existing.jobCardId) {
        await tx.jobCard.update({
          where: { id: existing.jobCardId },
          data: { status: "IN_PROGRESS" },
        });
      }
    }

    /* B4: re-sync JobCard partsAmount/laborAmount/totalAmount after any update. */
    if (existing.jobCardId) {
      await syncJobCardAmounts(tx, existing.jobCardId);
    }

    return tx.invoice.findUnique({ where: { id: updated.id }, select: invoiceSelect });
  }, { maxWait: 15000, timeout: 30000 });
}

/* ─── Delete ───────────────────────────────────────────── */

export async function softDeleteInvoice(id: string, shopId: string) {
  const existing = await prisma.invoice.findFirst({
    where: { id, shopId, isDeleted: false },
    select: { id: true, status: true, jobCardId: true, stockDeducted: true },
  });
  if (!existing) return null;
  if (existing.status === "PAID") {
    throw new BusinessError("Cannot delete a paid invoice.");
  }
  if (existing.stockDeducted) {
    throw new BusinessError("Cannot delete an invoice whose stock has already been deducted.");
  }

  return prisma.$transaction(async (tx) => {
    const result = await tx.invoice.update({
      where: { id },
      data: { isDeleted: true },
    });
    if (existing.jobCardId) {
      await tx.jobCard.update({
        where: { id: existing.jobCardId },
        data: { status: "IN_PROGRESS" },
      });
      await syncJobCardAmounts(tx, existing.jobCardId);
    }
    return result;
  }, { maxWait: 15000, timeout: 30000 });
}
