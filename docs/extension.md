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
  `POST /api/fit` (size advice), `GET /api/try-on/:id/status` (SSE),
  `GET /api/health`. CORS is enabled for extension origins.
- Want try-on inside your own site instead of a side panel? The web app in
  this repo is the embeddable reference implementation — see the README.

## Size advice (and its limits)

When a product page carries a real size-chart table, the panel can
recommend a size. How it works:

- On badge click the extension reads the page once: JSON-LD product
  fields (brand, category) plus any HTML size-chart table — nothing
  runs on page load, nothing is sent until you click.
- You set your height (plus optional chest/waist and a tighter /
  regular / looser preference) once in **Your fit** — stored locally,
  like your photo, and reused on every store.
- The advice comes from `POST /api/fit` on your configured backend:
  deterministic arithmetic over the store's own chart — size ranges
  and nearest measurements, a confidence level, and reasons that quote
  the chart's numbers next to yours. No model, no guessing past the
  chart.

Honest limits:

- Image-based size charts, `<select>` size pickers, and charts inside
  iframes are not read v1 — the panel says "no size chart on this
  page" and try-on still works.
- Charts that list inches without saying so (values below 40) are
  rejected on purpose rather than misread as centimetres.
- A page without a chart gets no advice, never a guessed size.

## Build from source

```bash
pnpm -C extension install
pnpm -C extension build   # → extension/dist (manifest + scripts + panel)
pnpm -C extension test    # 85 unit/component tests
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
4. Set height in **Your fit** → badge-click a page with a size chart →
   the advice card shows size + confidence + reasons
