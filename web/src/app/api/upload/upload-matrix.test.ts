import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { garmentPhoto, personPhoto, solidPng, transparentPng } from "@/lib/testing/images";
import { POST } from "./route";

/**
 * The Phase 4 ten-case test matrix: every offline-checkable good/bad input
 * pair driven through the real POST /api/upload handler. The two
 * model-gated cases (no-person-in-frame, not-clothing) live in
 * doc/private/phases/phase-4-matrix.md as DEFERRED until the budget unlock.
 */

const PreflightErrorResponseSchema = z.object({ error: z.string(), code: z.string() });
const WindowErrorResponseSchema = z.object({ error: z.string() });

interface Fixture {
  readonly fileName: string;
  readonly build: () => Promise<Uint8Array<ArrayBuffer>>;
}

interface MatrixCase {
  readonly id: number;
  readonly name: string;
  readonly person?: Fixture;
  readonly garment?: Fixture;
  readonly expect:
    | "accept-all"
    | { readonly role: "person" | "garment"; readonly code?: string; readonly reasonIncludes?: string };
}

async function upload(fixture: Fixture, role: "person" | "garment"): Promise<Response> {
  const formData = new FormData();
  formData.append("file", new File([await fixture.build()], fixture.fileName, { type: "image/png" }));
  formData.append("role", role);
  return POST(new Request("http://localhost/api/upload", { method: "POST", body: formData }));
}

async function assertAccepted(fixture: Fixture, role: "person" | "garment"): Promise<void> {
  const response = await upload(fixture, role);
  expect(response.status).toBe(201);
}

async function assertRejected(
  fixture: Fixture,
  role: "person" | "garment",
  expected: { readonly code?: string; readonly reasonIncludes?: string },
): Promise<void> {
  const response = await upload(fixture, role);
  expect(response.status).toBe(422);
  if (expected.code === undefined) {
    const body = WindowErrorResponseSchema.parse(await response.json());
    if (expected.reasonIncludes !== undefined) {
      expect(body.error).toContain(expected.reasonIncludes);
    }
    return;
  }
  const body = PreflightErrorResponseSchema.parse(await response.json());
  expect(body.code).toBe(expected.code);
}

const CASES: readonly MatrixCase[] = [
  {
    id: 1,
    name: "good person + good garment",
    person: { fileName: "person.png", build: () => personPhoto(800, 1000) },
    garment: { fileName: "garment.png", build: () => garmentPhoto(600, 600) },
    expect: "accept-all",
  },
  {
    id: 2,
    name: "panorama person strip",
    person: { fileName: "pano.png", build: () => personPhoto(1200, 300) },
    garment: { fileName: "garment.png", build: () => garmentPhoto(600, 600) },
    expect: { role: "person", code: "aspect" },
  },
  {
    id: 3,
    name: "blank person frame",
    person: { fileName: "blank.png", build: () => solidPng("#202020", 800, 1000) },
    garment: { fileName: "garment.png", build: () => garmentPhoto(600, 600) },
    expect: { role: "person", code: "blank" },
  },
  {
    id: 4,
    name: "skin-free person graphic",
    person: { fileName: "graphic.png", build: () => garmentPhoto(800, 1000) },
    garment: { fileName: "garment.png", build: () => garmentPhoto(600, 600) },
    expect: { role: "person", code: "skin" },
  },
  {
    id: 5,
    name: "undersized person below the 256px window",
    person: { fileName: "small.png", build: () => personPhoto(250, 313) },
    garment: { fileName: "garment.png", build: () => garmentPhoto(600, 600) },
    expect: { role: "person", reasonIncludes: "256" },
  },
  {
    id: 6,
    name: "blank garment frame",
    person: { fileName: "person.png", build: () => personPhoto(800, 1000) },
    garment: { fileName: "blank.png", build: () => solidPng("#f0f0f0", 600, 600) },
    expect: { role: "garment", code: "blank" },
  },
  {
    id: 7,
    name: "mostly-transparent garment",
    person: { fileName: "person.png", build: () => personPhoto(800, 1000) },
    garment: { fileName: "ghost.png", build: () => transparentPng(600, 600) },
    expect: { role: "garment", code: "transparent", reasonIncludes: "solid background" },
  },
  {
    id: 8,
    name: "wrong-format garment (.gif)",
    person: { fileName: "person.png", build: () => personPhoto(800, 1000) },
    garment: { fileName: "pic.gif", build: () => garmentPhoto(600, 600) },
    expect: { role: "garment", reasonIncludes: "unsupported format" },
  },
  {
    id: 9,
    name: "corrupt garment bytes",
    person: { fileName: "person.png", build: () => personPhoto(800, 1000) },
    garment: {
      fileName: "corrupt.png",
      build: async () => new TextEncoder().encode("not an image at all"),
    },
    expect: { role: "garment", reasonIncludes: "not a decodable image" },
  },
  {
    id: 10,
    name: "exact window boundaries accepted (256px person, 4096px garment)",
    person: { fileName: "edge-person.png", build: () => personPhoto(256, 256) },
    garment: { fileName: "edge-garment.png", build: () => garmentPhoto(4096, 4096) },
    expect: "accept-all",
  },
];

beforeAll(async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "upload-matrix-"));
  process.env["TRYON_DATA_DIR"] = dataDir;
});

describe("Phase 4 upload test matrix", () => {
  for (const testCase of CASES) {
    it(`case ${testCase.id}: ${testCase.name}`, async () => {
      const rejecting = testCase.expect === "accept-all" ? null : testCase.expect;

      if (testCase.person !== undefined) {
        if (rejecting === null || rejecting.role !== "person") {
          await assertAccepted(testCase.person, "person");
        } else {
          await assertRejected(testCase.person, "person", rejecting);
        }
      }
      if (testCase.garment !== undefined) {
        if (rejecting === null || rejecting.role !== "garment") {
          await assertAccepted(testCase.garment, "garment");
        } else {
          await assertRejected(testCase.garment, "garment", rejecting);
        }
      }
    });
  }
});
