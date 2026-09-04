/**
 * Panel-side client for the WearLensAI API. Same contract as the web app:
 * upload (multipart, never base64) → submit → SSE status → result URL.
 * Rejections carry the same actionable copy as the web 422s.
 */
import ky, { HTTPError } from "ky";
import { z } from "zod";
import type { BodyProfile, FitAdvice, GarmentProfile } from "../lib/profile/schema";
import { FitAdviceSchema } from "../lib/profile/schema";
import type { StatusEvent } from "./status-events";

const UploadResponseSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
});

export interface UploadedImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export async function uploadImage(
  apiBase: string,
  file: File,
  role: "person" | "garment",
): Promise<UploadedImage> {
  const body = new FormData();
  body.append("file", file);
  body.append("role", role);
  return UploadResponseSchema.parse(await ky.post(`${apiBase}/api/upload`, { body }).json());
}

export async function submitTryOn(
  apiBase: string,
  personUrl: string,
  garmentUrl: string,
): Promise<string> {
  const { jobId } = z
    .object({ jobId: z.string() })
    .parse(
      await ky
        .post(`${apiBase}/api/try-on`, {
          json: { personUrl, garmentUrl },
        })
        .json(),
    );
  return jobId;
}

export async function fitAdvice(
  apiBase: string,
  garment: GarmentProfile,
  body: BodyProfile,
): Promise<FitAdvice> {
  const response: unknown = await ky
    .post(`${apiBase}/api/fit`, { json: { garment, body } })
    .json();
  return FitAdviceSchema.parse(response);
}

export async function fetchAsBlob(imageUrl: string): Promise<File> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`could not download the garment image (${response.status.toString()})`);
  }
  const blob = await response.blob();
  return new File([blob], garmentFileName(imageUrl), {
    type: blob.type || "image/jpeg",
  });
}

function garmentFileName(imageUrl: string): string {
  const pathname = new URL(imageUrl).pathname;
  const base = pathname.split("/").at(-1) ?? "garment.jpg";
  return /\.[a-z0-9]+$/i.test(base) ? base : `${base}.jpg`;
}

export async function uploadErrorMessage(error: HTTPError): Promise<string> {
  const parsed = z
    .object({ error: z.string() })
    .safeParse(await error.response.json().catch(() => null));
  return parsed.success ? parsed.data.error : "upload failed";
}

export function runTryOn(
  apiBase: string,
  jobId: string,
): Promise<Extract<StatusEvent, { phase: "done" | "failed" }>> {
  return new Promise((resolve, reject) => {
    const source = new EventSource(`${apiBase}/api/try-on/${jobId}/status`);
    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = StatusEventSchema.safeParse(JSON.parse(event.data));
      if (!parsed.success) return;
      if (parsed.data.phase === "done" || parsed.data.phase === "failed") {
        source.close();
        resolve(parsed.data);
      }
    };
    source.onerror = () => {
      source.close();
      reject(new Error("lost the connection to the backend"));
    };
  });
}

const StatusEventSchema = z.union([
  z.object({ phase: z.literal("queued") }),
  z.object({ phase: z.literal("processing") }),
  z.object({ phase: z.literal("done"), resultUrl: z.string() }),
  z.object({ phase: z.literal("failed"), reason: z.string() }),
]);
