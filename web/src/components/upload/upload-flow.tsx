"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import ky, { HTTPError } from "ky";
import { Toaster, toast } from "sonner";
import { z } from "zod";
import { CropStep } from "@/components/upload/crop-step";
import { ImageDropzone } from "@/components/upload/image-dropzone";
import { uploadErrorMessage, uploadImage } from "@/lib/upload-client";
import type { UploadedImage } from "@/lib/upload-client";

const JobCreatedSchema = z.object({ jobId: z.string() });
const SubmitErrorResponseSchema = z.object({ error: z.string() });

export function UploadFlow() {
  const router = useRouter();
  const [person, setPerson] = useState<UploadedImage | null>(null);
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [personUploading, setPersonUploading] = useState(false);
  const [garment, setGarment] = useState<UploadedImage | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const uploadPersonFile = useCallback(async (file: File) => {
    setPersonUploading(true);
    try {
      const uploaded = await uploadImage(file, "person");
      setPerson(uploaded);
      setPersonFile(null);
    } catch (error) {
      if (error instanceof HTTPError) {
        toast.error(await uploadErrorMessage(error));
        return;
      }
      throw error;
    } finally {
      setPersonUploading(false);
    }
  }, []);

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
        const parsed = SubmitErrorResponseSchema.safeParse(
          await error.response.json().catch(() => null),
        );
        toast.error(parsed.success ? parsed.data.error : "could not start the try-on");
        return;
      }
      throw error;
    }
  }, [person, garment, submitting, router]);

  const personReady = person !== null && personFile === null && !personUploading;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <ImageDropzone
            role="person"
            label="Your photo"
            onUploaded={setPerson}
            onFileValidated={(file) => {
              setPerson(null);
              setPersonFile(file);
            }}
          />
          {personFile !== null ? (
            <CropStep
              file={personFile}
              onConfirm={(cropped) => {
                void uploadPersonFile(cropped);
              }}
              onSkip={(original) => {
                void uploadPersonFile(original);
              }}
            />
          ) : null}
        </div>
        <ImageDropzone role="garment" label="Garment" onUploaded={setGarment} />
      </div>
      <button
        type="button"
        onClick={() => {
          void submit();
        }}
        disabled={!personReady || garment === null || submitting}
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
