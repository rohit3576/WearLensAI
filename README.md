# WearLensAI

> **See it on you before you buy.** Upload a photo and a garment — get a
> realistic AI try-on with a before/after slider, in seconds.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Runs on free tiers](https://img.shields.io/badge/runs%20on-free%20tiers-success.svg)
![Offline-first](https://img.shields.io/badge/dev%20loop-100%25%20offline-informational.svg)

<!-- 60-sec demo GIF goes here at launch -->

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

One upload each — your photo, the garment — and WearLensAI shows **you**
wearing **that** garment, side by side with the original. No coin flip.

```text
            ┌────────────────────────────────────────────────────────┐
 your photo │  crop + frame (4:5)      garment image                  │
            └──────┬──────────────────────────┬──────────────────────┘
                   ▼                          ▼
            preflight quality gate — blank frames, skin-free "photos",
            transparent PNGs, wrong formats: rejected with plain-English
            reasons BEFORE any API credit can burn
                   │
                   ▼
            try-on engine  (StubEngine offline · FASHN/FLUX via fal.ai live)
                   │  live job lifecycle over SSE — no fake progress bars
                   ▼
            result + before/after compare slider
```

## Who it's for

| You are | What WearLensAI gives you |
|---|---|
| **A shopper** | Confidence at checkout — see the fit on your own photo before money moves |
| **A seller or indie brand** | A try-on experience you can host yourself, on free tiers — no per-image SaaS tax, and your product images stay in your stack |
| **A developer** | An MIT-licensed, seam-first codebase where every external service has an offline twin — fork it, test it for $0, flip env vars to go live |
| **An AI agent builder** | A ready-made MCP server: your agent can drive the entire try-on pipeline (submit, poll, fetch results) as three tool calls — [docs/mcp.md](docs/mcp.md) |
| **A shopper on any store** | The browser extension (building): it spots the garment on a product page and shows it on your photo — no store integration needed |

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

Quality is enforced, not hoped for: bad inputs die at the gate with
plain-English reasons, and a 10-case test matrix proves every rejection
path on every commit.

## What's inside

- **Web app** — Next.js 16, App Router, React 19, Tailwind v4, shadcn/ui.
  Drag-and-drop upload with instant previews, a pointer-drag crop step, a
  live job lifecycle you can watch, and a buttery before/after slider.
- **Preflight quality layer** — deterministic image checks (aspect window,
  blank-frame variance, skin-tone presence, transparency) with actionable
  error copy.
- **MCP server for AI agents** — three stdio tools over the exact same
  engine seams as the web app; agents can run the full 200-image
  evaluation pipeline unattended.
- **Python toolkit** — benchmark + batch inference over the same verified
  fal.ai adapters, with a fully offline dry-run mode.

## Architecture

```text
web app ─┬─ POST /api/upload ── window validation → preflight → Storage (local │ R2)
         ├─ POST /api/try-on ─ TryOnEngine (stub │ fal) → JobStore (sqlite │ Neon)
         └─ GET /status (SSE) → done → /api/results/<id>.png
MCP ────── same runtime seams → submit / status / result tools
ai/ ────── benchmark + batch inference (fal adapters, dry-run gateway)
```

## Quickstart

**Web app** (upload → crop → live lifecycle → slider):

```bash
cd web && pnpm install && pnpm build && pnpm start
```

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
cd web && pnpm test && pnpm test:e2e   # 122 unit + Playwright E2E in real Chrome
uv run pytest                          # 45 Python tests
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui |
| Try-on | FASHN v1.6 / FLUX VTO via fal.ai (API-first) · FASHN v1.5 self-host (Apache-2.0) |
| Data | Neon Postgres · Cloudflare R2 |
| Hosting | Vercel · Modal |
| MCP | Model Context Protocol server over the same engine seams — [docs/mcp.md](docs/mcp.md) |

Runs on free tiers end-to-end — the hosted demo costs $0/month.

## The browser extension (building now)

The zero-integration path for shoppers — and the fastest way for a store to
offer try-on without touching their codebase. The extension detects the
garment image on any fashion product page (JSON-LD → og:image → gallery
heuristics), the shopper picks their photo once, and the before/after
result renders in the side panel. Store owners and devs can point it at
their own WearLensAI deployment — the same API this repo ships.

## Not in scope (yet)

Amazon/Flipkart deep integration, body measurements, size prediction, AI
shopping agent, recommendations, mobile app, training custom models. One
thing at a time.

## License

Code: MIT. Model weights keep their own licenses — see
[MODEL_LICENSES.md](MODEL_LICENSES.md).
