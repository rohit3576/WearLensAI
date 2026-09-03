"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import { z } from "zod";
import {
  ALLOWED_EXTENSIONS,
  MAX_EDGE_PX,
  MAX_UPLOAD_BYTES,
  MIN_EDGE_PX,
} from "@/lib/upload-rules";
import type { UploadRole } from "@/lib/upload-rules";

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
} as const;

const UploadResponseSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
});

const ErrorResponseSchema = z.object({ error: z.string() });

export interface UploadedImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export interface ImageDropzoneProps {
  readonly role: UploadRole;
  readonly label: string;
  readonly onUploaded: (image: UploadedImage) => void;
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  return { width: bitmap.width, height: bitmap.height };
}

function rejectionReason(code: string): string {
  switch (code) {
    case "file-invalid-type":
      return `unsupported format (use ${ALLOWED_EXTENSIONS.join(", ")})`;
    case "file-too-large":
      return `file too large; uploads must be <= ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`;
    case "too-many-files":
      return "drop exactly one image";
    default:
      return `upload rejected (${code})`;
  }
}

export function ImageDropzone({ role, label, onUploaded }: ImageDropzoneProps) {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [meta, setMeta] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl !== undefined) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onDrop = useCallback(
    async (
      accepted: readonly File[],
      rejections: readonly { readonly errors: readonly { readonly code: string }[] }[],
    ) => {
      const firstRejection = rejections[0];
      if (firstRejection !== undefined) {
        const code = firstRejection.errors[0]?.code ?? "unknown";
        toast.error(rejectionReason(code));
        return;
      }
      const file = accepted[0];
      if (file === undefined) return;

      const dims = await imageDimensions(file);
      const shortEdge = Math.min(dims.width, dims.height);
      const longEdge = Math.max(dims.width, dims.height);
      if (shortEdge < MIN_EDGE_PX) {
        toast.error(
          `resolution too low (${dims.width}x${dims.height}); shortest side must be >= ${MIN_EDGE_PX}px`,
        );
        return;
      }
      if (longEdge > MAX_EDGE_PX) {
        toast.error(
          `resolution too high (${dims.width}x${dims.height}); longest side must be <= ${MAX_EDGE_PX}px`,
        );
        return;
      }

      setUploading(true);
      setPreviewUrl(URL.createObjectURL(file));
      const body = new FormData();
      body.append("file", file);
      body.append("role", role);
      try {
        const response = UploadResponseSchema.parse(
          await ky.post("/api/upload", { body }).json(),
        );
        setMeta(`${response.width}x${response.height}`);
        onUploaded(response);
      } catch (error) {
        if (error instanceof HTTPError) {
          const parsed = ErrorResponseSchema.safeParse(await error.response.json().catch(() => null));
          toast.error(parsed.success ? parsed.data.error : "upload failed");
          return;
        }
        throw error;
      } finally {
        setUploading(false);
      }
    },
    [role, onUploaded],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_UPLOAD_BYTES,
    multiple: false,
    disabled: uploading,
  });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div
        {...getRootProps({
          role: "button",
          className: `cursor-pointer rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors ${
            isDragActive ? "border-primary bg-muted/40" : "hover:border-primary/50"
          }`,
          "aria-label": `${label} dropzone`,
        })}
      >
        <input {...getInputProps()} />
        {previewUrl === undefined ? (
          <p className="text-sm text-muted-foreground">
            Drag an image here, or click to browse (jpg, png, webp)
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- in-memory blob preview; next/image optimization cannot apply to object URLs
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="mx-auto max-h-64 object-contain"
          />
        )}
      </div>
      {meta !== undefined ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
    </div>
  );
}
