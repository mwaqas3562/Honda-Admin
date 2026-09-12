import type { Request, Response } from "express";
import { parsePagination } from "../../shared/utils/pagination";
import { getShopScope } from "../../shared/utils/shop-scope";
import { listStockLogs } from "./stock-log.service";

export async function listStockLogsHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const { page, limit } = parsePagination(req, 100);
  const partId  = req.query.partId ? String(req.query.partId) : undefined;
  const logType = req.query.logType ? (String(req.query.logType) as "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT") : undefined;
  res.json(await listStockLogs(shopId, page, limit, partId, logType));
}
