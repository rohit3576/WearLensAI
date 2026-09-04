// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedProfile, cacheProfile } from "./normalize-cache";

const stored: Record<string, unknown> = {};

beforeEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: async (keys: string[]) =>
          Object.fromEntries(keys.filter((k) => k in stored).map((k) => [k, stored[k]])),
        set: async (items: Record<string, unknown>) => {
          Object.assign(stored, items);
        },
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const profile = {
  sourceUrl: "https://store.test/products/dress",
  brand: "Acme",
  sizeChart: {
    unit: "cm" as const,
    from: "llm" as const,
    rows: [{ size: "M", chestCm: 96 }],
  },
};

describe("normalize cache", () => {
  it("misses before any write and hits after, keyed by source URL", async () => {
    expect(await cachedProfile("https://store.test/products/dress")).toBeUndefined();

    await cacheProfile(profile);

    expect(await cachedProfile("https://store.test/products/dress")).toEqual(profile);
    expect(await cachedProfile("https://store.test/products/other")).toBeUndefined();
  });

  it("degrades corrupt cached values to undefined", async () => {
    stored["normalizedProfile:https://store.test/products/dress"] = { garbage: true };

    expect(await cachedProfile("https://store.test/products/dress")).toBeUndefined();
  });

  it("is a no-op outside an extension context", async () => {
    vi.unstubAllGlobals();

    expect(await cachedProfile("https://store.test/products/dress")).toBeUndefined();
    await cacheProfile(profile);
  });
});
