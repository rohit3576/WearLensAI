import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { validateUploadImage } from "./image-validation";

async function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#7890a0" },
  })
    .png()
    .toBuffer();
}

describe("validateUploadImage", () => {
  it("accepts a png inside the size window and echoes its dimensions", async () => {
    const bytes = await pngBuffer(800, 1000);

    const image = await validateUploadImage({
      bytes,
      fileName: "person.png",
    });

    expect(image.width).toBe(800);
    expect(image.height).toBe(1000);
    expect(image.contentType).toBe("image/png");
    expect(image.extension).toBe(".png");
  });

  it("accepts jpg and webp and maps their content types", async () => {
    const jpg = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#101010" },
    })
      .jpeg()
      .toBuffer();
    const webp = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#202020" },
    })
      .webp()
      .toBuffer();

    const jpgImage = await validateUploadImage({ bytes: jpg, fileName: "a.jpg" });
    const webpImage = await validateUploadImage({ bytes: webp, fileName: "b.webp" });

    expect(jpgImage.contentType).toBe("image/jpeg");
    expect(webpImage.contentType).toBe("image/webp");
  });

  it("rejects an image whose shortest side is below the minimum", async () => {
    const bytes = await pngBuffer(255, 1000);

    await expect(
      validateUploadImage({ bytes, fileName: "small.png" }),
    ).rejects.toMatchObject({
      name: "ImageValidationError",
      reason: expect.stringContaining("256"),
    });
  });

  it("rejects an image whose longest side exceeds the maximum", async () => {
    const bytes = await pngBuffer(1000, 4097);

    await expect(
      validateUploadImage({ bytes, fileName: "huge.png" }),
    ).rejects.toMatchObject({
      name: "ImageValidationError",
      reason: expect.stringContaining("4096"),
    });
  });

  it("rejects an unsupported extension", async () => {
    const bytes = await pngBuffer(300, 300);

    await expect(
      validateUploadImage({ bytes, fileName: "pic.gif" }),
    ).rejects.toMatchObject({
      name: "ImageValidationError",
      reason: expect.stringContaining("unsupported format"),
    });
  });

  it("rejects corrupt bytes that carry an allowed extension", async () => {
    const bytes = Buffer.from("definitely not an image");

    await expect(
      validateUploadImage({ bytes, fileName: "corrupt.png" }),
    ).rejects.toMatchObject({
      name: "ImageValidationError",
      reason: expect.stringContaining("not a decodable image"),
    });
  });

  it("rejects a payload above the byte ceiling before decoding", async () => {
    const bytes = Buffer.alloc(10 * 1024 * 1024 + 1, 1);

    await expect(
      validateUploadImage({ bytes, fileName: "big.png" }),
    ).rejects.toMatchObject({
      name: "ImageValidationError",
      reason: expect.stringContaining("file too large"),
    });
  });

  it("accepts the exact window boundaries", async () => {
    const minEdge = await pngBuffer(256, 256);
    const maxEdge = await pngBuffer(4096, 4096);

    await expect(
      validateUploadImage({ bytes: minEdge, fileName: "edge-min.png" }),
    ).resolves.toMatchObject({ width: 256, height: 256 });
    await expect(
      validateUploadImage({ bytes: maxEdge, fileName: "edge-max.png" }),
    ).resolves.toMatchObject({ width: 4096, height: 4096 });
  });
});
