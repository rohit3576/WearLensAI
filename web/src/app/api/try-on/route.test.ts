import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { z } from "zod";
import { getRuntime } from "@/lib/runtime";
import { StatusEventSchema } from "@/lib/tryon/status";
import type { StatusEvent } from "@/lib/tryon/status";
import { POST } from "./route";
import { GET as getStatusStream } from "./[id]/status/route";
import { GET as getResultImage } from "../results/[name]/route";

const JobIdResponseSchema = z.object({ jobId: z.string() });
const ErrorResponseSchema = z.object({ error: z.string() });

let personUrl: string;
let garmentUrl: string;

function submitBody(personUrl: string, garmentUrl: string): Request {
  return new Request("http://localhost/api/try-on", {
    method: "POST",
    body: JSON.stringify({ personUrl, garmentUrl }),
    headers: { "Content-Type": "application/json" },
  });
}

async function submitJob(): Promise<string> {
  const response = await POST(submitBody(personUrl, garmentUrl));
  expect(response.status).toBe(201);
  const { jobId } = JobIdResponseSchema.parse(await response.json());
  return jobId;
}

async function collectSseEvents(jobId: string): Promise<StatusEvent[]> {
  const response = await getStatusStream(
    new Request(`http://localhost/api/try-on/${jobId}/status`),
    { params: Promise.resolve({ id: jobId }) },
  );
  if (response.body === null) throw new Error("SSE response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: StatusEvent[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
      if (dataLine === undefined) throw new Error(`SSE block without data: ${block}`);
      events.push(StatusEventSchema.parse(JSON.parse(dataLine.slice("data: ".length))));
      boundary = buffer.indexOf("\n\n");
    }
  }
  return events;
}

const PHASE_ORDER = { queued: 0, processing: 1, done: 2, failed: 2 } as const;

beforeAll(async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "tryon-route-"));
  process.env["TRYON_DATA_DIR"] = dataDir;
  process.env["TRYON_STUB_QUEUED_MS"] = "30";
  process.env["TRYON_STUB_PROCESSING_MS"] = "30";

  const personBytes = await sharp({
    create: { width: 800, height: 1000, channels: 3, background: "#7890a0" },
  })
    .png()
    .toBuffer();
  const garmentBytes = await sharp({
    create: { width: 300, height: 300, channels: 3, background: "#c85050" },
  })
    .png()
    .toBuffer();
  const { storage } = getRuntime();
  personUrl = await storage.put({
    bytes: personBytes,
    contentType: "image/png",
    role: "person",
  });
  garmentUrl = await storage.put({
    bytes: garmentBytes,
    contentType: "image/png",
    role: "garment",
  });
});

describe("POST /api/try-on", () => {
  it("returns 201 with a job id for stored image URLs", async () => {
    const jobId = await submitJob();
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a malformed body with 400", async () => {
    const invalid = await POST(
      new Request("http://localhost/api/try-on", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(invalid.status).toBe(400);

    const missing = await POST(submitBody(personUrl, ""));
    expect(missing.status).toBe(400);
    const { error } = ErrorResponseSchema.parse(await missing.json());
    expect(error).toContain("personUrl and garmentUrl");
  });
});

describe("GET /api/try-on/[id]/status (SSE)", () => {
  it("streams the lifecycle to done and the result URL serves a real image", async () => {
    const jobId = await submitJob();

    const events = await collectSseEvents(jobId);

    expect(events.length).toBeGreaterThan(0);
    const phases = events.map((event) => event.phase);
    for (let i = 1; i < phases.length; i++) {
      const previous = PHASE_ORDER[phases[i - 1] as keyof typeof PHASE_ORDER];
      const current = PHASE_ORDER[phases[i] as keyof typeof PHASE_ORDER];
      expect(current).toBeGreaterThanOrEqual(previous);
    }
    const final = events.at(-1);
    if (final === undefined || final.phase !== "done") {
      throw new Error(`stream did not end done: ${JSON.stringify(events)}`);
    }
    expect(final.resultUrl).toBe(`/api/results/${jobId}.png`);

    const name = final.resultUrl.slice("/api/results/".length);
    const imageResponse = await getResultImage(
      new Request(`http://localhost${final.resultUrl}`),
      { params: Promise.resolve({ name }) },
    );
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("Content-Type")).toBe("image/png");
    const meta = await sharp(Buffer.from(await imageResponse.arrayBuffer())).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(1000);
  });

  it("streams to failed with the reason when inputs are not storage URLs", async () => {
    const response = await POST(submitBody("/api/other/nope.png", garmentUrl));
    expect(response.status).toBe(201);
    const { jobId } = JobIdResponseSchema.parse(await response.json());

    const events = await collectSseEvents(jobId);

    const final = events.at(-1);
    if (final === undefined || final.phase !== "failed") {
      throw new Error(`stream did not end failed: ${JSON.stringify(events)}`);
    }
    expect(final.reason).toContain("not a local storage URL");
  });

  it("returns 404 for an unknown job id", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";
    const response = await getStatusStream(
      new Request(`http://localhost/api/try-on/${unknown}/status`),
      { params: Promise.resolve({ id: unknown }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /api/results/[name]", () => {
  it("rejects unknown and traversal-shaped names with 404", async () => {
    for (const name of ["unknown.png", "..%2Fjobs.db", "sub/dir.png"]) {
      const response = await getResultImage(new Request(`http://localhost/api/results/${name}`), {
        params: Promise.resolve({ name }),
      });
      expect(response.status).toBe(404);
    }
  });
});
