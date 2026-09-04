// @vitest-environment jsdom
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractSizeChart } from "./size-chart";

const STORE_URL = "https://store.test/products/wrap-dress";

function page(body: string): Document {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`, {
    url: STORE_URL,
  });
  return dom.window.document;
}

function table(...rows: string[]): string {
  const trs = rows.map((row) => `<tr>${row}</tr>`).join("");
  return `<table><tbody>${trs}</tbody></table>`;
}

function cells(...values: string[]): string {
  return values.map((value) => `<td>${value}</td>`).join("");
}

function head(...values: string[]): string {
  return values.map((value) => `<th>${value}</th>`).join("");
}

describe("extractSizeChart", () => {
  it("reads a clean metric table with chest and waist columns", () => {
    const doc = page(
      table(
        head("Size", "Chest (cm)", "Waist (cm)"),
        cells("S", "88", "72"),
        cells("M", "94", "78"),
        cells("L", "100", "84"),
      ),
    );

    const chart = extractSizeChart(doc);

    expect(chart).toEqual({
      unit: "cm",
      from: "dom-table",
      rows: [
        { size: "S", chestCm: 88, waistCm: 72 },
        { size: "M", chestCm: 94, waistCm: 78 },
        { size: "L", chestCm: 100, waistCm: 84 },
      ],
    });
  });

  it("converts inch columns to cm", () => {
    const doc = page(
      table(
        head("Size", "Chest (inches)"),
        cells("S", "34"),
        cells("M", "36"),
      ),
    );

    const chart = extractSizeChart(doc);

    expect(chart?.rows[0]?.chestCm).toBeCloseTo(86.4, 1);
    expect(chart?.rows[1]?.chestCm).toBeCloseTo(91.4, 1);
  });

  it("normalizes mixed-unit tables per column", () => {
    const doc = page(
      table(
        head("Size", "Chest (cm)", "Waist (in)"),
        cells("M", "94", "30"),
        cells("L", "100", "32"),
      ),
    );

    const chart = extractSizeChart(doc);

    expect(chart?.rows).toEqual([
      { size: "M", chestCm: 94, waistCm: 76.2 },
      { size: "L", chestCm: 100, waistCm: 81.3 },
    ]);
  });

  it("parses height ranges with hyphens and en-dashes into tuples", () => {
    const doc = page(
      table(
        head("Size", "Height (cm)"),
        cells("S", "170-175"),
        cells("M", "176–182"),
      ),
    );

    const chart = extractSizeChart(doc);

    expect(chart?.rows).toEqual([
      { size: "S", heightRangeCm: [170, 175] },
      { size: "M", heightRangeCm: [176, 182] },
    ]);
  });

  it("rejects size-only tables without measurement columns", () => {
    const doc = page(table(head("Size"), cells("S"), cells("M"), cells("L")));

    expect(extractSizeChart(doc)).toBeUndefined();
  });

  it("keeps numeric jeans sizes 28-40 as size labels", () => {
    const doc = page(
      table(
        head("Size", "Waist (cm)"),
        cells("28", "71"),
        cells("30", "76"),
        cells("32", "81"),
      ),
    );

    const chart = extractSizeChart(doc);

    expect(chart?.rows.map((row) => row.size)).toEqual(["28", "30", "32"]);
    expect(chart?.rows[0]?.waistCm).toBe(71);
  });

  it("tolerates EU/UK/US prefixed labels, including dress numerics", () => {
    const doc = page(
      table(
        head("Size", "Chest (cm)"),
        cells("EU M", "94"),
        cells("UK 12", "96"),
      ),
    );

    const chart = extractSizeChart(doc);

    expect(chart?.rows.map((row) => row.size)).toEqual(["EU M", "UK 12"]);
  });

  it("ranks multiple qualifying tables: more measurement columns wins over DOM order", () => {
    const doc = page(
      table(
        head("Size", "Chest (cm)"),
        cells("S", "88"),
        cells("M", "94"),
      ) +
        table(
          head("Size", "Chest (cm)", "Waist (cm)", "Height (cm)"),
          cells("S", "88", "72", "170-175"),
          cells("M", "94", "78", "176-182"),
        ),
    );

    const chart = extractSizeChart(doc);

    expect(chart?.rows[0]).toEqual({
      size: "S",
      chestCm: 88,
      waistCm: 72,
      heightRangeCm: [170, 175],
    });
  });

  it("returns undefined when the page has no table", () => {
    const doc = page('<div class="product">No sizes here</div>');

    expect(extractSizeChart(doc)).toBeUndefined();
  });

  it("rejects rows whose measurement values are garbage or out of range", () => {
    const doc = page(
      table(
        head("Size", "Chest (cm)"),
        cells("S", "abc"),
        cells("M", "5"),
      ),
    );

    expect(extractSizeChart(doc)).toBeUndefined();
  });

  it("maps a Bust column to chestCm", () => {
    const doc = page(
      table(
        head("Size", "Bust (cm)"),
        cells("M", "94"),
        cells("L", "100"),
      ),
    );

    const chart = extractSizeChart(doc);

    expect(chart?.rows[0]?.chestCm).toBe(94);
  });
});
