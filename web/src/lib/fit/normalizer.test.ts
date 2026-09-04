import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  LlmNormalizer,
  RawPageContentSchema,
  resolveNormalizer,
  RulesNormalizer,
} from "./normalizer";
import type { NormalizerClient } from "./normalizer";
import type { GarmentProfile } from "./schema";

const charted: GarmentProfile = {
  sourceUrl: "https://store.test/products/dress",
  brand: "Acme",
  sizeChart: {
    unit: "cm",
    from: "dom-table",
    rows: [
      { size: "S", heightRangeCm: [160, 168] },
      { size: "M", heightRangeCm: [169, 176] },
    ],
  },
};

const raw = {
  tables: ["<table><tr><td>S</td><td>88</td></tr></table>"],
  ldJson: '{"@type":"Product"}',
};
const SOURCE_URL = "https://store.test/products/dress";

describe("RulesNormalizer", () => {
  it("returns the deterministic profile untouched when a chart is present", async () => {
    const normalizer = new RulesNormalizer();

    const result = await normalizer.normalize({
      sourceUrl: SOURCE_URL,
      deterministic: charted,
      raw,
    });

    expect(result).toBe(charted);
  });

  it("passes absence through — undefined stays undefined", async () => {
    const normalizer = new RulesNormalizer();

    expect(
      await normalizer.normalize({ sourceUrl: SOURCE_URL, deterministic: undefined, raw }),
    ).toBeUndefined();
  });
});

describe("resolveNormalizer (TRYON_NORMALIZER)", () => {
  it("defaults to rules when unset", () => {
    expect(resolveNormalizer({})).toBeInstanceOf(RulesNormalizer);
  });

  it("selects rules explicitly", () => {
    expect(resolveNormalizer({ TRYON_NORMALIZER: "rules" })).toBeInstanceOf(RulesNormalizer);
  });

  it("fails loudly on a typo instead of silently downgrading", () => {
    expect(() => resolveNormalizer({ TRYON_NORMALIZER: "llmm" })).toThrow(z.ZodError);
  });

  it("fails loudly naming the key when llm is selected without GEMINI_API_KEY", () => {
    let message = "";
    try {
      resolveNormalizer({ TRYON_NORMALIZER: "llm" });
    } catch (error) {
      message = error instanceof z.ZodError ? JSON.stringify(error.issues) : String(error);
    }
    expect(message).toContain("GEMINI_API_KEY");
  });

  it("with a key set, resolves the LlmNormalizer", () => {
    const normalizer = resolveNormalizer({
      TRYON_NORMALIZER: "llm",
      GEMINI_API_KEY: "test-key",
    });
    expect(normalizer).toBeInstanceOf(LlmNormalizer);
  });
});

describe("LlmNormalizer (injected client)", () => {
  const chartless: GarmentProfile = { sourceUrl: SOURCE_URL, brand: "Acme" };
  const modelChart = {
    unit: "cm",
    from: "llm",
    rows: [
      { size: "S", chestCm: 88 },
      { size: "M", chestCm: 96 },
    ],
  };

  function fakeClient(
    output: unknown,
    options: { hang?: boolean; throwAfter?: Error } = {},
  ): NormalizerClient & { calls: { system: string; prompt: string }[] } {
    const client: NormalizerClient & { calls: { system: string; prompt: string }[] } = {
      calls: [],
      async generate({ system, prompt }) {
        client.calls.push({ system, prompt });
        if (options.throwAfter !== undefined) throw options.throwAfter;
        if (options.hang === true) return new Promise<never>(() => {});
        return output;
      },
    };
    return client;
  }

  it("never calls the model when the deterministic pass already has a chart (money guard)", async () => {
    const client = fakeClient(modelChart);
    const normalizer = new LlmNormalizer(client, { timeoutMs: 1_000 });

    const result = await normalizer.normalize({
      sourceUrl: SOURCE_URL,
      deterministic: charted,
      raw,
    });

    expect(result).toBe(charted);
    expect(client.calls).toHaveLength(0);
  });

  it("merges a model-found chart with the deterministic fields and marks provenance llm", async () => {
    const client = fakeClient({ sizeChart: modelChart, brand: "ModelBrand" });
    const normalizer = new LlmNormalizer(client, { timeoutMs: 1_000 });

    const result = await normalizer.normalize({
      sourceUrl: SOURCE_URL,
      deterministic: chartless,
      raw,
    });

    expect(result).toEqual({
      sourceUrl: SOURCE_URL,
      brand: "Acme",
      sizeChart: modelChart,
    });
  });

  it("keeps model brand-only output as a useful profile when deterministic is undefined", async () => {
    const client = fakeClient({ brand: "ModelBrand" });
    const normalizer = new LlmNormalizer(client, { timeoutMs: 1_000 });

    const result = await normalizer.normalize({
      sourceUrl: SOURCE_URL,
      deterministic: undefined,
      raw,
    });

    expect(result).toEqual({ sourceUrl: SOURCE_URL, brand: "ModelBrand" });
  });

  it("falls back to the deterministic result on malformed model output", async () => {
    const client = fakeClient({ nonsense: true, rows: "nope" });
    const normalizer = new LlmNormalizer(client, { timeoutMs: 1_000 });

    const result = await normalizer.normalize({
      sourceUrl: SOURCE_URL,
      deterministic: chartless,
      raw,
    });

    expect(result).toBe(chartless);
  });

  it("falls back when the client throws", async () => {
    const client = fakeClient(undefined, { throwAfter: new Error("provider down") });
    const normalizer = new LlmNormalizer(client, { timeoutMs: 1_000 });

    const result = await normalizer.normalize({
      sourceUrl: SOURCE_URL,
      deterministic: chartless,
      raw,
    });

    expect(result).toBe(chartless);
  });

  it("falls back when the client exceeds the timeout", async () => {
    const client = fakeClient(modelChart, { hang: true });
    const normalizer = new LlmNormalizer(client, { timeoutMs: 20 });

    const result = await normalizer.normalize({
      sourceUrl: SOURCE_URL,
      deterministic: chartless,
      raw,
    });

    expect(result).toBe(chartless);
  });

  it("builds the prompt from the raw tables and ld+json, with the no-chart instruction", async () => {
    const client = fakeClient({});
    const normalizer = new LlmNormalizer(client, { timeoutMs: 1_000 });

    await normalizer.normalize({ sourceUrl: SOURCE_URL, deterministic: undefined, raw });

    const call = client.calls[0];
    if (call === undefined) throw new Error("client was not called");
    expect(call.prompt).toContain("<table><tr><td>S</td><td>88</td></tr></table>");
    expect(call.prompt).toContain('{"@type":"Product"}');
    expect(call.system + call.prompt).toContain("no size chart");
  });
});

describe("RawPageContentSchema", () => {
  it("accepts capped raw material", () => {
    const parsed = RawPageContentSchema.parse({
      tables: ["<table>…</table>"],
      ldJson: '{"@type":"Product"}',
    });
    expect(parsed.tables).toHaveLength(1);
  });

  it("rejects more than five tables", () => {
    expect(() =>
      RawPageContentSchema.parse({ tables: Array.from({ length: 6 }, () => "<table></table>") }),
    ).toThrow(z.ZodError);
  });

  it("rejects an oversized table", () => {
    expect(() =>
      RawPageContentSchema.parse({ tables: ["x".repeat(4097)] }),
    ).toThrow(z.ZodError);
  });

  it("rejects oversized ld+json", () => {
    expect(() => RawPageContentSchema.parse({ tables: [], ldJson: "x".repeat(8193) })).toThrow(
      z.ZodError,
    );
  });

  it("defaults tables to empty and ld+json to absent", () => {
    expect(RawPageContentSchema.parse({})).toEqual({ tables: [] });
  });
});
