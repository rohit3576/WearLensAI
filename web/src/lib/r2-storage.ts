/**
 * R2Storage — DEFERRED to Phase 3 Step 8 (unlock: owner creates the
 * Cloudflare R2 free-tier bucket + env vars in Vercel).
 *
 * Implementation checklist when accounts exist:
 * 1. S3-compatible client (@aws-sdk/client-s3) with R2 endpoint + credentials
 *    from env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).
 * 2. put() → PutObject; return the public URL (bucket custom domain or R2
 *    public bucket URL). pathOf() is NOT needed in prod: FalEngine reads
 *    images over HTTP, StubEngine never runs there.
 * 3. Flip TRYON_STORAGE=r2. GET /api/files becomes unnecessary (R2 serves).
 */
export const R2_DEFERRED_NOTE =
  "R2Storage lands with owner accounts in Phase 3 Step 8" as const;
