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
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { UploadRole } from "./upload-rules";

export interface StoredUpload {
  readonly bytes: Buffer;
  readonly contentType: "image/jpeg" | "image/png" | "image/webp";
  readonly role: UploadRole;
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

const CONTENT_TYPE_BY_EXTENSION = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
} as const;

const URL_PREFIX = "/api/files/" as const;

/** /api/files/<name> with a strictly alphanumeric/dash/dot name. */
const StoredNameSchema = z.string().regex(/^[a-z0-9-]+\.(jpg|png|webp)$/);

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
    if (!StoredNameSchema.safeParse(name).success) {
      throw new Error(`refusing to resolve untrusted storage name: ${name}`);
    }
    return path.join(this.uploadDir, name);
  }

  /** Serve a stored file by name; null when unknown or the name is untrusted. */
  async read(name: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    if (!StoredNameSchema.safeParse(name).success) return null;
    const extension = name.slice(name.lastIndexOf(".")) as keyof typeof CONTENT_TYPE_BY_EXTENSION;
    try {
      const bytes = await readFile(path.join(this.uploadDir, name));
      return { bytes, contentType: CONTENT_TYPE_BY_EXTENSION[extension] };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }
}

const StorageNameSchema = z.enum(["local", "r2"]).default("local");

export class StorageNotImplementedError extends Error {
  readonly name = "StorageNotImplementedError";
  constructor(readonly storageName: string) {
    super(
      `storage "${storageName}" is not implemented yet ` +
        "(see src/lib/r2-storage.ts for the deferred plan)",
    );
  }
}

/**
 * Resolve storage from the environment. A typo in TRYON_STORAGE fails
 * loudly (ZodError) instead of silently downgrading.
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
      throw new StorageNotImplementedError(name);
    default: {
      const exhausted: never = name;
      throw new Error(`unexpected storage name: ${String(exhausted)}`);
    }
  }
}
