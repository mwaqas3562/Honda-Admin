import type { Request, Response } from "express";
import { parsePagination } from "../../shared/utils/pagination";
import { getShopScope } from "../../shared/utils/shop-scope";
import {
  createJobCardSchema,
  finalizeJobCardSchema,
  updateJobCardSchema,
} from "./jobcard.schema";
import {
  createJobCard,
  finalizeJobCard,
  getJobCard,
  listJobCards,
  peekNextJobNumber,
  updateJobCard,
} from "./jobcard.service";

export async function listJobCardsHandler(
  req: Request,
  res: Response
): Promise<void> {
  const shopId = getShopScope(req);
  const { page, limit } = parsePagination(req, 100);
  const status = req.query.status
    ? (String(req.query.status) as
        | "OPEN"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED")
    : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  const invoiceableOnly =
    String(req.query.invoiceable ?? "") === "true" ||
    String(req.query.invoiceableOnly ?? "") === "true";
  res.json(
    await listJobCards(
      shopId,
      page,
      limit,
      status,
      search,
      invoiceableOnly
    )
  );
}

export async function getJobCardHandler(
  req: Request,
  res: Response
): Promise<void> {
  const shopId = getShopScope(req);
  const j = await getJobCard(String(req.params.id), shopId);
  if (!j) {
    res.status(404).json({ message: "Job card not found." });
    return;
  }
  res.json(j);
}

export async function createJobCardHandler(
  req: Request,
  res: Response
): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = createJobCardSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  try {
    const j = await createJobCard(
      shopId,
      req.user!.id,
      parsed.data
    );
    res.status(201).json(j);
  } catch (e) {
    res.status(400).json({ message: (e as Error).message });
  }
}

export async function updateJobCardHandler(
  req: Request,
  res: Response
): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = updateJobCardSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  try {
    const j = await updateJobCard(
      String(req.params.id),
      shopId,
      parsed.data
    );
    if (!j) {
      res.status(404).json({ message: "Job card not found." });
      return;
    }
    res.json(j);
  } catch (e) {
    res.status(409).json({ message: (e as Error).message });
  }
}

export async function finalizeJobCardHandler(
  req: Request,
  res: Response
): Promise<void> {
  const shopId = getShopScope(req);
  const parsed = finalizeJobCardSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ message: "Validation error.", errors: parsed.error.flatten() });
    return;
  }
  try {
    const j = await finalizeJobCard(
      String(req.params.id),
      shopId
    );
    if (!j) {
      res.status(404).json({ message: "Job card not found." });
      return;
    }
    res.json(j);
  } catch (e) {
    res.status(409).json({ message: (e as Error).message });
  }
}

export async function nextJobNumberHandler(
  req: Request,
  res: Response
): Promise<void> {
  const shopId = getShopScope(req);
  const nextNumber = await peekNextJobNumber(shopId);
  res.json({ nextNumber });
}
