import { describe, expect, it } from "vitest";
import { clampOffset, computeCropRect, coverScale } from "./crop-math";

describe("coverScale", () => {
  it("scales a portrait image to cover a 4:5 frame by height", () => {
    expect(coverScale({ width: 800, height: 1000 }, { width: 320, height: 400 })).toBe(0.4);
  });

  it("scales a landscape image to cover a wide frame by width", () => {
    expect(coverScale({ width: 1000, height: 500 }, { width: 800, height: 300 })).toBe(0.8);
  });

  it("falls back to 1 for unmeasured or degenerate sizes", () => {
    expect(coverScale({ width: 800, height: 1000 }, { width: 0, height: 0 })).toBe(1);
    expect(coverScale({ width: 0, height: 0 }, { width: 320, height: 400 })).toBe(1);
  });
});

describe("clampOffset", () => {
  const natural = { width: 800, height: 1000 };
  const container = { width: 320, height: 400 };

  it("forces zero on an axis with no slack (cover exactly fits)", () => {
    const result = clampOffset({ natural, container, zoom: 1 }, { x: 50, y: 0 });
    expect(result).toStrictEqual({ x: 0, y: 0 });
  });

  it("clamps to the symmetric slack once zoomed", () => {
    const scale = coverScale(natural, container) * 2;
    const slackX = (800 * scale - 320) / 2;
    const slackY = (1000 * scale - 400) / 2;

    const far = clampOffset({ natural, container, zoom: 2 }, { x: 10000, y: -10000 });
    const within = clampOffset({ natural, container, zoom: 2 }, { x: 10, y: -10 });

    expect(far).toStrictEqual({ x: slackX, y: -slackY });
    expect(within).toStrictEqual({ x: 10, y: -10 });
  });

  it("passes candidates through when the container is unmeasured", () => {
    const result = clampOffset(
      { natural, container: { width: 0, height: 0 }, zoom: 1 },
      { x: 123, y: -45 },
    );
    expect(result).toStrictEqual({ x: 123, y: -45 });
  });
});

describe("computeCropRect", () => {
  const natural = { width: 800, height: 1000 };
  const container = { width: 320, height: 400 };

  it("returns the centered cover region at zoom 1 with no offset", () => {
    const rect = computeCropRect({ natural, container, zoom: 1, offset: { x: 0, y: 0 } });

    expect(rect.sw).toBeCloseTo(800);
    expect(rect.sh).toBeCloseTo(1000);
    expect(rect.sx).toBeCloseTo(0);
    expect(rect.sy).toBeCloseTo(0);
  });

  it("crops tighter as zoom grows", () => {
    const z1 = computeCropRect({ natural, container, zoom: 1, offset: { x: 0, y: 0 } });
    const z2 = computeCropRect({ natural, container, zoom: 2, offset: { x: 0, y: 0 } });

    expect(z2.sw).toBeCloseTo(z1.sw / 2);
    expect(z2.sh).toBeCloseTo(z1.sh / 2);
    expect(z2.sx).toBeCloseTo((800 - z2.sw) / 2);
    expect(z2.sy).toBeCloseTo((1000 - z2.sh) / 2);
  });

  it("shifts the source region opposite to the drag offset", () => {
    const centered = computeCropRect({ natural, container, zoom: 2, offset: { x: 0, y: 0 } });
    const dragged = computeCropRect({ natural, container, zoom: 2, offset: { x: -40, y: 30 } });

    expect(dragged.sx).toBeCloseTo(centered.sx + 50);
    expect(dragged.sy).toBeCloseTo(centered.sy - 37.5);
  });
});
