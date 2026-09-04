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

/**
 * Body profile — entered by the shopper, never predicted. Canonical cm
 * integers; the imperial UI converts before save. Twin of the /api/fit
 * request side (web/src/lib/fit, F3).
 */
export const BodyProfileSchema = z.object({
  heightCm: z
    .number()
    .int()
    .min(120, "Height must be between 120 and 220 cm")
    .max(220, "Height must be between 120 and 220 cm"),
  chestCm: z
    .number()
    .int()
    .min(60, "Chest must be between 60 and 160 cm")
    .max(160, "Chest must be between 60 and 160 cm")
    .optional(),
  waistCm: z
    .number()
    .int()
    .min(60, "Waist must be between 60 and 160 cm")
    .max(160, "Waist must be between 60 and 160 cm")
    .optional(),
  fitPreference: z.enum(["tight", "regular", "loose"]).default("regular"),
});

export type SizeRow = z.infer<typeof SizeRowSchema>;
export type SizeChart = z.infer<typeof SizeChartSchema>;
export type GarmentProfile = z.infer<typeof GarmentProfileSchema>;
export type BodyProfile = z.infer<typeof BodyProfileSchema>;
