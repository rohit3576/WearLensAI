/**
 * JobStore seam — persistent try-on job rows. SqliteJobStore (dev: a single
 * file under web/.data, zero setup) and NeonJobStore (deploy: Neon Postgres
 * free tier over the serverless HTTP driver). Selection: TRYON_JOBS env
 * (default "sqlite") via resolveJobStore. Fields per plan: id, status,
 * person_url, garment_url, result_url, created_at, completed_at (no users
 * table).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { JobId, JobStatus, SubmitTryOn } from "./engine";
import { NeonJobStore, neonQueryFromEnv } from "./neon-job-store";

export interface StoredJob {
  readonly id: string;
  readonly phase: "queued" | "processing" | "done" | "failed";
  readonly personUrl: string;
  readonly garmentUrl: string;
  readonly resultUrl: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface JobStore {
  create(jobId: JobId, input: SubmitTryOn): Promise<void>;
  update(jobId: JobId, status: JobStatus): Promise<void>;
  get(jobId: JobId): Promise<StoredJob | null>;
}

export interface SqliteJobStoreConfig {
  readonly dbPath: string;
}

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

function sqlValueToString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export class SqliteJobStore implements JobStore {
  readonly dbPath: string;
  private readonly db: DatabaseSync;

  constructor(config: SqliteJobStoreConfig) {
    this.dbPath = config.dbPath;
    mkdirSync(path.dirname(config.dbPath), { recursive: true });
    this.db = new DatabaseSync(config.dbPath);
    this.db.exec(CREATE_TABLE);
  }

  async create(jobId: JobId, input: SubmitTryOn): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO tryon_jobs (id, phase, person_url, garment_url, created_at) VALUES (?, 'queued', ?, ?, ?)",
      )
      .run(jobId, input.personUrl, input.garmentUrl, new Date().toISOString());
  }

  async update(jobId: JobId, status: JobStatus): Promise<void> {
    switch (status.phase) {
      case "queued":
        this.db
          .prepare("UPDATE tryon_jobs SET phase = 'queued' WHERE id = ?")
          .run(jobId);
        return;
      case "processing":
        this.db
          .prepare("UPDATE tryon_jobs SET phase = 'processing' WHERE id = ?")
          .run(jobId);
        return;
      case "done":
        this.db
          .prepare(
            "UPDATE tryon_jobs SET phase = 'done', result_url = ?, completed_at = ? WHERE id = ?",
          )
          .run(status.resultUrl, new Date().toISOString(), jobId);
        return;
      case "failed":
        this.db
          .prepare(
            "UPDATE tryon_jobs SET phase = 'failed', reason = ?, completed_at = ? WHERE id = ?",
          )
          .run(status.reason, new Date().toISOString(), jobId);
        return;
    }
  }

  async get(jobId: JobId): Promise<StoredJob | null> {
    const row = this.db
      .prepare("SELECT * FROM tryon_jobs WHERE id = ?")
      .get(jobId) as Record<string, unknown> | undefined;
    if (row === undefined) return null;
    const phase = sqlValueToString(row["phase"]);
    const personUrl = sqlValueToString(row["person_url"]);
    const garmentUrl = sqlValueToString(row["garment_url"]);
    const createdAt = sqlValueToString(row["created_at"]);
    if (phase === null || personUrl === null || garmentUrl === null || createdAt === null) {
      throw new Error(`corrupt job row for ${jobId}`);
    }
    return {
      id: jobId,
      phase: phase as StoredJob["phase"],
      personUrl,
      garmentUrl,
      resultUrl: sqlValueToString(row["result_url"]),
      reason: sqlValueToString(row["reason"]),
      createdAt,
      completedAt: sqlValueToString(row["completed_at"]),
    };
  }

  async clear(): Promise<void> {
    this.db.exec("DELETE FROM tryon_jobs");
  }
}

const JobStoreNameSchema = z.enum(["sqlite", "neon"]).default("sqlite");

/**
 * Resolve the job store from the environment. A typo in TRYON_JOBS fails
 * loudly (ZodError) instead of silently downgrading; neon additionally
 * requires DATABASE_URL (see neonQueryFromEnv).
 */
export function resolveJobStore(
  env: Readonly<Record<string, string | undefined>>,
  sqliteConfig: SqliteJobStoreConfig,
): JobStore {
  const name = JobStoreNameSchema.parse(env["TRYON_JOBS"]);
  switch (name) {
    case "sqlite":
      return new SqliteJobStore(sqliteConfig);
    case "neon":
      return new NeonJobStore(neonQueryFromEnv(env));
    default: {
      const exhausted: never = name;
      throw new Error(`unexpected job store name: ${String(exhausted)}`);
    }
  }
}
