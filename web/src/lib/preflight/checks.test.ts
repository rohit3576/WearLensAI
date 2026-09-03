import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { runPreflight } from "./checks";
import type { PreflightContext } from "./checks";

async function texturedPng(
  width: number,
  height: number,
  patches: readonly { readonly color: string; readonly left: number; readonly top: number; readonly width: number; readonly height: number }[] = [],
): Promise<PreflightContext> {
  const composites = patches.map((patch) => ({
    input: {
      create: {
        width: patch.width,
        height: patch.height,
        channels: 3 as const,
        background: patch.color,
      },
    },
    left: patch.left,
    top: patch.top,
  }));
  const bytes = await sharp({
    create: { width, height, channels: 3, background: "#3a3f4a" },
  })
    .composite(composites)
    .png()
    .toBuffer();
  return { bytes, width, height, contentType: "image/png" };
}

const SKIN_PATCH = { color: "#c88b78", left: 0, top: 0, width: 160, height: 160 } as const;

describe("runPreflight — person", () => {
  it("accepts a square-ish textured photo with skin visible", async () => {
    const image = await texturedPng(800, 800, [{ ...SKIN_PATCH, left: 350, top: 100 }]);

    await expect(runPreflight("person", image)).resolves.toStrictEqual({ ok: true });
  });

  it("accepts the exact 1:3 aspect boundary in both orientations", async () => {
    const portrait = await texturedPng(500, 1500, [{ ...SKIN_PATCH, width: 150, height: 150, left: 175, top: 675 }]);
    const landscape = await texturedPng(1500, 500, [{ ...SKIN_PATCH, width: 150, height: 150, left: 675, top: 175 }]);

    await expect(runPreflight("person", portrait)).resolves.toStrictEqual({ ok: true });
    await expect(runPreflight("person", landscape)).resolves.toStrictEqual({ ok: true });
  });

  it("rejects an extreme panorama strip with the aspect code and actionable copy", async () => {
    const image = await texturedPng(1200, 250, [{ ...SKIN_PATCH, left: 550, top: 100 }]);

    await expect(runPreflight("person", image)).resolves.toMatchObject({
      ok: false,
      rejection: { code: "aspect", reason: expect.stringContaining("portrait or landscape") },
    });
  });

  it("rejects a solid blank frame with the blank code", async () => {
    const bytes = await sharp({
      create: { width: 800, height: 1000, channels: 3, background: "#202020" },
    })
      .png()
      .toBuffer();

    await expect(
      runPreflight("person", { bytes, width: 800, height: 1000, contentType: "image/png" }),
    ).resolves.toMatchObject({
      ok: false,
      rejection: { code: "blank", reason: expect.stringContaining("blank") },
    });
  });

  it("rejects a textured image with no skin tones at all", async () => {
    const image = await texturedPng(800, 1000, [
      { color: "#0d5c2e", left: 100, top: 100, width: 300, height: 300 },
      { color: "#123f8f", left: 400, top: 500, width: 300, height: 300 },
    ]);

    await expect(runPreflight("person", image)).resolves.toMatchObject({
      ok: false,
      rejection: { code: "skin", reason: expect.stringContaining("face") },
    });
  });
});

describe("runPreflight — garment", () => {
  it("accepts a textured garment image without applying person checks", async () => {
    const image = await texturedPng(600, 600, [
      { color: "#0d5c2e", left: 150, top: 150, width: 300, height: 300 },
    ]);

    await expect(runPreflight("garment", image)).resolves.toStrictEqual({ ok: true });
  });

  it("rejects a solid blank garment frame", async () => {
    const bytes = await sharp({
      create: { width: 600, height: 600, channels: 3, background: "#f0f0f0" },
    })
      .png()
      .toBuffer();

    await expect(
      runPreflight("garment", { bytes, width: 600, height: 600, contentType: "image/png" }),
    ).resolves.toMatchObject({
      ok: false,
      rejection: { code: "blank" },
    });
  });

  it("rejects a mostly-transparent PNG with the transparent code", async () => {
    const bytes = await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 4,
        background: { r: 200, g: 60, b: 60, alpha: 0.03 },
      },
    })
      .png()
      .toBuffer();

    await expect(
      runPreflight("garment", { bytes, width: 600, height: 600, contentType: "image/png" }),
    ).resolves.toMatchObject({
      ok: false,
      rejection: { code: "transparent", reason: expect.stringContaining("solid background") },
    });
  });

  it("accepts an opaque PNG and skips the alpha check for JPEG-style input without alpha", async () => {
    const opaque = await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 4,
        background: { r: 200, g: 60, b: 60, alpha: 1 },
      },
    })
      .composite([
        {
          input: {
            create: { width: 200, height: 200, channels: 3, background: "#f0f0f0" },
          },
          left: 200,
          top: 200,
        },
      ])
      .png()
      .toBuffer();

    await expect(
      runPreflight("garment", {
        bytes: opaque,
        width: 600,
        height: 600,
        contentType: "image/png",
      }),
    ).resolves.toStrictEqual({ ok: true });
  });
});
