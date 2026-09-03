/**
 * Pure tool handlers for the WearLensAI MCP surface. Each mirrors the web
 * app's pipeline exactly — read → window validation → role preflight →
 * storage → engine — so rejections carry the same actionable copy as the
 * web 422s. Handlers return plain results; server.ts wraps them into MCP
 * tool responses.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { validateUploadImage } from "../src/lib/image-validation";
import { ImageValidationError } from "../src/lib/image-validation";
import { getRuntime } from "../src/lib/runtime";
import { runPreflight } from "../src/lib/preflight/checks";
import { JobId } from "../src/lib/tryon/engine";
import type { UploadRole } from "../src/lib/upload-rules";

export const SubmitParamsSchema = z.object({
  person_path: z.string().min(1),
  garment_path: z.string().min(1),
});
export const JobIdParamsSchema = z.object({ job_id: z.string().min(1) });

export type SubmitResult =
  | { readonly ok: true; readonly jobId: string }
  | { readonly ok: false; readonly reason: string; readonly code?: string };

export type StatusResult =
  | { readonly ok: true; readonly phase: string; readonly resultUrl?: string; readonly reason?: string }
  | { readonly ok: false; readonly reason: string };

export type ResultOutcome =
  | { readonly ok: true; readonly resultPath: string; readonly resultUrl: string }
  | { readonly ok: false; readonly reason: string };

const RESULT_URL_PREFIX = "/api/results/" as const;

type InputOutcome =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: string; readonly code?: string };

async function readInput(filePath: string, role: UploadRole): Promise<InputOutcome> {
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { ok: false, reason: `cannot read ${filePath}` };
    }
    throw error;
  }
  let validated;
  try {
    validated = await validateUploadImage({ bytes, fileName: path.basename(filePath) });
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
  const preflight = await runPreflight(role, {
    bytes: validated.bytes,
    width: validated.width,
    height: validated.height,
    contentType: validated.contentType,
  });
  if (!preflight.ok) {
    return { ok: false, reason: preflight.rejection.reason, code: preflight.rejection.code };
  }
  const { storage } = getRuntime();
  const url = await storage.put({
    bytes: validated.bytes,
    contentType: validated.contentType,
    role,
  });
  return { ok: true, url };
}

export async function submitTryOn(raw: unknown): Promise<SubmitResult> {
  const params = SubmitParamsSchema.parse(raw);
  const person = await readInput(params.person_path, "person");
  if (!person.ok) return person;
  const garment = await readInput(params.garment_path, "garment");
  if (!garment.ok) return garment;

  const { engine } = getRuntime();
  const jobId = await engine.submit({ personUrl: person.url, garmentUrl: garment.url });
  return { ok: true, jobId };
}

export async function tryOnStatus(raw: unknown): Promise<StatusResult> {
  const params = JobIdParamsSchema.parse(raw);
  const { store } = getRuntime();
  const job = await store.get(JobId(params.job_id));
  if (job === null) {
    return { ok: false, reason: `job not found: ${params.job_id}` };
  }
  switch (job.phase) {
    case "queued":
    case "processing":
      return { ok: true, phase: job.phase };
    case "done":
      return {
        ok: true,
        phase: "done",
        ...(job.resultUrl === null ? {} : { resultUrl: job.resultUrl }),
      };
    case "failed":
      return {
        ok: true,
        phase: "failed",
        ...(job.reason === null ? {} : { reason: job.reason }),
      };
  }
}

export async function tryOnResult(raw: unknown): Promise<ResultOutcome> {
  const params = JobIdParamsSchema.parse(raw);
  const runtime = getRuntime();
  const job = await runtime.store.get(JobId(params.job_id));
  if (job === null) {
    return { ok: false, reason: `job not found: ${params.job_id}` };
  }
  if (job.phase !== "done" || job.resultUrl === null) {
    if (job.phase === "failed" && job.reason !== null) {
      return { ok: false, reason: `job failed: ${job.reason}` };
    }
    return { ok: false, reason: `job is ${job.phase}; result not ready` };
  }
  const name = job.resultUrl.slice(RESULT_URL_PREFIX.length);
  return {
    ok: true,
    resultPath: path.join(runtime.resultsDir, name),
    resultUrl: job.resultUrl,
  };
}
