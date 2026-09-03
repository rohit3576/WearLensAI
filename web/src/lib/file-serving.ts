import { readFile } from "node:fs/promises";
import path from "node:path";

const STORED_NAME_PATTERN = /^[a-z0-9-]+\.(jpg|png|webp)$/;

const CONTENT_TYPE_BY_EXTENSION = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
} as const;

export interface ServedImage {
  readonly bytes: Buffer;
  readonly contentType: string;
}

export function isStoredName(name: string): boolean {
  return STORED_NAME_PATTERN.test(name);
}

/**
 * Serve a stored image by file name from `dir`; null when unknown or the
 * name is traversal-shaped. Both outcomes look identical on purpose.
 */
export async function readImageFrom(dir: string, name: string): Promise<ServedImage | null> {
  if (!isStoredName(name)) return null;
  const bytes = await readFile(path.join(dir, name)).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  });
  if (bytes === null) return null;
  const extension = name.slice(name.lastIndexOf(".")) as keyof typeof CONTENT_TYPE_BY_EXTENSION;
  return { bytes, contentType: CONTENT_TYPE_BY_EXTENSION[extension] };
}
