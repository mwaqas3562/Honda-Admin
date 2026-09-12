import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const stockLogSelect = {
  id: true, shopId: true, partId: true, changeQty: true, balanceQty: true,
  logType: true, notes: true, purchaseId: true, jobCardId: true,
  createdAt: true,
  part: { select: { id: true, name: true, sku: true } },
} satisfies Prisma.StockLogSelect;

export async function listStockLogs(
  shopId: string,
  page = 1,
  limit = 100,
  partId?: string,
  logType?: "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT"
) {
  const skip = (page - 1) * limit;
  const where: Prisma.StockLogWhereInput = {
    shopId, isDeleted: false,
    ...(partId && { partId }),
    ...(logType && { logType }),
  };
  const [data, total] = await Promise.all([
    prisma.stockLog.findMany({ where, select: stockLogSelect, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.stockLog.count({ where }),
  ]);
  return { data, total, page, limit };
}
