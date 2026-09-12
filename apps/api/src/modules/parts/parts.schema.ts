import { z } from "zod";

export const createPartSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().max(80).optional().nullable(),
  stockQty: z.number().int().nonnegative().default(0),
  costPrice: z.number().int().nonnegative().default(0),
  unitPrice: z.number().int().nonnegative().optional(),
  sellingPrice: z.number().int().nonnegative().default(0),
  minStockLevel: z.number().int().nonnegative().default(5),
});

export const updatePartSchema = createPartSchema.partial();

export type CreatePartInput = z.infer<typeof createPartSchema>;
export type UpdatePartInput = z.infer<typeof updatePartSchema>;
