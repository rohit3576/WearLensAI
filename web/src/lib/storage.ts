/**
 * Storage seam — where uploaded images live. LocalStorage (dev: disk under
 * web/.data, zero setup) now; R2Storage (deploy: Cloudflare R2 free tier)
 * lands with the owner accounts in Phase 3 Step 8 — see r2-storage.ts.
 *
 * The public URL contract: put() returns a browser-fetchable URL of the
 * shape /api/files/<name>; GET /api/files/[name] serves it. Dev-only
 * consumers (StubEngine) resolve URLs back to paths via pathOf().
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { isStoredName, readImageFrom } from "./file-serving";
import { r2StorageFromEnv } from "./r2-storage";
import type { UploadRole } from "./upload-rules";

export interface StoredUpload {
  readonly bytes: Buffer;
  readonly contentType: "image/jpeg" | "image/png" | "image/webp";
  /** Upload-boundary metadata (dropzone hints); engine results omit it. */
  readonly role?: UploadRole;
}

export interface Storage {
  /** Persist bytes; returns a browser-fetchable URL. */
  put(upload: StoredUpload): Promise<string>;
}

export interface LocalStorageConfig {
  /** Data root (default ".data"); TRYON_DATA_DIR overrides for hermetic tests. */
  readonly rootDir: string;
}

const EXTENSION_BY_CONTENT_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

const URL_PREFIX = "/api/files/" as const;

export class LocalStorage implements Storage {
  private readonly uploadDir: string;

  constructor(config: LocalStorageConfig) {
    this.uploadDir = path.join(config.rootDir, "uploads");
  }

  async put(upload: StoredUpload): Promise<string> {
    const extension = EXTENSION_BY_CONTENT_TYPE[upload.contentType];
    const name = `${randomUUID()}${extension}`;
    await mkdir(this.uploadDir, { recursive: true });
    await writeFile(path.join(this.uploadDir, name), upload.bytes);
    return `${URL_PREFIX}${name}`;
  }

  /** Dev-only inverse of put() URLs — for consumers that read files (StubEngine). */
  pathOf(url: string): string {
    if (!url.startsWith(URL_PREFIX)) {
      throw new Error(`not a local storage URL: ${url}`);
    }
    const name = url.slice(URL_PREFIX.length);
    if (!isStoredName(name)) {
      throw new Error(`refusing to resolve untrusted storage name: ${name}`);
    }
    return path.join(this.uploadDir, name);
  }

  /** Serve a stored file by name; null when unknown or the name is untrusted. */
  async read(name: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    return readImageFrom(this.uploadDir, name);
  }
}

const StorageNameSchema = z.enum(["local", "r2"]).default("local");

/**
 * Resolve storage from the environment. A typo in TRYON_STORAGE fails
 * loudly (ZodError) instead of silently downgrading; r2 additionally
 * requires the R2_* vars (see r2StorageFromEnv).
 */
export function resolveStorage(
  env: Readonly<Record<string, string | undefined>>,
  config: LocalStorageConfig = { rootDir: env["TRYON_DATA_DIR"] ?? ".data" },
): Storage {
  const name = StorageNameSchema.parse(env["TRYON_STORAGE"]);
  switch (name) {
    case "local":
      return new LocalStorage(config);
    case "r2":
      return r2StorageFromEnv(env);
    default: {
      const exhausted: never = name;
      throw new Error(`unexpected storage name: ${String(exhausted)}`);
    }
  }
}
