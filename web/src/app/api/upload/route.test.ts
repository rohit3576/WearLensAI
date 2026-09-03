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
const ErrorResponseSchema = z.object({ error: z.string() });

async function pngBytes(width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: "#7890a0" },
  })
    .png()
    .toBuffer();
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
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

describe("POST /api/upload", () => {
  it("stores a valid person image and returns its URL and dimensions", async () => {
    const bytes = await pngBytes(800, 1000);
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
    const bytes = await pngBytes(255, 900);
    const response = await POST(uploadRequest(new File([bytes], "small.png", { type: "image/png" }), "garment"));

    expect(response.status).toBe(422);
    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.error).toContain("256");
  });

  it("rejects corrupt bytes with 422", async () => {
    const bytes = new TextEncoder().encode("not an image at all");
    const response = await POST(uploadRequest(new File([bytes], "corrupt.png", { type: "image/png" }), "person"));

    expect(response.status).toBe(422);
    const body = ErrorResponseSchema.parse(await response.json());
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
    const bytes = await pngBytes(300, 300);
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
