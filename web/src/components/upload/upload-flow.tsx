"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import ky, { HTTPError } from "ky";
import { Toaster, toast } from "sonner";
import { z } from "zod";
import { ImageDropzone } from "@/components/upload/image-dropzone";
import type { UploadedImage } from "@/components/upload/image-dropzone";

const JobCreatedSchema = z.object({ jobId: z.string() });
const ErrorResponseSchema = z.object({ error: z.string() });

export function UploadFlow() {
  const router = useRouter();
  const [person, setPerson] = useState<UploadedImage | null>(null);
  const [garment, setGarment] = useState<UploadedImage | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    if (person === null || garment === null || submitting) return;
    setSubmitting(true);
    try {
      const { jobId } = JobCreatedSchema.parse(
        await ky
          .post("/api/try-on", {
            json: { personUrl: person.url, garmentUrl: garment.url },
          })
          .json(),
      );
      router.push(`/try-on/${jobId}`);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof HTTPError) {
        const parsed = ErrorResponseSchema.safeParse(
          await error.response.json().catch(() => null),
        );
        toast.error(parsed.success ? parsed.data.error : "could not start the try-on");
        return;
      }
      throw error;
    }
  }, [person, garment, submitting, router]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <ImageDropzone role="person" label="Your photo" onUploaded={setPerson} />
        <ImageDropzone role="garment" label="Garment" onUploaded={setGarment} />
      </div>
      <button
        type="button"
        onClick={() => {
          void submit();
        }}
        disabled={person === null || garment === null || submitting}
        className="h-11 w-full max-w-64 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {submitting ? "Starting try-on" : "Try it on"}
      </button>
      <p className="text-xs text-muted-foreground">
        JPG, PNG or WebP. Shortest side at least 256px, longest side at most 4096px.
      </p>
      <Toaster position="top-center" />
    </div>
  );
}
