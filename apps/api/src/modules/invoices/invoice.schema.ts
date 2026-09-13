import { z } from "zod";

export const invoiceItemSchema = z.object({
  /** Optional link to a stocked Part. Required when the line is a product. */
  partId: z.string().optional(),
  itemCode: z.string().optional(),
  itemName: z.string().min(1),
  qty: z.number().int().positive(),
  rate: z.number().int().nonnegative(),
  /** Optional explicit cost-price snapshot; otherwise pulled from Part at save-time. */
  costPrice: z.number().int().nonnegative().optional(),
  remarks: z.string().optional(),
});

export const createInvoiceSchema = z.object({
  /** A non-completed Job Card MUST be selected. */
  jobCardId: z.string().min(1),
  /** Business date of the bill. Defaults to now when omitted, and is what the
   *  receipt prints and the daily reports group by, so back-dated entries land
   *  on the day the work was actually done. */
  entryDate: z.string().datetime().optional(),
  jobDetail: z.string().optional(),
  /** Override the auto-filled customer cell number for this invoice. */
  cellNo: z.string().optional(),
  saleTerm: z.string().default("BY CASH"),
  discountPct: z.number().min(0).max(100).default(0),
  paidAmount: z.number().int().nonnegative().default(0),
  /** When PAID, stock is deducted and the Job Card auto-completes. */
  status: z.enum(["DRAFT", "PAID"]).default("DRAFT"),
  items: z.array(invoiceItemSchema).min(1),
});

export const updateInvoiceSchema = z.object({
  entryDate: z.string().datetime().optional(),
  jobDetail: z.string().optional(),
  cellNo: z.string().optional(),
  saleTerm: z.string().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  paidAmount: z.number().int().nonnegative().optional(),
  status: z.enum(["DRAFT", "ISSUED", "PARTIAL", "PAID", "VOID"]).optional(),
  items: z.array(invoiceItemSchema).min(1).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
