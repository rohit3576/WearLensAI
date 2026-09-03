/**
 * Upload rules shared by the server validation and the client dropzone.
 * Mirrors ai/preprocessing/validate.py — keep both sides in sync.
 * Sharp-free on purpose: the browser imports this module too.
 */

export const MIN_EDGE_PX = 256;
export const MAX_EDGE_PX = 4096;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;

export const ALLOWED_CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
} as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const UPLOAD_ROLES = ["person", "garment"] as const;

export type UploadRole = (typeof UPLOAD_ROLES)[number];
