# WearLensAI

> **See it on you before you buy.** Upload a photo and a garment — get a
> realistic AI try-on with a before/after slider, plus a size
> recommendation reasoned from the store's own size chart.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Runs on free tiers](https://img.shields.io/badge/runs%20on-free%20tiers-success.svg)
![Offline-first](https://img.shields.io/badge/dev%20loop-100%25%20offline-informational.svg)

<!-- demo GIF goes here at launch -->

---

## The problem

Online clothing shopping runs on guesswork. You see the garment on a model
who is not you — different height, different build, different vibe — and you
are asked to pay anyway.

- **For shoppers**, that uncertainty becomes hesitation, wrong sizes, and
  the return-shipping shuffle. The garment that looked perfect on the
  product page is a coin flip on you.
- **For sellers**, every "will this look right?" doubt is lost conversion,
  and every return is margin walking out the door — restocking, shipping,
  and a customer who hesitates next time.
- **For everyone else**, existing try-on tools are closed SaaS: per-image
  pricing, no self-hosting, no way to audit what the model did to your
  photo.

## The solution

One upload each — your photo, the garment — and WearLensAI answers both
questions money moves on: **how it looks** (you wearing that garment,
before/after) and **which size** (reasoned from the store's own chart).
No coin flip.

```text
            ┌────────────────────────────────────────────────────────┐
 your photo │  crop + frame (4:5)      garment image                  │
            └──────┬──────────────────────────┬──────────────────────┘
                   ▼                          ▼
            preflight quality gate — blank frames, skin-free "photos",
            transparent PNGs, wrong formats: rejected with plain-English
            reasons BEFORE any API credit can burn
                   │                          │
                   ▼                          ▼
            try-on engine                 size chart
            (StubEngine offline ·          height/chest/waist arithmetic
             FASHN/FLUX via fal.ai live)   (+ optional LLM normalization)
                   │                          │
                   │  live job lifecycle       │  size + confidence
                   │  over SSE                 │  + quoted reasons
                   ▼                          ▼
            result + before/after      size advice
            compare slider             next to the try-on
```

## Who it's for

| You are | What WearLensAI gives you |
|---|---|
| **A shopper** | Confidence at checkout — see the fit on your own photo before money moves |
| **A seller or indie brand** | A try-on experience you can host yourself, on free tiers — no per-image SaaS tax, and your product images stay in your stack |
| **A developer** | An MIT-licensed, seam-first codebase where every external service has an offline twin — fork it, test it for $0, flip env vars to go live |
| **An AI agent builder** | A ready-made MCP server: your agent can drive the entire try-on pipeline (submit, poll, fetch results) as three tool calls — [docs/mcp.md](docs/mcp.md) |
| **A shopper on any store** | The browser extension: it spots the garment on a product page, shows it on your photo, and recommends your size from the store's own chart — [docs/extension.md](docs/extension.md) |

## Why this one is different

Most try-on demos hide a paid API behind every click. WearLensAI is built
**seam-first**: every external dependency sits behind an interface with a
working offline twin — the whole product builds, tests, and demos for **$0**,
and going live is an env-var flip, not a rewrite.

| Seam | Offline (now) | Live (env var) |
|---|---|---|
| Try-on engine | `StubEngine` — real compositing, observable lifecycle | `TRYON_ENGINE=fal` |
| Storage | local disk | `TRYON_STORAGE=r2` |
| Job store | node:sqlite | `TRYON_JOBS=neon` |
| Size-chart normalization | rules passthrough (never spends a call) | `TRYON_NORMALIZER=llm` |

Quality is enforced, not hoped for: bad inputs die at the gate with
plain-English reasons, a 10-case preflight matrix plus a 14-case fit matrix
prove every path on every commit, and every fit recommendation quotes the
chart's own numbers next to yours — no invented constants, no guessing.

## What's inside

- **Web app** — Next.js 16, App Router, React 19, Tailwind v4, shadcn/ui.
  Drag-and-drop upload with instant previews, a pointer-drag crop step, a
  live job lifecycle you can watch, and a buttery before/after slider.
- **Preflight quality layer** — deterministic image checks (aspect window,
  blank-frame variance, skin-tone presence, transparency) with actionable
  error copy.
- **Fit engine** — deterministic size advice from the store's own size
  chart: height/chest/waist arithmetic with confidence and plain-English
  reasons — `POST /api/fit`. When a chart defeats the deterministic
  reader, an opt-in LLM normalizer (`POST /api/normalize`, Gemini flash)
  rebuilds it from the page's raw tables — money-guarded: no call when a
  chart was already found, cached per page, every failure falls back to
  the honest answer.
- **Browser extension** — the same pipeline on any store: garment
  detection, one-click try-on in the side panel, size advice from the
  store's chart. Set your photo and height once, locally; reused
  everywhere.
- **MCP server for AI agents** — three stdio tools over the exact same
  engine seams as the web app; agents can run the full 200-image
  evaluation pipeline unattended.
- **Python toolkit** — benchmark + batch inference over the same verified
  fal.ai adapters, with a fully offline dry-run mode.

## Architecture

```text
web app ─┬─ POST /api/upload ─── window validation → preflight → Storage (local │ R2)
         ├─ POST /api/try-on ─── TryOnEngine (stub │ fal) → JobStore (sqlite │ Neon)
         ├─ POST /api/fit ────── size-chart arithmetic → size + confidence + reasons
         ├─ POST /api/normalize ─ chart normalizer (rules passthrough │ Gemini, opt-in)
         └─ GET /api/try-on/:id/status (SSE) → done → /api/results/<id>.png
extension ─ badge click → garment detection + chart extraction (DOM only) → same API
MCP ─────── same runtime seams → submit / status / result tools
ai/ ─────── benchmark + batch inference (fal adapters, dry-run gateway)
```

## API surface

Every consumer — web app, extension, MCP, your own client — speaks the
same HTTP API. CORS is enabled for extension origins; errors are
plain-English JSON, never stack traces.

| Method | Path | Body → Result |
|---|---|---|
| `POST` | `/api/upload` | multipart image (`role`: person/garment) → `{url, width, height}` after preflight |
| `POST` | `/api/try-on` | `{personUrl, garmentUrl}` → `{jobId}` |
| `GET` | `/api/try-on/:id/status` | — → SSE stream: queued → processing → done/failed |
| `GET` | `/api/results/:name` | — → result PNG |
| `POST` | `/api/fit` | `{garment, body}` → `{size, confidence, reasons[]}` |
| `POST` | `/api/normalize` | `{sourceUrl, deterministic?, raw}` → `{profile}` (LLM opt-in) |
| `GET` | `/api/health` | — → `{ok, engine, storage}` |

## Quickstart

**Web app** (upload → crop → live lifecycle → slider):

```bash
cd web && pnpm install && pnpm build && pnpm start
```

**Deploy** (Vercel + Neon + R2, all free tiers, ~10 minutes):
see [docs/deploy.md](docs/deploy.md).

**MCP server** (for Claude Desktop / opencode — wiring guide in
[docs/mcp.md](docs/mcp.md)):

```bash
pnpm -C web mcp
```

**Python toolkit** (benchmark + inference, offline dry-run by default):

```bash
uv sync && uv run python -m ai.inference --help
```

**Tests** — the whole thing is proven offline, every commit:

```bash
cd web && pnpm test && pnpm test:e2e   # 190 unit + Playwright E2E in real Chrome
cd extension && pnpm test              # 98 extension tests
uv run pytest                          # 45 Python tests
```

## Configuration

Unset = offline defaults, zero accounts, zero cost. Every flip is loud:
a typo or a missing key fails with the variable named, never a silent
downgrade.

| Variable | Default | Flips to |
|---|---|---|
| `TRYON_ENGINE` | `stub` | `fal` — live FASHN/FLUX try-on (needs `FAL_KEY`) |
| `TRYON_STORAGE` | `local` | `r2` — Cloudflare R2 images (needs `R2_*`) |
| `TRYON_JOBS` | `sqlite` | `neon` — Neon Postgres job rows (needs `DATABASE_URL`) |
| `TRYON_NORMALIZER` | `rules` | `llm` — Gemini size-chart normalization (needs `GEMINI_API_KEY`) |
| `TRYON_DATA_DIR` | `web/.data` | local data root (tests use temp dirs) |
| `R2_ACCOUNT_ID` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_BUCKET` `R2_PUBLIC_BASE_URL` | — | R2 storage config — [docs/deploy.md](docs/deploy.md) |
| `NORMALIZER_MODEL` | `gemini-2.0-flash` | any Gemini model id |

## Repository layout

```text
web/                  Next.js app, API routes, MCP server
  src/app/api/        upload · try-on · status (SSE) · results · fit · normalize · health
  src/lib/            seams: engine · storage · job store · fit · normalizer · preflight
extension/            MV3 browser extension — content script, side panel, background
ai/                   Python: benchmark + batch inference (fal adapters, dry-run)
docs/                 extension · deploy · mcp guides
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui |
| Try-on | FASHN v1.6 / FLUX VTO via fal.ai (API-first) · FASHN v1.5 self-host (Apache-2.0) |
| Size advice | deterministic chart arithmetic · optional Gemini flash normalization via Vercel AI SDK (opt-in) |
| Data | Neon Postgres · Cloudflare R2 |
| Hosting | Vercel · Modal |
| MCP | Model Context Protocol server over the same engine seams — [docs/mcp.md](docs/mcp.md) |

Runs on free tiers end-to-end — the hosted demo costs $0/month.

## The browser extension

The zero-integration path for shoppers — and the fastest way for a store to
offer try-on without touching their codebase. The extension detects the
garment image on any fashion product page (JSON-LD → og:image → gallery
heuristics), shows a **Try this on** badge, and renders the before/after
result in its side panel. It also reads the store's size chart, and with
your height saved once it recommends a size with the reasoning shown —
every claim quoting the chart's own numbers next to yours. When a page's
chart is too messy for the deterministic reader, an opt-in LLM
normalizer on the backend can rebuild it (public page tables only, off
by default, a model failure never becomes a wrong size).

Your photo and height are saved once, locally, and reused on every
store. Store owners and devs can point it at their own WearLensAI
deployment — the same API this repo ships.

Full install guide, size-advice details, LLM normalization, detection
limits, and the store-owner path: [docs/extension.md](docs/extension.md)

## Privacy

- **Your photo goes only to the backend you point at.** In offline mode
  that is your own machine. The extension stores your photo and height
  in `chrome.storage.local` — they never leave the browser except as
  try-on input to your configured deployment.
- **The extension sends public page content only, and only on your
  click.** Garment image and size-chart tables are read at badge-click
  time; nothing runs on page load, nothing in the background.
- **No analytics, no trackers, no cookies, no third-party scripts.**
- **Self-host everything.** Every seam has an offline twin; going live
  means your keys on your deployment, not ours — there is no ours.

## Development

```bash
cd web && pnpm dev       # http://localhost:3000, hot reload
cd web && pnpm test      # unit · pnpm lint · pnpm typecheck · pnpm build
cd extension && pnpm test && pnpm build   # load extension/dist unpacked
```

| Guide | What's in it |
|---|---|
| [docs/extension.md](docs/extension.md) | install for shoppers, size advice + LLM limits, store-owner path |
| [docs/deploy.md](docs/deploy.md) | Vercel + Neon + R2 in ~10 minutes, free tiers |
| [docs/mcp.md](docs/mcp.md) | MCP server wiring for Claude Desktop / opencode |

## Not in scope (yet)

Amazon/Flipkart deep integration, body measurements, ML fit prediction,
AI shopping agent, recommendations, mobile app, training custom models.
One thing at a time.

## License

Code: MIT. Model weights keep their own licenses — see
[MODEL_LICENSES.md](MODEL_LICENSES.md).
