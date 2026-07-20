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
  interpolateTrackPose,
  nearestTrackPoint,
  trackSliceCoordinates,
} from "../lib/gpx";
import { CommentMarkers } from "./CommentMarkers";

const MAP_IMAGE_SOURCE = "omap-image";
const MAP_IMAGE_LAYER = "omap-raster";
const TRACK_SOURCE = "gps-track";
const TRACK_LAYER = "gps-track-line";
const TRACK_ENDS_SOURCE = "gps-track-ends";
const TRACK_ENDS_LAYER = "gps-track-ends-circle";
const TRACK_RANGE_SOURCE = "track-range";
const TRACK_RANGE_LAYER = "track-range-line";
const PLAN_SOURCE_PREFIX = "route-plan-";
const RUNNER_SOURCE = "runner-pos";
const RUNNER_LAYER = "runner-circle";

const INITIAL_WIDTH_FRACTION = 0.55;
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

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

function lerpBearing(from: number, to: number, alpha: number): number {
  const diff = ((to - from + 540) % 360) - 180;
  return from + diff * alpha;
}

function isNearTrack(
  map: maplibregl.Map,
  points: { lng: number; lat: number }[],
  lng: number,
  lat: number,
  maxPx = 28,
): ReturnType<typeof nearestTrackPoint> {
  const hit = nearestTrackPoint(points, lng, lat);
  if (!hit) return null;
  const a = map.project([hit.lng, hit.lat]);
  const b = map.project([lng, lat]);
  if (Math.hypot(a.x - b.x, a.y - b.y) > maxPx) return null;
  return hit;
}

/** Bottom → top: omap image, plans, track, range, ends, runner */
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
    TRACK_RANGE_LAYER,
    TRACK_ENDS_LAYER,
    RUNNER_LAYER,
  ];

  for (const id of bottomToTop) {
    if (map.getLayer(id)) {
      try {
        map.moveLayer(id);
      } catch {
        // ignore
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
  const mapImageSize = useProjectStore((s) => s.mapImageSize);
  const setPose = useProjectStore((s) => s.setPose);
  const trackPoints = useProjectStore((s) => s.project.track.points);
  const routePlans = useProjectStore((s) => s.project.routePlans);
  const appendPlanCoordinate = useProjectStore((s) => s.appendPlanCoordinate);
  const addRoutePlan = useProjectStore((s) => s.addRoutePlan);
  const addComment = useProjectStore((s) => s.addComment);
  const updateComment = useProjectStore((s) => s.updateComment);

  const mode = useUiStore((s) => s.mode);
  const mapOpacity = useUiStore((s) => s.mapOpacity);
  const showTrack = useUiStore((s) => s.showTrack);
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const headingUp = useUiStore((s) => s.headingUp);
  const activeRoutePlanId = useUiStore((s) => s.activeRoutePlanId);
  const followRangeStartMs = useUiStore((s) => s.followRangeStartMs);
  const setGeorefStep = useUiStore((s) => s.setGeorefStep);
  const setGeorefPin = useUiStore((s) => s.setGeorefPin);
  const setGeorefPendingFrom = useUiStore((s) => s.setGeorefPendingFrom);
  const resetGeorefAlign = useUiStore((s) => s.resetGeorefAlign);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const setFollowRangeStartMs = useUiStore((s) => s.setFollowRangeStartMs);
  const setActiveRoutePlanId = useUiStore((s) => s.setActiveRoutePlanId);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);

  const appliedImageUrlRef = useRef<string | null>(null);
  const pendingFitImageRef = useRef(false);
  const headingBearingRef = useRef<number | null>(null);
  const headingRafRef = useRef<number | null>(null);
  /** While true, skip heading-up camera writes so wheel zoom can animate. */
  const headingWheelPauseRef = useRef(false);
  const headingWheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: [0, 20],
      zoom: 1.5,
      attributionControl: { compact: true },
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

  // Sync map image overlay — create pose + source in one pass (avoids first-load miss)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const syncImage = () => {
      if (!map.isStyleLoaded()) return;

      if (!mapImageUrl || !mapImageSize) {
        if (map.getLayer(MAP_IMAGE_LAYER)) map.removeLayer(MAP_IMAGE_LAYER);
        if (map.getSource(MAP_IMAGE_SOURCE)) map.removeSource(MAP_IMAGE_SOURCE);
        appliedImageUrlRef.current = null;
        pendingFitImageRef.current = false;
        return;
      }

      const urlChanged = appliedImageUrlRef.current !== mapImageUrl;
      if (urlChanged) {
        if (map.getLayer(MAP_IMAGE_LAYER)) map.removeLayer(MAP_IMAGE_LAYER);
        if (map.getSource(MAP_IMAGE_SOURCE)) map.removeSource(MAP_IMAGE_SOURCE);
        appliedImageUrlRef.current = mapImageUrl;
        pendingFitImageRef.current = true;
      }

      let currentPose = useProjectStore.getState().project.georef.pose;
      if (!currentPose) {
        currentPose = createInitialPose(
          map,
          mapImageSize.width,
          mapImageSize.height,
        );
        setPose(currentPose);
      }

      const coordinates = cornersFromPose(currentPose);
      const src = map.getSource(MAP_IMAGE_SOURCE) as
        | maplibregl.ImageSource
        | undefined;
      if (src) {
        src.setCoordinates(coordinates);
        if (map.getLayer(MAP_IMAGE_LAYER)) {
          map.setPaintProperty(MAP_IMAGE_LAYER, "raster-opacity", mapOpacity);
        }
      } else {
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
      }
      ensureLayerOrder(map);

      if (pendingFitImageRef.current && currentPose) {
        pendingFitImageRef.current = false;
        const corners = cornersFromPose(currentPose);
        const bounds = new maplibregl.LngLatBounds(corners[0], corners[0]);
        corners.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, { padding: 48, maxZoom: 17, duration: 500 });
      }
    };

    syncImage();
    map.on("style.load", syncImage);
    // Retry once after idle in case the style was mid-update on first try
    const onIdle = () => {
      if (
        mapImageUrl &&
        mapImageSize &&
        appliedImageUrlRef.current === mapImageUrl &&
        !map.getSource(MAP_IMAGE_SOURCE)
      ) {
        syncImage();
      }
    };
    map.once("idle", onIdle);
    return () => {
      map.off("style.load", syncImage);
      map.off("idle", onIdle);
    };
  }, [mapImageUrl, mapImageSize, pose, mapOpacity, mapInstance, setPose]);

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
      routePlans.forEach((plan) => {
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

        const color = plan.color || "#2563eb";
        const lineWidth = plan.lineWidth ?? 3;
        if (!map.getLayer(layerId)) {
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": color,
              "line-width": lineWidth,
              "line-dasharray": [2, 1],
              "line-opacity": 0.85,
            },
          });
        } else {
          map.setPaintProperty(layerId, "line-color", color);
          map.setPaintProperty(layerId, "line-width", lineWidth);
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
              "circle-color": color,
              "circle-stroke-width": 1,
              "circle-stroke-color": "#fff",
            },
            filter: ["==", "$type", "Point"],
          });
        } else {
          map.setPaintProperty(pointLayer, "circle-color", color);
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

  // Runner marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const runnerPose = interpolateTrackPose(trackPoints, animationTimeMs);
      const show = trackPoints.length > 0 && runnerPose != null;

      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: show
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Point",
                  coordinates: [runnerPose.lng, runnerPose.lat],
                },
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
  }, [animationTimeMs, trackPoints, mapInstance]);

  // Smooth heading-up camera (own RAF so rotation stays continuous)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !headingUp || mode !== "view") {
      if (headingRafRef.current != null) {
        cancelAnimationFrame(headingRafRef.current);
        headingRafRef.current = null;
      }
      if (headingWheelTimerRef.current != null) {
        clearTimeout(headingWheelTimerRef.current);
        headingWheelTimerRef.current = null;
      }
      headingWheelPauseRef.current = false;
      return;
    }

    const onWheel = () => {
      headingWheelPauseRef.current = true;
      if (headingWheelTimerRef.current != null) {
        clearTimeout(headingWheelTimerRef.current);
      }
      headingWheelTimerRef.current = setTimeout(() => {
        headingWheelPauseRef.current = false;
        headingWheelTimerRef.current = null;
      }, 200);
    };
    map.on("wheel", onWheel);

    const tick = () => {
      if (!headingWheelPauseRef.current) {
        const pts = useProjectStore.getState().project.track.points;
        const t = useUiStore.getState().animationTimeMs;
        const playing = useUiStore.getState().isPlaying;
        const runnerPose = interpolateTrackPose(pts, t);
        if (runnerPose) {
          const currentBearing =
            headingBearingRef.current ?? map.getBearing();
          // Higher alpha while scrubbing so the map snaps to the new heading faster
          const alpha = playing ? 0.14 : 0.35;
          const nextBearing = lerpBearing(
            currentBearing,
            runnerPose.bearing,
            alpha,
          );
          headingBearingRef.current = nextBearing;
          // Omit zoom so wheel zoom sticks; pause during wheel so ease isn't cancelled.
          map.jumpTo({
            center: [runnerPose.lng, runnerPose.lat],
            bearing: nextBearing,
          });
        }
      }
      headingRafRef.current = requestAnimationFrame(tick);
    };

    headingRafRef.current = requestAnimationFrame(tick);
    return () => {
      map.off("wheel", onWheel);
      if (headingWheelTimerRef.current != null) {
        clearTimeout(headingWheelTimerRef.current);
        headingWheelTimerRef.current = null;
      }
      headingWheelPauseRef.current = false;
      if (headingRafRef.current != null) {
        cancelAnimationFrame(headingRafRef.current);
        headingRafRef.current = null;
      }
    };
  }, [headingUp, mode, mapInstance]);

  // Reset north-up when turning heading-up off
  useEffect(() => {
    const map = mapRef.current;
    if (!map || headingUp) return;
    headingBearingRef.current = null;
    map.easeTo({ bearing: 0, duration: 400 });
  }, [headingUp]);

  // Preview highlight while picking a follow-comment range, or selected follow range
  const followHoverMsRef = useRef<number | null>(null);
  const skipFollowClickRef = useRef(false);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const comments = useProjectStore((s) => s.project.comments);

  const syncTrackRangeHighlight = useCallback(
    (endMs: number | null = null) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;

      const ui = useUiStore.getState();
      const pts = useProjectStore.getState().project.track.points;
      let coords: [number, number][] = [];

      if (ui.followRangeStartMs != null && pts.length > 0) {
        const end = endMs ?? followHoverMsRef.current ?? ui.followRangeStartMs;
        coords = trackSliceCoordinates(pts, ui.followRangeStartMs, end);
      } else {
        const activeId =
          ui.expandedCommentIds[ui.expandedCommentIds.length - 1] ?? null;
        const selected = useProjectStore
          .getState()
          .project.comments.find((c) => c.id === activeId);
        if (
          selected?.kind === "follow" &&
          selected.timeStartMs != null &&
          selected.timeEndMs != null &&
          pts.length > 0
        ) {
          coords = trackSliceCoordinates(
            pts,
            selected.timeStartMs,
            selected.timeEndMs,
          );
        }
      }

      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features:
          coords.length >= 2
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "LineString", coordinates: coords },
                },
              ]
            : [],
      };
      ensureGeoJsonSource(map, TRACK_RANGE_SOURCE, data);
      if (!map.getLayer(TRACK_RANGE_LAYER)) {
        map.addLayer({
          id: TRACK_RANGE_LAYER,
          type: "line",
          source: TRACK_RANGE_SOURCE,
          paint: {
            "line-color": "#f59e0b",
            "line-width": 5,
            "line-opacity": 0.85,
          },
        });
      }
      ensureLayerOrder(map);
    },
    [],
  );

  useEffect(() => {
    syncTrackRangeHighlight();
  }, [
    expandedCommentIds,
    comments,
    followRangeStartMs,
    trackPoints,
    mapInstance,
    syncTrackRangeHighlight,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const dragStartMsRef = { current: null as number | null };

    const selectedFollowId = (): string | null => {
      const ui = useUiStore.getState();
      const activeId =
        ui.expandedCommentIds[ui.expandedCommentIds.length - 1] ?? null;
      if (!activeId) return null;
      const c = useProjectStore
        .getState()
        .project.comments.find((x) => x.id === activeId);
      return c?.kind === "follow" ? activeId : null;
    };

    const applyFollowRange = (
      timeStartMs: number,
      timeEndMs: number,
      pts: ReturnType<
        typeof useProjectStore.getState
      >["project"]["track"]["points"],
      hitLng: number,
      hitLat: number,
    ) => {
      const mid = interpolateTrackPose(pts, (timeStartMs + timeEndMs) / 2);
      const patch = {
        lng: mid?.lng ?? hitLng,
        lat: mid?.lat ?? hitLat,
        timeStartMs,
        timeEndMs,
      };
      const editingId = selectedFollowId();
      if (editingId) {
        updateComment(editingId, patch);
        setFollowRangeStartMs(null);
        followHoverMsRef.current = null;
        setStatusMessage("Follow range updated.");
        return;
      }
      const id = addComment({
        kind: "follow",
        text: "",
        ...patch,
      });
      setFollowRangeStartMs(null);
      followHoverMsRef.current = null;
      setCommentExpanded(id, true);
      setStatusMessage("Follow comment added. Edit text in the panel.");
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      const ui = useUiStore.getState();
      if (ui.mode !== "comment" || ui.commentTool !== "follow") return;
      const startMs = ui.followRangeStartMs ?? dragStartMsRef.current;
      if (startMs == null) return;
      const pts = useProjectStore.getState().project.track.points;
      const hit = isNearTrack(map, pts, e.lngLat.lng, e.lngLat.lat, 40);
      if (hit?.timeOffsetMs == null) return;
      followHoverMsRef.current = hit.timeOffsetMs;
      if (ui.followRangeStartMs == null && dragStartMsRef.current != null) {
        setFollowRangeStartMs(dragStartMsRef.current);
      }
      syncTrackRangeHighlight(hit.timeOffsetMs);
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      const ui = useUiStore.getState();
      if (ui.mode !== "comment" || ui.commentTool !== "follow") return;
      if (ui.followRangeStartMs != null) return;
      const pts = useProjectStore.getState().project.track.points;
      const hit = isNearTrack(map, pts, e.lngLat.lng, e.lngLat.lat);
      if (hit?.timeOffsetMs == null) return;
      dragStartMsRef.current = hit.timeOffsetMs;
      followHoverMsRef.current = hit.timeOffsetMs;
      map.dragPan.disable();
    };

    const onMouseUp = (e: maplibregl.MapMouseEvent) => {
      map.dragPan.enable();
      const dragStart = dragStartMsRef.current;
      dragStartMsRef.current = null;
      if (dragStart == null) return;

      const ui = useUiStore.getState();
      if (ui.mode !== "comment" || ui.commentTool !== "follow") return;
      const pts = useProjectStore.getState().project.track.points;
      const hit = isNearTrack(map, pts, e.lngLat.lng, e.lngLat.lat, 40);
      if (hit?.timeOffsetMs == null) return;
      if (Math.abs(hit.timeOffsetMs - dragStart) < 300) {
        return;
      }

      const timeStartMs = Math.min(dragStart, hit.timeOffsetMs);
      const timeEndMs = Math.max(dragStart, hit.timeOffsetMs);
      skipFollowClickRef.current = true;
      applyFollowRange(timeStartMs, timeEndMs, pts, hit.lng, hit.lat);
    };

    map.on("mousemove", onMove);
    map.on("mousedown", onMouseDown);
    map.on("mouseup", onMouseUp);
    return () => {
      map.dragPan.enable();
      map.off("mousemove", onMove);
      map.off("mousedown", onMouseDown);
      map.off("mouseup", onMouseUp);
    };
  }, [
    mapInstance,
    addComment,
    updateComment,
    setFollowRangeStartMs,
    setCommentExpanded,
    setStatusMessage,
    syncTrackRangeHighlight,
  ]);

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
        let planId =
          useUiStore.getState().activeRoutePlanId ??
          useProjectStore.getState().project.routePlans[0]?.id;
        if (!planId) {
          planId = addRoutePlan();
          setActiveRoutePlanId(planId);
        }
        appendPlanCoordinate(planId, [lngLat.lng, lngLat.lat]);
        return;
      }

      if (currentMode === "comment") {
        const tool = useUiStore.getState().commentTool;
        const pts = useProjectStore.getState().project.track.points;

        if (tool === "map") {
          const id = addComment({
            kind: "map",
            lng: lngLat.lng,
            lat: lngLat.lat,
            text: "",
          });
          setCommentExpanded(id, true);
          return;
        }

        // follow: pick start then end on the track (2-click; drag handled above)
        if (skipFollowClickRef.current) {
          skipFollowClickRef.current = false;
          return;
        }
        if (pts.length === 0) {
          setStatusMessage("Load a GPS track before adding a follow comment.");
          return;
        }
        const hit = isNearTrack(map, pts, lngLat.lng, lngLat.lat);
        if (!hit || hit.timeOffsetMs == null) {
          setStatusMessage("Click near the GPS track to set the range.");
          return;
        }

        const pendingStart = useUiStore.getState().followRangeStartMs;
        if (pendingStart == null) {
          setFollowRangeStartMs(hit.timeOffsetMs);
          setStatusMessage(
            "Range start set. Click the track again to set the end.",
          );
          return;
        }

        const timeStartMs = Math.min(pendingStart, hit.timeOffsetMs);
        const timeEndMs = Math.max(pendingStart, hit.timeOffsetMs);
        if (timeEndMs - timeStartMs < 300) {
          setStatusMessage("End is too close to start — pick farther along the track.");
          return;
        }
        const mid = interpolateTrackPose(
          pts,
          (timeStartMs + timeEndMs) / 2,
        );
        const patch = {
          lng: mid?.lng ?? hit.lng,
          lat: mid?.lat ?? hit.lat,
          timeStartMs,
          timeEndMs,
        };
        const activeId =
          useUiStore.getState().expandedCommentIds[
            useUiStore.getState().expandedCommentIds.length - 1
          ] ?? null;
        const selected = useProjectStore
          .getState()
          .project.comments.find((c) => c.id === activeId);
        if (selected?.kind === "follow") {
          updateComment(selected.id, patch);
          setFollowRangeStartMs(null);
          setStatusMessage("Follow range updated.");
          return;
        }
        const id = addComment({
          kind: "follow",
          text: "",
          ...patch,
        });
        setFollowRangeStartMs(null);
        setCommentExpanded(id, true);
        setStatusMessage("Follow comment added. Edit text in the panel.");
      }
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [
    mapInstance,
    appendPlanCoordinate,
    addRoutePlan,
    addComment,
    updateComment,
    setPose,
    setGeorefStep,
    setGeorefPin,
    setGeorefPendingFrom,
    resetGeorefAlign,
    clearAlignMarkers,
    addAlignMarker,
    setCommentExpanded,
    setFollowRangeStartMs,
    setActiveRoutePlanId,
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

/** Build an initial pose: prefer track center; cap size so world zoom still works. */
export function createInitialPose(
  map: maplibregl.Map,
  imageWidth: number,
  imageHeight: number,
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
      haversineDistance(lat, minLng, lat, maxLng) * 1.4,
    );
  } else {
    const bounds = map.getBounds();
    viewportWidthM = haversineDistance(
      lat,
      bounds.getWest(),
      lat,
      bounds.getEast(),
    );
  }

  // Cap so a world-scale basemap view doesn't create a continent-sized overlay
  const widthM = Math.min(
    Math.max(80, viewportWidthM * INITIAL_WIDTH_FRACTION),
    4000,
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
