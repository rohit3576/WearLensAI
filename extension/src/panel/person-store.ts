/**
 * Person-photo persistence: upload once in `chrome.storage.local` (as a
 * JPEG data URL), reuse across every store. Falls back to no-op storage in
 * non-extension contexts (tests) via the shared storageOf guard.
 */

const STORAGE_KEY = "personPhotoDataUrl" as const;

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

export async function loadPersonPhoto(): Promise<string | undefined> {
  const storage = storageOf();
  if (storage === undefined) return undefined;
  const stored = await storage.local.get([STORAGE_KEY]);
  const value = stored[STORAGE_KEY];
  return typeof value === "string" && value.startsWith("data:image/") ? value : undefined;
}

export async function savePersonPhoto(dataUrl: string): Promise<void> {
  await storageOf()?.local.set({ [STORAGE_KEY]: dataUrl });
}

export async function clearPersonPhoto(): Promise<void> {
  await storageOf()?.local.set({ [STORAGE_KEY]: "" });
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(new Error("could not read the photo file"));
    };
    reader.readAsDataURL(file);
  });
}

export async function dataUrlToFile(dataUrl: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], "person.jpg", { type: blob.type || "image/jpeg" });
}
