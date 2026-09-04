/**
 * R2Storage — the deploy Storage (Cloudflare R2 free tier, S3-compatible).
 * put() uploads via PutObject and returns the bucket's public URL; uploads
 * and StubEngine results share the bucket under different key prefixes.
 * GET /api/files is unused in this mode — R2 serves the bytes directly.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Storage, StoredUpload } from "./storage";

/** The only S3 surface R2Storage needs — S3Client satisfies it structurally. */
export interface PutObjectSender {
  send(command: PutObjectCommand): Promise<unknown>;
}

export interface R2StorageConfig {
  readonly client: PutObjectSender;
  readonly bucket: string;
  /** Browser-fetchable base, e.g. https://pub-<hash>.r2.dev or a custom domain. */
  readonly publicBaseUrl: string;
  readonly keyPrefix: string;
}

const EXTENSION_BY_CONTENT_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

/** Names are random UUIDs: public + immutable caching is safe. */
const CACHE_CONTROL = "public, max-age=31536000, immutable" as const;

export class R2Storage implements Storage {
  private readonly publicBaseUrl: string;

  constructor(private readonly config: R2StorageConfig) {
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, "");
  }

  async put(upload: StoredUpload): Promise<string> {
    const extension = EXTENSION_BY_CONTENT_TYPE[upload.contentType];
    const key = `${this.config.keyPrefix}${randomUUID()}${extension}`;
    await this.config.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: upload.bytes,
        ContentType: upload.contentType,
        CacheControl: CACHE_CONTROL,
      }),
    );
    return `${this.publicBaseUrl}/${key}`;
  }
}

const R2EnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required when TRYON_STORAGE=r2"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required when TRYON_STORAGE=r2"),
  R2_SECRET_ACCESS_KEY: z
    .string()
    .min(1, "R2_SECRET_ACCESS_KEY is required when TRYON_STORAGE=r2"),
  R2_BUCKET: z.string().min(1, "R2_BUCKET is required when TRYON_STORAGE=r2"),
  R2_PUBLIC_BASE_URL: z
    .string()
    .min(1, "R2_PUBLIC_BASE_URL is required when TRYON_STORAGE=r2 (the bucket's public URL)"),
});

/**
 * Build R2Storage from the environment. Any missing R2_* var fails loudly
 * (ZodError naming it) instead of falling back to local disk.
 */
export function r2StorageFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): R2Storage {
  const vars = R2EnvSchema.parse({
    R2_ACCOUNT_ID: env["R2_ACCOUNT_ID"],
    R2_ACCESS_KEY_ID: env["R2_ACCESS_KEY_ID"],
    R2_SECRET_ACCESS_KEY: env["R2_SECRET_ACCESS_KEY"],
    R2_BUCKET: env["R2_BUCKET"],
    R2_PUBLIC_BASE_URL: env["R2_PUBLIC_BASE_URL"],
  });
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${vars.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: vars.R2_ACCESS_KEY_ID,
      secretAccessKey: vars.R2_SECRET_ACCESS_KEY,
    },
  });
  return new R2Storage({
    client,
    bucket: vars.R2_BUCKET,
    publicBaseUrl: vars.R2_PUBLIC_BASE_URL,
    keyPrefix: "uploads/",
  });
}
