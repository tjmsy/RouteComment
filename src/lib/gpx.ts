import { gpx } from "@tmcw/togeojson";
import type { TrackPoint } from "./types";

type GeoJsonFeature = {
  type: string;
  geometry?: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
  properties?: Record<string, unknown>;
};

type GeoJsonFeatureCollection = {
  type: string;
  features: GeoJsonFeature[];
};

function coordTime(properties: Record<string, unknown> | undefined, index: number): string | undefined {
  if (!properties) return undefined;
  const coordTimes = properties.coordinateProperties as
    | { times?: string[] }
    | undefined;
  if (coordTimes?.times?.[index]) return coordTimes.times[index];
  if (typeof properties.time === "string") return properties.time;
  return undefined;
}

export function parseGpx(text: string): TrackPoint[] {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const geojson = gpx(doc) as GeoJsonFeatureCollection;
  const points: TrackPoint[] = [];

  for (const feature of geojson.features ?? []) {
    const geom = feature.geometry;
    if (!geom) continue;

    if (geom.type === "LineString") {
      const coords = geom.coordinates as number[][];
      coords.forEach((c, i) => {
        points.push({
          lng: c[0],
          lat: c[1],
          time: coordTime(feature.properties, i),
        });
      });
    } else if (geom.type === "MultiLineString") {
      const lines = geom.coordinates as number[][][];
      let idx = 0;
      for (const line of lines) {
        for (const c of line) {
          points.push({
            lng: c[0],
            lat: c[1],
            time: coordTime(feature.properties, idx),
          });
          idx++;
        }
      }
    }
  }

  return withTimeOffsets(points);
}

export function withTimeOffsets(points: TrackPoint[]): TrackPoint[] {
  if (points.length === 0) return points;

  const firstWithTime = points.find((p) => p.time);
  if (!firstWithTime?.time) {
    // No timestamps: use cumulative distance as fake time (1 m/s)
    let dist = 0;
    return points.map((p, i) => {
      if (i > 0) {
        dist += haversineMeters(points[i - 1], p);
      }
      return { ...p, timeOffsetMs: dist * 1000 };
    });
  }

  const t0 = Date.parse(firstWithTime.time);
  return points.map((p) => ({
    ...p,
    timeOffsetMs: p.time ? Date.parse(p.time) - t0 : undefined,
  }));
}

function haversineMeters(a: TrackPoint, b: TrackPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function interpolateTrackPosition(
  points: TrackPoint[],
  timeMs: number,
): { lng: number; lat: number } | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { lng: points[0].lng, lat: points[0].lat };

  const timed = points.map((p, i) => ({
    ...p,
    timeOffsetMs: p.timeOffsetMs ?? i * 1000,
  }));

  if (timeMs <= (timed[0].timeOffsetMs ?? 0)) {
    return { lng: timed[0].lng, lat: timed[0].lat };
  }
  const last = timed[timed.length - 1];
  if (timeMs >= (last.timeOffsetMs ?? 0)) {
    return { lng: last.lng, lat: last.lat };
  }

  for (let i = 0; i < timed.length - 1; i++) {
    const a = timed[i];
    const b = timed[i + 1];
    const t0 = a.timeOffsetMs ?? 0;
    const t1 = b.timeOffsetMs ?? t0 + 1;
    if (timeMs >= t0 && timeMs <= t1) {
      const u = t1 === t0 ? 0 : (timeMs - t0) / (t1 - t0);
      return {
        lng: a.lng + (b.lng - a.lng) * u,
        lat: a.lat + (b.lat - a.lat) * u,
      };
    }
  }
  return { lng: last.lng, lat: last.lat };
}

export function trackDurationMs(points: TrackPoint[]): number {
  if (points.length === 0) return 0;
  const last = points[points.length - 1];
  if (last.timeOffsetMs != null) return last.timeOffsetMs;
  return Math.max(0, (points.length - 1) * 1000);
}

export function nearestTrackTimeOffset(
  points: TrackPoint[],
  lng: number,
  lat: number,
): number | undefined {
  if (points.length === 0) return undefined;
  let best = 0;
  let bestDist = Infinity;
  points.forEach((p, i) => {
    const d = (p.lng - lng) ** 2 + (p.lat - lat) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  const p = points[best];
  return p.timeOffsetMs ?? best * 1000;
}
