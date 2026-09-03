import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { z } from "zod";
import { POST } from "./route";

let dataDir: string;

const UploadResponseSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
});
const ErrorResponseSchema = z.object({ error: z.string(), code: z.string() });
const WindowErrorResponseSchema = z.object({ error: z.string() });

function toBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}

/** A person photo that passes every preflight check: textured + skin patch. */
async function personPng(width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  const face = Math.round(Math.min(width, height) * 0.2);
  const buffer = await sharp({
    create: { width, height, channels: 3 as const, background: "#3a3f4a" },
  })
    .composite([
      { input: { create: { width: face, height: face, channels: 3 as const, background: "#c88b78" } }, left: Math.round(width / 2 - face / 2), top: Math.round(height * 0.08) },
      { input: { create: { width: Math.round(width * 0.5), height: Math.round(height * 0.35), channels: 3 as const, background: "#565d6b" } }, left: Math.round(width * 0.25), top: Math.round(height * 0.5) },
    ])
    .png()
    .toBuffer();
  return toBytes(buffer);
}

/** A garment image that passes every preflight check: textured, opaque, non-skin palette. */
async function garmentPng(width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await sharp({
    create: { width, height, channels: 3 as const, background: "#e8e4de" },
  })
    .composite([
      { input: { create: { width: Math.round(width * 0.5), height: Math.round(height * 0.6), channels: 3 as const, background: "#2f5d8f" } }, left: Math.round(width * 0.25), top: Math.round(height * 0.2) },
    ])
    .png()
    .toBuffer();
  return toBytes(buffer);
}

function uploadRequest(file: File, role: string): Request {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("role", role);
  return new Request("http://localhost/api/upload", { method: "POST", body: formData });
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "upload-route-"));
  process.env["TRYON_DATA_DIR"] = dataDir;
});

describe("POST /api/upload — window validation (unchanged)", () => {
  it("stores a valid person image and returns its URL and dimensions", async () => {
    const bytes = await personPng(800, 1000);
    const response = await POST(uploadRequest(new File([bytes], "person.png", { type: "image/png" }), "person"));

    expect(response.status).toBe(201);
    const body = UploadResponseSchema.parse(await response.json());
    expect(body.url).toMatch(/^\/api\/files\/[a-z0-9-]+\.png$/);
    expect(body.width).toBe(800);
    expect(body.height).toBe(1000);

    const name = body.url.split("/").at(-1);
    if (name === undefined) throw new Error("url has no file name");
    const stored = await readFile(path.join(dataDir, "uploads", name));
    expect(stored.byteLength).toBe(bytes.byteLength);
  });

  it("rejects an undersized image with 422 and the boundary in the reason", async () => {
    const bytes = await garmentPng(255, 900);
    const response = await POST(uploadRequest(new File([bytes], "small.png", { type: "image/png" }), "garment"));

    expect(response.status).toBe(422);
    const body = WindowErrorResponseSchema.parse(await response.json());
    expect(body.error).toContain("256");
  });

  it("rejects corrupt bytes with 422", async () => {
    const bytes = new TextEncoder().encode("not an image at all");
    const response = await POST(uploadRequest(new File([bytes], "corrupt.png", { type: "image/png" }), "person"));

    expect(response.status).toBe(422);
    const body = WindowErrorResponseSchema.parse(await response.json());
    expect(body.error).toContain("not a decodable image");
  });

  it("rejects a non-multipart body with 400", async () => {
    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: "role=person",
        headers: { "Content-Type": "text/plain" },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects an unknown role with 400", async () => {
    const bytes = await garmentPng(300, 300);
    const response = await POST(uploadRequest(new File([bytes], "p.png", { type: "image/png" }), "shoe"));

    expect(response.status).toBe(400);
  });

  it("rejects a missing file part with 400", async () => {
    const formData = new FormData();
    formData.append("role", "person");
    const response = await POST(
      new Request("http://localhost/api/upload", { method: "POST", body: formData }),
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /api/upload — role preflight (Phase 4)", () => {
  it("rejects a panorama person photo with 422, code aspect, and actionable copy", async () => {
    const bytes = await personPng(1200, 300);
    const response = await POST(uploadRequest(new File([bytes], "pano.png", { type: "image/png" }), "person"));

    expect(response.status).toBe(422);
    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe("aspect");
    expect(body.error).toContain("portrait or landscape");
  });

  it("rejects a skin-free person photo with 422, code skin", async () => {
    const bytes = await garmentPng(800, 1000);
    const response = await POST(uploadRequest(new File([bytes], "nophoto.png", { type: "image/png" }), "person"));

    expect(response.status).toBe(422);
    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe("skin");
  });

  it("accepts the same skin-free image as a garment — checks are role-scoped", async () => {
    const bytes = await garmentPng(600, 800);
    const response = await POST(uploadRequest(new File([bytes], "garment.png", { type: "image/png" }), "garment"));

    expect(response.status).toBe(201);
  });

  it("rejects a mostly-transparent garment with 422, code transparent", async () => {
    const buffer = await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 4,
        background: { r: 143, g: 47, b: 47, alpha: 0.03 },
      },
    })
      .png()
      .toBuffer();
    const response = await POST(uploadRequest(new File([toBytes(buffer)], "ghost.png", { type: "image/png" }), "garment"));

    expect(response.status).toBe(422);
    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe("transparent");
    expect(body.error).toContain("solid background");
  });

  it("rejects a blank person frame with 422, code blank", async () => {
    const buffer = await sharp({
      create: { width: 800, height: 1000, channels: 3, background: "#202020" },
    })
      .png()
      .toBuffer();
    const response = await POST(uploadRequest(new File([toBytes(buffer)], "blank.png", { type: "image/png" }), "person"));

    expect(response.status).toBe(422);
    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe("blank");
  });
});
