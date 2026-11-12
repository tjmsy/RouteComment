import {
  percentile,
  formatPaceValue,
  clampPace,
  MAX_PACE_MIN_PER_KM,
} from "./trackSpeed";

export type ChartKind = "ele" | "hr" | "speed";

function paddedRange(
  min: number,
  max: number,
  padRatio: number
): { min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (max <= min) {
    const pad = Math.max(Math.abs(min) * 0.05, 1);
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * padRatio;
  return { min: min - pad, max: max + pad };
}

function percentileRange(
  sorted: number[],
  loP: number,
  hiP: number,
  padRatio: number
): { min: number; max: number } {
  if (sorted.length === 0) return { min: 0, max: 1 };
  if (sorted.length === 1) {
    const v = sorted[0];
    return paddedRange(v, v, padRatio);
  }
  let lo = percentile(sorted, loP);
  let hi = percentile(sorted, hiP);
  if (hi <= lo) {
    lo = sorted[0];
    hi = sorted[sorted.length - 1];
  }
  if (hi <= lo) hi = lo + 0.1;
  return paddedRange(lo, hi, padRatio);
}

/** Y-axis range for pace (min/km): fast (small) … slow (capped at 45). */
function paceYRange(sorted: number[]): { min: number; max: number } {
  if (sorted.length === 0) {
    return { min: 0, max: MAX_PACE_MIN_PER_KM };
  }
  const capped = sorted.map(clampPace).sort((a, b) => a - b);
  let fast = percentile(capped, 0.05);
  let slow = Math.min(percentile(capped, 0.95), MAX_PACE_MIN_PER_KM);
  if (slow <= fast) {
    fast = capped[0];
    slow = Math.min(capped[capped.length - 1], MAX_PACE_MIN_PER_KM);
  }
  if (slow <= fast) {
    slow = Math.min(fast + 0.5, MAX_PACE_MIN_PER_KM);
    if (slow <= fast) fast = Math.max(0, slow - 0.5);
  }
  const pad = (slow - fast) * 0.05;
  return {
    min: Math.max(0, fast - pad),
    max: Math.min(MAX_PACE_MIN_PER_KM, slow),
  };
}

/** Y-axis range for profile chart series (matches map speed coloring for speed). */
export function yRangeForKind(
  kind: ChartKind,
  values: number[]
): { min: number; max: number } {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) {
    if (kind === "speed") return { min: 0, max: MAX_PACE_MIN_PER_KM };
    return { min: 0, max: 1 };
  }

  const sorted = [...valid].sort((a, b) => a - b);

  if (kind === "speed") {
    return paceYRange(sorted);
  }

  if (kind === "hr") {
    return percentileRange(sorted, 0.05, 0.95, 0.05);
  }

  return paddedRange(sorted[0], sorted[sorted.length - 1], 0.1);
}

/** Estimate Y-axis label strings for uniform axis width across charts. */
export function formatYLabel(kind: ChartKind, value: number): string {
  if (kind === "ele") return `${Math.round(value)}`;
  if (kind === "hr") return `${Math.round(value)}`;
  return formatPaceValue(value);
}

/** Rough tick splits between min and max (5 ticks). */
export function yAxisSplits(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min];
  }
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

const CHAR_WIDTH_PX = 6.2;
const AXIS_GAP = 4;

/** Compute shared left-axis width and label column for profile charts. */
export function uniformYAxisLayout(
  ranges: { kind: ChartKind; min: number; max: number }[]
): { size: number; labelChars: number } {
  let labelChars = 4;
  for (const { kind, min, max } of ranges) {
    for (const v of yAxisSplits(min, max)) {
      labelChars = Math.max(labelChars, formatYLabel(kind, v).length);
    }
  }
  const size = Math.ceil(labelChars * CHAR_WIDTH_PX) + AXIS_GAP + 8;
  return { size, labelChars };
}

/** @deprecated Use uniformYAxisLayout */
export function uniformYAxisSize(
  ranges: { kind: ChartKind; min: number; max: number }[]
): number {
  return uniformYAxisLayout(ranges).size;
}
