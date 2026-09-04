/**
 * DeterministicFitEngine v1 — pure arithmetic over the store's own
 * chart. Signals (height ranges, chest, waist) pick rows; agreement
 * raises confidence, conflicts resolve to the larger size (tight
 * prefers the smaller); the fit preference offsets one row, clamped
 * and always explained. No invented constants: every reason quotes
 * the chart's numbers next to the body's. ML fit prediction is a
 * later unlock; this never guesses beyond the chart.
 */
import type { BodyProfile, FitAdvice, GarmentProfile, SizeRow } from "./schema";

type SignalKind = "height" | "chest" | "waist";

interface Signal {
  readonly kind: SignalKind;
  readonly index: number;
  readonly reason: string;
  readonly strength: "exact" | "gap" | "overlap" | "boundary" | "nearest";
}

const KIND_LABELS: Record<SignalKind, string> = { height: "Height", chest: "Chest", waist: "Waist" };
const MEASURE_FIELDS = {
  chest: { rowField: "chestCm", label: "chest" },
  waist: { rowField: "waistCm", label: "waist" },
} as const;

function heightSignal(rows: readonly SizeRow[], heightCm: number): Signal | undefined {
  const withRanges = rows
    .map((row, index) => ({ row, index, range: row.heightRangeCm }))
    .filter((entry) => entry.range !== undefined);
  if (withRanges.length === 0) return undefined;

  const containing = withRanges.filter(
    (entry) => heightCm >= (entry.range?.[0] ?? 0) && heightCm <= (entry.range?.[1] ?? 0),
  );
  if (containing.length === 1) {
    const hit = containing[0];
    if (hit === undefined) return undefined;
    const [lo, hi] = hit.range ?? [0, 0];
    return {
      kind: "height",
      index: hit.index,
      strength: "exact",
      reason: `Your height ${heightCm} cm is inside the ${hit.row.size} range (${lo}–${hi} cm)`,
    };
  }
  if (containing.length > 1) {
    const larger = containing[containing.length - 1];
    if (larger === undefined) return undefined;
    return {
      kind: "height",
      index: larger.index,
      strength: "overlap",
      reason: `Multiple sizes list your height ${heightCm} cm — took the larger, ${larger.row.size}`,
    };
  }

  const first = withRanges[0];
  const last = withRanges[withRanges.length - 1];
  if (first === undefined || last === undefined) return undefined;
  if (heightCm < (first.range?.[0] ?? 0)) {
    return {
      kind: "height",
      index: first.index,
      strength: "boundary",
      reason: `Your height ${heightCm} cm is below every range (starts at ${first.range?.[0]} cm) — the ${first.row.size} may run large on you`,
    };
  }
  if (heightCm > (last.range?.[1] ?? 0)) {
    return {
      kind: "height",
      index: last.index,
      strength: "boundary",
      reason: `Your height ${heightCm} cm is above every range (tops out at ${last.range?.[1]} cm) — the ${last.row.size} may run small on you`,
    };
  }

  const below = withRanges
    .filter((entry) => heightCm > (entry.range?.[1] ?? 0))
    .reduce((best, entry) =>
      (entry.range?.[1] ?? 0) > (best.range?.[1] ?? 0) ? entry : best,
    );
  const above = withRanges
    .filter((entry) => heightCm < (entry.range?.[0] ?? 0))
    .reduce((best, entry) =>
      (entry.range?.[0] ?? 0) < (best.range?.[0] ?? 0) ? entry : best,
    );
  if (below === undefined || above === undefined) return undefined;
  const distanceBelow = heightCm - (below.range?.[1] ?? 0);
  const distanceAbove = (above.range?.[0] ?? 0) - heightCm;
  const nearer = distanceAbove < distanceBelow ? above : below;
  return {
    kind: "height",
    index: nearer.index,
    strength: "gap",
    reason:
      `Your height ${heightCm} cm falls between the ${below.row.size} range (up to ${below.range?.[1]} cm) ` +
      `and the ${above.row.size} range (from ${above.range?.[0]} cm) — picked the nearer`,
  };
}

function measureSignal(
  rows: readonly SizeRow[],
  kind: "chest" | "waist",
  bodyValue: number | undefined,
): Signal | undefined {
  if (bodyValue === undefined) return undefined;
  const field = MEASURE_FIELDS[kind].rowField;
  const label = MEASURE_FIELDS[kind].label;
  const withValues = rows
    .map((row, index) => ({ row, index, value: row[field] }))
    .filter((entry) => entry.value !== undefined);
  if (withValues.length === 0) return undefined;

  const notSmaller = withValues.filter((entry) => (entry.value ?? 0) >= bodyValue);
  const best =
    notSmaller.length > 0
      ? notSmaller.reduce((min, entry) => ((entry.value ?? 0) < (min.value ?? 0) ? entry : min))
      : withValues.reduce((max, entry) => ((entry.value ?? 0) > (max.value ?? 0) ? entry : max));

  return {
    kind,
    index: best.index,
    strength: "nearest",
    reason: `Your ${label} ${bodyValue} cm is closest to the ${best.row.size} ${label} (${best.value} cm)`,
  };
}

export function fitAdvice(garment: GarmentProfile, body: BodyProfile): FitAdvice {
  const chart = garment.sizeChart;
  if (chart === undefined) {
    return {
      confidence: "none",
      reasons: ["No size chart on this page — the try-on still works"],
    };
  }
  const rows = chart.rows;

  const signals = [
    heightSignal(rows, body.heightCm),
    measureSignal(rows, "chest", body.chestCm),
    measureSignal(rows, "waist", body.waistCm),
  ].filter((signal): signal is Signal => signal !== undefined);

  if (signals.length === 0) {
    return {
      confidence: "none",
      reasons: [
        "This chart has no height ranges and you have no chest or waist saved — add chest or waist in Your fit for a size match",
      ],
    };
  }

  const reasons = signals.map((signal) => signal.reason);
  const distinctIndices = [...new Set(signals.map((signal) => signal.index))];

  let baseIndex: number;
  let confidence: FitAdvice["confidence"];
  let preferenceAlreadyApplied = false;
  if (distinctIndices.length > 1) {
    const ordered = [...signals].sort((a, b) => a.index - b.index);
    const low = ordered[0];
    const high = ordered[ordered.length - 1];
    if (low === undefined || high === undefined) throw new Error("unreachable: empty signal sort");
    baseIndex = body.fitPreference === "tight" ? low.index : high.index;
    confidence = "medium";
    preferenceAlreadyApplied = body.fitPreference !== "regular";
    reasons.push(
      `${KIND_LABELS[low.kind]} points to ${rows[low.index]?.size} but ${low.kind === high.kind ? "another signal" : high.kind} points to ${rows[high.index]?.size} — sized for the ${rows[baseIndex]?.size}`,
    );
  } else {
    baseIndex = distinctIndices[0] ?? 0;
    const height = signals.find((signal) => signal.kind === "height");
    if (height !== undefined && height.strength === "exact") confidence = "high";
    else if (height !== undefined && (height.strength === "gap" || height.strength === "overlap")) {
      confidence = "medium";
    } else if (signals.length >= 2) confidence = "high";
    else confidence = "low";
  }

  let finalIndex = baseIndex;
  if (!preferenceAlreadyApplied) {
    if (body.fitPreference === "loose" && baseIndex < rows.length - 1) {
      finalIndex = baseIndex + 1;
      reasons.push(`Sized up one for a looser fit — ${rows[baseIndex]?.size} to ${rows[finalIndex]?.size}`);
    } else if (body.fitPreference === "loose") {
      reasons.push(`${rows[baseIndex]?.size} is already the largest size`);
    } else if (body.fitPreference === "tight" && baseIndex > 0) {
      finalIndex = baseIndex - 1;
      reasons.push(`Sized down one for a tighter fit — ${rows[baseIndex]?.size} to ${rows[finalIndex]?.size}`);
    } else if (body.fitPreference === "tight") {
      reasons.push(`${rows[baseIndex]?.size} is already the smallest size`);
    }
  }

  return { size: rows[finalIndex]?.size, confidence, reasons };
}
