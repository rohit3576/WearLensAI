/**
 * Fetch garment candidates from the active tab: inject the bundled
 * detect-in-page script (isolated world), then read its result. Works on
 * any page via host_permissions — no content-script registration needed.
 */
import type { GarmentCandidate } from "../lib/detect";

interface CandidateWindow {
  __wearlensCandidates?: unknown;
}

export async function activeTabCandidates(): Promise<GarmentCandidate[]> {
  const chromeApi = (globalThis as { chrome?: typeof chrome }).chrome;
  if (chromeApi?.tabs === undefined || chromeApi.scripting === undefined) return [];
  const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  if (tabId === undefined) return [];

  await chromeApi.scripting.executeScript({
    target: { tabId },
    files: ["detect-in-page.js"],
  });
  const results = await chromeApi.scripting.executeScript({
    target: { tabId },
    func: () => (globalThis as CandidateWindow).__wearlensCandidates,
    args: [],
  });
  const first = results[0]?.result;
  return Array.isArray(first) ? (first as GarmentCandidate[]) : [];
}
