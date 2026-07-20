import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { cornersFromPose } from "../lib/omapPose";
import {
  poseTranslatedByPoint,
  poseFromPinnedSimilarity,
} from "../lib/omapSimilarity";
import { haversineDistance } from "../lib/geo";
import {
  interpolateTrackPosition,
  nearestTrackTimeOffset,
} from "../lib/gpx";
import { CommentMarkers } from "./CommentMarkers";

const MAP_IMAGE_SOURCE = "omap-image";
const MAP_IMAGE_LAYER = "omap-raster";
const TRACK_SOURCE = "gps-track";
const TRACK_LAYER = "gps-track-line";
const TRACK_ENDS_SOURCE = "gps-track-ends";
const TRACK_ENDS_LAYER = "gps-track-ends-circle";
const PLAN_SOURCE_PREFIX = "route-plan-";
const RUNNER_SOURCE = "runner-pos";
const RUNNER_LAYER = "runner-circle";

const INITIAL_WIDTH_FRACTION = 0.55;

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function ensureGeoJsonSource(
  map: maplibregl.Map,
  id: string,
  data: GeoJSON.FeatureCollection | GeoJSON.Feature,
) {
  const existing = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
  } else {
    map.addSource(id, { type: "geojson", data });
  }
}

/** Bottom → top: omap image, plans, track, ends, runner (OSM stays at bottom). */
function ensureLayerOrder(map: maplibregl.Map) {
  const style = map.getStyle();
  const planLayers =
    style?.layers
      ?.map((l) => l.id)
      .filter((id) => id.startsWith(PLAN_SOURCE_PREFIX)) ?? [];

  const bottomToTop = [
    MAP_IMAGE_LAYER,
    ...planLayers,
    TRACK_LAYER,
    TRACK_ENDS_LAYER,
    RUNNER_LAYER,
  ];

  for (const id of bottomToTop) {
    if (map.getLayer(id)) {
      try {
        map.moveLayer(id);
      } catch {
        // ignore if layer temporarily missing
      }
    }
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const alignMarkersRef = useRef<maplibregl.Marker[]>([]);

  const pose = useProjectStore((s) => s.project.georef.pose);
  const mapImageUrl = useProjectStore((s) => s.mapImageUrl);
  const setPose = useProjectStore((s) => s.setPose);
  const trackPoints = useProjectStore((s) => s.project.track.points);
  const routePlans = useProjectStore((s) => s.project.routePlans);
  const appendPlanCoordinate = useProjectStore((s) => s.appendPlanCoordinate);
  const addComment = useProjectStore((s) => s.addComment);

  const mode = useUiStore((s) => s.mode);
  const mapOpacity = useUiStore((s) => s.mapOpacity);
  const showTrack = useUiStore((s) => s.showTrack);
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const activeRoutePlanId = useUiStore((s) => s.activeRoutePlanId);
  const setGeorefStep = useUiStore((s) => s.setGeorefStep);
  const setGeorefPin = useUiStore((s) => s.setGeorefPin);
  const setGeorefPendingFrom = useUiStore((s) => s.setGeorefPendingFrom);
  const resetGeorefAlign = useUiStore((s) => s.resetGeorefAlign);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const setActiveRoutePlanId = useUiStore((s) => s.setActiveRoutePlanId);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [139.7, 35.68],
      zoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    map.once("load", () => setMapInstance(map));

    return () => {
      alignMarkersRef.current.forEach((m) => m.remove());
      alignMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
  }, []);

  const clearAlignMarkers = useCallback(() => {
    alignMarkersRef.current.forEach((m) => m.remove());
    alignMarkersRef.current = [];
  }, []);

  const addAlignMarker = useCallback(
    (lngLat: { lng: number; lat: number }, label: string, kind: "source" | "target") => {
      const map = mapRef.current;
      if (!map) return;
      const el = document.createElement("div");
      el.className = `georef-align-marker georef-align-marker-${kind}`;
      el.textContent = label;
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lngLat.lng, lngLat.lat])
        .addTo(map);
      alignMarkersRef.current.push(marker);
    },
    [],
  );

  // Create initial pose when image loads without one
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!mapImageUrl || pose) return;
    const size = useProjectStore.getState().mapImageSize;
    if (!size) return;
    setPose(createInitialPose(map, size.width, size.height));
  }, [mapImageUrl, pose, setPose, mapInstance]);

  // Sync overlay image from pose
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (!mapImageUrl || !pose) {
      if (map.getLayer(MAP_IMAGE_LAYER)) map.removeLayer(MAP_IMAGE_LAYER);
      if (map.getSource(MAP_IMAGE_SOURCE)) map.removeSource(MAP_IMAGE_SOURCE);
      return;
    }

    const coordinates = cornersFromPose(pose);
    const src = map.getSource(MAP_IMAGE_SOURCE) as
      | maplibregl.ImageSource
      | undefined;

    if (src) {
      src.setCoordinates(coordinates);
      if (map.getLayer(MAP_IMAGE_LAYER)) {
        map.setPaintProperty(MAP_IMAGE_LAYER, "raster-opacity", mapOpacity);
      }
      ensureLayerOrder(map);
      return;
    }

    map.addSource(MAP_IMAGE_SOURCE, {
      type: "image",
      url: mapImageUrl,
      coordinates,
    });
    map.addLayer({
      id: MAP_IMAGE_LAYER,
      type: "raster",
      source: MAP_IMAGE_SOURCE,
      paint: {
        "raster-opacity": mapOpacity,
        "raster-fade-duration": 0,
      },
    });
    ensureLayerOrder(map);
  }, [mapImageUrl, pose, mapOpacity, mapInstance]);

  // Recreate source when URL changes
  const prevUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (prevUrlRef.current === mapImageUrl) return;
    const hadUrl = prevUrlRef.current != null;
    prevUrlRef.current = mapImageUrl;
    if (hadUrl) {
      if (map.getLayer(MAP_IMAGE_LAYER)) map.removeLayer(MAP_IMAGE_LAYER);
      if (map.getSource(MAP_IMAGE_SOURCE)) map.removeSource(MAP_IMAGE_SOURCE);
    }
  }, [mapImageUrl]);

  // Track
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const pts = trackPoints;
      const lineData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features:
          pts.length >= 2 && showTrack
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: pts.map((p) => [p.lng, p.lat]),
                  },
                },
              ]
            : [],
      };
      ensureGeoJsonSource(map, TRACK_SOURCE, lineData);
      if (!map.getLayer(TRACK_LAYER) && pts.length >= 2) {
        map.addLayer({
          id: TRACK_LAYER,
          type: "line",
          source: TRACK_SOURCE,
          paint: {
            "line-color": "#e11d48",
            "line-width": 3,
            "line-opacity": 0.9,
          },
        });
      }
      if (map.getLayer(TRACK_LAYER)) {
        map.setLayoutProperty(
          TRACK_LAYER,
          "visibility",
          showTrack && pts.length >= 2 ? "visible" : "none",
        );
      }

      const ends: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features:
          pts.length >= 1 && showTrack
            ? [
                {
                  type: "Feature",
                  properties: { role: "start" },
                  geometry: {
                    type: "Point",
                    coordinates: [pts[0].lng, pts[0].lat],
                  },
                },
                ...(pts.length >= 2
                  ? [
                      {
                        type: "Feature" as const,
                        properties: { role: "end" },
                        geometry: {
                          type: "Point" as const,
                          coordinates: [
                            pts[pts.length - 1].lng,
                            pts[pts.length - 1].lat,
                          ],
                        },
                      },
                    ]
                  : []),
              ]
            : [],
      };
      ensureGeoJsonSource(map, TRACK_ENDS_SOURCE, ends);
      if (!map.getLayer(TRACK_ENDS_LAYER)) {
        map.addLayer({
          id: TRACK_ENDS_LAYER,
          type: "circle",
          source: TRACK_ENDS_SOURCE,
          paint: {
            "circle-radius": 7,
            "circle-color": [
              "match",
              ["get", "role"],
              "start",
              "#22c55e",
              "#e11d48",
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
      }
      if (map.getLayer(TRACK_ENDS_LAYER)) {
        map.setLayoutProperty(
          TRACK_ENDS_LAYER,
          "visibility",
          showTrack && pts.length >= 1 ? "visible" : "none",
        );
      }
      ensureLayerOrder(map);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [trackPoints, showTrack, mapInstance]);

  const fittedTrackRef = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || trackPoints.length < 2) return;
    const key = `${trackPoints[0].lng},${trackPoints[0].lat}-${trackPoints.length}`;
    if (fittedTrackRef.current === key) return;
    fittedTrackRef.current = key;
    const bounds = new maplibregl.LngLatBounds(
      [trackPoints[0].lng, trackPoints[0].lat],
      [trackPoints[0].lng, trackPoints[0].lat],
    );
    trackPoints.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
  }, [trackPoints]);

  // Route plans
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const existingIds = new Set<string>();
      routePlans.forEach((plan, idx) => {
        const sourceId = `${PLAN_SOURCE_PREFIX}${plan.id}`;
        const layerId = `${sourceId}-line`;
        const pointLayer = `${sourceId}-pts`;
        existingIds.add(sourceId);
        existingIds.add(layerId);
        existingIds.add(pointLayer);

        const data: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features:
            plan.coordinates.length >= 2
              ? [
                  {
                    type: "Feature",
                    properties: {},
                    geometry: {
                      type: "LineString",
                      coordinates: plan.coordinates,
                    },
                  },
                ]
              : plan.coordinates.length === 1
                ? [
                    {
                      type: "Feature",
                      properties: {},
                      geometry: {
                        type: "Point",
                        coordinates: plan.coordinates[0],
                      },
                    },
                  ]
                : [],
        };
        ensureGeoJsonSource(map, sourceId, data);

        const colors = ["#2563eb", "#7c3aed", "#0891b2", "#ca8a04"];
        if (!map.getLayer(layerId)) {
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": colors[idx % colors.length],
              "line-width": 3,
              "line-dasharray": [2, 1],
              "line-opacity": 0.85,
            },
          });
        }
        map.setLayoutProperty(
          layerId,
          "visibility",
          plan.visible && plan.coordinates.length >= 2 ? "visible" : "none",
        );

        if (!map.getLayer(pointLayer)) {
          map.addLayer({
            id: pointLayer,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-radius": 4,
              "circle-color": "#2563eb",
              "circle-stroke-width": 1,
              "circle-stroke-color": "#fff",
            },
            filter: ["==", "$type", "Point"],
          });
        }
        map.setLayoutProperty(
          pointLayer,
          "visibility",
          plan.visible && plan.coordinates.length > 0 ? "visible" : "none",
        );
      });

      const style = map.getStyle();
      style?.layers?.forEach((layer) => {
        if (
          layer.id.startsWith(PLAN_SOURCE_PREFIX) &&
          !existingIds.has(layer.id)
        ) {
          map.removeLayer(layer.id);
        }
      });
      Object.keys(style?.sources ?? {}).forEach((id) => {
        if (id.startsWith(PLAN_SOURCE_PREFIX) && !existingIds.has(id)) {
          if (!map.getLayer(`${id}-line`) && !map.getLayer(`${id}-pts`)) {
            map.removeSource(id);
          }
        }
      });
      ensureLayerOrder(map);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [routePlans, mapInstance]);

  // Runner — always kept above the map image via ensureLayerOrder
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const pos = interpolateTrackPosition(trackPoints, animationTimeMs);
      const show = trackPoints.length > 0 && pos != null;

      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: show
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
              },
            ]
          : [],
      };
      ensureGeoJsonSource(map, RUNNER_SOURCE, data);
      if (!map.getLayer(RUNNER_LAYER)) {
        map.addLayer({
          id: RUNNER_LAYER,
          type: "circle",
          source: RUNNER_SOURCE,
          paint: {
            "circle-radius": 8,
            "circle-color": "#f43f5e",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
      }
      ensureLayerOrder(map);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [animationTimeMs, trackPoints, isPlaying, mapInstance]);

  useEffect(() => {
    if (!activeRoutePlanId && routePlans[0]) {
      setActiveRoutePlanId(routePlans[0].id);
    }
  }, [activeRoutePlanId, routePlans, setActiveRoutePlanId]);

  // Clear align markers when leaving georef
  useEffect(() => {
    if (mode !== "georef") {
      clearAlignMarkers();
      useUiStore.setState({
        georefStep: 0,
        georefPin: null,
        georefPendingFrom: null,
      });
    }
  }, [mode, clearAlignMarkers]);

  // Map clicks — attach once map is ready; always read mode from store
  useEffect(() => {
    const map = mapInstance ?? mapRef.current;
    if (!map) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const lngLat = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      const currentMode = useUiStore.getState().mode;

      if (currentMode === "georef") {
        const currentPose = useProjectStore.getState().project.georef.pose;
        if (!currentPose) {
          setStatusMessage("Load a map image first.");
          return;
        }

        const step = useUiStore.getState().georefStep;
        const pending = useUiStore.getState().georefPendingFrom;
        const pin = useUiStore.getState().georefPin;

        if (step === 0) {
          setGeorefPendingFrom(lngLat);
          clearAlignMarkers();
          addAlignMarker(lngLat, "1", "source");
          setGeorefStep(1);
          return;
        }

        if (step === 1 && pending) {
          const next = poseTranslatedByPoint(currentPose, pending, lngLat);
          setPose(next);
          setGeorefPendingFrom(null);
          setGeorefPin(lngLat);
          clearAlignMarkers();
          addAlignMarker(lngLat, "1", "target");
          setGeorefStep(2);
          return;
        }

        if (step === 2) {
          setGeorefPendingFrom(lngLat);
          addAlignMarker(lngLat, "2", "source");
          setGeorefStep(3);
          return;
        }

        if (step === 3 && pending && pin) {
          const next = poseFromPinnedSimilarity(
            currentPose,
            pin,
            pending,
            lngLat,
          );
          if (next) {
            setPose(next);
            clearAlignMarkers();
            setGeorefPendingFrom(null);
            setGeorefPin(null);
            setGeorefStep(0);
            setStatusMessage(
              "Aligned. Repeat the 2-point cycle to fine-tune, or switch mode when done.",
            );
          } else {
            clearAlignMarkers();
            resetGeorefAlign();
            setStatusMessage(
              "Points too close — pick features farther apart.",
            );
          }
        }
        return;
      }

      if (currentMode === "plan") {
        const planId =
          useUiStore.getState().activeRoutePlanId ??
          useProjectStore.getState().project.routePlans[0]?.id;
        if (planId) {
          appendPlanCoordinate(planId, [lngLat.lng, lngLat.lat]);
        }
        return;
      }

      if (currentMode === "comment") {
        const pts = useProjectStore.getState().project.track.points;
        const timeOffsetMs = nearestTrackTimeOffset(
          pts,
          lngLat.lng,
          lngLat.lat,
        );
        const id = addComment({
          lng: lngLat.lng,
          lat: lngLat.lat,
          text: "",
          timeOffsetMs,
        });
        setCommentExpanded(id, true);
      }
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [
    mapInstance,
    appendPlanCoordinate,
    addComment,
    setPose,
    setGeorefStep,
    setGeorefPin,
    setGeorefPendingFrom,
    resetGeorefAlign,
    clearAlignMarkers,
    addAlignMarker,
    setCommentExpanded,
    setStatusMessage,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    canvas.style.cursor =
      mode === "plan" || mode === "comment" || mode === "georef"
        ? "crosshair"
        : "";
  }, [mode]);

  return (
    <>
      <div ref={containerRef} className="map-view" />
      <CommentMarkers map={mapInstance} />
    </>
  );
}

/** Build an initial pose centered on the current map viewport. */
export function createInitialPose(
  map: maplibregl.Map,
  imageWidth: number,
  imageHeight: number,
) {
  const center = map.getCenter();
  const bounds = map.getBounds();
  const viewportWidthM = haversineDistance(
    center.lat,
    bounds.getWest(),
    center.lat,
    bounds.getEast(),
  );
  const widthM = Math.max(50, viewportWidthM * INITIAL_WIDTH_FRACTION);
  const heightM = widthM * (imageHeight / imageWidth);
  return {
    lng: center.lng,
    lat: center.lat,
    bearing: 0,
    widthM,
    heightM,
  };
}
