import type { PreflightCheck, PreflightContext } from "./checks";
import { lumaStdDev, transparentRatio } from "./image-stats";

const LUMA_STD_DEV_FLOOR = 4;
const TRANSPARENT_RATIO_CEILING = 0.9;

/**
 * Heuristic sanity checks for garment images — NOT clothing detection.
 * Category/quality understanding is a model check deferred to the budget
 * unlock (Phase 3 Step 9 plug-in point). Checks run specific-first: a
 * mostly-transparent frame reports "transparent", not the generic "blank".
 */
export const GARMENT_CHECKS: readonly PreflightCheck[] = [
  {
    code: "transparent",
    reason: "image is mostly transparent; upload the garment on a solid background",
    async passes(context: PreflightContext): Promise<boolean> {
      return (await transparentRatio(context.bytes)) <= TRANSPARENT_RATIO_CEILING;
    },
  },
  {
    code: "blank",
    reason: "image looks blank or flat; upload a real garment photo",
    async passes(context: PreflightContext): Promise<boolean> {
      return (await lumaStdDev(context.bytes)) >= LUMA_STD_DEV_FLOOR;
    },
  },
];
