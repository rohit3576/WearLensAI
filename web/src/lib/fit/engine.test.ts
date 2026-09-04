import { describe, expect, it } from "vitest";
import { fitAdvice } from "./engine";
import type { BodyProfile, GarmentProfile, SizeRow } from "./schema";

const URL = "https://store.test/products/dress";

function garment(rows: SizeRow[]): GarmentProfile {
  return { sourceUrl: URL, sizeChart: { unit: "cm", from: "dom-table", rows } };
}

function body(overrides: Partial<BodyProfile> = {}): BodyProfile {
  return { heightCm: 175, fitPreference: "regular", ...overrides };
}

const HEIGHT_CHART: SizeRow[] = [
  { size: "S", heightRangeCm: [160, 168] },
  { size: "M", heightRangeCm: [169, 176] },
  { size: "L", heightRangeCm: [177, 184] },
];

const CHEST_CHART: SizeRow[] = [
  { size: "S", chestCm: 88 },
  { size: "M", chestCm: 96 },
  { size: "L", chestCm: 104 },
];

describe("fitAdvice", () => {
  it("1. returns none with a plain reason when the page has no chart", () => {
    const advice = fitAdvice({ sourceUrl: URL }, body());

    expect(advice.confidence).toBe("none");
    expect(advice.size).toBeUndefined();
    expect(advice.reasons).toEqual(["No size chart on this page — the try-on still works"]);
  });

  it("2. returns none asking for chest or waist when the chart has no height ranges and the body lacks them", () => {
    const advice = fitAdvice(garment(CHEST_CHART), body({ chestCm: undefined }));

    expect(advice.confidence).toBe("none");
    expect(advice.size).toBeUndefined();
    expect(advice.reasons[0]).toContain("add chest or waist");
  });

  it("3. hits high on a single exact height containment", () => {
    const advice = fitAdvice(garment(HEIGHT_CHART), body({ heightCm: 172 }));

    expect(advice).toMatchObject({ size: "M", confidence: "high" });
    expect(advice.reasons).toContain("Your height 172 cm is inside the M range (169–176 cm)");
  });

  it("4. lands medium on the nearer row when height falls in a gap", () => {
    const gapChart: SizeRow[] = [
      { size: "S", heightRangeCm: [160, 175] },
      { size: "M", heightRangeCm: [178, 184] },
    ];

    const advice = fitAdvice(garment(gapChart), body({ heightCm: 176 }));

    expect(advice.confidence).toBe("medium");
    expect(advice.size).toBe("S");
    expect(advice.reasons[0]).toContain("between");
  });

  it("5. taller than every range → low with a runs-small reason", () => {
    const advice = fitAdvice(garment(HEIGHT_CHART), body({ heightCm: 190 }));

    expect(advice).toMatchObject({ size: "L", confidence: "low" });
    expect(advice.reasons[0]).toContain("above every range");
    expect(advice.reasons[0]).toContain("run small");
  });

  it("6. shorter than every range → low with a runs-large reason", () => {
    const advice = fitAdvice(garment(HEIGHT_CHART), body({ heightCm: 155 }));

    expect(advice).toMatchObject({ size: "S", confidence: "low" });
    expect(advice.reasons[0]).toContain("below every range");
    expect(advice.reasons[0]).toContain("run large");
  });

  it("7. chest alone → smallest garment chest not smaller than the body's, low", () => {
    const advice = fitAdvice(garment(CHEST_CHART), body({ heightCm: 175, chestCm: 92 }));

    expect(advice).toMatchObject({ size: "M", confidence: "low" });
    expect(advice.reasons).toContain("Your chest 92 cm is closest to the M chest (96 cm)");
  });

  it("8. every garment chest smaller than the body's → largest, low", () => {
    const advice = fitAdvice(garment(CHEST_CHART), body({ heightCm: 175, chestCm: 150 }));

    expect(advice).toMatchObject({ size: "L", confidence: "low" });
    expect(advice.reasons[0]).toContain("L chest (104 cm)");
  });

  it("9. height and chest agree on one row → high", () => {
    const rows: SizeRow[] = [
      { size: "S", heightRangeCm: [160, 168], chestCm: 88 },
      { size: "M", heightRangeCm: [169, 176], chestCm: 96 },
      { size: "L", heightRangeCm: [177, 184], chestCm: 104 },
    ];

    const advice = fitAdvice(garment(rows), body({ heightCm: 172, chestCm: 94 }));

    expect(advice).toMatchObject({ size: "M", confidence: "high" });
  });

  it("10. height says M, chest says L, regular → the larger L, medium, both quoted", () => {
    const rows: SizeRow[] = [
      { size: "S", heightRangeCm: [160, 168], chestCm: 84 },
      { size: "M", heightRangeCm: [169, 176], chestCm: 88 },
      { size: "L", heightRangeCm: [177, 184], chestCm: 104 },
    ];

    const advice = fitAdvice(garment(rows), body({ heightCm: 172, chestCm: 92 }));

    expect(advice).toMatchObject({ size: "L", confidence: "medium" });
    expect(advice.reasons.join(" ")).toContain("Height points to M");
    expect(advice.reasons.join(" ")).toContain("chest points to L");
  });

  it("11. the same conflict with a tight preference → the smaller M, medium", () => {
    const rows: SizeRow[] = [
      { size: "S", heightRangeCm: [160, 168], chestCm: 84 },
      { size: "M", heightRangeCm: [169, 176], chestCm: 88 },
      { size: "L", heightRangeCm: [177, 184], chestCm: 104 },
    ];

    const advice = fitAdvice(garment(rows), body({ heightCm: 172, chestCm: 92, fitPreference: "tight" }));

    expect(advice).toMatchObject({ size: "M", confidence: "medium" });
  });

  it("12. exact hit with a loose preference → one row up, still high, reason states the shift", () => {
    const advice = fitAdvice(garment(HEIGHT_CHART), body({ heightCm: 172, fitPreference: "loose" }));

    expect(advice).toMatchObject({ size: "L", confidence: "high" });
    expect(advice.reasons).toContain("Sized up one for a looser fit — M to L");
  });

  it("13. tight at the smallest size stays clamped with an honest reason", () => {
    const advice = fitAdvice(garment(HEIGHT_CHART), body({ heightCm: 162, fitPreference: "tight" }));

    expect(advice).toMatchObject({ size: "S", confidence: "high" });
    expect(advice.reasons).toContain("S is already the smallest size");
  });

  it("14. no height signal; chest and waist disagree → the larger, medium", () => {
    const rows: SizeRow[] = [
      { size: "S", chestCm: 88, waistCm: 76 },
      { size: "M", chestCm: 96, waistCm: 82 },
      { size: "L", chestCm: 104, waistCm: 88 },
    ];

    const advice = fitAdvice(garment(rows), body({ heightCm: 175, chestCm: 94, waistCm: 87 }));

    expect(advice).toMatchObject({ size: "L", confidence: "medium" });
    expect(advice.reasons.join(" ")).toContain("waist");
  });
});
