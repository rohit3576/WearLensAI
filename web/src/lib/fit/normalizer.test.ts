import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RawPageContentSchema, resolveNormalizer, RulesNormalizer } from "./normalizer";
import type { GarmentProfile } from "./schema";

const charted: GarmentProfile = {
  sourceUrl: "https://store.test/products/dress",
  brand: "Acme",
  sizeChart: {
    unit: "cm",
    from: "dom-table",
    rows: [
      { size: "S", heightRangeCm: [160, 168] },
      { size: "M", heightRangeCm: [169, 176] },
    ],
  },
};

const raw = { tables: ["<table><tr><td>S</td><td>88</td></tr></table>"], ldJson: "{}" };

describe("RulesNormalizer", () => {
  it("returns the deterministic profile untouched when a chart is present", async () => {
    const normalizer = new RulesNormalizer();

    const result = await normalizer.normalize({ deterministic: charted, raw });

    expect(result).toBe(charted);
  });

  it("passes absence through — undefined stays undefined", async () => {
    const normalizer = new RulesNormalizer();

    expect(
      await normalizer.normalize({ deterministic: undefined, raw }),
    ).toBeUndefined();
  });
});

describe("resolveNormalizer (TRYON_NORMALIZER)", () => {
  it("defaults to rules when unset", () => {
    expect(resolveNormalizer({})).toBeInstanceOf(RulesNormalizer);
  });

  it("selects rules explicitly", () => {
    expect(resolveNormalizer({ TRYON_NORMALIZER: "rules" })).toBeInstanceOf(RulesNormalizer);
  });

  it("fails loudly on a typo instead of silently downgrading", () => {
    expect(() => resolveNormalizer({ TRYON_NORMALIZER: "llmm" })).toThrow(z.ZodError);
  });

  it("fails loudly naming the key when llm is selected without GEMINI_API_KEY", () => {
    let message = "";
    try {
      resolveNormalizer({ TRYON_NORMALIZER: "llm" });
    } catch (error) {
      message = error instanceof z.ZodError ? JSON.stringify(error.issues) : String(error);
    }
    expect(message).toContain("GEMINI_API_KEY");
  });

  it("with a key set, reports the llm twin as not yet implemented (lands in F4.2)", () => {
    expect(() =>
      resolveNormalizer({ TRYON_NORMALIZER: "llm", GEMINI_API_KEY: "test-key" }),
    ).toThrow(/not implemented yet|F4\.2/);
  });
});

describe("RawPageContentSchema", () => {
  it("accepts capped raw material", () => {
    const parsed = RawPageContentSchema.parse({
      tables: ["<table>…</table>"],
      ldJson: '{"@type":"Product"}',
    });
    expect(parsed.tables).toHaveLength(1);
  });

  it("rejects more than five tables", () => {
    expect(() =>
      RawPageContentSchema.parse({ tables: Array.from({ length: 6 }, () => "<table></table>") }),
    ).toThrow(z.ZodError);
  });

  it("rejects an oversized table", () => {
    expect(() =>
      RawPageContentSchema.parse({ tables: ["x".repeat(4097)] }),
    ).toThrow(z.ZodError);
  });

  it("rejects oversized ld+json", () => {
    expect(() => RawPageContentSchema.parse({ tables: [], ldJson: "x".repeat(8193) })).toThrow(
      z.ZodError,
    );
  });

  it("defaults tables to empty and ld+json to absent", () => {
    expect(RawPageContentSchema.parse({})).toEqual({ tables: [] });
  });
});
