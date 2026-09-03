import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { garmentPhoto, personPhoto, solidPng, transparentPng } from "@/lib/testing/images";
import { POST } from "./route";

let dataDir: string;

const UploadResponseSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
});
const ErrorResponseSchema = z.object({ error: z.string(), code: z.string() });
const WindowErrorResponseSchema = z.object({ error: z.string() });

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
    const bytes = await personPhoto(800, 1000);
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
    const bytes = await garmentPhoto(255, 900);
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
    const bytes = await garmentPhoto(300, 300);
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
    const bytes = await personPhoto(1200, 300);
    const response = await POST(uploadRequest(new File([bytes], "pano.png", { type: "image/png" }), "person"));

    expect(response.status).toBe(422);
    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe("aspect");
    expect(body.error).toContain("portrait or landscape");
  });

  it("rejects a skin-free person photo with 422, code skin", async () => {
    const bytes = await garmentPhoto(800, 1000);
    const response = await POST(uploadRequest(new File([bytes], "nophoto.png", { type: "image/png" }), "person"));

    expect(response.status).toBe(422);
    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe("skin");
  });

  it("accepts the same skin-free image as a garment — checks are role-scoped", async () => {
    const bytes = await garmentPhoto(600, 800);
    const response = await POST(uploadRequest(new File([bytes], "garment.png", { type: "image/png" }), "garment"));

    expect(response.status).toBe(201);
  });

  it("rejects a mostly-transparent garment with 422, code transparent", async () => {
    const bytes = await transparentPng(600, 600);
    const response = await POST(uploadRequest(new File([bytes], "ghost.png", { type: "image/png" }), "garment"));

    expect(response.status).toBe(422);
    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe("transparent");
    expect(body.error).toContain("solid background");
  });

  it("rejects a blank person frame with 422, code blank", async () => {
    const bytes = await solidPng("#202020", 800, 1000);
    const response = await POST(uploadRequest(new File([bytes], "blank.png", { type: "image/png" }), "person"));

    expect(response.status).toBe(422);
    const body = ErrorResponseSchema.parse(await response.json());
    expect(body.code).toBe("blank");
  });
});
