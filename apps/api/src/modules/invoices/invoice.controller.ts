import type { Request, Response } from "express";
import { parsePagination } from "../../shared/utils/pagination";
import { getShopScope } from "../../shared/utils/shop-scope";
import { createInvoiceSchema, updateInvoiceSchema } from "./invoice.schema";
import { createPaymentSchema } from "./payment.schema";
import {
  createInvoice,
  getInvoice,
  listInvoices,
  softDeleteInvoice,
  updateInvoice,
} from "./invoice.service";
import { listPayments, recordPayment } from "./payment.service";

export async function listInvoicesHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const { page, limit } = parsePagination(req, 50);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const result = await listInvoices(shopId, page, limit, q);
  res.json(result);
}

export async function getInvoiceHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const invoice = await getInvoice(String(req.params.id), shopId);
  if (!invoice) { res.status(404).json({ message: "Invoice not found." }); return; }
  res.json(invoice);
}

export async function createInvoiceHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  const invoice = await createInvoice(shopId, req.user!.id, parsed.data);
  res.status(201).json(invoice);
}

export async function updateInvoiceHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = updateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  const invoice = await updateInvoice(String(req.params.id), shopId, req.user!.id, parsed.data);
  if (!invoice) { res.status(404).json({ message: "Invoice not found." }); return; }
  res.json(invoice);
}

export async function deleteInvoiceHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const result = await softDeleteInvoice(String(req.params.id), shopId);
  if (!result) { res.status(404).json({ message: "Invoice not found." }); return; }
  res.json({ message: "Invoice deleted." });
}

export async function listPaymentsHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const data = await listPayments(String(req.params.id), shopId);
  res.json({ data });
}

export async function createPaymentHandler(req: Request, res: Response): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = createPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  const payment = await recordPayment(String(req.params.id), shopId, req.user!.id, parsed.data);
  res.status(201).json(payment);
}
