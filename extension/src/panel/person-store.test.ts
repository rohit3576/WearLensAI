// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPersonPhoto, dataUrlToFile, loadPersonPhoto, savePersonPhoto } from "./person-store";

const stored: Record<string, unknown> = {};

beforeEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
  vi.stubGlobal("chrome", {
    storage: {
      local: {
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

describe("person-store", () => {
  it("round-trips a photo data URL through chrome.storage", async () => {
    await savePersonPhoto("data:image/jpeg;base64,abc");

    await expect(loadPersonPhoto()).resolves.toBe("data:image/jpeg;base64,abc");

    await clearPersonPhoto();
    await expect(loadPersonPhoto()).resolves.toBeUndefined();
  });

  it("ignores non-image stored values", async () => {
    stored["personPhotoDataUrl"] = "not-a-photo";

    await expect(loadPersonPhoto()).resolves.toBeUndefined();
  });

  it("converts a data URL back into a File", async () => {
    const file = await dataUrlToFile("data:text/plain;base5,aGVsbG8=");

    expect(file).toBeInstanceOf(File);
  });
});
