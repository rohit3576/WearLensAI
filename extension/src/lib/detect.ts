/**
 * Garment detection for product pages — deterministic v1. Ranked candidates
 * from three sources: schema.org JSON-LD Product images, og:image, and a
 * gallery heuristic over <img> elements. Pure DOM in, plain data out; no
 * browser APIs, so the panel and tests share one implementation. The
 * shopper always confirms the pick — ML segmentation is a later unlock.
 */

import { isProductNode, visitJsonLdNodes } from "./jsonld-walk";

export type CandidateSource = "jsonld" | "og" | "gallery";

export interface GarmentCandidate {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly score: number;
  readonly source: CandidateSource;
}

const MIN_DIMENSION = 200;
const MIN_ASPECT = 0.3;
const MAX_ASPECT = 3;
const MAX_CANDIDATES = 8;

const SCORES = { jsonld: 100, og: 80, gallery: 40 } as const;
const KEYWORD_BONUS = 10;
const MAX_AREA_BONUS = 20;

const CLOTHING_KEYWORDS = [
  "dress",
  "shirt",
  "tshirt",
  "tee",
  "jacket",
  "coat",
  "blazer",
  "sweater",
  "hoodie",
  "jeans",
  "trousers",
  "pants",
  "skirt",
  "top",
  "blouse",
  "outfit",
  "garment",
  "worn",
  "wearing",
  "model",
] as const;

/** Extract image URL strings from a Product node's `image` field. */
function imageUrlsOf(node: Record<string, unknown>): string[] {
  const image = node["image"];
  const fromEntry = (entry: unknown): string[] => {
    if (typeof entry === "string") return [entry];
    if (entry !== null && typeof entry === "object") {
      const url = (entry as Record<string, unknown>)["url"];
      if (typeof url === "string") return [url];
    }
    return [];
  };
  if (Array.isArray(image)) return image.flatMap(fromEntry);
  return fromEntry(image);
}

function jsonLdCandidates(doc: Document): GarmentCandidate[] {
  const candidates: GarmentCandidate[] = [];
  for (const node of visitJsonLdNodes(doc)) {
    if (!isProductNode(node)) continue;
    for (const src of imageUrlsOf(node)) {
      candidates.push({
        src,
        width: 0,
        height: 0,
        score: SCORES.jsonld,
        source: "jsonld",
      });
    }
  }
  return candidates;
}

function ogCandidates(doc: Document): GarmentCandidate[] {
  const content = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");
  if (typeof content !== "string" || content === "") return [];
  const width = Number.parseInt(
    doc.querySelector('meta[property="og:image:width"]')?.getAttribute("content") ?? "",
    10,
  );
  const height = Number.parseInt(
    doc.querySelector('meta[property="og:image:height"]')?.getAttribute("content") ?? "",
    10,
  );
  return [
    {
      src: content,
      width: Number.isNaN(width) ? 0 : width,
      height: Number.isNaN(height) ? 0 : height,
      score: SCORES.og,
      source: "og",
    },
  ];
}

function galleryCandidates(doc: Document): GarmentCandidate[] {
  const base = doc.baseURI;
  const candidates: GarmentCandidate[] = [];
  for (const img of doc.querySelectorAll("img")) {
    const rawSrc = img.getAttribute("src");
    if (rawSrc === null || rawSrc === "") continue;
    let src: URL;
    try {
      src = new URL(rawSrc, base);
    } catch {
      continue;
    }
    if (src.protocol !== "http:" && src.protocol !== "https:") continue;
    const width = img.width || Number.parseInt(img.getAttribute("width") ?? "", 10) || 0;
    const height = img.height || Number.parseInt(img.getAttribute("height") ?? "", 10) || 0;
    if (width < MIN_DIMENSION || height < MIN_DIMENSION) continue;
    const aspect = width / height;
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
    const haystack = `${img.alt} ${img.getAttribute("title") ?? ""}`.toLowerCase();
    const keywordHit = CLOTHING_KEYWORDS.some((keyword) => haystack.includes(keyword));
    const areaBonus = Math.min(MAX_AREA_BONUS, Math.round((width * height) / 10_000));
    candidates.push({
      src: src.href,
      width,
      height,
      score: SCORES.gallery + (keywordHit ? KEYWORD_BONUS : 0) + areaBonus,
      source: "gallery",
    });
  }
  return candidates;
}

/** Dedupe by absolute URL, keeping the highest-scoring candidate per URL. */
function dedupe(candidates: readonly GarmentCandidate[]): GarmentCandidate[] {
  const bySrc = new Map<string, GarmentCandidate>();
  for (const candidate of candidates) {
    let key: string;
    try {
      key = new URL(candidate.src).href;
    } catch {
      key = candidate.src;
    }
    const existing = bySrc.get(key);
    if (existing === undefined || candidate.score > existing.score) {
      bySrc.set(key, candidate);
    }
  }
  return [...bySrc.values()];
}

export function detectGarmentCandidates(doc: Document): GarmentCandidate[] {
  const merged = [
    ...jsonLdCandidates(doc),
    ...ogCandidates(doc),
    ...galleryCandidates(doc),
  ];
  return dedupe(merged)
    .sort((a, b) => b.score - a.score || b.width * b.height - a.width * a.height)
    .slice(0, MAX_CANDIDATES);
}
