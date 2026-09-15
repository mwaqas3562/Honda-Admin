import { Prisma } from "@prisma/client";
import { BusinessError } from "../../shared/errors/business-error";
import { prisma } from "../../config/prisma";
import { formatJobNumber, nextSequence } from "../../shared/utils/sequence";
import type { CreateJobCardInput, UpdateJobCardInput } from "./jobcard.schema";

/**
 * Returns the formatted next job number without consuming the sequence.
 * Uses current lastValue + 1 (or 1 if no row exists yet).
 */
export async function peekNextJobNumber(shopId: string): Promise<string> {
  const row = await prisma.numberSequence.findUnique({
    where: { shopId_kind: { shopId, kind: "JOB_CARD" } },
    select: { lastValue: true },
  });
  return formatJobNumber((row?.lastValue ?? 0) + 1);
}

const jobCardSelect = {
  id: true,
  shopId: true,
  customerId: true,
  jobNumber: true,
  title: true,
  description: true,
  serviceNotes: true,
  vehicleRegNo: true,
  vehicleType: true,
  engineType: true,
  meterReading: true,
  mechanicAssigned: true,
  mechanicId: true,
  days: true,
  nextDueDate: true,
  status: true,
  isFinal: true,
  finalizedAt: true,
  laborAmount: true,
  partsAmount: true,
  totalAmount: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, phone: true } },
  mechanic: { select: { id: true, name: true, status: true, phone: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true } },
} satisfies Prisma.JobCardSelect;

export async function listJobCards(
  shopId: string,
  page = 1,
  limit = 100,
  status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  search?: string,
  /** When true, only return cards eligible to be invoiced (open/in-progress and not yet invoiced). */
  invoiceableOnly?: boolean,
  /** When true, drop COMPLETED cards. For work-queue views, where filtering
   *  client-side would silently shrink a fixed page to nothing once most
   *  recent cards are done. */
  excludeCompleted?: boolean
) {
  const skip = (page - 1) * limit;
  const where: Prisma.JobCardWhereInput = {
    shopId,
    isDeleted: false,
    ...(status && { status }),
    ...(invoiceableOnly && {
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      invoice: null,
    }),
    ...(!invoiceableOnly && !status && excludeCompleted && {
      status: { not: "COMPLETED" as const },
    }),
    ...(search && {
      OR: [
        { jobNumber: { contains: search, mode: "insensitive" } },
        { vehicleRegNo: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { mechanicAssigned: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search, mode: "insensitive" } } },
      ],
    }),
  };
  const [data, total] = await Promise.all([
    prisma.jobCard.findMany({
      where,
      select: jobCardSelect,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.jobCard.count({ where }),
  ]);
  return { data, total, page, limit };
}

export async function getJobCard(id: string, shopId: string) {
  return prisma.jobCard.findFirst({
    where: { id, shopId, isDeleted: false },
    select: jobCardSelect,
  });
}

/**
 * Create a Job Card.
 * - Auto-numbered JC-1, JC-2, … per shop.
 * - Items/labour live on the Sales Invoice; this just opens the job.
 * - If `customerId` is omitted but `customerName` is supplied, a Customer is
 *   created inline (walk-in flow).
 */
export async function createJobCard(
  shopId: string,
  userId: string,
  input: CreateJobCardInput
) {
  // Step 1: Customer creation/lookup (outside transaction)
  let customerId = input.customerId;
  if (!customerId) {
    const created = await prisma.customer.create({
      data: {
        shopId,
        name: input.customerName!.trim(),
        phone: input.customerPhone?.trim() || null,
        createdById: userId,
      },
    });
    customerId = created.id;
  } else {
    const exists = await prisma.customer.findFirst({
      where: { id: customerId, shopId, isDeleted: false },
      select: { id: true },
    });
    if (!exists) throw new BusinessError("Customer not found in this shop.");
  }

  // Step 2: Mechanic lookup (outside transaction)
  let mechanicId: string | null = null;
  let mechanicName: string | null = input.mechanicAssigned?.trim() || null;
  if (input.mechanicId) {
    const mech = await prisma.mechanic.findFirst({
      where: { id: input.mechanicId, shopId, isDeleted: false },
      select: { id: true, name: true, status: true },
    });
    if (!mech) throw new BusinessError("Selected mechanic was not found.");
    if (mech.status !== "ACTIVE") throw new BusinessError("Selected mechanic is inactive and cannot be assigned.");
    mechanicId = mech.id;
    mechanicName = mech.name;
  }

  // Step 3: Sequence and job card creation (transaction)
  return prisma.$transaction(async (tx) => {
    const seq = await nextSequence(tx, shopId, "JOB_CARD");
    return tx.jobCard.create({
      data: {
        shopId,
        customerId,
        jobNumber: formatJobNumber(seq),
        title: input.title?.trim() || "Job Intake",
        description: input.description ?? null,
        vehicleRegNo: input.vehicleRegNo ?? null,
        vehicleType: input.vehicleType ?? null,
        engineType: input.engineType ?? null,
        meterReading: input.meterReading ?? null,
        mechanicId,
        mechanicAssigned: mechanicName,
        status: "OPEN",
        isFinal: false,
        createdById: userId,
      },
      select: jobCardSelect,
    });
  });
}

/**
 * Update a Job Card. Throws if the card is finalised or completed —
 * those are immutable per the workflow.
 */
export async function updateJobCard(
  id: string,
  shopId: string,
  input: UpdateJobCardInput
) {
  const existing = await prisma.jobCard.findFirst({
    where: { id, shopId, isDeleted: false },
    select: { id: true, status: true, isFinal: true, customerId: true, invoice: { select: { id: true } } },
  });
  if (!existing) return null;
  if (existing.invoice) {
    throw new BusinessError("This Job Card has already been invoiced and cannot be edited.");
  }
  if (existing.isFinal) {
    throw new BusinessError("This Job Card has been finalised and cannot be edited.");
  }
  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    throw new BusinessError("This Job Card is closed and cannot be edited.");
  }

  let mechanicUpdate: { mechanicId?: string | null; mechanicAssigned?: string | null } = {};
  if (input.mechanicId !== undefined) {
    if (input.mechanicId === null || input.mechanicId === "") {
      mechanicUpdate.mechanicId = null;
      mechanicUpdate.mechanicAssigned = null;
    } else {
      const mech = await prisma.mechanic.findFirst({
        where: { id: input.mechanicId, shopId, isDeleted: false },
        select: { id: true, name: true, status: true },
      });
      if (!mech) throw new BusinessError("Selected mechanic was not found.");
      if (mech.status !== "ACTIVE") throw new BusinessError("Selected mechanic is inactive and cannot be assigned.");
      mechanicUpdate.mechanicId = mech.id;
      mechanicUpdate.mechanicAssigned = mech.name;
    }
  } else if (input.mechanicAssigned !== undefined) {
    // Legacy free-text update path — only honoured when no mechanicId was sent.
    mechanicUpdate.mechanicAssigned = input.mechanicAssigned || null;
  }

  /* A job card references a customer rather than storing a name, so fixing the
   * name or number here edits that customer record — and therefore every other
   * card and bill of theirs. That is the right behaviour for a typo, which is
   * what this is for; it is not a way to move a card to a different person. */
  if (input.customerName !== undefined || input.customerPhone !== undefined) {
    await prisma.customer.update({
      where: { id: existing.customerId },
      data: {
        ...(input.customerName !== undefined && { name: input.customerName.trim() }),
        ...(input.customerPhone !== undefined && { phone: input.customerPhone.trim() || null }),
      },
    });
  }

  return prisma.jobCard.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && {
        description: input.description || null,
      }),
      ...(input.vehicleRegNo !== undefined && {
        vehicleRegNo: input.vehicleRegNo || null,
      }),
      ...(input.vehicleType !== undefined && {
        vehicleType: input.vehicleType || null,
      }),
      ...(input.engineType !== undefined && {
        engineType: input.engineType || null,
      }),
      ...(input.meterReading !== undefined && {
        meterReading: input.meterReading,
      }),
      ...mechanicUpdate,
    },
    select: jobCardSelect,
  });
}

/**
 * Finalise a Job Card — locks the record so it can be invoiced.
 * Idempotent: re-finalising returns the current state without error.
 */
export async function finalizeJobCard(id: string, shopId: string) {
  const existing = await prisma.jobCard.findFirst({
    where: { id, shopId, isDeleted: false },
    select: { id: true, isFinal: true, status: true },
  });
  if (!existing) return null;
  if (existing.isFinal) {
    return prisma.jobCard.findUnique({ where: { id }, select: jobCardSelect });
  }
  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    throw new BusinessError("Cannot finalise a closed Job Card.");
  }

  return prisma.jobCard.update({
    where: { id },
    data: {
      isFinal: true,
      finalizedAt: new Date(),
    },
    select: jobCardSelect,
  });
}
