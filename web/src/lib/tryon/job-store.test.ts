import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JobId } from "./engine";
import type { JobStatus } from "./engine";
import { SqliteJobStore } from "./job-store";
import type { StoredJob } from "./job-store";

let store: SqliteJobStore;

const input = { personUrl: "/api/files/p.png", garmentUrl: "/api/files/g.png" };

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "jobstore-"));
  store = new SqliteJobStore({ dbPath: path.join(dir, "jobs.db") });
});

beforeEach(async () => {
  await store.clear();
});

describe("SqliteJobStore", () => {
  it("creates a job row in the queued phase and reads it back", async () => {
    const jobId = JobId("11111111-1111-4111-8111-111111111111");

    await store.create(jobId, input);
    const job = await store.get(jobId);

    expect(job).not.toBeNull();
    if (job === null) throw new Error("unreachable");
    expect(job.phase).toBe("queued");
    expect(job.personUrl).toBe(input.personUrl);
    expect(job.garmentUrl).toBe(input.garmentUrl);
    expect(job.resultUrl).toBeNull();
    expect(job.reason).toBeNull();
    expect(job.completedAt).toBeNull();
    expect(job.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns null for an unknown job", async () => {
    expect(await store.get(JobId("00000000-0000-4000-8000-000000000000"))).toBeNull();
  });

  it("persists the done transition with result URL and completion time", async () => {
    const jobId = JobId("22222222-2222-4222-8222-222222222222");
    await store.create(jobId, input);

    const done: JobStatus = { phase: "done", resultUrl: "/api/results/x.png" };
    await store.update(jobId, done);

    const job = await store.get(jobId);
    if (job === null) throw new Error("job missing after update");
    expect(job.phase).toBe("done");
    expect(job.resultUrl).toBe("/api/results/x.png");
    expect(job.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("persists the failed transition with its reason", async () => {
    const jobId = JobId("33333333-3333-4333-8333-333333333333");
    await store.create(jobId, input);

    await store.update(jobId, { phase: "processing" });
    await store.update(jobId, { phase: "failed", reason: "stub failure injection" });

    const job = await store.get(jobId);
    if (job === null) throw new Error("job missing after update");
    expect(job.phase).toBe("failed");
    expect(job.reason).toBe("stub failure injection");
    expect(job.completedAt).not.toBeNull();
  });

  it("survives a store reopen (real persistence, not memory)", async () => {
    const jobId = JobId("44444444-4444-4444-8444-444444444444");
    await store.create(jobId, input);
    await store.update(jobId, { phase: "done", resultUrl: "/api/results/y.png" });
    const dbPath = store.dbPath;

    const reopened = new SqliteJobStore({ dbPath });
    const job: StoredJob | null = await reopened.get(jobId);

    expect(job?.resultUrl).toBe("/api/results/y.png");
  });
});
