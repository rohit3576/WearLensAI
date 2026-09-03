/**
 * TryOnEngine seam — the web app's single port for virtual try-on work.
 *
 * Implementations: StubEngine (dev, $0, real compositing, observable lifecycle)
 * and FalEngine (deferred to Phase 3 Step 9 with the API budget unlock).
 * Selection: `TRYON_ENGINE` env (default "stub") via `resolveEngine`.
 */
import { z } from "zod";
import { StubEngine, defaultStubConfig } from "./stub-engine";
import type { StubEngineConfig } from "./stub-engine";

declare const jobBrand: unique symbol;

/** A try-on job identifier. Never a raw string. */
export type JobId = string & { readonly [jobBrand]: "JobId" };

export function JobId(value: string): JobId {
  return value as JobId;
}

/** Inputs to a try-on job: stored image URLs from the upload flow. */
export interface SubmitTryOn {
  readonly personUrl: string;
  readonly garmentUrl: string;
}

/** All URLs the result page needs (person + garment echo, composite result). */
export interface TryOnResult {
  readonly personUrl: string;
  readonly garmentUrl: string;
  readonly resultUrl: string;
}

export const JOB_PHASES = ["queued", "processing", "done", "failed"] as const;

export type JobPhase = (typeof JOB_PHASES)[number];

export type JobStatus =
  | { readonly phase: "queued" }
  | { readonly phase: "processing" }
  | { readonly phase: "done"; readonly resultUrl: string }
  | { readonly phase: "failed"; readonly reason: string };

export interface TryOnEngine {
  submit(input: SubmitTryOn): Promise<JobId>;
  status(jobId: JobId): Promise<JobStatus>;
  result(jobId: JobId): Promise<TryOnResult>;
}

export class JobNotFoundError extends Error {
  readonly name = "JobNotFoundError";
  constructor(readonly jobId: JobId) {
    super(`try-on job ${jobId} not found`);
  }
}

/** result() was called while the job is still queued or processing. */
export class ResultNotReadyError extends Error {
  readonly name = "ResultNotReadyError";
  constructor(readonly phase: "queued" | "processing") {
    super(`try-on result not ready: job is ${phase}`);
  }
}

export class JobFailedError extends Error {
  readonly name = "JobFailedError";
  constructor(readonly reason: string) {
    super(`try-on job failed: ${reason}`);
  }
}

export class EngineNotImplementedError extends Error {
  readonly name = "EngineNotImplementedError";
  constructor(readonly engineName: string) {
    super(
      `try-on engine "${engineName}" is not implemented yet ` +
        "(see src/lib/tryon/fal-engine.ts for the deferred plan)",
    );
  }
}

const EngineNameSchema = z.enum(["stub", "fal"]).default("stub");

/**
 * Resolve the engine from the environment. A typo in TRYON_ENGINE fails
 * loudly (ZodError) instead of silently downgrading.
 */
export function resolveEngine(
  env: Readonly<Record<string, string | undefined>>,
  stubConfig: StubEngineConfig = defaultStubConfig,
): TryOnEngine {
  const name = EngineNameSchema.parse(env["TRYON_ENGINE"]);
  switch (name) {
    case "stub":
      return new StubEngine(stubConfig);
    case "fal":
      throw new EngineNotImplementedError(name);
    default: {
      const exhausted: never = name;
      throw new Error(`unexpected engine name: ${String(exhausted)}`);
    }
  }
}
