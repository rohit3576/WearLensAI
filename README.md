# WearLensAI

> Open-source AI virtual try-on platform — see clothes on YOU before you buy.

<!-- 60-sec demo GIF goes here at launch (Phase 10) -->

## What it does

Upload your photo + a garment image → get a realistic AI try-on result.

```text
Person photo (crop + preflight) + Garment image → VTON engine → live job lifecycle (SSE) → result + before/after slider
```

Every input passes a preflight quality gate — bad photos die with actionable
messages before any API credit burns.

## Architecture

Every external dependency sits behind a seam, so the whole product builds,
tests, and demos offline against fakes and stubs — live services flip with
env vars, no code changes.

```text
web app (Next.js) ─┬─ POST /api/upload ── window validation → preflight → Storage (local │ R2)
                   ├─ POST /api/try-on ─ TryOnEngine (stub │ fal) → JobStore (sqlite │ Neon)
                   └─ GET  /status (SSE) → done → /api/results/<id>.png
MCP server ──────── same seams (runtime.ts) → submit / status / result tools
ai/ (Python) ────── benchmark + batch inference over the same fal adapters
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui |
| Try-on | FASHN v1.6 / FLUX VTO via fal.ai (API-first) · FASHN v1.5 self-host (Apache-2.0) |
| Data | Neon Postgres · Cloudflare R2 |
| Hosting | Vercel · Modal |
| MCP | Model Context Protocol server over the same engine seams — [docs/mcp.md](docs/mcp.md) |

Runs on free tiers end-to-end — the whole demo costs $0/month.

## Roadmap

- [x] Phase 0 — repo bootstrap
- [x] Phase 1 — model benchmark (build done; paid run parked for API budget)
- [x] Phase 2 — inference pipeline (build done; live proof parked)
- [x] Phase 3 — web app MVP (deploy step parked for free-tier accounts)
- [x] Phase 4 — quality & safety layer
- [ ] Phase 5 — evaluation (200 try-ons)
- [ ] Phase 10 — deploy + launch

## Out of scope (for now)

Amazon/Flipkart integration, browser extension, body measurements, size prediction, AI shopping agent, recommendations, mobile app, training custom models.

## Quickstart

- Python (benchmark + inference): `uv sync && uv run pytest` — see `ai/`
- Web app (upload → crop → SSE lifecycle → before/after slider):
  `cd web && pnpm install && pnpm build && pnpm start`
- Tests: `cd web && pnpm test` (unit) · `pnpm test:e2e` (Playwright) · `uv run pytest` (Python)
- MCP server for AI agents: `pnpm -C web mcp` — wiring guide in [docs/mcp.md](docs/mcp.md)

## License

Code: MIT. Model weights keep their own licenses — see [MODEL_LICENSES.md](MODEL_LICENSES.md).
