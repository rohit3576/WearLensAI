import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FitAdviceSchema } from "@/lib/fit/schema";
import { POST } from "./route";

const ErrorResponseSchema = z.object({ error: z.string() });

const CHARTED_GARMENT = {
  sourceUrl: "https://store.test/products/dress",
  brand: "Acme",
  sizeChart: {
    unit: "cm",
    from: "dom-table",
    rows: [
      { size: "S", heightRangeCm: [160, 168] },
      { size: "M", heightRangeCm: [169, 176] },
      { size: "L", heightRangeCm: [177, 184] },
    ],
  },
};

function fitRequest(garment: unknown, body: unknown): Request {
  return new Request("http://localhost/api/fit", {
    method: "POST",
    body: JSON.stringify({ garment, body }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/fit", () => {
  it("returns validated advice for a charted garment and body profile", async () => {
    const response = await POST(
      fitRequest(CHARTED_GARMENT, { heightCm: 172, fitPreference: "regular" }),
    );

    expect(response.status).toBe(200);
    const advice = FitAdviceSchema.parse(await response.json());
    expect(advice.size).toBe("M");
    expect(advice.confidence).toBe("high");
    expect(advice.reasons[0]).toContain("172 cm");
  });

  it("answers 200 with none-advice for a chartless garment — absence is an answer, not an error", async () => {
    const response = await POST(
      fitRequest({ sourceUrl: "https://store.test/products/x" }, { heightCm: 172 }),
    );

    expect(response.status).toBe(200);
    const advice = FitAdviceSchema.parse(await response.json());
    expect(advice.confidence).toBe("none");
    expect(advice.size).toBeUndefined();
  });

  it("rejects an out-of-range height with 400 naming the bound", async () => {
    const response = await POST(fitRequest(CHARTED_GARMENT, { heightCm: 300 }));

    expect(response.status).toBe(400);
    const { error } = ErrorResponseSchema.parse(await response.json());
    expect(error).toContain("120 and 220");
    expect(error).toContain("heightCm");
  });

  it("rejects a missing garment with 400 naming the field", async () => {
    const response = await POST(fitRequest(undefined, { heightCm: 172 }));

    expect(response.status).toBe(400);
    const { error } = ErrorResponseSchema.parse(await response.json());
    expect(error).toContain("garment");
    expect(error).toContain("required");
  });

  it("rejects a non-JSON body with 400", async () => {
    const response = await POST(
      new Request("http://localhost/api/fit", {
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
