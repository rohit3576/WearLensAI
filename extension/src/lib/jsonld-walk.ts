/**
 * Shared ld+json traversal: parse every application/ld+json script and
 * visit all nodes, walking @graph. Malformed scripts are skipped, not
 * fatal. Pure DOM in, plain nodes out — used by garment detection
 * (images) and profile extraction (brand/category/title) alike.
 */

export type JsonLdNode = Record<string, unknown>;

export function visitJsonLdNodes(doc: Document): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const entry of value) collect(entry);
        return;
      }
      if (value !== null && typeof value === "object") {
        const node = value as JsonLdNode;
        nodes.push(node);
        const graph = node["@graph"];
        if (Array.isArray(graph)) collect(graph);
      }
    };
    collect(parsed);
  }
  return nodes;
}

export function isProductNode(node: JsonLdNode): boolean {
  const type = node["@type"];
  if (typeof type === "string") return type === "Product";
  if (Array.isArray(type)) return type.some((entry) => entry === "Product");
  return false;
}
