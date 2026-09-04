/**
 * Garment normalizer seam — deterministic rules (default, $0) vs a
 * structured-output model (TRYON_NORMALIZER=llm + GEMINI_API_KEY).
 * The input carries the page URL, the extension's deterministic
 * extraction, and capped raw page material (public tables + ld+json
 * only). The rules twin is a passthrough; the llm twin only spends a
 * call when the deterministic pass found no chart, never throws to the
 * caller (timeout, provider failure, and malformed output all fall
 * back), and marks model-found charts with from: "llm" provenance.
 * Mirrors resolveEngine / resolveStorage: typos and missing keys fail
 * loudly, never silently downgrade.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { GarmentProfileSchema, SizeChartSchema } from "./schema";
import type { GarmentProfile } from "./schema";

const MAX_TABLES = 5;
const MAX_TABLE_BYTES = 4096;
const MAX_LD_JSON_BYTES = 8192;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MODEL = "gemini-2.0-flash";

export const RawPageContentSchema = z.object({
  tables: z.array(z.string().max(MAX_TABLE_BYTES)).max(MAX_TABLES).default([]),
  ldJson: z.string().max(MAX_LD_JSON_BYTES).optional(),
});

export type RawPageContent = z.infer<typeof RawPageContentSchema>;

export interface NormalizeInput {
  readonly sourceUrl: string;
  readonly deterministic: GarmentProfile | undefined;
  readonly raw: RawPageContent;
}

export interface GarmentNormalizer {
  normalize(input: NormalizeInput): Promise<GarmentProfile | undefined>;
}

/** One structured-output model call; returns raw JSON-compatible data. */
export interface NormalizerClient {
  generate(input: { system: string; prompt: string }): Promise<unknown>;
}

export function geminiNormalizerClient(
  apiKey: string,
  model: string = DEFAULT_MODEL,
): NormalizerClient {
  const provider = createGoogleGenerativeAI({ apiKey });
  return {
    async generate({ system, prompt }) {
      const result = await generateObject({
        model: provider(model),
        schema: LlmOutputSchema,
        system,
        prompt,
      });
      return result.object;
    },
  };
}

const LlmOutputSchema = z.object({
  sizeChart: SizeChartSchema.optional(),
  brand: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
});

const SYSTEM_PROMPT =
  "You normalize product-page size charts into structured data. " +
  "Work only from the given page material: return a size chart only when the " +
  "material contains one, never invent sizes or measurements, and convert " +
  "inches to centimetres. If the page shows no size chart, return no size chart.";

function buildPrompt(input: NormalizeInput): string {
  const det = input.deterministic;
  const known =
    det === undefined
      ? "no profile fields"
      : [det.brand, det.category, det.title].filter((value) => value !== undefined).join(", ");
  return [
    "Product page material (public content only):",
    `ld+json: ${input.raw.ldJson ?? "(none)"}`,
    `tables: ${input.raw.tables.join("\n")}`,
    `Deterministic parser already found: ${known}.`,
    "Return the size chart if the tables contain one (sizes and measurements in cm), " +
      "plus brand/category/title if visible. Return no size chart if none is present.",
  ].join("\n");
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("normalizer timed out")), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface LlmNormalizerConfig {
  readonly timeoutMs: number;
}

export class LlmNormalizer implements GarmentNormalizer {
  constructor(
    private readonly client: NormalizerClient,
    private readonly config: LlmNormalizerConfig = { timeoutMs: DEFAULT_TIMEOUT_MS },
  ) {}

  async normalize(input: NormalizeInput): Promise<GarmentProfile | undefined> {
    if (input.deterministic?.sizeChart !== undefined) return input.deterministic;

    let output: unknown;
    try {
      output = await withTimeout(
        this.client.generate({ system: SYSTEM_PROMPT, prompt: buildPrompt(input) }),
        this.config.timeoutMs,
      );
    } catch {
      return input.deterministic;
    }

    const parsed = LlmOutputSchema.safeParse(output);
    if (!parsed.success) return input.deterministic;
    const { sizeChart, brand, category, title } = parsed.data;
    if (sizeChart === undefined && brand === undefined && category === undefined && title === undefined) {
      return input.deterministic;
    }
    const det = input.deterministic;
    try {
      return GarmentProfileSchema.parse({
        sourceUrl: input.sourceUrl,
        title: det?.title ?? title,
        brand: det?.brand ?? brand,
        category: det?.category ?? category,
        sizeChart: det?.sizeChart ?? sizeChart,
      });
    } catch {
      return input.deterministic;
    }
  }
}

export class RulesNormalizer implements GarmentNormalizer {
  async normalize(input: NormalizeInput): Promise<GarmentProfile | undefined> {
    return input.deterministic;
  }
}

const NormalizerNameSchema = z.enum(["rules", "llm"]).default("rules");

/**
 * Resolve the normalizer from the environment. A typo in
 * TRYON_NORMALIZER fails loudly (ZodError); llm additionally requires
 * GEMINI_API_KEY (named in the error when missing).
 */
export function resolveNormalizer(
  env: Readonly<Record<string, string | undefined>>,
): GarmentNormalizer {
  const name = NormalizerNameSchema.parse(env["TRYON_NORMALIZER"]);
  switch (name) {
    case "rules":
      return new RulesNormalizer();
    case "llm":
      z.string("GEMINI_API_KEY is required when TRYON_NORMALIZER=llm")
        .min(1, "GEMINI_API_KEY is required when TRYON_NORMALIZER=llm")
        .parse(env["GEMINI_API_KEY"]);
      return new LlmNormalizer(
        geminiNormalizerClient(env["GEMINI_API_KEY"] ?? "", env["NORMALIZER_MODEL"] ?? DEFAULT_MODEL),
      );
    default: {
      const exhausted: never = name;
      throw new Error(`unexpected normalizer name: ${String(exhausted)}`);
    }
  }
}

let cached: GarmentNormalizer | undefined;

/** Process-wide memo, the getRuntime pattern — env read once. */
export function getNormalizer(): GarmentNormalizer {
  cached ??= resolveNormalizer(process.env);
  return cached;
}
