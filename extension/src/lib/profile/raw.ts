/**
 * Raw page material for the backend normalizer — public content only:
 * the ≤5 most size-ish <table> outerHTMLs (keyword tables rank ahead of
 * bigger keyword-less ones, then by text length; each truncated to
 * 4 KB) and the ld+json scripts joined and truncated to 8 KB. Caps
 * mirror the web contract (RawPageContentSchema) — keep both in sync.
 */

const MAX_TABLES = 5;
const MAX_TABLE_CHARS = 4096;
const MAX_LD_JSON_CHARS = 8192;
const SIZE_KEYWORDS = /size|chest|bust|waist|height/i;

export interface RawPageContent {
  readonly tables: string[];
  readonly ldJson?: string;
}

export function collectRawPageContent(doc: Document): RawPageContent {
  const tables = [...doc.querySelectorAll("table")]
    .map((table) => ({
      html: table.outerHTML,
      keywordHit: SIZE_KEYWORDS.test(table.textContent ?? ""),
      textLength: (table.textContent ?? "").length,
    }))
    .sort((a, b) => Number(b.keywordHit) - Number(a.keywordHit) || b.textLength - a.textLength)
    .slice(0, MAX_TABLES)
    .map((entry) => entry.html.slice(0, MAX_TABLE_CHARS));

  const ldJson = [...doc.querySelectorAll('script[type="application/ld+json"]')]
    .map((script) => script.textContent ?? "")
    .join("\n")
    .slice(0, MAX_LD_JSON_CHARS);

  return { tables, ...(ldJson === "" ? {} : { ldJson }) };
}
