import { gpx } from "@tmcw/togeojson";
import { bearing } from "./geo";
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

const GPXTPX_NS = "http://www.garmin.com/xmlschemas/TrackPointExtension/v1";

function coordTime(
  properties: Record<string, unknown> | undefined,
  index: number,
): string | undefined {
  if (!properties) return undefined;
  const coordTimes = properties.coordinateProperties as
    | { times?: string[] }
    | undefined;
  if (coordTimes?.times?.[index]) return coordTimes.times[index];
  if (typeof properties.time === "string") return properties.time;
  return undefined;
}

/** Parse per-trkpt heart rate from GPX TrackPointExtension (togeojson omits per-coordinate HR). */
function parseHeartRatesFromDom(doc: Document): (number | undefined)[] {
  const rates: (number | undefined)[] = [];
  const trkpts = doc.getElementsByTagNameNS(
    "http://www.topografix.com/GPX/1/1",
    "trkpt",
  );
  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i];
    let hr: number | undefined;
    const ext = pt.getElementsByTagNameNS(GPXTPX_NS, "TrackPointExtension")[0];
    if (ext) {
      const hrEl = ext.getElementsByTagNameNS(GPXTPX_NS, "hr")[0];
      if (hrEl?.textContent) {
        const n = Number(hrEl.textContent.trim());
        if (Number.isFinite(n)) hr = n;
      }
    }
    if (hr == null) {
      const hrEls = pt.getElementsByTagNameNS(GPXTPX_NS, "hr");
      if (hrEls.length > 0 && hrEls[0].textContent) {
        const n = Number(hrEls[0].textContent.trim());
        if (Number.isFinite(n)) hr = n;
      }
    }
    rates.push(hr);
  }
  return rates;
}

export function parseGpx(text: string): TrackPoint[] {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const heartRates = parseHeartRatesFromDom(doc);
  const geojson = gpx(doc) as GeoJsonFeatureCollection;
  const points: TrackPoint[] = [];
  let hrIdx = 0;

  for (const feature of geojson.features ?? []) {
    const geom = feature.geometry;
    if (!geom) continue;

    if (geom.type === "LineString") {
      const coords = geom.coordinates as number[][];
      coords.forEach((c, i) => {
        const hr = heartRates[hrIdx];
        hrIdx++;
        points.push({
          lng: c[0],
          lat: c[1],
          time: coordTime(feature.properties, i),
          ele: c.length >= 3 && Number.isFinite(c[2]) ? c[2] : undefined,
          heartRate: hr,
        });
      });
    } else if (geom.type === "MultiLineString") {
      const lines = geom.coordinates as number[][][];
      let idx = 0;
      for (const line of lines) {
        for (const c of line) {
          const hr = heartRates[hrIdx];
          hrIdx++;
          points.push({
            lng: c[0],
            lat: c[1],
            time: coordTime(feature.properties, idx),
            ele: c.length >= 3 && Number.isFinite(c[2]) ? c[2] : undefined,
            heartRate: hr,
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
  const pose = interpolateTrackPose(points, timeMs);
  return pose ? { lng: pose.lng, lat: pose.lat } : null;
}

/** Position + travel bearing (degrees clockwise from north) along the track. */
export function interpolateTrackPose(
  points: TrackPoint[],
  timeMs: number,
): { lng: number; lat: number; bearing: number } | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return { lng: points[0].lng, lat: points[0].lat, bearing: 0 };
  }

  const timed = points.map((p, i) => ({
    ...p,
    timeOffsetMs: p.timeOffsetMs ?? i * 1000,
  }));

  const bearingOf = (a: TrackPoint, b: TrackPoint) =>
    bearing(a.lat, a.lng, b.lat, b.lng);

  if (timeMs <= (timed[0].timeOffsetMs ?? 0)) {
    return {
      lng: timed[0].lng,
      lat: timed[0].lat,
      bearing: bearingOf(timed[0], timed[1]),
    };
  }
  const last = timed[timed.length - 1];
  if (timeMs >= (last.timeOffsetMs ?? 0)) {
    const prev = timed[timed.length - 2];
    return {
      lng: last.lng,
      lat: last.lat,
      bearing: bearingOf(prev, last),
    };
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
        bearing: bearingOf(a, b),
      };
    }
  }
  return {
    lng: last.lng,
    lat: last.lat,
    bearing: bearingOf(timed[timed.length - 2], last),
  };
}

/** Linearly interpolate a numeric track field at a given time. */
export function interpolateValueAtTime(
  points: TrackPoint[],
  timeMs: number,
  key: "ele" | "heartRate",
): number | null {
  if (points.length === 0) return null;

  const timed = points.map((p, i) => ({
    ...p,
    timeOffsetMs: p.timeOffsetMs ?? i * 1000,
  }));

  const hasValue = (p: TrackPoint) => {
    const v = p[key];
    return typeof v === "number" && Number.isFinite(v);
  };

  if (!timed.some(hasValue)) return null;

  const first = timed[0];
  const last = timed[timed.length - 1];
  const t0First = first.timeOffsetMs ?? 0;
  const t0Last = last.timeOffsetMs ?? 0;

  if (timeMs <= t0First) {
    if (hasValue(first)) return first[key]!;
    for (const p of timed) {
      if (hasValue(p)) return p[key]!;
    }
    return null;
  }
  if (timeMs >= t0Last) {
    if (hasValue(last)) return last[key]!;
    for (let i = timed.length - 1; i >= 0; i--) {
      if (hasValue(timed[i])) return timed[i][key]!;
    }
    return null;
  }

  for (let i = 0; i < timed.length - 1; i++) {
    const a = timed[i];
    const b = timed[i + 1];
    const ta = a.timeOffsetMs ?? 0;
    const tb = b.timeOffsetMs ?? ta + 1;
    if (timeMs < ta || timeMs > tb) continue;

    const va = hasValue(a) ? a[key]! : null;
    const vb = hasValue(b) ? b[key]! : null;

    if (va != null && vb != null) {
      const u = tb === ta ? 0 : (timeMs - ta) / (tb - ta);
      return va + (vb - va) * u;
    }
    if (va != null) return va;
    if (vb != null) return vb;
  }

  return null;
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
  const hit = nearestTrackPoint(points, lng, lat);
  return hit?.timeOffsetMs;
}

export function nearestTrackPoint(
  points: TrackPoint[],
  lng: number,
  lat: number,
): TrackPoint | null {
  if (points.length === 0) return null;
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
  return {
    ...p,
    timeOffsetMs: p.timeOffsetMs ?? best * 1000,
  };
}

/** Sub-polyline of the track covering [startMs, endMs]. */
export function trackSliceCoordinates(
  points: TrackPoint[],
  startMs: number,
  endMs: number,
): [number, number][] {
  if (points.length === 0) return [];
  const a = Math.min(startMs, endMs);
  const b = Math.max(startMs, endMs);
  const timed = points.map((p, i) => ({
    ...p,
    timeOffsetMs: p.timeOffsetMs ?? i * 1000,
  }));
  const coords: [number, number][] = [];
  for (const p of timed) {
    const t = p.timeOffsetMs ?? 0;
    if (t >= a && t <= b) coords.push([p.lng, p.lat]);
  }
  if (coords.length === 0) {
    const start = interpolateTrackPosition(points, a);
    const end = interpolateTrackPosition(points, b);
    if (start) coords.push([start.lng, start.lat]);
    if (end) coords.push([end.lng, end.lat]);
  }
  return coords;
}
