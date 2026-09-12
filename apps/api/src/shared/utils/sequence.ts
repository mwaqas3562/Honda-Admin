import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Atomically reserves the next integer in a per-shop counter.
 *
 * Implementation:
 *   - Uses `upsert` to lazily create the row, then an atomic
 *     `update {data: {lastValue: {increment: 1}}}` which Postgres
 *     translates to `UPDATE … SET last_value = last_value + 1 RETURNING …`.
 *     That single statement holds the row lock just long enough to
 *     return a fresh, unique value with no gaps for concurrent callers.
 *
 *  Pass a `tx` if you need the increment to participate in a larger
 *  transaction (e.g. so the document insert + sequence bump succeed or
 *  fail together).
 */
export type SequenceKind = "JOB_CARD" | "INVOICE" | "PURCHASE";

type Db = PrismaClient | Prisma.TransactionClient;

export async function nextSequence(
  db: Db,
  shopId: string,
  kind: SequenceKind
): Promise<number> {
  // Ensure a row exists. If two requests race we'll both succeed because
  // unique([shopId, kind]) is the conflict target — the second upsert no-ops.
  await db.numberSequence.upsert({
    where: { shopId_kind: { shopId, kind } },
    create: { shopId, kind, lastValue: 0 },
    update: {},
  });

  const updated = await db.numberSequence.update({
    where: { shopId_kind: { shopId, kind } },
    data: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  });
  return updated.lastValue;
}

/** Format helpers — keep numbering format in one place.
 *  All document numbers are plain integers (no prefix), starting from 101. */
export function formatJobNumber(n: number): string {
  return String(n);
}

export function formatInvoiceNumber(n: number): string {
  return String(n);
}

export function formatPurchaseNumber(n: number): string {
  return String(n);
}
