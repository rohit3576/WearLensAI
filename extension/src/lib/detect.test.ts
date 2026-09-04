// @vitest-environment jsdom
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { detectGarmentCandidates } from "./detect";
import type { GarmentCandidate } from "./detect";

const STORE_URL = "https://store.test/products/wrap-dress";

function page(body: string, head = ""): Document {
  const dom = new JSDOM(`<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`, {
    url: STORE_URL,
  });
  return dom.window.document;
}

function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

describe("detectGarmentCandidates — JSON-LD", () => {
  it("ranks Product images from ld+json first with source jsonld", () => {
    const doc = page(
      jsonLdScript({
        "@context": "https://schema.org/",
        "@type": "Product",
        name: "Wrap Dress",
        image: ["https://cdn.store.test/dress-front.jpg", "https://cdn.store.test/dress-back.jpg"],
      }),
    );

    const candidates = detectGarmentCandidates(doc);

    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const top = candidates[0];
    expect(top).toMatchObject({ src: "https://cdn.store.test/dress-front.jpg", source: "jsonld" });
    expect(candidates[1]).toMatchObject({ src: "https://cdn.store.test/dress-back.jpg", source: "jsonld" });
  });

  it("accepts a single ImageObject url and walks @graph arrays", () => {
    const doc = page(
      jsonLdScript({
        "@graph": [
          { "@type": "Store", name: "x" },
          { "@type": "Product", image: { url: "https://cdn.store.test/model.jpg" } },
        ],
      }),
    );

    const candidates = detectGarmentCandidates(doc);

    expect(candidates[0]).toMatchObject({ src: "https://cdn.store.test/model.jpg", source: "jsonld" });
  });

  it("ignores malformed ld+json without throwing", () => {
    const doc = page(
      `<script type="application/ld+json">{ not json</script><img src="https://cdn.store.test/fallback.jpg" width="600" height="800" alt="Product photo">`,
    );

    const candidates = detectGarmentCandidates(doc);

    expect(candidates[0]?.src).toBe("https://cdn.store.test/fallback.jpg");
  });
});

describe("detectGarmentCandidates — og:image", () => {
  it("falls back to og:image when no JSON-LD Product exists", () => {
    const doc = page(
      "",
      `<meta property="og:image" content="https://cdn.store.test/og-dress.jpg">`,
    );

    const candidates = detectGarmentCandidates(doc);

    expect(candidates[0]).toMatchObject({ src: "https://cdn.store.test/og-dress.jpg", source: "og" });
  });
});

describe("detectGarmentCandidates — gallery heuristic", () => {
  const galleryBody = `
    <header><img src="https://cdn.store.test/logo.png" width="120" height="40" alt="Store logo"></header>
    <div class="gallery">
      <img src="https://cdn.store.test/model-worn.jpg" width="640" height="853" alt="Red wrap dress worn by model">
      <img src="https://cdn.store.test/detail.jpg" width="600" height="800" alt="Fabric detail">
    </div>`;

  it("picks large garment-ish images, skips logos, and rewards clothing keywords", () => {
    const doc = page(galleryBody);

    const candidates = detectGarmentCandidates(doc);

    const srcs = candidates.map((c) => c.src);
    expect(srcs).toContain("https://cdn.store.test/model-worn.jpg");
    expect(srcs).not.toContain("https://cdn.store.test/logo.png");
    const model = candidates.find((c) => c.src.endsWith("model-worn.jpg"));
    const detail = candidates.find((c) => c.src.endsWith("detail.jpg"));
    if (model === undefined || detail === undefined) throw new Error("gallery candidates missing");
    expect(model.score).toBeGreaterThan(detail.score);
    expect(model.source).toBe("gallery");
  });

  it("absolutizes relative srcs against the page URL", () => {
    const doc = page(`<img src="/images/dress.jpg" width="600" height="800" alt="Dress photo">`);

    const candidates = detectGarmentCandidates(doc);

    expect(candidates[0]?.src).toBe("https://store.test/images/dress.jpg");
  });

  it("filters extreme aspect ratios", () => {
    const doc = page(
      `<img src="https://cdn.store.test/banner.jpg" width="1200" height="300" alt="Dress banner">`,
    );

    const candidates = detectGarmentCandidates(doc);

    expect(candidates).toHaveLength(0);
  });

  it("returns an empty list when nothing matches", () => {
    const doc = page(`<p>No images here</p>`);

    expect(detectGarmentCandidates(doc)).toStrictEqual([]);
  });

  it("dedupes by absolute URL keeping the best source", () => {
    const doc = page(
      jsonLdScript({ "@type": "Product", image: "https://cdn.store.test/dress.jpg" }) +
        `<img src="https://cdn.store.test/dress.jpg" width="600" height="800" alt="Dress">`,
    );

    const candidates = detectGarmentCandidates(doc);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source).toBe("jsonld");
  });
});

describe("ranking order across sources", () => {
  it("jsonld beats og beats gallery", () => {
    const doc = page(
      jsonLdScript({ "@type": "Product", image: "https://cdn.store.test/a.jpg" }) +
        `<img src="https://cdn.store.test/c.jpg" width="600" height="800" alt="Dress">`,
      `<meta property="og:image" content="https://cdn.store.test/b.jpg">`,
    );

    const candidates: readonly GarmentCandidate[] = detectGarmentCandidates(doc);
    const sources = candidates.map((c) => c.source);

    expect(sources.indexOf("jsonld")).toBeLessThan(sources.indexOf("og"));
    expect(sources.indexOf("og")).toBeLessThan(sources.indexOf("gallery"));
  });
});
