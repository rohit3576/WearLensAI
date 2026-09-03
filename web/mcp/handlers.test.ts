import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { garmentPhoto, personPhoto, solidPng } from "../src/lib/testing/images";
import { submitTryOn, tryOnResult, tryOnStatus } from "./handlers";

let workDir: string;
let personPath: string;
let garmentPath: string;

async function pollUntilDone(jobId: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const status = await tryOnStatus({ job_id: jobId });
    if (status.ok && (status.phase === "done" || status.phase === "failed")) {
      if (status.phase === "failed") throw new Error(`job failed: ${status.reason ?? ""}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job never reached done");
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "mcp-handlers-"));
  process.env["TRYON_DATA_DIR"] = path.join(workDir, "data");
  process.env["TRYON_STUB_QUEUED_MS"] = "100";
  process.env["TRYON_STUB_PROCESSING_MS"] = "100";
  personPath = path.join(workDir, "person.png");
  garmentPath = path.join(workDir, "garment.png");
});

describe("submitTryOn", () => {
  it("accepts good files and returns a job id", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(personPath, await personPhoto(800, 1000));
    await writeFile(garmentPath, await garmentPhoto(600, 600));

    const result = await submitTryOn({
      person_path: personPath,
      garment_path: garmentPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects below-window files with the boundary in the reason", async () => {
    const { writeFile } = await import("node:fs/promises");
    const smallPath = path.join(workDir, "small.png");
    await writeFile(smallPath, await personPhoto(250, 313));

    const result = await submitTryOn({ person_path: smallPath, garment_path: garmentPath });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain("256");
  });

  it("rejects skin-free person files with the preflight code and copy", async () => {
    const { writeFile } = await import("node:fs/promises");
    const graphicPath = path.join(workDir, "graphic.png");
    await writeFile(graphicPath, await garmentPhoto(800, 1000));

    const result = await submitTryOn({
      person_path: graphicPath,
      garment_path: garmentPath,
    });

    expect(result).toMatchObject({ ok: false, code: "skin" });
    if (!result.ok) expect(result.reason).toContain("face");
  });

  it("rejects a blank garment with the blank code", async () => {
    const { writeFile } = await import("node:fs/promises");
    const blankPath = path.join(workDir, "blank-garment.png");
    await writeFile(blankPath, await solidPng("#f0f0f0", 600, 600));

    const result = await submitTryOn({ person_path: personPath, garment_path: blankPath });

    expect(result).toMatchObject({ ok: false, code: "blank" });
  });

  it("rejects unreadable paths with a clear reason", async () => {
    const result = await submitTryOn({
      person_path: path.join(workDir, "missing.png"),
      garment_path: garmentPath,
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain("missing.png");
  });
});

describe("tryOnStatus / tryOnResult", () => {
  it("walk a submitted job to done and return a real result file", async () => {
    const submitted = await submitTryOn({
      person_path: personPath,
      garment_path: garmentPath,
    });
    if (!submitted.ok) throw new Error("submit failed in fixture setup");

    await pollUntilDone(submitted.jobId);

    const done = await tryOnStatus({ job_id: submitted.jobId });
    expect(done).toMatchObject({ ok: true, phase: "done" });

    const result = await tryOnResult({ job_id: submitted.jobId });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resultUrl).toBe(`/api/results/${submitted.jobId}.png`);
      expect(result.resultPath.endsWith(`${submitted.jobId}.png`)).toBe(true);
      const { stat } = await import("node:fs/promises");
      const info = await stat(result.resultPath);
      expect(info.size).toBeGreaterThan(0);
    }
  });

  it("report a not-ready result while the job is still running", async () => {
    const submitted = await submitTryOn({
      person_path: personPath,
      garment_path: garmentPath,
    });
    if (!submitted.ok) throw new Error("submit failed in fixture setup");

    const result = await tryOnResult({ job_id: submitted.jobId });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain("not ready");
  });

  it("reject unknown job ids for both tools", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";

    const status = await tryOnStatus({ job_id: unknown });
    expect(status).toMatchObject({ ok: false });

    const result = await tryOnResult({ job_id: unknown });
    expect(result).toMatchObject({ ok: false });
  });
});
