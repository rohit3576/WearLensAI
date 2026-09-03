import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { JobId, JobFailedError, JobNotFoundError, ResultNotReadyError } from "./engine";
import { StubEngine } from "./stub-engine";
import type { JobStatus, SubmitTryOn, TryOnResult } from "./engine";
import type { StubEngineConfig } from "./stub-engine";

const PERSON_WIDTH = 800;
const PERSON_HEIGHT = 1000;
const QUEUED_DELAY_MS = 100;
const PROCESSING_DELAY_MS = 200;

let inputDir: string;
let outputDir: string;
let input: SubmitTryOn;

function makeConfig(overrides: Partial<StubEngineConfig> = {}): StubEngineConfig {
  return {
    outputDir,
    queuedDelayMs: QUEUED_DELAY_MS,
    processingDelayMs: PROCESSING_DELAY_MS,
    failureMode: "never",
    resultUrlPrefix: "/api/results/",
    ...overrides,
  };
}

/** Real timers captured at import — fake timers must not block sharp's real work. */
const realSetTimeout = globalThis.setTimeout;

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    realSetTimeout(resolve, ms);
  });
}

/** Advance the fake clock in small ticks until the job is done or failed. */
async function settleToTerminal(engine: StubEngine, jobId: JobId): Promise<JobStatus> {
  for (let tick = 0; tick < 200; tick++) {
    await vi.advanceTimersByTimeAsync(10);
    await realSleep(1);
    const status = await engine.status(jobId);
    if (status.phase === "done" || status.phase === "failed") return status;
  }
  throw new Error("engine did not reach a terminal phase");
}

beforeAll(async () => {
  inputDir = await mkdtemp(path.join(tmpdir(), "tryon-input-"));
  outputDir = await mkdtemp(path.join(tmpdir(), "tryon-output-"));
  const personPath = path.join(inputDir, "person.png");
  const garmentPath = path.join(inputDir, "garment.png");
  await sharp({
    create: { width: PERSON_WIDTH, height: PERSON_HEIGHT, channels: 3, background: "#7890a0" },
  })
    .png()
    .toFile(personPath);
  await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#c85050" },
  })
    .png()
    .toFile(garmentPath);
  input = { personUrl: personPath, garmentUrl: garmentPath };
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StubEngine", () => {
  it("returns a queued job immediately on submit", async () => {
    const engine = new StubEngine(makeConfig());

    const jobId = await engine.submit(input);
    const status = await engine.status(jobId);

    expect(status).toStrictEqual({ phase: "queued" });
  });

  it("moves queued → processing only after the configured queued delay", async () => {
    const engine = new StubEngine(makeConfig());
    const jobId = await engine.submit(input);

    await vi.advanceTimersByTimeAsync(QUEUED_DELAY_MS - 1);
    expect(await engine.status(jobId)).toStrictEqual({ phase: "queued" });

    await vi.advanceTimersByTimeAsync(1);
    expect(await engine.status(jobId)).toStrictEqual({ phase: "processing" });
  });

  it("reaches done with a composite result after the processing delay", async () => {
    const engine = new StubEngine(makeConfig());

    const jobId = await engine.submit(input);
    const status = await settleToTerminal(engine, jobId);

    expect(status.phase).toBe("done");
    if (status.phase !== "done") throw new Error("unreachable");
    expect(status.resultUrl).toBe(`/api/results/${jobId}.png`);

    const written = sharp(path.join(outputDir, `${jobId}.png`));
    const meta = await written.metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(PERSON_WIDTH);
    expect(meta.height).toBe(PERSON_HEIGHT);
  });

  it("result() echoes the input urls once the job is done", async () => {
    const engine = new StubEngine(makeConfig());
    const jobId = await engine.submit(input);
    await settleToTerminal(engine, jobId);

    const result: TryOnResult = await engine.result(jobId);

    expect(result).toStrictEqual({
      personUrl: input.personUrl,
      garmentUrl: input.garmentUrl,
      resultUrl: `/api/results/${jobId}.png`,
    });
  });

  it("lets each engine follow its own delay config", async () => {
    const slow = new StubEngine(makeConfig());
    const fast = new StubEngine(
      makeConfig({ queuedDelayMs: 10, processingDelayMs: 20 }),
    );
    const slowId = await slow.submit(input);
    const fastId = await fast.submit(input);

    await vi.advanceTimersByTimeAsync(15);
    expect(await slow.status(slowId)).toStrictEqual({ phase: "queued" });
    expect(await fast.status(fastId)).toStrictEqual({ phase: "processing" });

    await vi.advanceTimersByTimeAsync(90);
    expect(await slow.status(slowId)).toStrictEqual({ phase: "processing" });
    const fastStatus = await settleToTerminal(fast, fastId);
    if (fastStatus.phase !== "done") throw new Error("fast engine should be done");
    expect(fastStatus.resultUrl).toBe(`/api/results/${fastId}.png`);
  });

  it("lands in failed with a reason when failure is injected", async () => {
    const engine = new StubEngine(makeConfig({ failureMode: "always" }));

    const jobId = await engine.submit(input);
    const status = await settleToTerminal(engine, jobId);

    expect(status.phase).toBe("failed");
    if (status.phase !== "failed") throw new Error("unreachable");
    expect(status.reason.length).toBeGreaterThan(0);
    await expect(engine.result(jobId)).rejects.toBeInstanceOf(JobFailedError);
  });

  it("rejects result() with ResultNotReadyError while queued or processing", async () => {
    const engine = new StubEngine(makeConfig());
    const jobId = await engine.submit(input);

    const queuedError = await engine.result(jobId).catch((error: unknown) => error);
    expect(queuedError).toBeInstanceOf(ResultNotReadyError);
    if (!(queuedError instanceof ResultNotReadyError)) throw new Error("unreachable");
    expect(queuedError.phase).toBe("queued");

    await vi.advanceTimersByTimeAsync(QUEUED_DELAY_MS);
    const processingError = await engine.result(jobId).catch((error: unknown) => error);
    expect(processingError).toBeInstanceOf(ResultNotReadyError);
    if (!(processingError instanceof ResultNotReadyError)) throw new Error("unreachable");
    expect(processingError.phase).toBe("processing");
  });

  it("fails the job with a reason when the person image is unreadable", async () => {
    const engine = new StubEngine(makeConfig());
    const jobId = await engine.submit({
      personUrl: path.join(inputDir, "missing.png"),
      garmentUrl: input.garmentUrl,
    });

    const status = await settleToTerminal(engine, jobId);

    expect(status.phase).toBe("failed");
  });

  it("rejects status()/result() for an unknown job with JobNotFoundError", async () => {
    const engine = new StubEngine(makeConfig());
    const unknownId = JobId("00000000-0000-4000-8000-000000000000");

    await expect(engine.status(unknownId)).rejects.toBeInstanceOf(JobNotFoundError);
    await expect(engine.result(unknownId)).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it("produces byte-identical composites for identical inputs", async () => {
    const engine = new StubEngine(makeConfig());
    const firstId = await engine.submit(input);
    const secondId = await engine.submit(input);
    await settleToTerminal(engine, firstId);
    await settleToTerminal(engine, secondId);

    const first = await sharp(path.join(outputDir, `${firstId}.png`)).png().toBuffer();
    const second = await sharp(path.join(outputDir, `${secondId}.png`)).png().toBuffer();

    expect(first.equals(second)).toBe(true);
  });

  it("emits onStatus for each post-submit transition in order", async () => {
    const events: string[] = [];
    const engine = new StubEngine(
      makeConfig({
        onStatus: async (_jobId, status) => {
          events.push(status.phase);
        },
      }),
    );

    const jobId = await engine.submit(input);
    await settleToTerminal(engine, jobId);

    expect(events).toStrictEqual(["processing", "done"]);
  });

  it("emits onStatus with failed when failure is injected", async () => {
    const events: JobStatus[] = [];
    const engine = new StubEngine(
      makeConfig({
        failureMode: "always",
        onStatus: (_jobId, status) => {
          events.push(status);
        },
      }),
    );

    const jobId = await engine.submit(input);
    await settleToTerminal(engine, jobId);

    expect(events).toStrictEqual([{ phase: "processing" }, { phase: "failed", reason: expect.any(String) }]);
  });

  it("reads inputs through resolveInputPath when configured", async () => {
    let resolvedPerson = "";
    const engine = new StubEngine(
      makeConfig({
        resolveInputPath: (url) => {
          if (url === "/api/files/abc.png") {
            resolvedPerson = url;
            return input.personUrl;
          }
          return url;
        },
      }),
    );

    const jobId = await engine.submit({
      personUrl: "/api/files/abc.png",
      garmentUrl: input.garmentUrl,
    });
    const status = await settleToTerminal(engine, jobId);

    expect(status.phase).toBe("done");
    expect(resolvedPerson).toBe("/api/files/abc.png");
  });
});
