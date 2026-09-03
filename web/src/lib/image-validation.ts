/**
 * Image upload boundary validation — the TypeScript mirror of
 * ai/preprocessing/validate.py. An untrusted upload becomes a typed
 * ValidatedUpload or a typed ImageValidationError with a user-actionable
 * reason. Everything downstream receives validated values.
 */
import sharp from "sharp";
import {
  ALLOWED_CONTENT_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_EDGE_PX,
  MAX_UPLOAD_BYTES,
  MIN_EDGE_PX,
} from "./upload-rules";

export class ImageValidationError extends Error {
  readonly name = "ImageValidationError";
  constructor(
    readonly fileName: string,
    readonly reason: string,
  ) {
    super(`${fileName}: ${reason}`);
  }
}

export interface UntrustedImage {
  readonly bytes: Buffer;
  readonly fileName: string;
}

export interface ValidatedUpload {
  readonly bytes: Buffer;
  readonly contentType: (typeof ALLOWED_CONTENT_TYPES)[keyof typeof ALLOWED_CONTENT_TYPES];
  readonly extension: (typeof ALLOWED_EXTENSIONS)[number];
  readonly width: number;
  readonly height: number;
}

function isAllowedExtension(ext: string): ext is (typeof ALLOWED_EXTENSIONS)[number] {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

export async function validateUploadImage(image: UntrustedImage): Promise<ValidatedUpload> {
  const extension = extensionOf(image.fileName);
  if (!isAllowedExtension(extension)) {
    throw new ImageValidationError(
      image.fileName,
      `unsupported format '${extension || "none"}' (use jpg, png or webp)`,
    );
  }
  if (image.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError(
      image.fileName,
      "file too large; uploads must be <= 10 MB",
    );
  }
  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(image.bytes).metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    throw new ImageValidationError(image.fileName, "not a decodable image");
  }
  if (width === undefined || height === undefined) {
    throw new ImageValidationError(image.fileName, "not a decodable image");
  }
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  if (shortEdge < MIN_EDGE_PX) {
    throw new ImageValidationError(
      image.fileName,
      `resolution too low (${width}x${height}); shortest side must be >= ${MIN_EDGE_PX}px`,
    );
  }
  if (longEdge > MAX_EDGE_PX) {
    throw new ImageValidationError(
      image.fileName,
      `resolution too high (${width}x${height}); longest side must be <= ${MAX_EDGE_PX}px`,
    );
  }
  return {
    bytes: image.bytes,
    contentType: ALLOWED_CONTENT_TYPES[extension],
    extension,
    width,
    height,
  };
}
