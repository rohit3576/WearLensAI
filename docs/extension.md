# WearLensAI Browser Extension

See any store's garment on your own photo — without the store integrating
anything. The extension detects product images on fashion pages, shows a
**Try this on** badge, and runs the try-on in its side panel against a
WearLensAI backend (yours, or one you run yourself).

> Status: developer preview. Load it unpacked (below); Chrome Web Store
> listing comes with the launch phase. Verified at unit level (35 tests) —
> see the smoke checklist at the end for the 2-minute manual check.

## For shoppers

1. **Install** (unpacked, for now):
   - Build or get `extension/dist/`
   - Chrome → `chrome://extensions` → enable Developer mode → **Load
     unpacked** → select `extension/dist`
2. **Set the backend once** — open the panel (toolbar icon), enter the
   backend URL, save. Someone hosting a public instance will publish a URL;
   locally it's `http://localhost:3000`.
3. **Pick your photo once** — the first try-on asks for your photo and
   walks you through framing it (4:5). It's saved in the extension's local
   storage and reused on every store; "Use a different photo" swaps it.
4. **Shop** — hover a garment image on any product page, click
   **Try this on**, confirm the detected image, and the before/after
   slider renders when the job finishes.

Your photo lives in `chrome.storage.local` on your machine. Images are sent
only to the backend URL you configured — nowhere else.

## For store owners and developers

The extension is a zero-integration front end over the **WearLensAI API** —
the same endpoints the web app uses. Run your own deployment and point the
extension (or your own client) at it:

```bash
# your deployment of the web app (this repo)
cd web && pnpm install && pnpm build && pnpm start
```

- Default panel backend: `http://localhost:3000` — change it in the panel.
- API surface: `POST /api/upload` (multipart), `POST /api/try-on`,
  `GET /api/try-on/:id/status` (SSE), `GET /api/health`. CORS is enabled
  for extension origins.
- Want try-on inside your own site instead of a side panel? The web app in
  this repo is the embeddable reference implementation — see the README.

## Build from source

```bash
pnpm -C extension install
pnpm -C extension build   # → extension/dist (manifest + scripts + panel)
pnpm -C extension test    # 35 unit/component tests
```

## How detection works (and its limits)

Deterministic v1, ranked: schema.org JSON-LD `Product.image` → `og:image`
→ gallery heuristic (size/aspect window + clothing keywords in alt text).
You always confirm the picked image — nothing auto-submits.

Known limits: heavily obfuscated galleries (canvas-rendered images,
lazy-loaded without `src`) may not detect; JSON-LD images that differ from
the visible gallery can appear as duplicates; ML garment segmentation is a
planned upgrade behind the same confirm-first flow.

## Manual smoke checklist

1. `pnpm -C web start` (backend on :3000) and load `extension/dist`
2. Open any product page with a garment photo → hover → badge appears
3. Badge click → panel opens pre-filled → pick/confirm photo → slider
