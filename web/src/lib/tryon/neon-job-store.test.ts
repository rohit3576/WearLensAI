import { describe, expect, it } from "vitest";
import { JobId } from "./engine";
import type { QueryExecutor } from "./neon-job-store";
import { NeonJobStore } from "./neon-job-store";

/**
 * In-memory fake over the exact SQL NeonJobStore issues — the deploy twin of
 * job-store.test.ts's real-file sqlite tests. The fake interprets the SQL
 * text (prefix + $N placeholders); if the implementation's statements drift,
 * the fake throws "unhandled query" and the test fails.
 */
interface JobRow {
  id: string;
  phase: string;
  person_url: string;
  garment_url: string;
  result_url: string | null;
  reason: string | null;
  created_at: string;
  completed_at: string | null;
  [column: string]: string | null;
}

function makeFakeDb(): { rows: JobRow[]; queries: { query: string; params: unknown[] }[]; exec: QueryExecutor } {
  const rows: JobRow[] = [];
  const queries: { query: string; params: unknown[] }[] = [];
  const exec: QueryExecutor = async (rawQuery, params) => {
    const query = rawQuery.trimStart();
    queries.push({ query, params: [...params] });
    if (query.startsWith("CREATE TABLE")) return [];
    if (query.startsWith("INSERT INTO tryon_jobs")) {
      const [id, personUrl, garmentUrl, createdAt] = params as [string, string, string, string];
      rows.push({
        id,
        phase: "queued",
        person_url: personUrl,
        garment_url: garmentUrl,
        result_url: null,
        reason: null,
        created_at: createdAt,
        completed_at: null,
      });
      return [];
    }
    if (query.startsWith("UPDATE tryon_jobs SET phase = 'queued'")) {
      return [];
    }
    if (query.startsWith("UPDATE tryon_jobs SET phase = 'processing'")) {
      const row = rows.find((r) => r.id === params[0]);
      if (row !== undefined) row.phase = "processing";
      return [];
    }
    if (query.startsWith("UPDATE tryon_jobs SET phase = 'done'")) {
      const [resultUrl, completedAt, id] = params as [string, string, string];
      const row = rows.find((r) => r.id === id);
      if (row !== undefined) {
        row.phase = "done";
        row.result_url = resultUrl;
        row.completed_at = completedAt;
      }
      return [];
    }
    if (query.startsWith("UPDATE tryon_jobs SET phase = 'failed'")) {
      const [reason, completedAt, id] = params as [string, string, string];
      const row = rows.find((r) => r.id === id);
      if (row !== undefined) {
        row.phase = "failed";
        row.reason = reason;
        row.completed_at = completedAt;
      }
      return [];
    }
    if (query.startsWith("SELECT * FROM tryon_jobs")) {
      const row = rows.find((r) => r.id === params[0]);
      return row === undefined ? [] : [row];
    }
    throw new Error(`fake executor: unhandled query: ${query}`);
  };
  return { rows, queries, exec };
}

const input = { personUrl: "/api/files/p.png", garmentUrl: "/api/files/g.png" };

describe("NeonJobStore", () => {
  it("lazily ensures the schema exactly once, then creates a queued row readable via get()", async () => {
    const db = makeFakeDb();
    const store = new NeonJobStore(db.exec);

    await store.create(JobId("11111111-1111-4111-8111-111111111111"), input);
    await store.create(JobId("22222222-2222-4222-8222-222222222222"), input);

    const creates = db.queries.filter((q) => q.query.startsWith("CREATE TABLE"));
    expect(creates).toHaveLength(1);

    const job = await store.get(JobId("11111111-1111-4111-8111-111111111111"));
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
    const store = new NeonJobStore(makeFakeDb().exec);
    expect(await store.get(JobId("00000000-0000-4000-8000-000000000000"))).toBeNull();
  });

  it("persists the done transition with result URL and completion time", async () => {
    const db = makeFakeDb();
    const store = new NeonJobStore(db.exec);
    const jobId = JobId("33333333-3333-4333-8333-333333333333");
    await store.create(jobId, input);

    await store.update(jobId, { phase: "done", resultUrl: "https://pub-x.r2.dev/uploads/a.png" });

    const job = await store.get(jobId);
    if (job === null) throw new Error("job missing after update");
    expect(job.phase).toBe("done");
    expect(job.resultUrl).toBe("https://pub-x.r2.dev/uploads/a.png");
    expect(job.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("persists the failed transition with its reason", async () => {
    const db = makeFakeDb();
    const store = new NeonJobStore(db.exec);
    const jobId = JobId("44444444-4444-4444-8444-444444444444");
    await store.create(jobId, input);

    await store.update(jobId, { phase: "processing" });
    await store.update(jobId, { phase: "failed", reason: "stub failure injection" });

    const job = await store.get(jobId);
    if (job === null) throw new Error("job missing after update");
    expect(job.phase).toBe("failed");
    expect(job.reason).toBe("stub failure injection");
    expect(job.completedAt).not.toBeNull();
  });

  it("keeps no state of its own — a second store over the same database sees the row", async () => {
    const db = makeFakeDb();
    const first = new NeonJobStore(db.exec);
    const jobId = JobId("55555555-5555-4555-8555-555555555555");
    await first.create(jobId, input);
    await first.update(jobId, { phase: "done", resultUrl: "https://pub-x.r2.dev/uploads/b.png" });

    const second = new NeonJobStore(db.exec);
    const job = await second.get(jobId);

    expect(job?.resultUrl).toBe("https://pub-x.r2.dev/uploads/b.png");
  });

  it("throws a corrupt-row error when a required column comes back null", async () => {
    const db = makeFakeDb();
    const store = new NeonJobStore(db.exec);
    const jobId = JobId("66666666-6666-4666-8666-666666666666");
    await store.create(jobId, input);
    const row = db.rows[0];
    if (row === undefined) throw new Error("row missing");
    row.person_url = null as unknown as string;

    await expect(store.get(jobId)).rejects.toThrow(/corrupt job row/);
  });
});
