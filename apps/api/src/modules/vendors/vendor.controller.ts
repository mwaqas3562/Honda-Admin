import type { Request, Response } from "express";
import { parsePagination } from "../../shared/utils/pagination";
import { getShopScope } from "../../shared/utils/shop-scope";
import { createVendorSchema, updateVendorSchema } from "./vendor.schema";
import { createVendor, getVendor, listVendors, softDeleteVendor, updateVendor } from "./vendor.service";

export async function listVendorsHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const { page, limit } = parsePagination(req, 100);
  const search = req.query.search ? String(req.query.search) : undefined;
  res.json(await listVendors(shopId, page, limit, search));
}

export async function getVendorHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const v = await getVendor(String(req.params.id), shopId);
  if (!v) { res.status(404).json({ message: "Vendor not found." }); return; }
  res.json(v);
}

export async function createVendorHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = createVendorSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() }); return; }
  try {
    const v = await createVendor(shopId, req.user!.id, parsed.data);
    res.status(201).json(v);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      res.status(409).json({ message: "Vendor code already exists for this shop." });
      return;
    }
    throw e;
  }
}

export async function updateVendorHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = updateVendorSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() }); return; }
  const v = await updateVendor(String(req.params.id), shopId, parsed.data);
  if (!v) { res.status(404).json({ message: "Vendor not found." }); return; }
  res.json(v);
}

export async function deleteVendorHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const r = await softDeleteVendor(String(req.params.id), shopId);
  if (!r) { res.status(404).json({ message: "Vendor not found." }); return; }
  res.json({ message: "Vendor deleted." });
}
