/**
 * Per-URL normalize cache (chrome.storage.session): a chartless pick
 * that the backend enriched gets cached so re-clicks on the same page
 * never re-call the normalizer within the browser session. No-op
 * outside extension contexts.
 */
import type { GarmentProfile } from "../lib/profile/schema";
import { GarmentProfileSchema } from "../lib/profile/schema";

interface SessionStorageApi {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function sessionOf(): SessionStorageApi | undefined {
  const chromeApi = (globalThis as { chrome?: { storage?: { session?: SessionStorageApi } } })
    .chrome;
  return chromeApi?.storage?.session;
}

function keyOf(sourceUrl: string): string {
  return `normalizedProfile:${sourceUrl}`;
}

export async function cachedProfile(sourceUrl: string): Promise<GarmentProfile | undefined> {
  const session = sessionOf();
  if (session === undefined) return undefined;
  const key = keyOf(sourceUrl);
  const stored = await session.get([key]);
  const value = stored[key];
  if (value === undefined || value === null) return undefined;
  const parsed = GarmentProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export async function cacheProfile(profile: GarmentProfile): Promise<void> {
  await sessionOf()?.set({ [keyOf(profile.sourceUrl)]: profile });
}
