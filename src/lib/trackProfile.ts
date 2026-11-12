import { haversineDistance } from "./geo";
import { interpolateValueAtTime } from "./gpx";
import {
  hasRealTimestamps,
  mpsToPaceMinPerKm,
  rawSegmentSpeedsMps,
  smoothSegmentSpeeds,
} from "./trackSpeed";
import type { TrackPoint } from "./types";

export type ProfileSample = {
  timeMs: number;
  distanceM: number;
  ele?: number;
  heartRate?: number;
  /** Pace in minutes per kilometer. */
  paceMinPerKm?: number;
};

export type TrackProfile = {
  samples: ProfileSample[];
  hasElevation: boolean;
  hasHeartRate: boolean;
  hasSpeed: boolean;
};

function hasElevationData(points: TrackPoint[]): boolean {
  return points.some(
    (p) => typeof p.ele === "number" && Number.isFinite(p.ele)
  );
}

function hasHeartRateData(points: TrackPoint[]): boolean {
  return points.some(
    (p) => typeof p.heartRate === "number" && Number.isFinite(p.heartRate)
  );
}

/** Build time-aligned profile samples from track points. */
export function buildTrackProfile(points: TrackPoint[]): TrackProfile {
  if (points.length === 0) {
    return {
      samples: [],
      hasElevation: false,
      hasHeartRate: false,
      hasSpeed: false,
    };
  }

  const timed = points.map((p, i) => ({
    ...p,
    timeOffsetMs: p.timeOffsetMs ?? i * 1000,
  }));

  const hasElevation = hasElevationData(timed);
  const hasHeartRate = hasHeartRateData(timed);
  const hasSpeed = hasRealTimestamps(timed) && timed.length >= 2;

  let cumulativeDist = 0;
  const samples: ProfileSample[] = timed.map((p, i) => {
    if (i > 0) {
      const prev = timed[i - 1];
      cumulativeDist += haversineDistance(prev.lat, prev.lng, p.lat, p.lng);
    }

    const sample: ProfileSample = {
      timeMs: p.timeOffsetMs ?? 0,
      distanceM: cumulativeDist,
    };

    if (hasElevation) {
      const ele =
        typeof p.ele === "number" && Number.isFinite(p.ele)
          ? p.ele
          : interpolateValueAtTime(timed, p.timeOffsetMs ?? 0, "ele");
      if (ele != null) sample.ele = ele;
    }

    if (hasHeartRate) {
      const hr =
        typeof p.heartRate === "number" && Number.isFinite(p.heartRate)
          ? p.heartRate
          : interpolateValueAtTime(timed, p.timeOffsetMs ?? 0, "heartRate");
      if (hr != null) sample.heartRate = hr;
    }

    return sample;
  });

  if (hasSpeed) {
    const raw = rawSegmentSpeedsMps(timed);
    const smoothed = smoothSegmentSpeeds(raw, timed);
    for (let i = 0; i < smoothed.length; i++) {
      const pace = mpsToPaceMinPerKm(smoothed[i]);
      if (pace != null) samples[i + 1].paceMinPerKm = pace;
    }
    if (samples.length > 0 && smoothed.length > 0) {
      const pace = mpsToPaceMinPerKm(smoothed[0]);
      if (pace != null) samples[0].paceMinPerKm = pace;
    }
  }

  return { samples, hasElevation, hasHeartRate, hasSpeed };
}

export function formatProfileTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function formatDistanceKm(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

/** Find sample index nearest to a time (binary search). */
export function nearestSampleIndex(
  samples: ProfileSample[],
  timeMs: number
): number {
  if (samples.length === 0) return 0;
  if (timeMs <= samples[0].timeMs) return 0;
  const last = samples[samples.length - 1];
  if (timeMs >= last.timeMs) return samples.length - 1;

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].timeMs < timeMs) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  const prev = samples[lo - 1];
  const curr = samples[lo];
  return Math.abs(prev.timeMs - timeMs) < Math.abs(curr.timeMs - timeMs)
    ? lo - 1
    : lo;
}
