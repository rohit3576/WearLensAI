import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { SqliteJobStore } from "../src/lib/tryon/job-store";
import { JobId } from "../src/lib/tryon/engine";
import { garmentPhoto, personPhoto } from "../src/lib/testing/images";
import { createMcpServer } from "./server";

const CallResultSchema = z.object({
  content: z.tuple([z.object({ type: z.literal("text"), text: z.string() })]),
  isError: z.boolean().optional(),
});

let workDir: string;
let dataDir: string;
let personPath: string;
let garmentPath: string;
let client: Client;

interface ToolPayload {
  readonly ok: boolean;
  readonly jobId?: string;
  readonly phase?: string;
  readonly reason?: string;
  readonly resultPath?: string;
  readonly resultUrl?: string;
}

async function callTool(
  name: string,
  arguments_: Record<string, string>,
): Promise<{ readonly isError: boolean; readonly payload: ToolPayload }> {
  const result = CallResultSchema.parse(await client.callTool({ name, arguments: arguments_ }));
  return {
    isError: result.isError === true,
    payload: JSON.parse(result.content[0].text) as ToolPayload,
  };
}

async function pollUntil(
  jobId: string,
  phase: "done" | "failed",
): Promise<ToolPayload> {
  for (let i = 0; i < 100; i++) {
    const { payload } = await callTool("get_try_on_status", { job_id: jobId });
    if (payload.phase === phase) return payload;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`job never reached ${phase}`);
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "mcp-e2e-"));
  dataDir = path.join(workDir, "data");
  process.env["TRYON_DATA_DIR"] = dataDir;
  process.env["TRYON_STUB_QUEUED_MS"] = "100";
  process.env["TRYON_STUB_PROCESSING_MS"] = "100";
  personPath = path.join(workDir, "person.png");
  garmentPath = path.join(workDir, "garment.png");
  await writeFile(personPath, await personPhoto(800, 1000));
  await writeFile(garmentPath, await garmentPhoto(600, 600));

  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "e2e", version: "0.0.1" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

describe("MCP end-to-end over in-memory transport", () => {
  it("drives submit → status → result with a real file on disk, and re-polls idempotently", async () => {
    const submitted = await callTool("submit_try_on", {
      person_path: personPath,
      garment_path: garmentPath,
    });
    expect(submitted.isError).toBe(false);
    expect(submitted.payload.ok).toBe(true);
    const jobId = submitted.payload.jobId;
    if (jobId === undefined) throw new Error("no jobId in submit result");

    const done = await pollUntil(jobId, "done");
    expect(done.resultUrl).toBe(`/api/results/${jobId}.png`);

    const result = await callTool("get_try_on_result", { job_id: jobId });
    expect(result.isError).toBe(false);
    const resultPath = result.payload.resultPath;
    if (resultPath === undefined) throw new Error("no resultPath in result");
    const info = await stat(resultPath);
    expect(info.size).toBeGreaterThan(0);

    const rePolled = await callTool("get_try_on_status", { job_id: jobId });
    expect(rePolled.payload.phase).toBe("done");
    expect(rePolled.payload.resultUrl).toBe(done.resultUrl);
  });

  it("reports the failed path with a reason when the stored input vanishes mid-lifecycle", async () => {
    const submitted = await callTool("submit_try_on", {
      person_path: personPath,
      garment_path: garmentPath,
    });
    const jobId = submitted.payload.jobId;
    if (jobId === undefined) throw new Error("no jobId in submit result");

    const uploads = await readdir(path.join(dataDir, "uploads"));
    for (const name of uploads) {
      await rm(path.join(dataDir, "uploads", name));
    }

    const failed = await pollUntil(jobId, "failed");
    expect(failed.phase).toBe("failed");
    expect(failed.reason ?? "").not.toBe("");

    const result = await callTool("get_try_on_result", { job_id: jobId });
    expect(result.isError).toBe(true);
    expect(result.payload.reason ?? "").toContain("failed");
  });

  it("surfaces preflight rejections as tool errors with the web copy", async () => {
    const blankGarment = path.join(workDir, "blank-garment.png");
    await writeFile(blankGarment, await garmentPhoto(600, 600));

    const rejected = await callTool("submit_try_on", {
      person_path: garmentPath,
      garment_path: blankGarment,
    });

    expect(rejected.isError).toBe(true);
    expect(rejected.payload.ok).toBe(false);
    expect(rejected.payload.reason ?? "").toContain("face");
  });
});

describe("shared TRYON_DATA_DIR visibility", () => {
  it("a job submitted via MCP handlers is visible to a second SqliteJobStore on the same db", async () => {
    const submitted = await callTool("submit_try_on", {
      person_path: personPath,
      garment_path: garmentPath,
    });
    const jobId = submitted.payload.jobId;
    if (jobId === undefined) throw new Error("no jobId in submit result");

    const webStore = new SqliteJobStore({ dbPath: path.join(dataDir, "jobs.db") });
    const job = await webStore.get(JobId(jobId));

    expect(job).not.toBeNull();
    expect(job?.personUrl).toMatch(/^\/api\/files\//);
  });
});
