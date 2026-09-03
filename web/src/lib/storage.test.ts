import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorage } from "./storage";
import type { StoredUpload } from "./storage";

let rootDir: string;
let storage: LocalStorage;

function upload(contentType: StoredUpload["contentType"]): StoredUpload {
  return { bytes: Buffer.from("image-bytes"), contentType, role: "person" };
}

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "storage-"));
  storage = new LocalStorage({ rootDir });
});

describe("LocalStorage", () => {
  it("put() persists bytes under uploads/ and returns a /api/files URL", async () => {
    const url = await storage.put(upload("image/png"));

    expect(url).toMatch(/^\/api\/files\/[a-z0-9-]+\.png$/);

    const files = await readdir(path.join(rootDir, "uploads"));
    const name = url.split("/").at(-1);
    if (name === undefined) throw new Error("url has no file name");
    expect(files).toContain(name);

    const stored = await readFile(path.join(rootDir, "uploads", name));
    expect(stored.toString()).toBe("image-bytes");
  });

  it("maps the jpeg content type to the .jpg extension", async () => {
    const url = await storage.put(upload("image/jpeg"));
    expect(url.endsWith(".jpg")).toBe(true);
  });

  it("generates distinct URLs for identical inputs", async () => {
    const first = await storage.put(upload("image/png"));
    const second = await storage.put(upload("image/png"));
    expect(first).not.toBe(second);
  });

  it("pathOf() inverts put() URLs to their stored file path", async () => {
    const url = await storage.put(upload("image/webp"));

    const filePath = storage.pathOf(url);

    const stored = await readFile(filePath);
    expect(stored.toString()).toBe("image-bytes");
  });

  it("pathOf() rejects URLs it did not produce", async () => {
    expect(() => storage.pathOf("/api/files/../../etc/passwd")).toThrow();
    expect(() => storage.pathOf("/api/other/thing.png")).toThrow();
  });
});
