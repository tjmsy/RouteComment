import { haversineDistance } from "./geo";
import { trackDurationMs } from "./gpx";
import type { TrackPoint } from "./types";

/** Ignore elevation deltas smaller than this (meters) to reduce GPS/DEM noise. */
const ELEV_GAIN_THRESHOLD_M = 1;

export type TrackSummary = {
  totalDistanceM: number;
  durationMs: number;
  /** Cumulative positive elevation change; omitted when no elevation data. */
  elevGainM?: number;
  /** Mean of points with heart rate; omitted when none. */
  avgHeartRate?: number;
};

export function buildTrackSummary(points: TrackPoint[]): TrackSummary {
  if (points.length === 0) {
    return { totalDistanceM: 0, durationMs: 0 };
  }

  let totalDistanceM = 0;
  let elevGainM = 0;
  let hasElevation = false;
  let hrSum = 0;
  let hrCount = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      totalDistanceM += haversineDistance(prev.lat, prev.lng, p.lat, p.lng);

      const a = prev.ele;
      const b = p.ele;
      if (
        typeof a === "number" &&
        Number.isFinite(a) &&
        typeof b === "number" &&
        Number.isFinite(b)
      ) {
        hasElevation = true;
        const d = b - a;
        if (d >= ELEV_GAIN_THRESHOLD_M) elevGainM += d;
      }
    }

    if (typeof p.heartRate === "number" && Number.isFinite(p.heartRate)) {
      hrSum += p.heartRate;
      hrCount += 1;
    }
  }

  const summary: TrackSummary = {
    totalDistanceM,
    durationMs: trackDurationMs(points),
  };

  if (hasElevation) summary.elevGainM = Math.round(elevGainM);
  if (hrCount > 0) summary.avgHeartRate = Math.round(hrSum / hrCount);

  return summary;
}

/** Format duration as `m:ss` or `h:mm:ss` when ≥ 1 hour. */
export function formatSummaryTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
