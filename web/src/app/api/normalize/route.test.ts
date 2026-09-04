import { describe, expect, it } from "vitest";
import { z } from "zod";
import { POST } from "./route";

const ErrorResponseSchema = z.object({ error: z.string() });
const ProfileResponseSchema = z.object({ profile: z.unknown() });

function normalizeRequest(payload: unknown): Request {
  return new Request("http://localhost/api/normalize", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
}

const chartlessDeterministic = {
  sourceUrl: "https://store.test/products/dress",
  brand: "Acme",
};

describe("POST /api/normalize (rules mode, the default)", () => {
  it("passes the deterministic profile through untouched", async () => {
    const response = await POST(
      normalizeRequest({
        sourceUrl: "https://store.test/products/dress",
        deterministic: chartlessDeterministic,
        raw: { tables: ["<table></table>"], ldJson: "{}" },
      }),
    );

    expect(response.status).toBe(200);
    const { profile } = ProfileResponseSchema.parse(await response.json());
    expect(profile).toEqual(chartlessDeterministic);
  });

  it("answers 200 with a null profile when nothing was found", async () => {
    const response = await POST(
      normalizeRequest({
        sourceUrl: "https://store.test/products/dress",
        raw: { tables: [] },
      }),
    );

    expect(response.status).toBe(200);
    const body = ProfileResponseSchema.parse(await response.json());
    expect(body.profile).toBeNull();
  });

  it("rejects an over-cap payload with 400 naming tables", async () => {
    const response = await POST(
      normalizeRequest({
        sourceUrl: "https://store.test/products/dress",
        raw: { tables: Array.from({ length: 6 }, () => "<table></table>") },
      }),
    );

    expect(response.status).toBe(400);
    const { error } = ErrorResponseSchema.parse(await response.json());
    expect(error).toContain("tables");
  });

  it("rejects a missing sourceUrl with 400 naming it", async () => {
    const response = await POST(
      normalizeRequest({ raw: { tables: [] } }),
    );

    expect(response.status).toBe(400);
    const { error } = ErrorResponseSchema.parse(await response.json());
    expect(error).toContain("sourceUrl");
    expect(error).toContain("required");
  });

  it("rejects a non-JSON body with 400", async () => {
    const response = await POST(
      new Request("http://localhost/api/normalize", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    const { error } = ErrorResponseSchema.parse(await response.json());
    expect(error).toContain("JSON");
  });
});
