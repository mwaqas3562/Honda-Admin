import { z } from "zod";

export const mechanicStatusEnum = z.enum(["ACTIVE", "INACTIVE"]);

export const createMechanicSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  status: mechanicStatusEnum.optional(),
});

export const updateMechanicSchema = createMechanicSchema.partial();

export const setMechanicStatusSchema = z.object({
  status: mechanicStatusEnum,
});

export type CreateMechanicInput = z.infer<typeof createMechanicSchema>;
export type UpdateMechanicInput = z.infer<typeof updateMechanicSchema>;
export type SetMechanicStatusInput = z.infer<typeof setMechanicStatusSchema>;
