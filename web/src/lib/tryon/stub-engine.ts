/**
 * StubEngine — the $0 dev engine. Real sharp compositing (person base +
 * tinted garment overlay at a fixed torso position), deterministic output,
 * and a configurable queued→processing→done lifecycle so the SSE stream
 * (Phase 3 Step 4) has something observable to show.
 *
 * Input URLs are treated as local filesystem paths until the Storage seam
 * lands in Step 3. Job state is in-memory until the JobStore seam in Step 4.
 */
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  JobFailedError,
  JobId,
  JobNotFoundError,
  ResultNotReadyError,
} from "./engine";
import type { JobStatus, SubmitTryOn, TryOnEngine, TryOnResult } from "./engine";

export interface StubEngineConfig {
  /** Directory the composite PNGs are written to (created on demand). */
  readonly outputDir: string;
  /** Time in "queued" before flipping to "processing". */
  readonly queuedDelayMs: number;
  /** Time in "processing" before compositing (or failing). */
  readonly processingDelayMs: number;
  /** Failure injection for the failed-phase path. */
  readonly failureMode: "never" | "always";
  /** Prefix for returned result URLs (a route mounts here in Step 4). */
  readonly resultUrlPrefix: string;
  /** Maps engine-input URLs to readable paths (dev wiring; identity default). */
  readonly resolveInputPath?: (url: string) => string;
  /** Deploy wiring: hand the composite PNG to external storage, return its URL. */
  readonly storeResult?: (png: Buffer) => Promise<string>;
  /** Deploy wiring: keep the lifecycle alive past the response (e.g. waitUntil). */
  readonly background?: (task: Promise<void>) => void;
  /** Observes post-submit transitions: processing, done, failed (not queued). */
  readonly onStatus?: (jobId: JobId, status: JobStatus) => void | Promise<void>;
}

export const defaultStubConfig: StubEngineConfig = {
  outputDir: ".data/tryon",
  queuedDelayMs: 500,
  processingDelayMs: 2_500,
  failureMode: "never",
  resultUrlPrefix: "/api/results/",
};

const STUB_TINT = "#5a7d9a" as const;
const GARMENT_WIDTH_RATIO = 0.4;
const GARMENT_TOP_RATIO = 0.35;
const STUB_FAILURE_REASON = "stub failure injection (StubEngineConfig.failureMode)";

/** A submitted job and its mutable lifecycle state (accumulator by design). */
interface StubJob {
  readonly input: SubmitTryOn;
  status: JobStatus;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class StubEngine implements TryOnEngine {
  private readonly jobs = new Map<JobId, StubJob>();

  constructor(private readonly config: StubEngineConfig) {}

  async submit(input: SubmitTryOn): Promise<JobId> {
    const jobId = JobId(randomUUID());
    const job: StubJob = { input, status: { phase: "queued" } };
    this.jobs.set(jobId, job);
    const task = this.runLifecycle(jobId, job);
    if (this.config.background !== undefined) {
      this.config.background(task);
    } else {
      void task;
    }
    return jobId;
  }

  async status(jobId: JobId): Promise<JobStatus> {
    const job = this.requireJob(jobId);
    const { ...status } = job.status;
    return status;
  }

  async result(jobId: JobId): Promise<TryOnResult> {
    const job = this.requireJob(jobId);
    switch (job.status.phase) {
      case "done":
        return {
          personUrl: job.input.personUrl,
          garmentUrl: job.input.garmentUrl,
          resultUrl: job.status.resultUrl,
        };
      case "failed":
        throw new JobFailedError(job.status.reason);
      case "queued":
      case "processing":
        throw new ResultNotReadyError(job.status.phase);
    }
  }

  private async runLifecycle(jobId: JobId, job: StubJob): Promise<void> {
    await sleep(this.config.queuedDelayMs);
    job.status = { phase: "processing" };
    await this.config.onStatus?.(jobId, job.status);
    await sleep(this.config.processingDelayMs);
    if (this.config.failureMode === "always") {
      job.status = { phase: "failed", reason: STUB_FAILURE_REASON };
      await this.config.onStatus?.(jobId, job.status);
      return;
    }
    try {
      const resultUrl = await this.composite(jobId, job.input);
      job.status = { phase: "done", resultUrl };
      await this.config.onStatus?.(jobId, job.status);
    } catch (error) {
      job.status = {
        phase: "failed",
        reason: error instanceof Error ? error.message : String(error),
      };
      await this.config.onStatus?.(jobId, job.status);
    }
  }

  /**
   * Inputs reach sharp as filesystem paths (dev), fetched Buffers (deploy:
   * http(s) URLs such as R2), or the raw string as-is (identity default).
   */
  private async inputSource(url: string): Promise<string | Buffer> {
    if (this.config.resolveInputPath !== undefined) {
      return this.config.resolveInputPath(url);
    }
    if (/^https?:/.test(url)) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`failed to fetch input image ${url}: HTTP ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    }
    return url;
  }

  private async composite(jobId: JobId, input: SubmitTryOn): Promise<string> {
    const person = await this.inputSource(input.personUrl);
    const garment = await this.inputSource(input.garmentUrl);
    const meta = await sharp(person).metadata();
    if (meta.width === undefined || meta.height === undefined) {
      throw new Error(`cannot read dimensions of person image ${input.personUrl}`);
    }
    const garmentWidth = Math.round(meta.width * GARMENT_WIDTH_RATIO);
    const garmentOverlay = await sharp(garment)
      .resize(garmentWidth)
      .tint(STUB_TINT)
      .png()
      .toBuffer();
    const composite = sharp(person)
      .composite([
        {
          input: garmentOverlay,
          left: Math.round((meta.width - garmentWidth) / 2),
          top: Math.round(meta.height * GARMENT_TOP_RATIO),
        },
      ])
      .png();
    if (this.config.storeResult !== undefined) {
      return this.config.storeResult(await composite.toBuffer());
    }
    await mkdir(this.config.outputDir, { recursive: true });
    const fileName = `${jobId}.png`;
    await composite.toFile(path.join(this.config.outputDir, fileName));
    return `${this.config.resultUrlPrefix}${fileName}`;
  }

  private requireJob(jobId: JobId): StubJob {
    const job = this.jobs.get(jobId);
    if (job === undefined) throw new JobNotFoundError(jobId);
    return job;
  }
}
