/**
 * NeonJobStore — the deploy JobStore (Neon Postgres free tier over the
 * serverless HTTP driver: no persistent connection, one fetch per query).
 *
 * Same tryon_jobs schema and row semantics as SqliteJobStore; selected via
 * TRYON_JOBS=neon (resolveJobStore in job-store.ts). The driver is injected
 * as a QueryExecutor so unit tests run offline against an in-memory fake —
 * the real Neon path is exercised by the Step 8 deploy verification.
 */
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import type { JobId, JobStatus, SubmitTryOn } from "./engine";
import type { JobStore, StoredJob } from "./job-store";

/** One parameterized statement against Postgres; returns rows as objects. */
export type QueryExecutor = (
  query: string,
  params: readonly unknown[],
) => Promise<ReadonlyArray<Record<string, unknown>>>;

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS tryon_jobs (
    id TEXT PRIMARY KEY,
    phase TEXT NOT NULL,
    person_url TEXT NOT NULL,
    garment_url TEXT NOT NULL,
    result_url TEXT,
    reason TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  )
` as const;

function rowToString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export class NeonJobStore implements JobStore {
  private schemaOnce: Promise<void> | undefined;

  constructor(private readonly query: QueryExecutor) {}

  /** CREATE TABLE once per store instance; failures surface on first use. */
  private ensureSchema(): Promise<void> {
    this.schemaOnce ??= this.query(CREATE_TABLE, []).then(() => undefined);
    return this.schemaOnce;
  }

  async create(jobId: JobId, input: SubmitTryOn): Promise<void> {
    await this.ensureSchema();
    await this.query(
      "INSERT INTO tryon_jobs (id, phase, person_url, garment_url, created_at) VALUES ($1, 'queued', $2, $3, $4)",
      [jobId, input.personUrl, input.garmentUrl, new Date().toISOString()],
    );
  }

  async update(jobId: JobId, status: JobStatus): Promise<void> {
    switch (status.phase) {
      case "queued":
        await this.query("UPDATE tryon_jobs SET phase = 'queued' WHERE id = $1", [jobId]);
        return;
      case "processing":
        await this.query("UPDATE tryon_jobs SET phase = 'processing' WHERE id = $1", [jobId]);
        return;
      case "done":
        await this.query(
          "UPDATE tryon_jobs SET phase = 'done', result_url = $1, completed_at = $2 WHERE id = $3",
          [status.resultUrl, new Date().toISOString(), jobId],
        );
        return;
      case "failed":
        await this.query(
          "UPDATE tryon_jobs SET phase = 'failed', reason = $1, completed_at = $2 WHERE id = $3",
          [status.reason, new Date().toISOString(), jobId],
        );
        return;
    }
  }

  async get(jobId: JobId): Promise<StoredJob | null> {
    await this.ensureSchema();
    const rows = await this.query("SELECT * FROM tryon_jobs WHERE id = $1", [jobId]);
    const row = rows[0];
    if (row === undefined) return null;
    const phase = rowToString(row["phase"]);
    const personUrl = rowToString(row["person_url"]);
    const garmentUrl = rowToString(row["garment_url"]);
    const createdAt = rowToString(row["created_at"]);
    if (phase === null || personUrl === null || garmentUrl === null || createdAt === null) {
      throw new Error(`corrupt job row for ${jobId}`);
    }
    return {
      id: jobId,
      phase: phase as StoredJob["phase"],
      personUrl,
      garmentUrl,
      resultUrl: rowToString(row["result_url"]),
      reason: rowToString(row["reason"]),
      createdAt,
      completedAt: rowToString(row["completed_at"]),
    };
  }

  /** Deploy verification helper (parity with SqliteJobStore.clear). */
  async clear(): Promise<void> {
    await this.ensureSchema();
    await this.query("DELETE FROM tryon_jobs", []);
  }
}

/**
 * Build the production executor from the environment. A missing or empty
 * DATABASE_URL fails loudly (ZodError) instead of silently downgrading.
 */
export function neonQueryFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): QueryExecutor {
  const connectionString = z
    .string()
    .min(1, "DATABASE_URL is required when TRYON_JOBS=neon (Neon connection string)")
    .parse(env["DATABASE_URL"]);
  const sql = neon(connectionString);
  return (query, params) => sql.query(query, [...params]);
}
