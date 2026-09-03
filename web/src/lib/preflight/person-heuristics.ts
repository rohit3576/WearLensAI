import type { PreflightCheck, PreflightContext } from "./checks";
import { lumaStdDev, skinToneRatio } from "./image-stats";

const ASPECT_LIMIT = 3;
const LUMA_STD_DEV_FLOOR = 4;
const SKIN_RATIO_FLOOR = 0.02;

/**
 * Heuristic sanity checks for person photos — NOT person detection. The
 * skin-tone floor is deliberately low (2%) so it only catches graphics,
 * screenshots, and logos; genuine face/pose understanding is a model check
 * deferred to the budget unlock (Phase 3 Step 9 plug-in point).
 */
export const PERSON_CHECKS: readonly PreflightCheck[] = [
  {
    code: "aspect",
    reason:
      "aspect ratio looks wrong for a person photo; use a normal portrait or landscape shot (not a panorama or strip)",
    async passes(context: PreflightContext): Promise<boolean> {
      const ratio = context.width / context.height;
      return ratio <= ASPECT_LIMIT && ratio >= 1 / ASPECT_LIMIT;
    },
  },
  {
    code: "blank",
    reason: "image looks blank or flat; upload a real photo",
    async passes(context: PreflightContext): Promise<boolean> {
      return (await lumaStdDev(context.bytes)) >= LUMA_STD_DEV_FLOOR;
    },
  },
  {
    code: "skin",
    reason: "no skin tones detected; upload a photo where your face is visible",
    async passes(context: PreflightContext): Promise<boolean> {
      return (await skinToneRatio(context.bytes)) >= SKIN_RATIO_FLOOR;
    },
  },
];
