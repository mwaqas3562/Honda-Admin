import { z } from "zod";

/**
 * Create payload — minimal "issue job" record. Items/labour amounts are
 * NO LONGER captured here; they belong to the linked Sales Invoice.
 */
export const createJobCardSchema = z
  .object({
    customerId: z.string().min(1).optional(),
    /** Walk-in: create a customer inline. */
    customerName: z.string().min(1).optional(),
    customerPhone: z.string().optional(),
    /** Free-text title; auto-derived to "Job Intake" if omitted. */
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    vehicleRegNo: z.string().optional(),
    vehicleType: z.string().optional(),
    engineType: z.string().optional(),
    meterReading: z.number().int().nonnegative().optional(),
    mechanicId: z.string().min(1).optional(),
    mechanicAssigned: z.string().optional(),
  })
  .refine((d) => Boolean(d.customerId || d.customerName), {
    message: "Either customerId or customerName is required.",
  });

/** Update payload — only meaningful while the card is NOT finalised. */
export const updateJobCardSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  vehicleRegNo: z.string().optional(),
  vehicleType: z.string().optional(),
  engineType: z.string().optional(),
  meterReading: z.number().int().nonnegative().optional(),
  mechanicId: z.string().nullable().optional(),
  mechanicAssigned: z.string().optional(),
});

/** Finalise locks the card so it can be invoiced. Once true, never reverts. */
export const finalizeJobCardSchema = z.object({
  isFinal: z.literal(true),
});

export type CreateJobCardInput = z.infer<typeof createJobCardSchema>;
export type UpdateJobCardInput = z.infer<typeof updateJobCardSchema>;
