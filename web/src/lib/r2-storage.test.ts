import { PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { R2Storage } from "./r2-storage";
import type { PutObjectSender } from "./r2-storage";
import type { StoredUpload } from "./storage";
import type { UploadRole } from "./upload-rules";

function upload(overrides: Partial<StoredUpload> = {}): StoredUpload {
  return {
    bytes: Buffer.from("fake-image-bytes"),
    contentType: "image/png",
    role: "person" as UploadRole,
    ...overrides,
  };
}

function makeSender(): {
  sent: PutObjectCommand[];
  sender: PutObjectSender;
} {
  const sent: PutObjectCommand[] = [];
  return {
    sent,
    sender: {
      async send(command) {
        sent.push(command);
        return {};
      },
    },
  };
}

describe("R2Storage.put", () => {
  it("uploads with bucket, content type, and immutable cache; returns a public URL", async () => {
    const { sent, sender } = makeSender();
    const storage = new R2Storage({
      client: sender,
      bucket: "wearlens-uploads",
      publicBaseUrl: "https://pub-abc123.r2.dev",
      keyPrefix: "uploads/",
    });

    const url = await storage.put(upload());

    expect(sent).toHaveLength(1);
    const command = sent[0];
    if (command === undefined) throw new Error("no command sent");
    expect(command.input.Bucket).toBe("wearlens-uploads");
    expect(command.input.Key).toMatch(/^uploads\/[0-9a-f-]{36}\.png$/);
    expect(command.input.ContentType).toBe("image/png");
    expect(command.input.CacheControl).toBe("public, max-age=31536000, immutable");
    expect(command.input.Body).toStrictEqual(Buffer.from("fake-image-bytes"));
    expect(url).toBe(`https://pub-abc123.r2.dev/${command.input.Key}`);
  });

  it("keys each extension by content type", async () => {
    const { sent, sender } = makeSender();
    const storage = new R2Storage({
      client: sender,
      bucket: "b",
      publicBaseUrl: "https://cdn.example.com",
      keyPrefix: "uploads/",
    });

    await storage.put(upload({ contentType: "image/jpeg" }));
    await storage.put(upload({ contentType: "image/webp" }));

    expect(sent[0]?.input.Key).toMatch(/\.jpg$/);
    expect(sent[1]?.input.Key).toMatch(/\.webp$/);
  });

  it("never generates the same key twice", async () => {
    const { sender } = makeSender();
    const storage = new R2Storage({
      client: sender,
      bucket: "b",
      publicBaseUrl: "https://cdn.example.com",
      keyPrefix: "uploads/",
    });

    const urls = new Set(
      await Promise.all([storage.put(upload()), storage.put(upload()), storage.put(upload())]),
    );

    expect(urls.size).toBe(3);
  });

  it("tolerates a trailing slash on the public base URL", async () => {
    const { sender } = makeSender();
    const storage = new R2Storage({
      client: sender,
      bucket: "b",
      publicBaseUrl: "https://cdn.example.com/",
      keyPrefix: "uploads/",
    });

    const url = await storage.put(upload());

    expect(url).not.toContain(".com//");
    expect(url).toMatch(/^https:\/\/cdn\.example\.com\/uploads\//);
  });
});
