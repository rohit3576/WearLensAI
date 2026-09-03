import ky from "ky";
import { z } from "zod";
import type { UploadRole } from "./upload-rules";

const UploadResponseSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
});

export const UploadErrorResponseSchema = z.object({ error: z.string() });

export interface UploadedImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Upload one validated image to POST /api/upload. Throws ky's HTTPError on
 * non-2xx; callers surface the server's `error` reason via toasts.
 */
export async function uploadImage(file: File, role: UploadRole): Promise<UploadedImage> {
  const body = new FormData();
  body.append("file", file);
  body.append("role", role);
  return UploadResponseSchema.parse(await ky.post("/api/upload", { body }).json());
}

/** Human-readable reason from an upload HTTPError; fallback when unparsable. */
export async function uploadErrorMessage(error: {
  readonly response: Response;
}): Promise<string> {
  const parsed = UploadErrorResponseSchema.safeParse(
    await error.response.json().catch(() => null),
  );
  return parsed.success ? parsed.data.error : "upload failed";
}
