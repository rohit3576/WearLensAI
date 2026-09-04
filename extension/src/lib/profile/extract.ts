/**
 * Garment profile extraction v1 — deterministic, structured sources
 * only: JSON-LD Product nodes (brand / category / title) over the same
 * shared walk as garment detection. Page reality never throws: fields
 * degrade to absence; a page without a field-bearing Product node has
 * no profile. LLM normalization is the F4 unlock behind this same
 * entry point.
 */
import { isProductNode, visitJsonLdNodes } from "../jsonld-walk";
import type { JsonLdNode } from "../jsonld-walk";
import { GarmentProfileSchema } from "./schema";
import type { GarmentProfile } from "./schema";

function oneStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value !== "") return value;
  if (Array.isArray(value)) return oneStringValue(value[0]);
  if (value !== null && typeof value === "object") {
    return oneStringValue((value as JsonLdNode)["name"]);
  }
  return undefined;
}

export function extractGarmentProfile(doc: Document, sourceUrl: string): GarmentProfile | undefined {
  for (const node of visitJsonLdNodes(doc)) {
    if (!isProductNode(node)) continue;
    const candidate = {
      sourceUrl,
      title: oneStringValue(node["name"]),
      brand: oneStringValue(node["brand"]),
      category: oneStringValue(node["category"]),
    };
    if (candidate.title === undefined && candidate.brand === undefined && candidate.category === undefined) {
      continue;
    }
    return GarmentProfileSchema.parse(candidate);
  }
  return undefined;
}
