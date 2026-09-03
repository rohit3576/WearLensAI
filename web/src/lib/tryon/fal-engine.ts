/**
 * FalEngine — DEFERRED to Phase 3 Step 9 (unlock: API budget).
 *
 * The request schemas below are ported 1:1 from the verified Python adapters
 * (`ai/adapters/fashn_v16.py`, `ai/adapters/flux_vto.py`, schema-verified
 * 2026-09-01 against the fal.ai API docs), so the live implementation is
 * copy-precise, not guesswork. The engine picks the Phase 1 benchmark winner.
 *
 * Implementation checklist when budget returns:
 * 1. REST via the fal queue API (POST submit → poll/stream → result), FAL_KEY env.
 * 2. Map queue states onto JobStatus; map API errors onto JobFailedError.
 * 3. Serve images as URLs (never base64) per the house rules.
 * 4. Flip TRYON_ENGINE=fal; verify upload → result end-to-end < 30 s.
 */
import { EngineNotImplementedError, JobId } from "./engine";
import type { JobStatus, SubmitTryOn, TryOnEngine, TryOnResult } from "./engine";

export const FASHN_V1_6_MODEL_ID = "fal-ai/fashn/tryon/v1.6" as const;
/** $0.075 per generation; response: `{ images: [{ url }] }` (CDN, ~3 days). */
export interface FashnV16Request {
  readonly model_image: string;
  readonly garment_image: string;
}

export const FLUX_VTO_MODEL_ID = "fal-ai/flux-pro/v1/vto" as const;
/**
 * Per-megapixel pricing (~$0.0475 at 1 MP). Limits: human <= 2 MP,
 * garment <= 1 MP. Response: `{ images: [{ url, width, height }], seed,
 * prompt, has_nsfw_concepts, timings }`.
 */
export interface FluxVtoRequest {
  readonly prompt: string;
  readonly human_image_url: string;
  readonly garment_image_url: string;
}

export const FLUX_DEFAULT_PROMPT =
  "A natural front-facing studio photo of the person wearing the garment." as const;

/** Placeholder until Step 9 — construction succeeds, every call fails typed. */
export class FalEngine implements TryOnEngine {
  async submit(_input: SubmitTryOn): Promise<JobId> {
    throw new EngineNotImplementedError("fal");
  }

  async status(_jobId: JobId): Promise<JobStatus> {
    throw new EngineNotImplementedError("fal");
  }

  async result(_jobId: JobId): Promise<TryOnResult> {
    throw new EngineNotImplementedError("fal");
  }
}
