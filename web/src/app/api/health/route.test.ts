import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GET } from "./route";

const HealthSchema = z.object({
  ok: z.literal(true),
  engine: z.string(),
  storage: z.string(),
});

describe("GET /api/health", () => {
  it("reports the active engine and storage modes", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    const body = HealthSchema.parse(await response.json());
    expect(body.engine).toBe("stub");
    expect(body.storage).toBe("local");
  });
});
