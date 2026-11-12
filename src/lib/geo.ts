const EARTH_RADIUS_M = 6371000;

/** Haversine distance in metres */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial bearing in degrees, range [0, 360) */
export function bearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const lngDiffRad = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(lngDiffRad) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lngDiffRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Offset a lat/lng by north/east metres. */
export function offsetLatLng(
  lat: number,
  lng: number,
  northM: number,
  eastM: number
): { lat: number; lng: number } {
  const dLat = (northM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng =
    (eastM / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180))) *
    (180 / Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

/** Offset by distance along a compass bearing (0 = north, clockwise). */
export function offsetByBearing(
  lat: number,
  lng: number,
  distanceM: number,
  bearingDeg: number
): { lat: number; lng: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  return offsetLatLng(
    lat,
    lng,
    distanceM * Math.cos(rad),
    distanceM * Math.sin(rad)
  );
}

/** Axis-aligned bounds from corner ring [[lng,lat], ...]. */
export function boundsFromCorners(
  corners: [number, number][]
): [[number, number], [number, number]] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of corners) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [
    [west, south],
    [east, north],
  ];
}
