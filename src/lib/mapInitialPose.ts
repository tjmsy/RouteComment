import type { Map as MapLibreMap } from "maplibre-gl";
import { haversineDistance } from "./geo";
import { useProjectStore } from "../store/projectStore";

const INITIAL_WIDTH_FRACTION = 0.55;

/** Build an initial pose: prefer track center; cap size so world zoom still works. */
export function createInitialPose(
  map: MapLibreMap,
  imageWidth: number,
  imageHeight: number
) {
  const track = useProjectStore.getState().project.track.points;
  const mapCenter = map.getCenter();
  let lng = mapCenter.lng;
  let lat = mapCenter.lat;
  let viewportWidthM: number;

  if (track.length >= 1) {
    let minLng = track[0].lng;
    let maxLng = track[0].lng;
    let minLat = track[0].lat;
    let maxLat = track[0].lat;
    for (const p of track) {
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
    }
    lng = (minLng + maxLng) / 2;
    lat = (minLat + maxLat) / 2;
    viewportWidthM = Math.max(
      80,
      haversineDistance(lat, minLng, lat, maxLng) * 1.4
    );
  } else {
    const bounds = map.getBounds();
    viewportWidthM = haversineDistance(
      lat,
      bounds.getWest(),
      lat,
      bounds.getEast()
    );
  }

  // Cap so a world-scale basemap view doesn't create a continent-sized overlay
  const widthM = Math.min(
    Math.max(80, viewportWidthM * INITIAL_WIDTH_FRACTION),
    4000
  );
  const heightM = widthM * (imageHeight / imageWidth);
  return {
    lng,
    lat,
    bearing: 0,
    widthM,
    heightM,
  };
}
