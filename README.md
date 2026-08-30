# WearLensAI

> Open-source AI virtual try-on platform — see clothes on YOU before you buy.

<!-- 60-sec demo GIF goes here at launch (Phase 10) -->

## What it does

Upload your photo + a garment image → get a realistic AI try-on result.

```text
Person photo + Garment image → VTON model → Result + before/after slider
```

## Architecture

<!-- architecture diagram placeholder (Phase 10) -->

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui |
| Try-on | FASHN v1.6 / FLUX VTO via fal.ai (API-first) · FASHN v1.5 self-host (Apache-2.0) |
| Data | Neon Postgres · Cloudflare R2 |
| Hosting | Vercel · Modal |

Runs on free tiers end-to-end — the whole demo costs $0/month.

## Roadmap

- [x] Phase 0 — repo bootstrap
- [ ] Phase 1 — model benchmark
- [ ] Phase 2 — inference pipeline
- [ ] Phase 3 — web app MVP
- [ ] Phase 4 — quality & safety layer
- [ ] Phase 5 — evaluation (200 try-ons)
- [ ] Phase 10 — deploy + launch

## Out of scope (for now)

Amazon/Flipkart integration, browser extension, body measurements, size prediction, AI shopping agent, recommendations, mobile app, training custom models.

## Quickstart

Arrives with Phase 1.

## License

Code: MIT. Model weights keep their own licenses — see [MODEL_LICENSES.md](MODEL_LICENSES.md).
