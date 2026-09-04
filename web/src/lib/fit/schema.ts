/**
 * Fit contract — the web side of the fit feature. These schemas mirror
 * the extension's lib/profile/schema.ts (keep both sides in sync; the
 * /api/fit route parses with THESE as the authority) and add the
 * response shape. All measurements canonical cm integers.
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

export const FitAdviceSchema = z.object({
  size: z.string().min(1).optional(),
  confidence: z.enum(["high", "medium", "low", "none"]),
  reasons: z.array(z.string().min(1)),
});

export type SizeRow = z.infer<typeof SizeRowSchema>;
export type SizeChart = z.infer<typeof SizeChartSchema>;
export type GarmentProfile = z.infer<typeof GarmentProfileSchema>;
export type BodyProfile = z.infer<typeof BodyProfileSchema>;
export type FitAdvice = z.infer<typeof FitAdviceSchema>;
