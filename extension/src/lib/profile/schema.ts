/**
 * Garment profile — the structured "what this page says about the
 * garment" contract for the fit feature. Loose by design: pages are
 * reality, so every field except sourceUrl degrades to absence instead
 * of failing. The size chart (F1.2) always normalizes to cm.
 */
import { z } from "zod";

export const SizeRowSchema = z.object({
  size: z.string().min(1),
  heightRangeCm: z.tuple([z.number(), z.number()]).optional(),
  chestCm: z.number().optional(),
  waistCm: z.number().optional(),
});

export const SizeChartSchema = z.object({
  unit: z.literal("cm"),
  rows: z.array(SizeRowSchema).min(1),
  from: z.literal("dom-table"),
});

export const GarmentProfileSchema = z.object({
  sourceUrl: z.string().min(1),
  title: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  sizeChart: SizeChartSchema.optional(),
});

export type SizeRow = z.infer<typeof SizeRowSchema>;
export type SizeChart = z.infer<typeof SizeChartSchema>;
export type GarmentProfile = z.infer<typeof GarmentProfileSchema>;
