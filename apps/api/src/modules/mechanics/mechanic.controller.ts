import type { Request, Response } from "express";
import { getShopScope } from "../../shared/utils/shop-scope";
import { MechanicStatus } from "@prisma/client";
import {
  createMechanicSchema,
  setMechanicStatusSchema,
  updateMechanicSchema,
} from "./mechanic.schema";
import {
  createMechanic,
  deleteMechanic,
  getMechanic,
  listMechanics,
  setMechanicStatus,
  updateMechanic,
} from "./mechanic.service";

function parseStatus(raw: unknown): MechanicStatus | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.toUpperCase();
  if (v === "ACTIVE" || v === "INACTIVE") return v as MechanicStatus;
  return undefined;
}

export async function listMechanicsHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const status = parseStatus(req.query.status);
  const q = req.query.q ? String(req.query.q).trim() : undefined;
  const includeStats = req.query.stats === "1" || req.query.stats === "true";
  const data = await listMechanics(shopId, { status, q, includeStats });
  res.json({ data });
}

export async function getMechanicHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const m = await getMechanic(String(req.params.id), shopId);
  if (!m) { res.status(404).json({ message: "Mechanic not found." }); return; }
  res.json(m);
}

export async function createMechanicHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = createMechanicSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  try {
    const m = await createMechanic(shopId, req.user!.id, parsed.data);
    res.status(201).json(m);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      res.status(409).json({ message: "A mechanic with this name already exists." });
      return;
    }
    throw e;
  }
}

export async function updateMechanicHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = updateMechanicSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  try {
    const m = await updateMechanic(String(req.params.id), shopId, parsed.data);
    if (!m) { res.status(404).json({ message: "Mechanic not found." }); return; }
    res.json(m);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      res.status(409).json({ message: "A mechanic with this name already exists." });
      return;
    }
    throw e;
  }
}

export async function setMechanicStatusHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = setMechanicStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  const m = await setMechanicStatus(String(req.params.id), shopId, parsed.data.status);
  if (!m) { res.status(404).json({ message: "Mechanic not found." }); return; }
  res.json(m);
}

export async function deleteMechanicHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const r = await deleteMechanic(String(req.params.id), shopId);
  if (r.deleted) { res.json({ message: "Mechanic deleted." }); return; }
  if (r.reason === "not_found") { res.status(404).json({ message: "Mechanic not found." }); return; }
  if (r.reason === "linked_jobcards") {
    res.status(409).json({
      message: "This mechanic is linked to existing job cards and cannot be deleted. Set status to INACTIVE instead.",
    });
    return;
  }
  res.status(400).json({ message: "Mechanic could not be deleted." });
}
