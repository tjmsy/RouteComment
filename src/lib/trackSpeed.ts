import { haversineDistance } from "./geo";
import type { TrackPoint } from "./types";

/** Cap absurd GPS spikes (≈108 km/h). */
const MAX_SPEED_MPS = 30;
/** Ignore segments shorter than this duration. */
const MIN_DT_MS = 50;
/** Rolling average window for speed smoothing (QuickRoute-style). */
const SMOOTH_WINDOW_MS = 5000;

const COLOR_STOPS: { t: number; rgb: [number, number, number] }[] = [
  { t: 0, rgb: [220, 38, 38] }, // red — slow
  { t: 1 / 3, rgb: [234, 179, 8] }, // yellow
  { t: 2 / 3, rgb: [34, 197, 94] }, // green
  { t: 1, rgb: [59, 130, 246] }, // blue — fast
];

export function hasRealTimestamps(points: TrackPoint[]): boolean {
  return points.some((p) => typeof p.time === "string" && p.time.length > 0);
}

function segmentTimeMs(a: TrackPoint, b: TrackPoint): number | null {
  if (a.timeOffsetMs == null || b.timeOffsetMs == null) return null;
  const dt = b.timeOffsetMs - a.timeOffsetMs;
  return dt > 0 ? dt : null;
}

/** Instantaneous speed (m/s) for each segment between consecutive points. */
export function rawSegmentSpeedsMps(points: TrackPoint[]): (number | null)[] {
  const speeds: (number | null)[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dt = segmentTimeMs(a, b);
    if (dt == null || dt < MIN_DT_MS) {
      speeds.push(null);
      continue;
    }
    const dist = haversineDistance(a.lat, a.lng, b.lat, b.lng);
    const mps = dist / (dt / 1000);
    if (!Number.isFinite(mps) || mps < 0) {
      speeds.push(null);
      continue;
    }
    speeds.push(Math.min(mps, MAX_SPEED_MPS));
  }
  return speeds;
}

function segmentMidTimeMs(points: TrackPoint[], i: number): number {
  const a = points[i].timeOffsetMs ?? 0;
  const b = points[i + 1].timeOffsetMs ?? a;
  return (a + b) / 2;
}

/** Time-windowed moving average of segment speeds. */
export function smoothSegmentSpeeds(
  raw: (number | null)[],
  points: TrackPoint[],
  windowMs = SMOOTH_WINDOW_MS,
): number[] {
  const half = windowMs / 2;
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const mid = segmentMidTimeMs(points, i);
    let sum = 0;
    let weight = 0;
    for (let j = 0; j < raw.length; j++) {
      const v = raw[j];
      if (v == null) continue;
      const dj = Math.abs(segmentMidTimeMs(points, j) - mid);
      if (dj > half) continue;
      // Triangular weight: closer neighbors count more
      const w = 1 - dj / half;
      sum += v * w;
      weight += w;
    }
    if (weight > 0) {
      out.push(sum / weight);
    } else if (raw[i] != null) {
      out.push(raw[i]!);
    } else {
      // Fall back to nearest valid neighbor
      let nearest: number | null = null;
      for (let d = 1; d < raw.length && nearest == null; d++) {
        if (i - d >= 0 && raw[i - d] != null) nearest = raw[i - d];
        else if (i + d < raw.length && raw[i + d] != null) nearest = raw[i + d];
      }
      out.push(nearest ?? 0);
    }
  }
  return out;
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const t = idx - lo;
  return sortedAsc[lo] * (1 - t) + sortedAsc[hi] * t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map normalized speed t∈[0,1] to red→yellow→green→blue. */
export function speedToColor(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < COLOR_STOPS.length - 2 && x > COLOR_STOPS[i + 1].t) i++;
  const a = COLOR_STOPS[i];
  const b = COLOR_STOPS[i + 1];
  const local = (x - a.t) / (b.t - a.t || 1);
  const r = Math.round(lerp(a.rgb[0], b.rgb[0], local));
  const g = Math.round(lerp(a.rgb[1], b.rgb[1], local));
  const bl = Math.round(lerp(a.rgb[2], b.rgb[2], local));
  return `rgb(${r},${g},${bl})`;
}

export type SpeedColoredTrack = {
  features: GeoJSON.Feature[];
  /** 5th percentile speed (m/s) used as scale floor. */
  minSpeedMps: number;
  /** 95th percentile speed (m/s) used as scale ceiling. */
  maxSpeedMps: number;
};

/**
 * Build per-segment LineString features colored by speed.
 * Returns null when timestamps are missing or the track is too short.
 */
export function buildSpeedColoredTrackFeatures(
  points: TrackPoint[],
): SpeedColoredTrack | null {
  if (!hasRealTimestamps(points) || points.length < 2) return null;

  const raw = rawSegmentSpeedsMps(points);
  const smoothed = smoothSegmentSpeeds(raw, points);
  const valid = smoothed.filter((v) => v > 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;

  let minSpeedMps = percentile(valid, 0.05);
  let maxSpeedMps = percentile(valid, 0.95);
  if (maxSpeedMps <= minSpeedMps) {
    minSpeedMps = valid[0];
    maxSpeedMps = valid[valid.length - 1];
  }
  if (maxSpeedMps <= minSpeedMps) {
    maxSpeedMps = minSpeedMps + 0.1;
  }

  const range = maxSpeedMps - minSpeedMps;
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < smoothed.length; i++) {
    const t = (smoothed[i] - minSpeedMps) / range;
    features.push({
      type: "Feature",
      properties: {
        color: speedToColor(t),
        speedMps: smoothed[i],
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [points[i].lng, points[i].lat],
          [points[i + 1].lng, points[i + 1].lat],
        ],
      },
    });
  }

  return { features, minSpeedMps, maxSpeedMps };
}

/** Convert m/s → pace in minutes per km. */
export function mpsToPaceMinPerKm(mps: number): number | undefined {
  if (!(mps > 0) || !Number.isFinite(mps)) return undefined;
  return 1000 / (mps * 60);
}

/** Format pace as `m:ss` (e.g. 5:30). */
export function formatPaceValue(minPerKm: number): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "—";
  const totalSec = Math.round(minPerKm * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format speed (m/s) as pace with unit, e.g. `5:30 min/km`. */
export function formatPaceMinPerKm(mps: number): string {
  const pace = mpsToPaceMinPerKm(mps);
  if (pace == null) return "—";
  return `${formatPaceValue(pace)} min/km`;
}
