/**
 * Preflight seam — deterministic sanity checks that run before any API
 * credit could be spent (Phase 4). Model-based understanding (one person,
 * clothing detected) plugs into this same registry at the budget unlock.
 */
import type { UploadRole } from "../upload-rules";
import { GARMENT_CHECKS } from "./garment-heuristics";
import { PERSON_CHECKS } from "./person-heuristics";

export const PREFLIGHT_CODES = ["aspect", "blank", "skin", "transparent"] as const;

export type PreflightCode = (typeof PREFLIGHT_CODES)[number];

export interface PreflightRejection {
  readonly code: PreflightCode;
  readonly reason: string;
}

export type PreflightResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly rejection: PreflightRejection };

export interface PreflightContext {
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
  readonly contentType: string;
}

export interface PreflightCheck {
  readonly code: PreflightCode;
  readonly reason: string;
  passes(context: PreflightContext): Promise<boolean>;
}

const CHECKS_BY_ROLE: Record<UploadRole, readonly PreflightCheck[]> = {
  person: PERSON_CHECKS,
  garment: GARMENT_CHECKS,
};

/** First failing check wins; every check of the role runs in order. */
export async function runPreflight(
  role: UploadRole,
  context: PreflightContext,
): Promise<PreflightResult> {
  for (const check of CHECKS_BY_ROLE[role]) {
    if (!(await check.passes(context))) {
      return { ok: false, rejection: { code: check.code, reason: check.reason } };
    }
  }
  return { ok: true };
}
