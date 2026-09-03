# WearLensAI Web — Design System

Source of truth for all UI work in `web/`. Created at the Design System Gate
(Phase 3 Step 3) — before the first real component. Update it when a pattern
changes; components follow this doc, not the other way around.

## Product voice

Calm, precise, tool-like. The app does one thing — show clothes on YOU — so
the UI stays out of the way: generous whitespace, one primary action per
screen, no decorative noise. No emojis anywhere in the UI.

## Foundations

Base: **shadcn/ui `base-nova` style, neutral palette** (pure-grayscale oklch,
zero chroma in `:root`; dark mode flips via `.dark` tokens). Tailwind v4 with
CSS-variable tokens defined in `src/app/globals.css`.

- **Color**: semantic tokens only — `background`, `foreground`, `primary`,
  `secondary`, `muted`, `accent`, `destructive`, `border`, `ring`. Never raw
  hex/oklch values in components. The result image is the only saturated
  content on screen; chrome stays grayscale.
- **Typography**: Geist Sans (`--font-sans`, `font-display: optional` — preloaded
  and self-hosted; throttled first views fall back to the metric-adjusted
  system font with zero shift). Geist Mono reserved for future ID/number
  surfaces — not loaded until something uses `font-mono`. Scale: `text-sm`
  body, `text-lg font-medium` card titles, `text-2xl md:text-3xl` page titles.
- **Radius**: token-driven (`--radius-sm` … `--radius-4xl`); cards use
  `rounded-xl`, inputs/buttons follow their shadcn component defaults.
- **Spacing**: 4px base grid. Page sections gap-6 md:gap-8; card padding
  p-4 md:p-6.

## Layout rules

- Mobile-first, single column; `md:` breaks to two-column where it helps
  (upload pair side-by-side). Full-height screens use `min-h-[100dvh]`,
  never `h-screen`.
- Content max-width `max-w-5xl mx-auto` centered.
- Interactive targets ≥ 44px tall on touch.

## Components (shadcn/ui primitives)

Use existing primitives in `src/components/ui` before inventing anything:
Button, Card, Input, Skeleton, Dialog, etc. Custom components live in
`src/components/<domain>/`.

- **ImageDropzone** (`components/upload/`): dashed-border card, drag-over
  state = `border-primary bg-muted/40`; below it a preview tile with the
  image (`object-contain`, aspect-square, `rounded-lg border`) and its
  filename + dimensions in `text-xs text-muted-foreground`.
- **UploadFlow** (`components/upload/`): the two dropzones + one primary
  button (`bg-primary`, h-11, `rounded-md`) + requirement hint. Owns the
  sonner `<Toaster position="top-center">` — it lives in this island, not
  the root layout, so routes without toasts ship no toaster JS.
- **CropStep** (`components/upload/`): person framing card — `rounded-xl
  border bg-card` with an aspect-[4/5] `overflow-hidden` frame (`cursor-grab`,
  `touch-none`), pointer-drag + 44px zoom buttons (Lucide zoom icons),
  "Skip crop" outline / "Use photo" primary buttons. Transform-only motion
  (`translate`/`scale`); the canvas export crops exactly what the frame
  shows (pure math in `crop-math.ts`).
- **ResultSlider** (`components/tryon/`): full-width `react-compare-slider`
  in a `rounded-xl border` box with server-known `aspect-ratio`; labels
  "Before"/"After" in `text-xs uppercase tracking-wide` chips
  (`rounded-full bg-background/90`) pinned to the top corners.
- **ProcessingPanel** (`components/tryon/`): pulse skeleton block matching
  the result aspect + a rotating plain-text status message (`aria-live`,
  fade-in on rotation). Progress bars are forbidden — we do not know real
  progress; never fake it.
- **Status cards** (`Shell`): `rounded-xl border bg-card p-6` with title,
  muted message, and an outlined `h-11` link-button for recovery paths.

## Feedback

- Errors and confirmations via **sonner** toasts (top-center). Toast copy is
  the user-actionable reason from the API (e.g. "shortest side must be
  >= 256px") — never raw JSON or stack noise.
- Destructive/failure tint: `destructive` token. Loading: Skeletons and
  disabled buttons, not spinners stacked on spinners.

## Motion

Motion is meaning, not decoration: 150–200ms transitions on hover/active
state changes (Tailwind `transition-colors`), `tw-animate-css` entrance fades
on result reveal. No parallax, no bounce, no autoplaying video.

## Imagery

Person/garment previews always `object-contain` on a `muted` background —
never crop the person. Result images keep their natural aspect ratio; the
layout wraps them. Placeholder tiles while uploading: Skeleton.

## Accessibility

- Every icon-only control has an `aria-label`; every input a visible label.
- Dropzone is keyboard-operable (react-dropzone defaults) with a visible
  focus ring (`ring` token).
- Color contrast: body text ≥ 4.5:1 against `background`; `muted-foreground`
  only for secondary metadata.
