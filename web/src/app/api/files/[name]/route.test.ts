import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LocalStorage } from "@/lib/storage";
import { GET } from "./route";

let dataDir: string;
let storage: LocalStorage;
let storedUrl: string;
const CONTENT = "file-route-bytes";

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "files-route-"));
  process.env["TRYON_DATA_DIR"] = dataDir;
});

beforeEach(async () => {
  storage = new LocalStorage({ rootDir: dataDir });
  storedUrl = await storage.put({
    bytes: Buffer.from(CONTENT),
    contentType: "image/png",
    role: "person",
  });
});

function fileRequest(name: string): Request {
  return new Request(`http://localhost/api/files/${name}`);
}

async function getByName(name: string): Promise<Response> {
  return GET(fileRequest(name), { params: Promise.resolve({ name }) });
}

describe("GET /api/files/[name]", () => {
  it("serves a stored file with its content type", async () => {
    const name = storedUrl.slice("/api/files/".length);

    const response = await getByName(name);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(await response.text()).toBe(CONTENT);
  });

  it("returns 404 for an unknown file", async () => {
    const response = await getByName("00000000-0000-4000-8000-000000000000.png");

    expect(response.status).toBe(404);
  });

  it("returns 404 for traversal-shaped names", async () => {
    const dotdot = await getByName("..%2F..%2Fetc%2Fpasswd");
    const slash = await getByName("sub/dir/file.png");

    expect(dotdot.status).toBe(404);
    expect(slash.status).toBe(404);
  });
});
