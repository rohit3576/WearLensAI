import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolveJobStore } from "./tryon/job-store";
import { NeonJobStore } from "./tryon/neon-job-store";
import { SqliteJobStore } from "./tryon/job-store";
import { resolveStorage } from "./storage";
import { LocalStorage } from "./storage";
import { R2Storage } from "./r2-storage";

const sqliteDir = path.join(tmpdir(), "seams-");

const R2_ENV = {
  R2_ACCOUNT_ID: "acc",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
  R2_PUBLIC_BASE_URL: "https://pub-x.r2.dev",
} as const;

describe("resolveJobStore (TRYON_JOBS)", () => {
  it("defaults to SqliteJobStore when unset", async () => {
    const dir = await mkdtemp(sqliteDir);
    const store = resolveJobStore({}, { dbPath: path.join(dir, "jobs.db") });
    expect(store).toBeInstanceOf(SqliteJobStore);
  });

  it("flips to NeonJobStore when TRYON_JOBS=neon with DATABASE_URL set", () => {
    const store = resolveJobStore(
      { TRYON_JOBS: "neon", DATABASE_URL: "postgres://user:pass@host/db" },
      { dbPath: "/unused/jobs.db" },
    );
    expect(store).toBeInstanceOf(NeonJobStore);
  });

  it("fails loudly when neon is selected without DATABASE_URL", () => {
    expect(() =>
      resolveJobStore({ TRYON_JOBS: "neon" }, { dbPath: "/unused/jobs.db" }),
    ).toThrow(z.ZodError);
  });

  it("fails loudly on a typo instead of silently downgrading", () => {
    expect(() =>
      resolveJobStore({ TRYON_JOBS: "neonn" }, { dbPath: "/unused/jobs.db" }),
    ).toThrow(z.ZodError);
  });
});

describe("resolveStorage (TRYON_STORAGE)", () => {
  it("defaults to LocalStorage when unset", async () => {
    const dir = await mkdtemp(sqliteDir);
    const storage = resolveStorage({}, { rootDir: dir });
    expect(storage).toBeInstanceOf(LocalStorage);
  });

  it("flips to R2Storage when TRYON_STORAGE=r2 with the R2_* vars set", () => {
    const storage = resolveStorage({ TRYON_STORAGE: "r2", ...R2_ENV });
    expect(storage).toBeInstanceOf(R2Storage);
  });

  it("fails loudly naming the missing var when r2 is selected half-configured", () => {
    const halfConfigured = { TRYON_STORAGE: "r2", ...R2_ENV } as Record<string, string>;
    delete halfConfigured["R2_BUCKET"];

    let message = "";
    try {
      resolveStorage(halfConfigured);
    } catch (error) {
      message = error instanceof z.ZodError ? JSON.stringify(error.issues) : String(error);
    }
    expect(message).toContain("R2_BUCKET");
  });

  it("fails loudly on a typo instead of silently downgrading", () => {
    expect(() => resolveStorage({ TRYON_STORAGE: "r22" })).toThrow(z.ZodError);
  });
});
