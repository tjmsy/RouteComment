import { boundsFromCorners, offsetByBearing } from "./geo";

/** Geographic pose of an orienteering map image overlay. */
export type OMapPose = {
  lng: number;
  lat: number;
  /** Image "up" direction, degrees clockwise from north */
  bearing: number;
  widthM: number;
  heightM: number;
};

export type ImageSourceCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

/**
 * MapLibre image-source corners: top-left, top-right, bottom-right, bottom-left.
 */
export function cornersFromPose(pose: OMapPose): ImageSourceCoordinates {
  const { lng, lat, bearing, widthM, heightM } = pose;
  const halfW = widthM / 2;
  const halfH = heightM / 2;

  function corner(xRight: number, yUp: number): [number, number] {
    const alongUp = offsetByBearing(lat, lng, yUp, bearing);
    const p = offsetByBearing(alongUp.lat, alongUp.lng, xRight, bearing + 90);
    return [p.lng, p.lat];
  }

  const tl = corner(-halfW, halfH);
  const tr = corner(halfW, halfH);
  const br = corner(halfW, -halfH);
  const bl = corner(-halfW, -halfH);
  return [tl, tr, br, bl];
}

export function boundsFromPose(
  pose: OMapPose
): [[number, number], [number, number]] {
  return boundsFromCorners(cornersFromPose(pose));
}
