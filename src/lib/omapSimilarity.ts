import { offsetLatLng } from "./geo";
import type { OMapPose } from "./omapPose";

export type LngLat = { lng: number; lat: number };

/** East/north metres of `to` relative to `from` (equirectangular). */
export function enDelta(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): { east: number; north: number } {
  const latRad = (fromLat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(latRad);
  return {
    east: (toLng - fromLng) * metersPerDegLng,
    north: (toLat - fromLat) * metersPerDegLat,
  };
}

/** Rotate EN vector clockwise by bearing degrees, then scale. */
export function rotateScaleEn(
  east: number,
  north: number,
  bearingDeg: number,
  scale: number
): { east: number; north: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    east: scale * (east * cos + north * sin),
    north: scale * (-east * sin + north * cos),
  };
}

/** Translate pose so that `from` moves onto `to` (first-point pin). */
export function poseTranslatedByPoint(
  pose: OMapPose,
  from: LngLat,
  to: LngLat
): OMapPose {
  return {
    ...pose,
    lng: pose.lng + (to.lng - from.lng),
    lat: pose.lat + (to.lat - from.lat),
  };
}

/**
 * Similarity about a fixed pin: second source→target pair.
 * Keeps `pin` fixed while rotating/scaling the rest of the pose.
 */
export function poseFromPinnedSimilarity(
  pose: OMapPose,
  pin: LngLat,
  from2: LngLat,
  to2: LngLat
): OMapPose | null {
  const fromVec = enDelta(pin.lat, pin.lng, from2.lat, from2.lng);
  const toVec = enDelta(pin.lat, pin.lng, to2.lat, to2.lng);

  const fromLen = Math.hypot(fromVec.east, fromVec.north);
  const toLen = Math.hypot(toVec.east, toVec.north);
  if (fromLen < 1 || toLen < 1) return null;

  const scale = toLen / fromLen;
  const fromAngle = Math.atan2(fromVec.east, fromVec.north);
  const toAngle = Math.atan2(toVec.east, toVec.north);
  let rotDeg = ((toAngle - fromAngle) * 180) / Math.PI;
  rotDeg = ((rotDeg % 360) + 360) % 360;
  if (rotDeg > 180) rotDeg -= 360;

  const centerFrom = enDelta(pin.lat, pin.lng, pose.lat, pose.lng);
  const centerTo = rotateScaleEn(
    centerFrom.east,
    centerFrom.north,
    rotDeg,
    scale
  );
  const newCenter = offsetLatLng(
    pin.lat,
    pin.lng,
    centerTo.north,
    centerTo.east
  );

  return {
    lng: newCenter.lng,
    lat: newCenter.lat,
    bearing: (((pose.bearing + rotDeg) % 360) + 360) % 360,
    widthM: pose.widthM * scale,
    heightM: pose.heightM * scale,
  };
}
