/**
 * Staged garment profile handoff (badge click → panel): read-and-clear
 * `pendingProfile` from chrome.storage.session. Corrupt staging degrades
 * to absent via safeParse — the panel never renders untrusted data.
 */
import { GarmentProfileSchema } from "../lib/profile/schema";
import type { GarmentProfile } from "../lib/profile/schema";

const STORAGE_KEY = "pendingProfile" as const;

interface SessionStorageApi {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function sessionOf(): SessionStorageApi | undefined {
  const chromeApi = (globalThis as { chrome?: { storage?: { session?: SessionStorageApi } } })
    .chrome;
  return chromeApi?.storage?.session;
}

export async function takePendingProfile(): Promise<GarmentProfile | undefined> {
  const session = sessionOf();
  if (session === undefined) return undefined;
  const stored = await session.get([STORAGE_KEY]);
  const value = stored[STORAGE_KEY];
  await session.set({ [STORAGE_KEY]: undefined });
  if (value === undefined || value === null) return undefined;
  const parsed = GarmentProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
