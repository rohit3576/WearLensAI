/**
 * Body-profile persistence (chrome.storage.local, key "bodyProfile"):
 * set once, reused on every store — the numeric twin of the person
 * photo. Schema.parse gates the write (invalid never lands); safeParse
 * gates the read (corrupt degrades to absent). No-op outside
 * extension contexts via the shared storage guard.
 */
import { BodyProfileSchema } from "../lib/profile/schema";
import type { BodyProfile } from "../lib/profile/schema";

const STORAGE_KEY = "bodyProfile" as const;

interface StorageApi {
  local: {
    get(keys: string[]): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  };
}

function storageOf(): StorageApi | undefined {
  const chromeApi = (globalThis as { chrome?: { storage?: StorageApi } }).chrome;
  return chromeApi?.storage;
}

export async function loadBodyProfile(): Promise<BodyProfile | undefined> {
  const storage = storageOf();
  if (storage === undefined) return undefined;
  const stored = await storage.local.get([STORAGE_KEY]);
  const value = stored[STORAGE_KEY];
  if (value === undefined || value === "" || value === null) return undefined;
  const parsed = BodyProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export async function saveBodyProfile(input: unknown): Promise<BodyProfile> {
  const storage = storageOf();
  if (storage === undefined) throw new Error("no storage available");
  const profile = BodyProfileSchema.parse(input);
  await storage.local.set({ [STORAGE_KEY]: profile });
  return profile;
}

export async function clearBodyProfile(): Promise<void> {
  await storageOf()?.local.set({ [STORAGE_KEY]: "" });
}
