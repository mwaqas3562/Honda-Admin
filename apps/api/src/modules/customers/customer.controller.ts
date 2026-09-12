import type { Request, Response } from "express";
import { parsePagination } from "../../shared/utils/pagination";
import { getShopScope } from "../../shared/utils/shop-scope";
import { createCustomerSchema, updateCustomerSchema } from "./customer.schema";
import { createCustomer, getCustomer, listCustomers, updateCustomer } from "./customer.service";

export async function listCustomersHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const { page, limit } = parsePagination(req, 200);
  const search = req.query.search ? String(req.query.search) : undefined;
  res.json(await listCustomers(shopId, page, limit, search));
}

export async function getCustomerHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const c = await getCustomer(String(req.params.id), shopId);
  if (!c) { res.status(404).json({ message: "Customer not found." }); return; }
  res.json(c);
}

export async function createCustomerHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() }); return; }
  const c = await createCustomer(shopId, req.user!.id, parsed.data);
  res.status(201).json(c);
}

export async function updateCustomerHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() }); return; }
  const c = await updateCustomer(String(req.params.id), shopId, parsed.data);
  if (!c) { res.status(404).json({ message: "Customer not found." }); return; }
  res.json(c);
}
