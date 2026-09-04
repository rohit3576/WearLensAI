// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { clearBodyProfile, loadBodyProfile, saveBodyProfile } from "./body-profile-store";

const stored: Record<string, unknown> = {};
const setMock = vi.fn(async (items: Record<string, unknown>) => {
  Object.assign(stored, items);
});

beforeEach(() => {
  setMock.mockClear();
  for (const key of Object.keys(stored)) delete stored[key];
  vi.stubGlobal("chrome", {
    storage: {
      local: {
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

describe("body-profile store", () => {
  it("saves a valid profile and loads it back with the preference default applied", async () => {
    await saveBodyProfile({ heightCm: 175 });

    const profile = await loadBodyProfile();

    expect(profile).toEqual({ heightCm: 175, fitPreference: "regular" });
  });

  it("round-trips chest, waist, and an explicit preference", async () => {
    await saveBodyProfile({
      heightCm: 168,
      chestCm: 96,
      waistCm: 78,
      fitPreference: "loose",
    });

    expect(await loadBodyProfile()).toEqual({
      heightCm: 168,
      chestCm: 96,
      waistCm: 78,
      fitPreference: "loose",
    });
  });

  it("rejects an invalid profile BEFORE anything reaches storage", async () => {
    await expect(saveBodyProfile({ heightCm: 119 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(saveBodyProfile({ heightCm: 221, chestCm: 96 })).rejects.toBeInstanceOf(
      z.ZodError,
    );
    await expect(saveBodyProfile({ heightCm: 175, chestCm: 59 })).rejects.toBeInstanceOf(
      z.ZodError,
    );

    expect(setMock).not.toHaveBeenCalled();
    expect(stored["bodyProfile"]).toBeUndefined();
  });

  it("degrades corrupt stored values to undefined instead of throwing", async () => {
    stored["bodyProfile"] = { heightCm: "tall", vibes: true };

    expect(await loadBodyProfile()).toBeUndefined();
  });

  it("clears a saved profile", async () => {
    await saveBodyProfile({ heightCm: 175 });
    await clearBodyProfile();

    expect(await loadBodyProfile()).toBeUndefined();
  });

  it("is a no-op outside an extension context (tests)", async () => {
    vi.unstubAllGlobals();

    expect(await loadBodyProfile()).toBeUndefined();
    await expect(saveBodyProfile({ heightCm: 175 })).rejects.toBeInstanceOf(Error);
  });
});
