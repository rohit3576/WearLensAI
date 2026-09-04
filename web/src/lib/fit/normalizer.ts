/**
 * Garment normalizer seam — deterministic rules (default, $0) vs a
 * structured-output model (F4.2, unlock-gated behind
 * TRYON_NORMALIZER=llm + GEMINI_API_KEY). The input carries BOTH the
 * extension's deterministic extraction and capped raw page material
 * (public tables + ld+json only); the rules twin is a passthrough — no
 * duplicate parser — and the llm twin only spends a call when the
 * deterministic pass found no chart. Mirrors resolveEngine /
 * resolveStorage: a typo fails loudly, never silently downgrades.
 */
import { z } from "zod";
import type { GarmentProfile } from "./schema";

const MAX_TABLES = 5;
const MAX_TABLE_BYTES = 4096;
const MAX_LD_JSON_BYTES = 8192;

export const RawPageContentSchema = z.object({
  tables: z.array(z.string().max(MAX_TABLE_BYTES)).max(MAX_TABLES).default([]),
  ldJson: z.string().max(MAX_LD_JSON_BYTES).optional(),
});

export type RawPageContent = z.infer<typeof RawPageContentSchema>;

export interface NormalizeInput {
  readonly deterministic: GarmentProfile | undefined;
  readonly raw: RawPageContent;
}

export interface GarmentNormalizer {
  normalize(input: NormalizeInput): Promise<GarmentProfile | undefined>;
}

export class RulesNormalizer implements GarmentNormalizer {
  async normalize(input: NormalizeInput): Promise<GarmentProfile | undefined> {
    return input.deterministic;
  }
}

export class NormalizerNotImplementedError extends Error {
  readonly name = "NormalizerNotImplementedError";
  constructor(readonly normalizerName: string) {
    super(
      `normalizer "${normalizerName}" is not implemented yet ` +
        "(LlmNormalizer lands in F4.2 — see fit-f4-steps.md)",
    );
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
      z
        .string("GEMINI_API_KEY is required when TRYON_NORMALIZER=llm")
        .min(1, "GEMINI_API_KEY is required when TRYON_NORMALIZER=llm")
        .parse(env["GEMINI_API_KEY"]);
      throw new NormalizerNotImplementedError(name);
    default: {
      const exhausted: never = name;
      throw new Error(`unexpected normalizer name: ${String(exhausted)}`);
    }
  }
}
