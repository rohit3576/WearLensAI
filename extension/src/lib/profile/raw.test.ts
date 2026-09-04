// @vitest-environment jsdom
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { collectRawPageContent } from "./raw";

const STORE_URL = "https://store.test/products/dress";

function page(body: string): Document {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`, {
    url: STORE_URL,
  });
  return dom.window.document;
}

function table(text: string, className = ""): string {
  return `<table class="${className}"><tr><td>${text}</td></tr></table>`;
}

describe("collectRawPageContent", () => {
  it("ranks size-keyword tables ahead of bigger keyword-less tables and keeps order", () => {
    const filler = "x".repeat(200);
    const doc = page(
      table(`Shipping policy ${filler}`) + table("Size Chest Waist S 88 72 M 94 78"),
    );

    const raw = collectRawPageContent(doc);

    expect(raw.tables).toHaveLength(2);
    expect(raw.tables[0]).toContain("Chest");
  });

  it("caps at five tables", () => {
    const doc = page(
      Array.from({ length: 6 }, (_, i) => table(`Size chart ${i.toString()} chest`)).join(""),
    );

    const raw = collectRawPageContent(doc);

    expect(raw.tables).toHaveLength(5);
  });

  it("truncates an oversized table to 4096 characters", () => {
    const doc = page(table(`<td>Size chest ${"y".repeat(9_000)}</td>`));

    const raw = collectRawPageContent(doc);

    expect(raw.tables[0]?.length).toBe(4096);
  });

  it("joins ld+json scripts and truncates to 8192 characters", () => {
    const big = '{"@type":"Product","brand":"Acme","padding":"' + "z".repeat(10_000) + '"}';
    const doc = page(
      `<script type="application/ld+json">{"@type":"Product","name":"A"}</script>` +
        `<script type="application/ld+json">${big}</script>`,
    );

    const raw = collectRawPageContent(doc);

    expect(raw.ldJson).toBeDefined();
    expect(raw.ldJson?.length).toBe(8192);
  });

  it("leaves ldJson undefined when the page has none", () => {
    const doc = page(table("Size chest S 88"));

    const raw = collectRawPageContent(doc);

    expect(raw.ldJson).toBeUndefined();
    expect(raw.tables).toHaveLength(1);
  });

  it("collects nothing from a page with no tables or ld+json", () => {
    const doc = page('<div class="product">Nothing structured</div>');

    const raw = collectRawPageContent(doc);

    expect(raw.tables).toEqual([]);
    expect(raw.ldJson).toBeUndefined();
  });
});
