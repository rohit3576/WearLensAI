/**
 * Runtime composition root — one memoized bundle per server process:
 * storage (uploads), job store (sqlite rows), and the tracking-wrapped
 * engine (store.create on submit, store.update on each transition).
 *
 * Dev wiring: StubEngine inputs resolve /api/files URLs to local paths via
 * LocalStorage.pathOf. Vitest isolates module state per test file, so each
 * file gets its own runtime against its own TRYON_DATA_DIR.
 */
import path from "node:path";
import { LocalStorage, resolveStorage } from "./storage";
import type { Storage } from "./storage";
import { resolveEngine } from "./tryon/engine";
import type { JobId, SubmitTryOn, TryOnEngine, TryOnResult } from "./tryon/engine";
import type { JobStatus } from "./tryon/engine";
import { SqliteJobStore } from "./tryon/job-store";
import type { JobStore } from "./tryon/job-store";
import { defaultStubConfig } from "./tryon/stub-engine";
import type { StubEngineConfig } from "./tryon/stub-engine";

export interface Runtime {
  readonly engine: TryOnEngine;
  readonly storage: Storage;
  readonly store: JobStore;
  readonly resultsDir: string;
}

class TrackingEngine implements TryOnEngine {
  constructor(
    private readonly inner: TryOnEngine,
    private readonly store: JobStore,
  ) {}

  async submit(input: SubmitTryOn): Promise<JobId> {
    const jobId = await this.inner.submit(input);
    await this.store.create(jobId, input);
    return jobId;
  }

  async status(jobId: JobId): Promise<JobStatus> {
    return this.inner.status(jobId);
  }

  async result(jobId: JobId): Promise<TryOnResult> {
    return this.inner.result(jobId);
  }
}

function envInt(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function buildRuntime(env: Readonly<Record<string, string | undefined>>): Runtime {
  const root = env["TRYON_DATA_DIR"] ?? ".data";
  const storage = resolveStorage(env);
  const store = new SqliteJobStore({ dbPath: path.join(root, "jobs.db") });
  const resultsDir = path.join(root, "tryon");
  const stubConfig: StubEngineConfig = {
    ...defaultStubConfig,
    outputDir: resultsDir,
    queuedDelayMs: envInt(env, "TRYON_STUB_QUEUED_MS", defaultStubConfig.queuedDelayMs),
    processingDelayMs: envInt(env, "TRYON_STUB_PROCESSING_MS", defaultStubConfig.processingDelayMs),
    onStatus: (jobId, status) => store.update(jobId, status),
    ...(storage instanceof LocalStorage
      ? { resolveInputPath: (url: string) => storage.pathOf(url) }
      : {}),
  };
  return {
    engine: new TrackingEngine(resolveEngine(env, stubConfig), store),
    storage,
    store,
    resultsDir,
  };
}

let cached: Runtime | undefined;

export function getRuntime(): Runtime {
  cached ??= buildRuntime(process.env);
  return cached;
}
