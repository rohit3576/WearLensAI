/**
 * Size-chart extraction v1 — real <table>s only. Header keywords map
 * columns (size/chest/bust→chest/waist/height), units normalize to cm
 * (in ×2.54, per column; unlabeled values are accepted only in the
 * 40–200 body-measurement range), height cells may be ranges
 * ("170-175", en/em-dashes too). Multiple tables compete; measurement
 * columns, then row count, then DOM order pick the winner. Image
 * charts, <select> pickers, and iframed tables are v1 non-goals —
 * absence is honest (`undefined`), never a guess.
 */
import { SizeChartSchema } from "./schema";
import type { SizeChart, SizeRow } from "./schema";

const CM_PER_INCH = 2.54;
const UNLABELED_CM_MIN = 40;
const UNLABELED_CM_MAX = 200;
const EXPLICIT_CM_MIN = 20;
const EXPLICIT_CM_MAX = 250;
const MIN_ROWS = 2;

type ColumnKind = "size" | "chest" | "waist" | "height" | "unknown";

interface Column {
  readonly kind: ColumnKind;
  readonly unit: "cm" | "in" | "unlabeled";
}

/** Letter sizes with optional EU/UK/US/FR/IT/DE prefix; jeans 28-40 bare. */
const SIZE_LABEL =
  /^(?:(?:EU|UK|US|FR|IT|DE)\s*)?(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL)$/i;
const PREFIXED_NUMERIC_SIZE = /^(?:EU|UK|US|FR|IT|DE)\s*(\d{1,2})$/i;
const BARE_NUMERIC_SIZE = /^\d{2}$/;
const BARE_NUMERIC_MIN = 24;
const BARE_NUMERIC_MAX = 44;
const PREFIXED_NUMERIC_MIN = 2;
const PREFIXED_NUMERIC_MAX = 60;

function isSizeLabel(text: string): boolean {
  if (SIZE_LABEL.test(text)) return true;
  const prefixed = text.match(PREFIXED_NUMERIC_SIZE);
  if (prefixed !== null) {
    const value = Number.parseInt(prefixed[1] ?? "", 10);
    return value >= PREFIXED_NUMERIC_MIN && value <= PREFIXED_NUMERIC_MAX;
  }
  if (BARE_NUMERIC_SIZE.test(text)) {
    const value = Number.parseInt(text, 10);
    return value >= BARE_NUMERIC_MIN && value <= BARE_NUMERIC_MAX;
  }
  return false;
}

function columnOf(headerText: string): Column | undefined {
  const text = headerText.toLowerCase();
  const kind: ColumnKind | undefined = text.includes("chest")
    ? "chest"
    : text.includes("bust")
      ? "chest"
      : text.includes("waist")
        ? "waist"
        : text.includes("height")
          ? "height"
          : text.includes("size")
            ? "size"
            : undefined;
  if (kind === undefined) return undefined;
  const unit = text.includes("cm")
    ? "cm"
    : text.includes("inch") || text.includes('"') || /\bin\b/.test(text)
      ? "in"
      : "unlabeled";
  return { kind, unit };
}

function cellText(cell: Element): string {
  return (cell.textContent ?? "").replace(/\s+/g, " ").trim();
}

function toCm(value: number, unit: Column["unit"]): number | undefined {
  if (unit === "in") return Math.round(value * CM_PER_INCH * 10) / 10;
  if (unit === "cm") return value;
  return value >= UNLABELED_CM_MIN && value <= UNLABELED_CM_MAX ? value : undefined;
}

function parseNumber(text: string): number | undefined {
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (match === null) return undefined;
  const value = Number.parseFloat(match[0] ?? "");
  return Number.isFinite(value) ? value : undefined;
}

/** "170-175" / "176–182" / "92" → single or [min, max], cm-normalized. */
function parseMeasurement(
  text: string,
  column: Column,
): { single?: number; range?: [number, number] } {
  const parts = text.split(/[-–—]/).map((part) => parseNumber(part));
  if (parts.some((part) => part === undefined)) return {};
  if (parts.length === 2) {
    const first = toCm(parts[0] ?? 0, column.unit);
    const second = toCm(parts[1] ?? 0, column.unit);
    if (first === undefined || second === undefined) return {};
    const [min, max] = first <= second ? [first, second] : [second, first];
    if (min < EXPLICIT_CM_MIN || max > EXPLICIT_CM_MAX) return {};
    return { range: [min, max] };
  }
  if (parts.length === 1) {
    const value = toCm(parts[0] ?? 0, column.unit);
    if (value === undefined || value < EXPLICIT_CM_MIN || value > EXPLICIT_CM_MAX) {
      return {};
    }
    return { single: value };
  }
  return {};
}

interface ParsedTable {
  readonly columns: readonly Column[];
  readonly rows: readonly SizeRow[];
}

function parseTable(table: HTMLTableElement): ParsedTable | undefined {
  const rows = [...table.querySelectorAll("tr")];
  let columns: Column[] | undefined;
  const parsedRows: SizeRow[] = [];

  for (const row of rows) {
    const cells = [...row.querySelectorAll("th,td")].map(cellText);
    if (columns === undefined) {
      const mapped = cells.map(columnOf);
      if (mapped.some((column) => column?.kind === "chest" || column?.kind === "waist" || column?.kind === "height")) {
        columns = mapped.map((column) => column ?? { kind: "unknown", unit: "unlabeled" });
      }
      continue;
    }
    const sizeIndex = columns.findIndex((column) => column.kind === "size");
    const labelIndex = sizeIndex >= 0 ? sizeIndex : 0;
    const label = cells[labelIndex] ?? "";
    if (!isSizeLabel(label)) continue;

    const sizeRow: SizeRow = { size: label };
    let stored = 0;
    columns.forEach((column, index) => {
      if (column.kind === "size" || column.kind === "unknown" || index === labelIndex) return;
      const raw = cells[index];
      if (raw === undefined) return;
      const { single, range } = parseMeasurement(raw, column);
      if (column.kind === "height") {
        if (range !== undefined) {
          sizeRow.heightRangeCm = range;
          stored++;
        } else if (single !== undefined) {
          sizeRow.heightRangeCm = [single, single];
          stored++;
        }
        return;
      }
      if (single === undefined) return;
      if (column.kind === "chest") sizeRow.chestCm = single;
      if (column.kind === "waist") sizeRow.waistCm = single;
      stored++;
    });
    if (stored > 0) parsedRows.push(sizeRow);
  }

  if (columns === undefined) return undefined;
  if (parsedRows.length < MIN_ROWS) return undefined;
  return { columns, rows: parsedRows };
}

export function extractSizeChart(doc: Document): SizeChart | undefined {
  let best: { chart: SizeChart; score: [number, number, number] } | undefined;

  doc.querySelectorAll("table").forEach((table, index) => {
    const parsed = parseTable(table);
    if (parsed === undefined) return;
    const measurementColumns = parsed.columns.filter((column) => column.kind !== "size").length;
    const score: [number, number, number] = [measurementColumns, parsed.rows.length, -index];
    if (best === undefined || compareScores(score, best.score) > 0) {
      best = { chart: SizeChartSchema.parse({ unit: "cm", rows: parsed.rows, from: "dom-table" }), score };
    }
  });

  return best?.chart;
}

function compareScores(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < a.length; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}
