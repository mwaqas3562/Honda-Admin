import { Prisma } from "@prisma/client";
import { BusinessError } from "../../shared/errors/business-error";
import { prisma } from "../../config/prisma";
import type { CreatePaymentInput } from "./payment.schema";

const paymentSelect = {
  id: true,
  invoiceId: true,
  amount: true,
  method: true,
  notes: true,
  paidAt: true,
  createdAt: true,
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PaymentSelect;

export async function listPayments(invoiceId: string, shopId: string) {
  return prisma.payment.findMany({
    where: { invoiceId, shopId, isDeleted: false },
    select: paymentSelect,
    orderBy: { paidAt: "desc" },
  });
}

/**
 * Record a payment against an invoice, sum it into Invoice.paidAmount,
 * and transition the invoice status accordingly:
 *   ISSUED  → PARTIAL or PAID
 *   PARTIAL → PARTIAL or PAID
 * VOID and DRAFT invoices cannot accept payments.
 */
export async function recordPayment(
  invoiceId: string,
  shopId: string,
  userId: string,
  input: CreatePaymentInput,
) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, shopId, isDeleted: false },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        jobCardId: true,
        invoiceNumber: true,
        stockDeducted: true,
        items: { select: { partId: true, qty: true, costPrice: true } },
      },
    });
    if (!inv) throw new BusinessError("Invoice not found.");
    if (inv.status === "DRAFT") {
      throw new BusinessError("Issue the invoice before recording payments.");
    }
    if (inv.status === "VOID") {
      throw new BusinessError("Cannot record payments on a voided invoice.");
    }

    const newPaid = inv.paidAmount + input.amount;
    if (newPaid > inv.totalAmount) {
      throw new BusinessError(
        `Payment exceeds outstanding balance (outstanding ${inv.totalAmount - inv.paidAmount}).`,
      );
    }

    const payment = await tx.payment.create({
      data: {
        shopId,
        invoiceId,
        amount: input.amount,
        method: input.method,
        notes: input.notes ?? null,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        createdById: userId,
      },
      select: paymentSelect,
    });

    const fullyPaid = newPaid >= inv.totalAmount;
    const nextStatus = fullyPaid ? "PAID" : "PARTIAL";

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: newPaid,
        status: nextStatus,
        /* A bill settled here is as paid as one marked paid on the invoice
         * screen, and the Job Cards report reads paidAt for both. */
        ...(fullyPaid ? { paidAt: new Date() } : {}),
        ...(fullyPaid && !inv.stockDeducted ? { stockDeducted: true } : {}),
      },
    });

    /* On full settlement, deduct stock (if not already) and complete the JC. */
    if (fullyPaid) {
      if (!inv.stockDeducted) {
        await deductStockForInvoice(tx, shopId, userId, inv.id, inv.invoiceNumber, inv.jobCardId, inv.items);
      }
      if (inv.jobCardId) {
        await tx.jobCard.update({
          where: { id: inv.jobCardId },
          data: { status: "COMPLETED" },
        });
      }
    }

    return payment;  }, { maxWait: 15000, timeout: 30000 });
}

async function deductStockForInvoice(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string,
  invoiceId: string,
  invoiceNumber: string,
  jobCardId: string | null,
  items: { partId: string | null; qty: number; costPrice: number }[],
) {
  const demand = new Map<string, number>();
  for (const i of items) {
    if (!i.partId) continue;
    demand.set(i.partId, (demand.get(i.partId) ?? 0) + i.qty);
  }
  if (demand.size === 0) return;

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
      throw new BusinessError(
        `Insufficient stock — ${label}: need ${needed}, in stock ${part?.stockQty ?? 0}`,
      );
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
  await tx.invoice.update({ where: { id: invoiceId }, data: { stockDeducted: true } });
}
