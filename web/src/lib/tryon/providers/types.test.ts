import { describe, expect, it } from "vitest";
import {
  canonicalCategoryOf,
  resolveProviderChain,
  fakeProviderForTests,
} from "./types";
import type { CanonicalCategory, TryOnProvider } from "./types";

describe("canonicalCategoryOf", () => {
  it("maps common JSON-LD category strings to canonical categories", () => {
    const cases: ReadonlyArray<[string, CanonicalCategory]> = [
      ["Dresses", "one-piece"],
      ["Women's Gowns & Dresses", "one-piece"],
      ["jumpsuit", "one-piece"],
      ["T-Shirts", "top"],
      ["shirts & blouses", "top"],
      ["Sweaters", "top"],
      ["Jeans", "bottom"],
      ["skirts", "bottom"],
      ["Jackets & Coats", "outerwear"],
      ["blazer", "outerwear"],
      ["Sneakers", "shoes"],
      ["boots", "shoes"],
    ];
    for (const [raw, expected] of cases) {
      expect(canonicalCategoryOf(raw)).toBe(expected);
    }
  });

  it("disambiguates compound nouns via the exact-match table", () => {
    expect(canonicalCategoryOf("dress shirt")).toBe("top");
    expect(canonicalCategoryOf("shirt dress")).toBe("one-piece");
  });

  it("returns undefined for unknown or absent categories", () => {
    expect(canonicalCategoryOf("Accessories")).toBeUndefined();
    expect(canonicalCategoryOf("Home & Living")).toBeUndefined();
    expect(canonicalCategoryOf(undefined)).toBeUndefined();
    expect(canonicalCategoryOf("")).toBeUndefined();
    expect(canonicalCategoryOf("   ")).toBeUndefined();
  });
});

const FASHN = fakeProviderForTests({ id: "fashn_v1_6", categories: ["top", "bottom", "one-piece", "outerwear"] });
const KLING = fakeProviderForTests({ id: "kling_kolors_v1_5", categories: [] });
const FLUX = fakeProviderForTests({ id: "flux_vto", categories: ["top", "one-piece"] });

describe("resolveProviderChain (TRYON_PROVIDERS)", () => {
  it("defaults to the shipped chain when unset or blank", () => {
    for (const env of [{}, { TRYON_PROVIDERS: "" }, { TRYON_PROVIDERS: "  " }]) {
      const chain = resolveProviderChain(env, [FASHN, KLING, FLUX]);
      expect(chain.map((provider) => provider.id)).toEqual([
        "fashn_v1_6",
        "kling_kolors_v1_5",
        "flux_vto",
      ]);
    }
  });

  it("honors an explicit ordered list with whitespace tolerated", () => {
    const chain = resolveProviderChain(
      { TRYON_PROVIDERS: " flux_vto ,  kling_kolors_v1_5 " },
      [FASHN, KLING, FLUX],
    );
    expect(chain.map((provider) => provider.id)).toEqual(["flux_vto", "kling_kolors_v1_5"]);
  });

  it("fails loudly listing the valid ids when the chain names an unknown provider", () => {
    let message = "";
    try {
      resolveProviderChain({ TRYON_PROVIDERS: "fashn_v1_6,gpt_tryon" }, [FASHN, KLING, FLUX]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("gpt_tryon");
    expect(message).toContain("fashn_v1_6");
    expect(message).toContain("kling_kolors_v1_5");
    expect(message).toContain("flux_vto");
  });

  it("rejects an explicitly empty chain", () => {
    expect(() => resolveProviderChain({ TRYON_PROVIDERS: "," }, [FASHN, KLING, FLUX])).toThrow();
  });
});

describe("TryOnProvider.handles", () => {
  it("universal providers (no categories) handle anything, including unknown", () => {
    expect(KLING.handles(undefined)).toBe(true);
    expect(KLING.handles("shoes")).toBe(true);
  });

  it("specific providers handle only their declared categories", () => {
    expect(FASHN.handles("one-piece")).toBe(true);
    expect(FASHN.handles("shoes")).toBe(false);
    expect(FASHN.handles(undefined)).toBe(false);
  });

  it("declares cost for visibility in failure copy", () => {
    const priced: TryOnProvider = fakeProviderForTests({ id: "x", costPerCallUsd: 0.075 });
    expect(priced.costPerCallUsd).toBe(0.075);
  });
});
