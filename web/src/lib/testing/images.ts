/**
 * Generated image fixtures for upload/preflight tests — no binaries in the
 * repo, every image is built with sharp at test time. Person photos pass all
 * preflight checks (textured + skin-tone patch); garment photos are textured,
 * opaque, and deliberately non-skin in palette.
 */
import sharp from "sharp";

function toBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}

/** A person photo that passes every preflight check: textured + skin patch. */
export async function personPhoto(width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  const face = Math.round(Math.min(width, height) * 0.2);
  const buffer = await sharp({
    create: { width, height, channels: 3 as const, background: "#3a3f4a" },
  })
    .composite([
      {
        input: { create: { width: face, height: face, channels: 3 as const, background: "#c88b78" } },
        left: Math.round(width / 2 - face / 2),
        top: Math.round(height * 0.08),
      },
      {
        input: {
          create: {
            width: Math.round(width * 0.5),
            height: Math.round(height * 0.35),
            channels: 3 as const,
            background: "#565d6b",
          },
        },
        left: Math.round(width * 0.25),
        top: Math.round(height * 0.5),
      },
    ])
    .png()
    .toBuffer();
  return toBytes(buffer);
}

/** A garment image that passes every preflight check: textured, opaque, non-skin palette. */
export async function garmentPhoto(
  width: number,
  height: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await sharp({
    create: { width, height, channels: 3 as const, background: "#e8e4de" },
  })
    .composite([
      {
        input: {
          create: {
            width: Math.round(width * 0.5),
            height: Math.round(height * 0.6),
            channels: 3 as const,
            background: "#2f5d8f",
          },
        },
        left: Math.round(width * 0.25),
        top: Math.round(height * 0.2),
      },
    ])
    .png()
    .toBuffer();
  return toBytes(buffer);
}

/** A flat single-color frame — fails every blank-floor check. */
export async function solidPng(
  color: string,
  width: number,
  height: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await sharp({
    create: { width, height, channels: 3 as const, background: color },
  })
    .png()
    .toBuffer();
  return toBytes(buffer);
}

/** A mostly-transparent frame — fails the garment transparency ceiling. */
export async function transparentPng(
  width: number,
  height: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 143, g: 47, b: 47, alpha: 0.03 },
    },
  })
    .png()
    .toBuffer();
  return toBytes(buffer);
}
