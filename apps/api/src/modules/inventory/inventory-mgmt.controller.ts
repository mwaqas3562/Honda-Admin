import type { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

/* ─── Helpers ──────────────────────────────────────────── */

function shopIdFromReq(req: Request): string | null {
  if (!req.user) return null;
  if (req.user.role === Role.SUPER_ADMIN) {
    return (req.headers["x-shop-id"] as string | undefined) ?? req.user.shopId ?? null;
  }
  return req.user.shopId ?? null;
}

/* ─── 1) Stock Adjustment ──────────────────────────────── */

const adjustSchema = z.object({
  partId: z.string().min(1),
  /** ADD = positive, REMOVE = negative; sign is applied server-side. */
  type: z.enum(["ADD", "REMOVE"]),
  quantity: z.number().int().positive(),
  reason: z.string().min(1).max(200),
});

export async function adjustStockHandler(req: Request, res: Response): Promise<void> {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  const shopId = shopIdFromReq(req);
  if (!shopId) { res.status(400).json({ message: "Shop scope required." }); return; }

  const { partId, type, quantity, reason } = parsed.data;
  const delta = type === "ADD" ? quantity : -quantity;

  const result = await prisma.$transaction(async (tx) => {
    const part = await tx.part.findFirst({
      where: { id: partId, shopId, isDeleted: false },
      select: { id: true, name: true, stockQty: true },
    });
    if (!part) throw new Error("Product not found.");

    const newQty = part.stockQty + delta;
    if (newQty < 0) {
      throw new Error(`Cannot remove ${quantity} — only ${part.stockQty} in stock.`);
    }

    const updated = await tx.part.update({
      where: { id: partId },
      data: { stockQty: newQty },
      select: { id: true, name: true, sku: true, stockQty: true },
    });

    await tx.stockLog.create({
      data: {
        shopId,
        partId,
        changeQty: delta,
        balanceQty: newQty,
        logType: "ADJUSTMENT",
        notes: reason,
        createdById: req.user!.id,
      },
    });

    return updated;
  });

  res.json({ message: "Stock adjusted.", part: result });
}

/* ─── 2) Bulk Upload ───────────────────────────────────── */

/**
 * Strict integer coercion for bulk-upload numeric fields.
 *
 *  - Empty/blank → undefined (field is optional).
 *  - Non-numeric or fractional values → ZodError "Decimal values not allowed in row X".
 *  - Negative values → clamped to 0 (uploads frequently include "-2" for adjustments
 *    that we treat as 0 after the validation policy "block negatives in input").
 */
const intField = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  return v;
}, z.union([z.number(), z.string()]).optional()).transform((raw, ctx) => {
  if (raw === undefined) return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only whole numbers are allowed. Decimal values are not permitted." });
    return z.NEVER;
  }
  if (!Number.isInteger(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only whole numbers are allowed. Decimal values are not permitted." });
    return z.NEVER;
  }
  return Math.max(0, n);
});

const bulkRowSchema = z.object({
  sku: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1)),
  name: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1)),
  category: z.string().optional().nullable(),
  costPrice: intField,
  sellingPrice: intField,
  stockQty: intField,
  minStockLevel: intField,
});

const bulkUploadSchema = z.object({
  /** OVERWRITE: row.stockQty replaces stockQty. ADD: row.stockQty is added. */
  stockMode: z.enum(["OVERWRITE", "ADD"]).default("OVERWRITE"),
  rows: z.array(bulkRowSchema).min(1).max(5000),
});

export async function bulkUploadPartsHandler(req: Request, res: Response): Promise<void> {
  const parsed = bulkUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    // Build a row-level message so the client can show which rows failed.
    const issues = parsed.error.issues.slice(0, 10).map((iss) => {
      // Path looks like ["rows", <index>, <field>] for row-level issues.
      const rowIdx = typeof iss.path[1] === "number" ? (iss.path[1] as number) : null;
      const field = iss.path[2] != null ? String(iss.path[2]) : "";
      return rowIdx !== null
        ? `Row ${rowIdx + 1}${field ? ` · ${field}` : ""}: ${iss.message}`
        : iss.message;
    });
    const summary = issues.length > 0 ? issues.join(" | ") : "Invalid payload.";
    res.status(400).json({
      message: `Validation error. ${summary}${parsed.error.issues.length > 10 ? ` (+${parsed.error.issues.length - 10} more)` : ""}`,
      errors: parsed.error.flatten(),
    });
    return;
  }
  const shopId = shopIdFromReq(req);
  if (!shopId) { res.status(400).json({ message: "Shop scope required." }); return; }
  const userId = req.user!.id;
  const { rows, stockMode } = parsed.data;

  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; sku: string; message: string }> = [];

  // ── Bulk fast path: fetch all existing parts in one query, then split into create/update sets.
  const allSkus = Array.from(new Set(rows.map((r) => r.sku)));
  const existingList = await prisma.part.findMany({
    where: { shopId, isDeleted: false, sku: { in: allSkus } },
    select: { id: true, sku: true, stockQty: true },
  });
  const existingMap = new Map(existingList.map((p) => [p.sku, p]));

  // ── 1) Create all new parts in a single bulk insert.
  const newRows = rows.filter((r) => !existingMap.has(r.sku));
  if (newRows.length > 0) {
    try {
      // Dedupe by sku (the upload may contain repeated rows; keep the last).
      const dedup = new Map<string, (typeof newRows)[number]>();
      for (const r of newRows) dedup.set(r.sku, r);
      const data = Array.from(dedup.values()).map((row) => {
        const cost = row.costPrice ?? 0;
        return {
          shopId,
          sku: row.sku,
          name: row.name,
          category: row.category ?? null,
          costPrice: cost,
          unitPrice: cost,
          sellingPrice: row.sellingPrice ?? 0,
          stockQty: row.stockQty ?? 0,
          minStockLevel: row.minStockLevel ?? 5,
          createdById: userId,
        };
      });
      const result = await prisma.part.createMany({ data, skipDuplicates: true });
      created = result.count;

      // Re-fetch to get ids for stock logs (only those with stock > 0).
      const createdSkus = data.filter((d) => d.stockQty > 0).map((d) => d.sku);
      if (createdSkus.length > 0) {
        const createdParts = await prisma.part.findMany({
          where: { shopId, sku: { in: createdSkus } },
          select: { id: true, sku: true, stockQty: true },
        });
        if (createdParts.length > 0) {
          await prisma.stockLog.createMany({
            data: createdParts.map((p) => ({
              shopId,
              partId: p.id,
              changeQty: p.stockQty,
              balanceQty: p.stockQty,
              logType: "PURCHASE_IN" as const,
              notes: "Bulk upload (new)",
              createdById: userId,
            })),
          });
        }
      }
    } catch (e) {
      errors.push({ row: 0, sku: "", message: `Bulk insert failed: ${(e as Error).message}` });
    }
  }

  // ── 2) Updates: ONE bulk SQL UPDATE FROM (VALUES …) for all existing rows.
  const updateRows = rows
    .map((row, idx) => ({ row, idx, existing: existingMap.get(row.sku) }))
    .filter((x): x is { row: typeof rows[number]; idx: number; existing: NonNullable<typeof x.existing> } => Boolean(x.existing));

  if (updateRows.length > 0) {
    try {
      // Build the VALUES list with explicit type casts so Postgres infers column types
      // even when columns are entirely null.
      const placeholders: string[] = [];
      const params: unknown[] = [shopId];
      let p = 1;
      const next = () => `$${++p}`;
      for (const { row } of updateRows) {
        const sku = next();
        const name = next();
        const category = next();
        const cost = next();
        const sell = next();
        const min = next();
        const stock = next();
        placeholders.push(
          `(${sku}::text, ${name}::text, ${category}::text, ${cost}::numeric, ${sell}::numeric, ${min}::int, ${stock}::int)`
        );
        params.push(
          row.sku,
          row.name,
          row.category ?? null,
          row.costPrice ?? null,
          row.sellingPrice ?? null,
          row.minStockLevel ?? null,
          row.stockQty ?? null,
        );
      }

      const stockExpr =
        stockMode === "ADD"
          ? `CASE WHEN v.stock IS NULL THEN p."stockQty" ELSE p."stockQty" + v.stock END`
          : `COALESCE(v.stock, p."stockQty")`;

      const sql = `
        UPDATE "Part" AS p SET
          name            = v.name,
          category        = COALESCE(v.category, p.category),
          "costPrice"     = COALESCE(v.cost, p."costPrice"),
          "unitPrice"     = COALESCE(v.cost, p."unitPrice"),
          "sellingPrice"  = COALESCE(v.sell, p."sellingPrice"),
          "minStockLevel" = COALESCE(v.min, p."minStockLevel"),
          "stockQty"      = ${stockExpr},
          "updatedAt"     = NOW()
        FROM (VALUES ${placeholders.join(",")}) AS v(sku, name, category, cost, sell, min, stock)
        WHERE p."shopId" = $1 AND p.sku = v.sku AND p."isDeleted" = false
      `;
      const affected = await prisma.$executeRawUnsafe(sql, ...params);
      updated = typeof affected === "number" ? affected : updateRows.length;

      // One summary stock-log entry per part whose stock actually changed.
      const stockChanges = updateRows
        .map(({ row, existing }) => {
          if (row.stockQty === undefined) return null;
          const newStock =
            stockMode === "ADD" ? existing.stockQty + row.stockQty : row.stockQty;
          if (newStock === existing.stockQty) return null;
          return {
            shopId,
            partId: existing.id,
            changeQty: newStock - existing.stockQty,
            balanceQty: newStock,
            logType: (stockMode === "ADD" ? "PURCHASE_IN" : "ADJUSTMENT") as
              | "PURCHASE_IN"
              | "ADJUSTMENT",
            notes: `Bulk upload (${stockMode})`,
            createdById: userId,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (stockChanges.length > 0) {
        await prisma.stockLog.createMany({ data: stockChanges });
      }
    } catch (e) {
      errors.push({ row: 0, sku: "", message: `Bulk update failed: ${(e as Error).message}` });
    }
  }

  res.json({
    summary: {
      total: rows.length,
      created,
      updated,
      failed: errors.length,
    },
    errors,
  });
}

/* ─── 3) Inventory Reports (consolidated) ──────────────── */

const reportQuerySchema = z.object({
  topN: z.coerce.number().int().min(1).max(50).default(10),
});

export async function getInventoryReportsHandler(req: Request, res: Response): Promise<void> {
  const parsed = reportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query.", errors: parsed.error.flatten() });
    return;
  }
  const shopId = shopIdFromReq(req);
  if (!shopId) { res.status(400).json({ message: "Shop scope required." }); return; }

  const parts = await prisma.part.findMany({
    where: { shopId, isDeleted: false },
    select: {
      id: true, name: true, sku: true, category: true,
      stockQty: true, costPrice: true, sellingPrice: true, minStockLevel: true,
    },
  });

  const toNum = (v: Prisma.Decimal | number) =>
    typeof v === "number" ? v : Number(v.toString()) || 0;

  let totalValue = 0;
  let potentialProfit = 0;
  const lowStock: typeof parts = [];
  const outOfStock: typeof parts = [];

  for (const p of parts) {
    const cost = toNum(p.costPrice);
    const sell = toNum(p.sellingPrice);
    totalValue += p.stockQty * cost;
    potentialProfit += p.stockQty * Math.max(0, sell - cost);
    if (p.stockQty === 0) outOfStock.push(p);
    else if (p.stockQty <= p.minStockLevel) lowStock.push(p);
  }

  const map = (arr: typeof parts) =>
    arr
      .sort((a, b) => a.stockQty - b.stockQty || a.name.localeCompare(b.name))
      .map((p) => ({
        id: p.id, name: p.name, sku: p.sku, category: p.category,
        stockQty: p.stockQty, minStockLevel: p.minStockLevel,
        costPrice: toNum(p.costPrice), sellingPrice: toNum(p.sellingPrice),
        value: Math.floor(p.stockQty * toNum(p.costPrice)),
      }));

  res.json({
    totals: {
      totalProducts: parts.length,
      totalValue: Math.floor(totalValue),
      potentialProfit: Math.floor(potentialProfit),
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
    },
    lowStock: map(lowStock).slice(0, parsed.data.topN),
    outOfStock: map(outOfStock).slice(0, parsed.data.topN),
  });
}
