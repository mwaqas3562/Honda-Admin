import { z } from "zod";

export const purchaseItemSchema = z.object({
  partId: z.string().min(1),
  quantity: z.number().int().positive(),         // ordered qty
  receivedQty: z.number().int().nonnegative().optional(), // optional initial receipt
  costPrice: z.number().int().nonnegative(),
});

export const createPurchaseSchema = z.object({
  vendorId: z.string().min(1, "Vendor is required."),
  status: z.enum(["DRAFT", "RECEIVED", "PAID", "CANCELLED"]).default("DRAFT"),
  notes: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1, "At least one line item is required."),
});

export const updatePurchaseSchema = z.object({
  vendorId: z.string().min(1).optional(),
  status: z.enum(["DRAFT", "RECEIVED", "PAID", "CANCELLED"]).optional(),
  notes: z.string().nullable().optional(),
  items: z.array(purchaseItemSchema).min(1).optional(),
});

export const purchaseStatusSchema = z.object({
  status: z.enum(["DRAFT", "RECEIVED", "PAID", "CANCELLED"]),
});

/* Partial receive: caller submits target receivedQty per line.
 * Service computes delta vs prior receivedQty and adjusts stock + totalCost.
 * Optionally caller may override costPrice (supplier price varies) or remove
 * an unreceived line item entirely. */
export const receivePurchaseSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        receivedQty: z.number().int().nonnegative(),
        costPrice: z.number().int().nonnegative().optional(),
        remove: z.boolean().optional(),
      })
    )
    .min(1),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;
export type PurchaseStatusInput = z.infer<typeof purchaseStatusSchema>;
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;
export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;
