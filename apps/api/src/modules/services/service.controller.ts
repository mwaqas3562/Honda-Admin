import type { Request, Response } from "express";
import { getShopScope } from "../../shared/utils/shop-scope";
import { createServiceSchema, updateServiceSchema } from "./service.schema";
import {
  createService,
  deleteService,
  getService,
  listServices,
  updateService,
} from "./service.service";

export async function listServicesHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const q = req.query.q ? String(req.query.q).trim() : undefined;
  const activeOnly = req.query.active === "1" || req.query.active === "true";
  const data = await listServices(shopId, { q, activeOnly });
  res.json({ data });
}

export async function getServiceHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const s = await getService(String(req.params.id), shopId);
  if (!s) { res.status(404).json({ message: "Service not found." }); return; }
  res.json(s);
}

export async function createServiceHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = createServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  try {
    const s = await createService(shopId, req.user!.id, parsed.data);
    res.status(201).json(s);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      res.status(409).json({ message: "A service with this name already exists." });
      return;
    }
    throw e;
  }
}

export async function updateServiceHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = updateServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  try {
    const s = await updateService(String(req.params.id), shopId, parsed.data);
    if (!s) { res.status(404).json({ message: "Service not found." }); return; }
    res.json(s);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      res.status(409).json({ message: "A service with this name already exists." });
      return;
    }
    throw e;
  }
}

export async function deleteServiceHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const ok = await deleteService(String(req.params.id), shopId);
  if (!ok) { res.status(404).json({ message: "Service not found." }); return; }
  res.json({ message: "Service deleted." });
}
