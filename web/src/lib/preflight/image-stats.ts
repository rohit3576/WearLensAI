/**
 * Sharp-based pixel statistics for preflight heuristics. Cheap and
 * deterministic: everything is computed on a 64x64 thumbnail, never the
 * full-resolution bytes.
 */
import sharp from "sharp";

const THUMB = 64;

/** Classic RGB skin-tone rule (Kovac et al.) — deliberately simple. */
function isSkinTone(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (
    r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b
  );
}

/** Standard deviation of 8-bit luma; ~0 for blank or solid frames. */
export async function lumaStdDev(bytes: Buffer): Promise<number> {
  const stats = await sharp(bytes).greyscale().stats();
  const channel = stats.channels[0];
  return channel === undefined ? 0 : channel.stdev;
}

/** Share of pixels passing the skin-tone rule, on a 64x64 thumbnail. */
export async function skinToneRatio(bytes: Buffer): Promise<number> {
  const raw = await sharp(bytes)
    .resize(THUMB, THUMB, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  let skin = 0;
  for (let i = 0; i < raw.length; i += 3) {
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    if (r === undefined || g === undefined || b === undefined) continue;
    if (isSkinTone(r, g, b)) skin += 1;
  }
  return skin / (THUMB * THUMB);
}

/** Share of mostly-transparent pixels (alpha < 200); 0 when no alpha exists. */
export async function transparentRatio(bytes: Buffer): Promise<number> {
  const meta = await sharp(bytes).metadata();
  if (meta.hasAlpha !== true) return 0;
  const raw = await sharp(bytes)
    .resize(THUMB, THUMB, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  let transparent = 0;
  for (let i = 3; i < raw.length; i += 4) {
    const alpha = raw[i];
    if (alpha === undefined) continue;
    if (alpha < 200) transparent += 1;
  }
  return transparent / (THUMB * THUMB);
}
