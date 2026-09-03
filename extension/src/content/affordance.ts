import { detectGarmentCandidates } from "../lib/detect";

const BADGE_CLASS = "wearlens-try-badge" as const;
const TRY_MESSAGE = "wearlens:try-this" as const;
const REBIND_DEBOUNCE_MS = 400;

export interface AffordanceHooks {
  readonly sendMessage: (message: unknown) => void;
}

interface BoundImage {
  readonly element: HTMLImageElement;
  readonly src: string;
}

function badgeStyle(): string {
  return `
.${BADGE_CLASS} {
  position: fixed;
  z-index: 2147483647;
  padding: 6px 12px;
  border: none;
  border-radius: 9999px;
  background: oklch(0.205 0 0);
  color: oklch(0.985 0 0);
  font: 500 12px/1.4 system-ui, sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 8px oklch(0 0 0 / 0.2);
}
.${BADGE_CLASS}[hidden] { display: none; }
`;
}

/**
 * Hover affordance over detected garment images. The badge is a single
 * document.body element repositioned per hovered image — the host page's
 * DOM structure is never mutated. SPA-safe via a debounced MutationObserver.
 */
export function startAffordance(
  doc: Document,
  hooks: AffordanceHooks,
  observe = true,
): () => void {
  const style = doc.createElement("style");
  style.textContent = badgeStyle();
  doc.head.appendChild(style);

  const badge = doc.createElement("button");
  badge.type = "button";
  badge.className = BADGE_CLASS;
  badge.textContent = "Try this on";
  badge.hidden = true;
  doc.body.appendChild(badge);

  const bound = new Set<HTMLImageElement>();
  let activeImage: BoundImage | null = null;

  badge.addEventListener("click", () => {
    if (activeImage !== null) {
      hooks.sendMessage({ type: TRY_MESSAGE, src: activeImage.src });
    }
    badge.hidden = true;
  });
  badge.addEventListener("mouseleave", () => {
    badge.hidden = true;
  });
  doc.defaultView?.addEventListener("scroll", () => {
    badge.hidden = true;
  }, { passive: true });

  function showBadgeFor(image: BoundImage): void {
    activeImage = image;
    const rect = image.element.getBoundingClientRect();
    badge.style.top = `${Math.max(rect.top + 8, 8)}px`;
    badge.style.left = `${Math.max(rect.right - 130, 8)}px`;
    badge.hidden = false;
  }

  function bindImage(element: HTMLImageElement, src: string): void {
    bound.add(element);
    element.addEventListener("mouseenter", () => {
      showBadgeFor({ element, src });
    });
    element.addEventListener("mouseleave", (event) => {
      if (badge.hidden === false && event.relatedTarget !== badge) {
        badge.hidden = true;
      }
    });
  }

  function bindAll(): void {
    const candidates = detectGarmentCandidates(doc);
    const bySrc = new Map(
      [...doc.images]
        .map((img) => {
          const raw = img.getAttribute("src");
          if (raw === null) return null;
          try {
            return { img, src: new URL(raw, doc.baseURI).href };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is { img: HTMLImageElement; src: string } => entry !== null)
        .map((entry) => [entry.src, entry.img] as const),
    );
    for (const candidate of candidates) {
      const match = bySrc.get(candidate.src);
      if (match !== undefined && !bound.has(match)) {
        bindImage(match, candidate.src);
      }
    }
  }

  bindAll();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(bindAll, REBIND_DEBOUNCE_MS);
  });
  if (observe) {
    observer.observe(doc.body, { childList: true, subtree: true });
  }

  return () => {
    if (timer !== undefined) clearTimeout(timer);
    observer.disconnect();
    badge.remove();
    style.remove();
  };
}
