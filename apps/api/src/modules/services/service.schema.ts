import { z } from "zod";

const intNonNeg = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "string" ? Number(v) : v))
  .refine((n) => Number.isFinite(n) && Number.isInteger(n) && n >= 0, {
    message: "Must be a non-negative integer.",
  });

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  defaultPrice: intNonNeg.optional(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

export const updateServiceSchema = createServiceSchema.partial();

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
