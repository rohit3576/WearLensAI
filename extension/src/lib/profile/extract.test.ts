// @vitest-environment jsdom
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractGarmentProfile, buildGarmentProfile } from "./extract";

const STORE_URL = "https://store.test/products/wrap-dress";

function page(body: string): Document {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`, {
    url: STORE_URL,
  });
  return dom.window.document;
}

function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

describe("extractGarmentProfile", () => {
  it("reads brand, category, and title from a full Product node", () => {
    const doc = page(
      jsonLdScript({
        "@type": "Product",
        name: "Wrap Dress",
        brand: "Acme",
        category: "Dresses",
        image: ["https://cdn.store.test/dress.jpg"],
      }),
    );

    const profile = extractGarmentProfile(doc, STORE_URL);

    expect(profile).toEqual({
      sourceUrl: STORE_URL,
      title: "Wrap Dress",
      brand: "Acme",
      category: "Dresses",
    });
  });

  it("walks @graph to find the Product node", () => {
    const doc = page(
      jsonLdScript({
        "@graph": [
          { "@type": "Store", name: "The Store" },
          { "@type": "Product", name: "Linen Shirt", brand: { name: "Nordwear" } },
        ],
      }),
    );

    const profile = extractGarmentProfile(doc, STORE_URL);

    expect(profile?.title).toBe("Linen Shirt");
    expect(profile?.brand).toBe("Nordwear");
  });

  it("accepts brand as { name }, as arrays, and category arrays (head wins)", () => {
    const doc = page(
      jsonLdScript({
        "@type": "Product",
        name: "Oversized Tee",
        brand: [{ name: "Acme" }, { name: "Ignored" }],
        category: ["T-Shirts", "Tops"],
      }),
    );

    const profile = extractGarmentProfile(doc, STORE_URL);

    expect(profile?.brand).toBe("Acme");
    expect(profile?.category).toBe("T-Shirts");
  });

  it("skips malformed ld+json without throwing and still reads a later good script", () => {
    const doc = page(
      `<script type="application/ld+json">{ not json</script>` +
        jsonLdScript({ "@type": "Product", name: "Salvaged Title" }),
    );

    const profile = extractGarmentProfile(doc, STORE_URL);

    expect(profile?.title).toBe("Salvaged Title");
  });

  it("returns undefined when there is no ld+json at all", () => {
    const doc = page(`<meta property="og:image" content="https://cdn.store.test/og.jpg">`);

    expect(extractGarmentProfile(doc, STORE_URL)).toBeUndefined();
  });

  it("returns undefined when no Product node exists", () => {
    const doc = page(jsonLdScript({ "@type": "Organization", name: "The Store" }));

    expect(extractGarmentProfile(doc, STORE_URL)).toBeUndefined();
  });

  it("returns undefined when the Product node has no profile fields (nothing to show)", () => {
    const doc = page(
      jsonLdScript({ "@type": "Product", image: ["https://cdn.store.test/only.jpg"] }),
    );

    expect(extractGarmentProfile(doc, STORE_URL)).toBeUndefined();
  });

  it("takes the first Product node that yields any profile field", () => {
    const doc = page(
      jsonLdScript({ "@type": "Product", image: ["https://cdn.store.test/a.jpg"] }) +
        jsonLdScript({ "@type": "Product", name: "Second Product", brand: "SecondBrand" }),
    );

    const profile = extractGarmentProfile(doc, STORE_URL);

    expect(profile?.title).toBe("Second Product");
  });
});

describe("buildGarmentProfile", () => {
  const chartTable = `
    <table><tbody>
      <tr><th>Size</th><th>Chest (cm)</th></tr>
      <tr><td>S</td><td>88</td></tr>
      <tr><td>M</td><td>94</td></tr>
    </tbody></table>
  `;

  it("merges JSON-LD fields with the DOM size chart", () => {
    const doc = page(
      jsonLdScript({ "@type": "Product", name: "Wrap Dress", brand: "Acme" }) + chartTable,
    );

    const profile = buildGarmentProfile(doc, STORE_URL);

    expect(profile?.title).toBe("Wrap Dress");
    expect(profile?.brand).toBe("Acme");
    expect(profile?.sizeChart?.rows).toHaveLength(2);
  });

  it("yields a chart-only profile when the page has no ld+json fields", () => {
    const doc = page(chartTable);

    const profile = buildGarmentProfile(doc, STORE_URL);

    expect(profile).toEqual({
      sourceUrl: STORE_URL,
      sizeChart: { unit: "cm", from: "dom-table", rows: [
        { size: "S", chestCm: 88 },
        { size: "M", chestCm: 94 },
      ] },
    });
  });

  it("returns undefined when the page offers neither fields nor chart", () => {
    const doc = page('<div class="product">No structured data</div>');

    expect(buildGarmentProfile(doc, STORE_URL)).toBeUndefined();
  });
});
