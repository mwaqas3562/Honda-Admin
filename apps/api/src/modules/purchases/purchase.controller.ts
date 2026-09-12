import type { Request, Response } from "express";
import { parsePagination } from "../../shared/utils/pagination";
import { getShopScope } from "../../shared/utils/shop-scope";
import {
  createPurchaseSchema,
  purchaseStatusSchema,
  receivePurchaseSchema,
  updatePurchaseSchema,
} from "./purchase.schema";
import {
  createPurchase, getPurchase, listPurchases, peekNextPurchaseNumber, purchaseReports,
  receivePurchase, setPurchaseStatus, softDeletePurchase, updatePurchase,
} from "./purchase.service";

export async function nextPurchaseNumberHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const nextNumber = await peekNextPurchaseNumber(shopId);
  res.json({ nextNumber });
}

export async function listPurchasesHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const { page, limit } = parsePagination(req, 100);
  const status   = typeof req.query.status   === "string" ? req.query.status : undefined;
  const vendorId = typeof req.query.vendorId === "string" ? req.query.vendorId : undefined;
  const search   = typeof req.query.search   === "string" ? req.query.search : undefined;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to   = typeof req.query.to   === "string" ? new Date(req.query.to)   : undefined;
  res.json(await listPurchases(shopId, page, limit, { status, vendorId, search, from, to }));
}

export async function getPurchaseHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const p = await getPurchase(String(req.params.id), shopId);
  if (!p) { res.status(404).json({ message: "Purchase not found." }); return; }
  res.json(p);
}

export async function createPurchaseHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = createPurchaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() }); return; }
  try {
    const p = await createPurchase(shopId, req.user!.id, parsed.data);
    res.status(201).json(p);
  } catch (e) {
    res.status(400).json({ message: (e as Error).message });
  }
}

export async function updatePurchaseHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = updatePurchaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() }); return; }
  try {
    const p = await updatePurchase(String(req.params.id), shopId, req.user!.id, parsed.data);
    if (!p) { res.status(404).json({ message: "Purchase not found." }); return; }
    res.json(p);
  } catch (e) {
    res.status(400).json({ message: (e as Error).message });
  }
}

export async function setPurchaseStatusHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = purchaseStatusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() }); return; }
  try {
    const p = await setPurchaseStatus(String(req.params.id), shopId, req.user!.id, parsed.data.status);
    if (!p) { res.status(404).json({ message: "Purchase not found." }); return; }
    res.json(p);
  } catch (e) {
    res.status(400).json({ message: (e as Error).message });
  }
}

export async function receivePurchaseHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = receivePurchaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() }); return; }
  try {
    const p = await receivePurchase(String(req.params.id), shopId, req.user!.id, parsed.data);
    if (!p) { res.status(404).json({ message: "Purchase not found." }); return; }
    res.json(p);
  } catch (e) {
    res.status(400).json({ message: (e as Error).message });
  }
}

export async function deletePurchaseHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const r = await softDeletePurchase(String(req.params.id), shopId, req.user!.id);
  if (!r) { res.status(404).json({ message: "Purchase not found." }); return; }
  res.json({ message: "Purchase deleted." });
}

export async function purchaseReportsHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to   = typeof req.query.to   === "string" ? new Date(req.query.to)   : undefined;
  const vendorId = typeof req.query.vendorId === "string" ? req.query.vendorId : undefined;
  const partId   = typeof req.query.partId   === "string" ? req.query.partId   : undefined;
  res.json(await purchaseReports(shopId, { from, to, vendorId, partId }));
}
