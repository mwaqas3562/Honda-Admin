import type { Request, Response } from "express";
import { parsePagination } from "../../shared/utils/pagination";
import { getShopScope } from "../../shared/utils/shop-scope";
import { createPartSchema, updatePartSchema } from "./parts.schema";
import { createPart, getPart, listParts, softDeletePart, updatePart } from "./parts.service";

export async function listPartsHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const { page, limit } = parsePagination(req, 100);
  const search = req.query.search ? String(req.query.search) : undefined;
  const result = await listParts(shopId, page, limit, search);
  res.json(result);
}

export async function getPartHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const part = await getPart(String(req.params.id), shopId);
  if (!part) { res.status(404).json({ message: "Part not found." }); return; }
  res.json(part);
}

export async function createPartHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = createPartSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() }); return; }
  try {
    const part = await createPart(shopId, req.user!.id, parsed.data);
    res.status(201).json(part);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      res.status(409).json({ message: "SKU already exists for this shop." });
      return;
    }
    throw e;
  }
}

export async function updatePartHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = updatePartSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() }); return; }
  const part = await updatePart(String(req.params.id), shopId, parsed.data);
  if (!part) { res.status(404).json({ message: "Part not found." }); return; }
  res.json(part);
}

export async function deletePartHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const result = await softDeletePart(String(req.params.id), shopId);
  if (!result) { res.status(404).json({ message: "Part not found." }); return; }
  res.json({ message: "Part deleted." });
}
