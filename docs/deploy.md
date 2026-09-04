# Deploying WearLensAI (free tiers)

This guide takes the web app from localhost to a public URL on three free
tiers — no credit card, $0/month at demo scale. The deployed app runs the
same code as dev; two env flips move job rows to Neon Postgres and images
to Cloudflare R2.

| Piece | Free tier | What it holds |
|---|---|---|
| Vercel | Hobby | The Next.js app, HTTPS URL |
| Neon | Free | `tryon_jobs` rows (status SSE reads these) |
| Cloudflare R2 | Free (10 GB) | Uploaded person/garment images + results |

Until the live engine lands (`TRYON_ENGINE=fal`, Step 9), the deployed app
runs the **StubEngine** — real uploads, real job lifecycle, real composite
output, just a stub try-on. Everything else (preflight, SSE, slider,
extension) is fully live.

## 1. Neon Postgres (2 minutes)

1. Sign up at [neon.tech](https://neon.tech) → **Create project** (any
   name, region near your users).
2. Open the project → copy the **Connection string**
   (`postgresql://user:pass@ep-....neon.tech/neondb?sslmode=require`).
   That is your `DATABASE_URL`.

The `tryon_jobs` table creates itself on first use — no migration step.

## 2. Cloudflare R2 (4 minutes)

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) →
   **R2 Object Storage** → **Create bucket** (any name, default location).
   The bucket name is your `R2_BUCKET`.
2. Bucket → **Settings** → **Public access** → enable the **r2.dev
   subdomain**. Copy the `https://pub-<hash>.r2.dev` URL — that is your
   `R2_PUBLIC_BASE_URL`. (The r2.dev subdomain is rate-limited and meant
   for demos; attach a custom domain later for real traffic.)
3. Your Cloudflare **Account ID** (dashboard right sidebar) is your
   `R2_ACCOUNT_ID`.
4. R2 overview → **Manage R2 API Tokens** → **Create API Token** →
   permission **Object Read & Write**, scope = your bucket. The Access Key
   ID / Secret Access Key pair gives you `R2_ACCESS_KEY_ID` /
   `R2_SECRET_ACCESS_KEY`.

## 3. Vercel (3 minutes)

1. Sign up at [vercel.com](https://vercel.com) → **Add New → Project** →
   import this GitHub repo.
2. **Root Directory:** `web` (important — the app lives there).
3. Open **Environment Variables** and add:

| Name | Value |
|---|---|
| `TRYON_JOBS` | `neon` |
| `DATABASE_URL` | the Neon connection string |
| `TRYON_STORAGE` | `r2` |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 token access key |
| `R2_SECRET_ACCESS_KEY` | R2 token secret |
| `R2_BUCKET` | bucket name |
| `R2_PUBLIC_BASE_URL` | `https://pub-<hash>.r2.dev` |

**Optional — LLM size-chart normalization (has a per-call cost):**
everything above stays $0. This row is the only paid surface, and it
is off unless you set it:

| Name | Value |
|---|---|
| `TRYON_NORMALIZER` | `llm` to enable (default `rules` = free passthrough) |
| `GEMINI_API_KEY` | Google AI Studio key — required when `llm` |
| `NORMALIZER_MODEL` | optional; default `gemini-2.0-flash` |

4. **Deploy.**

Both flips must be set together on Vercel: its filesystem is read-only,
so the dev defaults (sqlite file, local disk images) cannot run there.
A missing or misspelled var fails loudly at first request — the app never
silently downgrades.

## 4. Verify (5 minutes)

- [ ] `https://<your-app>.vercel.app/api/health` → `{"status":"ok"}`
- [ ] Open the site on your phone: upload a person photo + garment, crop,
      watch the job lifecycle, see the before/after slider
- [ ] Neon Console → SQL Editor → `SELECT id, phase FROM tryon_jobs` →
      your run is there, phase `done`
- [ ] R2 bucket → Objects → uploads and result PNGs are there
- [ ] (Extension) Settings → API base = your Vercel URL → try a garment
      from any product page

## Local development is unchanged

Without those env vars everything stays offline: local disk under
`web/.data`, sqlite `jobs.db`, zero accounts. That is the default — the
flips only matter where you set them.
