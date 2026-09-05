/**
 * Provider port for the routed try-on engine — one interface, many
 * thin adapters, zero vendor SDKs. Adding a model = one file exporting
 * a TryOnProvider + one entry in TRYON_PROVIDERS. Canonical categories
 * are ours (fed by the extension's JSON-LD extraction); each adapter
 * translates them to its native vocabulary. Poll carries the result
 * URL on done (no separate result round-trip).
 */

export const CANONICAL_CATEGORIES = [
  "top",
  "bottom",
  "one-piece",
  "outerwear",
  "shoes",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

const CATEGORY_BY_WORD: ReadonlyArray<readonly [RegExp, CanonicalCategory]> = [
  [/\b(shoes?|sneakers?|boots?|sandals?|heels?|loafers?)\b/, "shoes"],
  [/\b(dress(es)?|gowns?|jumpsuits?|rompers?|bodysuits?)\b/, "one-piece"],
  [/\b(jeans|pants|trousers?|shorts|skirts?|leggings|joggers?)\b/, "bottom"],
  [/\b(jackets?|coats?|blazers?|parkas?|outerwear)\b/, "outerwear"],
  [/\b(shirts?|t-?shirts?|tees?|blouses?|tops?|sweaters?|hoodies?|cardigans?|knitwear)\b/, "top"],
];

const EXACT_OVERRIDES: Readonly<Record<string, CanonicalCategory>> = {
  "dress shirt": "top",
  "shirt dress": "one-piece",
  "shirt dresses": "one-piece",
  overall: "one-piece",
  overalls: "one-piece",
};

export function canonicalCategoryOf(raw: string | undefined): CanonicalCategory | undefined {
  const text = raw?.trim().toLowerCase() ?? "";
  if (text === "") return undefined;
  const exact = EXACT_OVERRIDES[text];
  if (exact !== undefined) return exact;
  for (const [pattern, category] of CATEGORY_BY_WORD) {
    if (pattern.test(text)) return category;
  }
  return undefined;
}

export interface ProviderTryOnInput {
  readonly personImageUrl: string;
  readonly garmentImageUrl: string;
  readonly canonicalCategory: CanonicalCategory | undefined;
}

export interface ProviderJobRef {
  readonly providerId: string;
  readonly requestId: string;
}

export type ProviderJobPhase = "queued" | "processing" | "done" | "failed";

export interface ProviderJobStatus {
  readonly phase: ProviderJobPhase;
  readonly reason?: string;
  readonly resultUrl?: string;
}

export interface TryOnProvider {
  readonly id: string;
  /** Surfaced in failure copy — costs stay visible, never silent. */
  readonly costPerCallUsd: number;
  /** Canonical categories this provider handles; empty = universal. */
  readonly categories: readonly CanonicalCategory[];
  /** Native category string for a canonical one; undefined = not sent. */
  nativeCategoryOf(category: CanonicalCategory): string | undefined;
  /** Empty categories handles everything, including unknown garments. */
  handles(category: CanonicalCategory | undefined): boolean;
  submit(input: ProviderTryOnInput): Promise<ProviderJobRef>;
  poll(ref: ProviderJobRef): Promise<ProviderJobStatus>;
}

export const DEFAULT_PROVIDER_CHAIN = [
  "fashn_v1_6",
  "kling_kolors_v1_5",
  "flux_vto",
] as const;

/**
 * Resolve the ordered provider chain from TRYON_PROVIDERS (comma
 * separated). Unknown ids fail loudly listing every valid id — the
 * ai/ adapter-registry pattern — never a silent downgrade.
 */
export function resolveProviderChain(
  env: Readonly<Record<string, string | undefined>>,
  registry: readonly TryOnProvider[],
): TryOnProvider[] {
  const raw = env["TRYON_PROVIDERS"]?.trim() ?? "";
  const ids = raw === "" ? [...DEFAULT_PROVIDER_CHAIN] : raw.split(",").map((id) => id.trim()).filter((id) => id !== "");
  if (ids.length === 0) {
    throw new Error("TRYON_PROVIDERS must name at least one provider");
  }
  const byId = new Map(registry.map((provider) => [provider.id, provider]));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    const valid = registry.map((provider) => provider.id).join(", ");
    throw new Error(
      `unknown TRYON_PROVIDERS id(s): ${unknown.join(", ")} — valid providers: ${valid}`,
    );
  }
  return ids.map((id) => {
    const provider = byId.get(id);
    if (provider === undefined) throw new Error(`provider missing from registry: ${id}`);
    return provider;
  });
}

/** Test double for the port — real adapters land in R2/R3. */
export function fakeProviderForTests(options: {
  id: string;
  categories?: readonly CanonicalCategory[];
  costPerCallUsd?: number;
}): TryOnProvider {
  const categories = options.categories ?? [];
  return {
    id: options.id,
    costPerCallUsd: options.costPerCallUsd ?? 0,
    categories,
    nativeCategoryOf: (category) =>
      categories.includes(category) ? category.replace("one-piece", "one-pieces") : undefined,
    handles: (category) =>
      categories.length === 0 ? true : category !== undefined && categories.includes(category),
    submit: async () => ({ providerId: options.id, requestId: "fake" }),
    poll: async () => ({ phase: "done", resultUrl: "https://cdn.test/result.png" }),
  };
}
