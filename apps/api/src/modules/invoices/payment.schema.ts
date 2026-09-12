import { z } from "zod";

export const PaymentMethodEnum = z.enum(["CASH", "CARD", "BANK", "ONLINE", "OTHER"]);

export const createPaymentSchema = z.object({
  amount: z.number().int().positive(),
  method: PaymentMethodEnum.default("CASH"),
  notes: z.string().trim().max(500).optional().nullable(),
  paidAt: z.string().datetime().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
