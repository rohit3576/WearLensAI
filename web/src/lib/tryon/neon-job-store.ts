/**
 * NeonJobStore — DEFERRED to Phase 3 Step 8 (unlock: owner creates the Neon
 * free-tier Postgres + env vars in Vercel).
 *
 * Implementation checklist when the account exists:
 * 1. neon-serverless (or @neondatabase/serverless) driver over HTTP, no
 *    persistent connection needed on Vercel; connection string from
 *    DATABASE_URL env.
 * 2. Same tryon_jobs schema as SqliteJobStore (TEXT ids and ISO timestamps
 *    map directly to Postgres TEXT/TIMESTAMPTZ).
 * 3. Flip TRYON_JOBS=neon; the JobStore interface stays identical.
 */
export const NEON_DEFERRED_NOTE =
  "NeonJobStore lands with the owner Neon account in Phase 3 Step 8" as const;
