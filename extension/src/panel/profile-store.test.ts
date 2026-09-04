// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takePendingProfile } from "./profile-store";

const stored: Record<string, unknown> = {};
const setMock = vi.fn(async (items: Record<string, unknown>) => {
  Object.assign(stored, items);
});

beforeEach(() => {
  setMock.mockClear();
  for (const key of Object.keys(stored)) delete stored[key];
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: async (keys: string[]) =>
          Object.fromEntries(keys.filter((k) => k in stored).map((k) => [k, stored[k]])),
        set: setMock,
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("takePendingProfile", () => {
  it("returns a staged profile and clears the slot", async () => {
    stored["pendingProfile"] = {
      sourceUrl: "https://store.test/products/dress",
      title: "Wrap Dress",
      brand: "Acme",
      sizeChart: {
        unit: "cm",
        from: "dom-table",
        rows: [{ size: "S", chestCm: 88 }],
      },
    };

    const profile = await takePendingProfile();

    expect(profile?.title).toBe("Wrap Dress");
    expect(profile?.brand).toBe("Acme");
    expect(profile?.sizeChart?.rows[0]).toEqual({ size: "S", chestCm: 88 });
    expect(stored["pendingProfile"]).toBeUndefined();
  });

  it("returns undefined when nothing is staged", async () => {
    expect(await takePendingProfile()).toBeUndefined();
  });

  it("degrades corrupt staging to undefined instead of throwing", async () => {
    stored["pendingProfile"] = { nonsense: true, rows: "nope" };

    expect(await takePendingProfile()).toBeUndefined();
    expect(stored["pendingProfile"]).toBeUndefined();
  });

  it("returns undefined outside an extension context (no storage)", async () => {
    vi.unstubAllGlobals();

    expect(await takePendingProfile()).toBeUndefined();
  });
});
