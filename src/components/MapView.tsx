import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
import {
  buildSpeedColoredTrackFeatures,
  formatPaceValue,
  mpsToPaceMinPerKm,
} from "../lib/trackSpeed";
import { trackDragHitPx, trackHitPx, pointerVerb } from "../lib/mobile";
import { CommentMarkers } from "./CommentMarkers";
import { PlanVertexEditor } from "./PlanVertexEditor";
import { DEFAULT_POPUP_HEIGHT, DEFAULT_POPUP_WIDTH } from "../lib/types";

const TRACK_SOLID_COLOR = "#e11d48";

const MAP_IMAGE_SOURCE = "omap-image";
const MAP_IMAGE_LAYER = "omap-raster";
const TRACK_SOURCE = "gps-track";
const TRACK_HALO_LAYER = "gps-track-halo";
const TRACK_LAYER = "gps-track-line";
const TRACK_RANGE_SOURCE = "track-range";
const TRACK_RANGE_LAYER = "track-range-line";
const TRACK_HALO_EXTRA_WIDTH = 3;
const PLAN_SOURCE_PREFIX = "route-plan-";
const RUNNER_SOURCE = "runner-pos";
const RUNNER_LAYER = "runner-circle";

const INITIAL_WIDTH_FRACTION = 0.55;
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const TERRAIN_SOURCE = "mapterhorn-dem";
const TERRAIN_PITCH = 45;
const DEFAULT_MAX_PITCH = 60;
const MAP_BG = "#ffffff";

function isAppOwnedLayer(id: string): boolean {
  return (
    id === MAP_IMAGE_LAYER ||
    id === TRACK_HALO_LAYER ||
    id === TRACK_LAYER ||
    id === TRACK_RANGE_LAYER ||
    id === RUNNER_LAYER ||
    id.startsWith(PLAN_SOURCE_PREFIX)
  );
}

/** Remember each background layer's original color so we can restore it. */
function captureBackgroundColors(
  map: maplibregl.Map,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const style = map.getStyle();
  style?.layers?.forEach((layer) => {
    if (layer.type === "background") {
      const paint = (layer as { paint?: Record<string, unknown> }).paint;
      out[layer.id] = paint?.["background-color"] ?? MAP_BG;
    }
  });
  return out;
}

/**
 * Toggle OpenFreeMap layers via visibility (never setStyle, so app overlays
 * stay intact). When hidden, the basemap background is tinted white.
 */
function setBasemapVisible(
  map: maplibregl.Map,
  visible: boolean,
  originalBg: Record<string, unknown>,
) {
  if (!map.isStyleLoaded()) return;
  const vis = visible ? "visible" : "none";
  // Prefer live layer order over getStyle().layers snapshot so runtime layers
  // (and visibility overrides) stay in sync during camera movement / Play.
  const layerIds =
    typeof map.getLayersOrder === "function"
      ? map.getLayersOrder()
      : (map.getStyle()?.layers?.map((l) => l.id) ?? []);

  for (const id of layerIds) {
    if (isAppOwnedLayer(id)) continue;
    const layer = map.getLayer(id);
    if (!layer) continue;
    if (layer.type === "background") {
      try {
        map.setPaintProperty(
          id,
          "background-color",
          visible ? (originalBg[id] ?? MAP_BG) : MAP_BG,
        );
      } catch {
        // ignore
      }
      continue;
    }
    try {
      if (map.getLayoutProperty(id, "visibility") !== vis) {
        map.setLayoutProperty(id, "visibility", vis);
      }
    } catch {
      // ignore
    }
  }
}

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
  maxPx?: number,
): ReturnType<typeof nearestTrackPoint> {
  const limit = maxPx ?? trackHitPx();
  const hit = nearestTrackPoint(points, lng, lat);
  if (!hit) return null;
  const a = map.project([hit.lng, hit.lat]);
  const b = map.project([lng, lat]);
  if (Math.hypot(a.x - b.x, a.y - b.y) > limit) return null;
  return hit;
}

/** Bottom → top: omap image, plans, track halo, track, range, runner */
function ensureLayerOrder(map: maplibregl.Map) {
  const style = map.getStyle();
  const planLayers =
    style?.layers
      ?.map((l) => l.id)
      .filter((id) => id.startsWith(PLAN_SOURCE_PREFIX)) ?? [];

  const bottomToTop = [
    MAP_IMAGE_LAYER,
    ...planLayers,
    TRACK_HALO_LAYER,
    TRACK_LAYER,
    TRACK_RANGE_LAYER,
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
  const navControlRef = useRef<maplibregl.NavigationControl | null>(null);

  const pose = useProjectStore((s) => s.project.georef.pose);
  const mapImageUrl = useProjectStore((s) => s.mapImageUrl);
  const mapImageSize = useProjectStore((s) => s.mapImageSize);
  const setPose = useProjectStore((s) => s.setPose);
  const trackPoints = useProjectStore((s) => s.project.track.points);
  const routePlans = useProjectStore((s) => s.project.routePlans);
  const appendPlanCoordinate = useProjectStore((s) => s.appendPlanCoordinate);
  const addComment = useProjectStore((s) => s.addComment);
  const updateComment = useProjectStore((s) => s.updateComment);

  const mode = useUiStore((s) => s.mode);
  const editTool = useUiStore((s) => s.editTool);
  const mapOpacity = useUiStore((s) => s.mapOpacity);
  const showTrack = useUiStore((s) => s.showTrack);
  const colorTrackBySpeed = useUiStore((s) => s.colorTrackBySpeed);
  const trackLineWidth = useUiStore((s) => s.trackLineWidth);
  const showBasemap = useUiStore((s) => s.showBasemap);
  const headingUp = useUiStore((s) => s.headingUp);
  const terrain3d = useUiStore((s) => s.terrain3d);
  const activeRoutePlanId = useUiStore((s) => s.activeRoutePlanId);
  const followRangeStartMs = useUiStore((s) => s.followRangeStartMs);
  const followDraftRange = useUiStore((s) => s.followDraftRange);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const comments = useProjectStore((s) => s.project.comments);
  const showProfileCharts = useUiStore((s) => s.showProfileCharts);
  const isPlaying = useUiStore((s) => s.isPlaying);
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
  /** Original OpenFreeMap background colors, captured on first load. */
  const originalBgRef = useRef<Record<string, unknown>>({});
  const headingBearingRef = useRef<number | null>(null);
  const headingRafRef = useRef<number | null>(null);
  /** While true, skip heading-up camera writes so wheel zoom can animate. */
  const headingWheelPauseRef = useRef(false);
  const headingWheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  /** While true, skip heading-up camera writes so pitch/rotate drag can stick. */
  const headingDragPauseRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      // Mid-Atlantic; high zoom → ocean blue only (avoids world-map flash).
      center: [0, 0],
      zoom: 12,
      maxPitch: 0,
      attributionControl: { compact: true },
    });
    const nav = new maplibregl.NavigationControl();
    navControlRef.current = nav;
    map.addControl(nav, "top-right");
    mapRef.current = map;

    // Hide the basemap as soon as the style is parsed (before the first paint)
    // so the meaningless low-zoom world map never flashes on startup.
    const hideUntilContent = () => {
      if (!map.style || map.getStyle()?.layers == null) return;
      if (Object.keys(originalBgRef.current).length === 0) {
        originalBgRef.current = captureBackgroundColors(map);
      }
      const hasContent =
        useProjectStore.getState().project.track.points.length > 0 ||
        useProjectStore.getState().mapImageUrl != null;
      if (!hasContent) {
        setBasemapVisible(map, false, originalBgRef.current);
      }
    };
    map.on("styledata", hideUntilContent);

    map.once("load", () => {
      map.off("styledata", hideUntilContent);
      if (Object.keys(originalBgRef.current).length === 0) {
        originalBgRef.current = captureBackgroundColors(map);
      }
      const hasContent =
        useProjectStore.getState().project.track.points.length > 0 ||
        useProjectStore.getState().mapImageUrl != null;
      setBasemapVisible(
        map,
        hasContent && useUiStore.getState().showBasemap,
        originalBgRef.current,
      );
      setMapInstance(map);
    });

    return () => {
      map.off("styledata", hideUntilContent);
      alignMarkersRef.current.forEach((m) => m.remove());
      alignMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      navControlRef.current = null;
      setMapInstance(null);
    };
  }, []);

  // Keep zoom controls clear of the comment tool bar (top full-width on mobile).
  useEffect(() => {
    const map = mapRef.current;
    const nav = navControlRef.current;
    if (!map || !nav || !mapInstance) return;
    const commentEditing = mode === "edit" && editTool === "comment";
    const position = commentEditing ? "bottom-right" : "top-right";
    try {
      map.removeControl(nav);
    } catch {
      // ignore if already removed
    }
    map.addControl(nav, position);
  }, [mode, editTool, mapInstance]);

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
      const opacity =
        useUiStore.getState().mode === "georef" ? mapOpacity : 1;
      const src = map.getSource(MAP_IMAGE_SOURCE) as
        | maplibregl.ImageSource
        | undefined;
      if (src) {
        src.setCoordinates(coordinates);
        if (map.getLayer(MAP_IMAGE_LAYER)) {
          map.setPaintProperty(MAP_IMAGE_LAYER, "raster-opacity", opacity);
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
            "raster-opacity": opacity,
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
  }, [mapImageUrl, mapImageSize, pose, mapOpacity, mode, mapInstance, setPose]);

  // Basemap visibility — long-lived listeners always read the store so Play /
  // heading-up camera movement cannot leave layers stuck after a toggle, and
  // cannot re-apply a stale closure. (GPS track had the opposite bug: a stale
  // idle closure undoing the toggle; here we keep idle but never close over
  // showBasemap.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;
      if (Object.keys(originalBgRef.current).length === 0) {
        originalBgRef.current = captureBackgroundColors(map);
      }
      const ui = useUiStore.getState();
      const proj = useProjectStore.getState();
      const hasContent =
        proj.project.track.points.length > 0 || proj.mapImageUrl != null;
      setBasemapVisible(
        map,
        hasContent && ui.showBasemap,
        originalBgRef.current,
      );
      if (map.getLayer(MAP_IMAGE_LAYER)) {
        map.setPaintProperty(
          MAP_IMAGE_LAYER,
          "raster-opacity",
          ui.mode === "georef" ? ui.mapOpacity : 1,
        );
      }
      ensureLayerOrder(map);
    };

    apply();
    map.on("style.load", apply);
    map.on("idle", apply);
    const unsubUi = useUiStore.subscribe((s, prev) => {
      if (
        s.showBasemap !== prev.showBasemap ||
        s.mode !== prev.mode ||
        s.mapOpacity !== prev.mapOpacity
      ) {
        apply();
      }
    });
    const unsubProj = useProjectStore.subscribe((s, prev) => {
      if (
        s.project.track.points !== prev.project.track.points ||
        s.mapImageUrl !== prev.mapImageUrl
      ) {
        apply();
      }
    });
    return () => {
      map.off("style.load", apply);
      map.off("idle", apply);
      unsubUi();
      unsubProj();
    };
  }, [mapInstance, showBasemap, mode, mapOpacity]);

  // Terrain 3D (Mapterhorn DEM; no hillshade)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const PITCH_EASE_MS = 400;

    const applyPitch = (pitch: number) => {
      const ui = useUiStore.getState();
      // Heading-up jumpTo() calls stop() every frame and cancels easeTo. During
      // Play the main thread is busier so a timed pause is unreliable — set
      // pitch immediately whenever follow or playback would fight the ease.
      const instant =
        ui.isPlaying || (ui.headingUp && ui.mode === "view");
      if (instant) {
        map.setPitch(pitch);
      } else {
        map.easeTo({ pitch, duration: PITCH_EASE_MS });
      }
    };

    const apply = () => {
      if (!map.isStyleLoaded()) return;

      if (terrain3d) {
        if (!map.getSource(TERRAIN_SOURCE)) {
          map.addSource(TERRAIN_SOURCE, {
            type: "raster-dem",
            tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
            encoding: "terrarium",
            tileSize: 512,
            maxzoom: 12,
            attribution:
              '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
          });
        }
        map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1 });
        map.setMaxPitch(DEFAULT_MAX_PITCH);
        applyPitch(TERRAIN_PITCH);
      } else {
        map.setTerrain(null);
        if (map.getPitch() !== 0) {
          applyPitch(0);
        }
        map.setMaxPitch(0);
      }
    };

    apply();
    map.on("style.load", apply);
    const onIdleOnce = () => apply();
    if (!map.isStyleLoaded()) {
      map.once("idle", onIdleOnce);
    }
    return () => {
      map.off("style.load", apply);
      map.off("idle", onIdleOnce);
    };
  }, [terrain3d, mapInstance]);

  const speedColoredTrack = useMemo(() => {
    if (!colorTrackBySpeed || trackPoints.length < 2) return null;
    return buildSpeedColoredTrackFeatures(trackPoints);
  }, [colorTrackBySpeed, trackPoints]);

  const forceSolidTrack = useMemo(() => {
    // Only while editing follow ranges — selection must not stick into View.
    if (mode !== "edit" || editTool !== "comment") return false;
    if (followRangeStartMs != null || followDraftRange != null) return true;
    const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;
    if (!activeId) return false;
    return comments.some((c) => c.id === activeId && c.kind === "follow");
  }, [
    mode,
    editTool,
    followRangeStartMs,
    followDraftRange,
    expandedCommentIds,
    comments,
  ]);

  // Track
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;
      const pts = trackPoints;
      const visible = showTrack && pts.length >= 2;
      const useSpeedColors =
        visible && speedColoredTrack != null && !forceSolidTrack;
      const lineData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: !visible
          ? []
          : useSpeedColors
            ? speedColoredTrack.features
            : [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: pts.map((p) => [p.lng, p.lat]),
                  },
                },
              ],
      };
      const lineColor: string | maplibregl.ExpressionSpecification =
        useSpeedColors ? ["get", "color"] : TRACK_SOLID_COLOR;
      const haloWidth = trackLineWidth + TRACK_HALO_EXTRA_WIDTH;
      const visibility = visible ? "visible" : "none";

      ensureGeoJsonSource(map, TRACK_SOURCE, lineData);

      if (!map.getLayer(TRACK_HALO_LAYER) && pts.length >= 2) {
        map.addLayer({
          id: TRACK_HALO_LAYER,
          type: "line",
          source: TRACK_SOURCE,
          paint: {
            "line-color": "#ffffff",
            "line-width": haloWidth,
            "line-opacity": 0.85,
          },
        });
      } else if (map.getLayer(TRACK_HALO_LAYER)) {
        map.setPaintProperty(TRACK_HALO_LAYER, "line-width", haloWidth);
      }

      if (!map.getLayer(TRACK_LAYER) && pts.length >= 2) {
        map.addLayer({
          id: TRACK_LAYER,
          type: "line",
          source: TRACK_SOURCE,
          paint: {
            "line-color": lineColor,
            "line-width": trackLineWidth,
            "line-opacity": 0.9,
          },
        });
      } else if (map.getLayer(TRACK_LAYER)) {
        map.setPaintProperty(TRACK_LAYER, "line-color", lineColor);
        map.setPaintProperty(TRACK_LAYER, "line-width", trackLineWidth);
      }

      if (map.getLayer(TRACK_HALO_LAYER)) {
        map.setLayoutProperty(TRACK_HALO_LAYER, "visibility", visibility);
      }
      if (map.getLayer(TRACK_LAYER)) {
        map.setLayoutProperty(TRACK_LAYER, "visibility", visibility);
      }
      ensureLayerOrder(map);
    };

    // apply() is idempotent and guards on isStyleLoaded. Prefer style.load over a
    // permanent idle listener: during Play the runner marker updates every frame and
    // would fire idle continuously, racing stale track apply closures against toggles.
    apply();
    map.on("style.load", apply);
    const onIdleOnce = () => apply();
    if (!map.isStyleLoaded()) {
      map.once("idle", onIdleOnce);
    }
    return () => {
      map.off("style.load", apply);
      map.off("idle", onIdleOnce);
    };
  }, [
    trackPoints,
    showTrack,
    speedColoredTrack,
    forceSolidTrack,
    trackLineWidth,
    mapInstance,
  ]);

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
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, animate: false });
  }, [trackPoints]);

  // Route plans
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;
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

    apply();
    map.on("style.load", apply);
    map.on("idle", apply);
    return () => {
      map.off("style.load", apply);
      map.off("idle", apply);
    };
  }, [routePlans, mapInstance]);

  // Runner marker — keep listeners stable; scrub time via store subscribe so Play
  // does not rebind idle/style handlers every animation frame.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;
      const pts = useProjectStore.getState().project.track.points;
      const t = useUiStore.getState().animationTimeMs;
      const runnerPose = interpolateTrackPose(pts, t);
      const show = pts.length > 0 && runnerPose != null;

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
        ensureLayerOrder(map);
      }
    };

    apply();
    map.on("style.load", apply);
    const unsub = useUiStore.subscribe((s, prev) => {
      if (s.animationTimeMs !== prev.animationTimeMs) apply();
    });
    return () => {
      map.off("style.load", apply);
      unsub();
    };
  }, [trackPoints, mapInstance]);

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
      headingDragPauseRef.current = false;
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

    // jumpTo() calls handlers.stop(), which resets an in-progress pitch/rotate
    // drag. Pause on the gesture mousedown/touch — before the next RAF tick —
    // so right-drag pitch can work with Terrain 3D. Do not use pitchstart /
    // rotatestart: jumpTo itself fires those when bearing changes.
    const isPitchRotateMouse = (oe: MouseEvent) =>
      oe.button === 2 || (oe.button === 0 && oe.ctrlKey);

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (isPitchRotateMouse(e.originalEvent)) {
        headingDragPauseRef.current = true;
      }
    };
    const endMouseDragPause = () => {
      if (!headingDragPauseRef.current) return;
      headingDragPauseRef.current = false;
      headingBearingRef.current = map.getBearing();
    };
    const onTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length >= 2) {
        headingDragPauseRef.current = true;
      }
    };
    const onTouchEnd = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length >= 2) return;
      if (!headingDragPauseRef.current) return;
      headingDragPauseRef.current = false;
      headingBearingRef.current = map.getBearing();
    };

    map.on("wheel", onWheel);
    map.on("mousedown", onMouseDown);
    map.on("mouseup", endMouseDragPause);
    map.on("touchstart", onTouchStart);
    map.on("touchend", onTouchEnd);
    map.on("touchcancel", onTouchEnd);
    // Release may happen outside the canvas.
    window.addEventListener("mouseup", endMouseDragPause);

    const tick = () => {
      const dragBusy =
        headingDragPauseRef.current ||
        map.dragRotate.isActive() ||
        map.touchPitch.isActive();
      if (!headingWheelPauseRef.current && !dragBusy) {
        const pts = useProjectStore.getState().project.track.points;
        const t = useUiStore.getState().animationTimeMs;
        const playing = useUiStore.getState().isPlaying;
        const terrainOn = useUiStore.getState().terrain3d;
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
          // Omit zoom so wheel zoom sticks. When terrain is off, force pitch 0
          // every frame so a cancelled toggle cannot leave the camera tilted.
          map.jumpTo({
            center: [runnerPose.lng, runnerPose.lat],
            bearing: nextBearing,
            ...(terrainOn ? {} : { pitch: 0 }),
          });
        }
      }
      headingRafRef.current = requestAnimationFrame(tick);
    };

    headingRafRef.current = requestAnimationFrame(tick);
    return () => {
      map.off("wheel", onWheel);
      map.off("mousedown", onMouseDown);
      map.off("mouseup", endMouseDragPause);
      map.off("touchstart", onTouchStart);
      map.off("touchend", onTouchEnd);
      map.off("touchcancel", onTouchEnd);
      window.removeEventListener("mouseup", endMouseDragPause);
      if (headingWheelTimerRef.current != null) {
        clearTimeout(headingWheelTimerRef.current);
        headingWheelTimerRef.current = null;
      }
      headingWheelPauseRef.current = false;
      headingDragPauseRef.current = false;
      if (headingRafRef.current != null) {
        cancelAnimationFrame(headingRafRef.current);
        headingRafRef.current = null;
      }
    };
  }, [headingUp, mode, mapInstance]);

  // Reset north-up when turning heading-up off, or when leaving View
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === "view" && headingUp) return;
    headingBearingRef.current = null;
    map.easeTo({ bearing: 0, duration: 400 });
  }, [headingUp, mode, mapInstance]);

  // Preview highlight while picking a follow-comment range, draft, or selected follow
  const followHoverMsRef = useRef<number | null>(null);
  const skipFollowClickRef = useRef(false);
  /** True while a follow range drag has disabled map pan. */
  const followDragPanLockedRef = useRef(false);

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
      } else if (ui.followDraftRange && pts.length > 0) {
        coords = trackSliceCoordinates(
          pts,
          ui.followDraftRange.timeStartMs,
          ui.followDraftRange.timeEndMs,
        );
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
    const map = mapRef.current;
    if (!map || !mapInstance) return;
    syncTrackRangeHighlight();
    map.on("style.load", syncTrackRangeHighlight);
    return () => {
      map.off("style.load", syncTrackRangeHighlight);
    };
  }, [
    expandedCommentIds,
    comments,
    followRangeStartMs,
    followDraftRange,
    trackPoints,
    mapInstance,
    syncTrackRangeHighlight,
  ]);

  // Follow range: pan stays on unless actively dragging a range on the track.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const dragStartMsRef = { current: null as number | null };
    const dragCommittedStartRef = { current: false };

    const unlockDragPan = () => {
      if (!followDragPanLockedRef.current) return;
      followDragPanLockedRef.current = false;
      map.dragPan.enable();
    };

    const lockDragPan = () => {
      if (followDragPanLockedRef.current) return;
      followDragPanLockedRef.current = true;
      map.dragPan.disable();
    };

    const followTargetId = (): string | null => {
      const ui = useUiStore.getState();
      if (ui.followRangeTargetId) return ui.followRangeTargetId;
      const activeId =
        ui.expandedCommentIds[ui.expandedCommentIds.length - 1] ?? null;
      if (!activeId) return null;
      const c = useProjectStore
        .getState()
        .project.comments.find((x) => x.id === activeId);
      return c?.kind === "follow" ? activeId : null;
    };

    const stageFollowDraft = (
      timeStartMs: number,
      timeEndMs: number,
      pts: ReturnType<
        typeof useProjectStore.getState
      >["project"]["track"]["points"],
      hitLng: number,
      hitLat: number,
    ) => {
      const mid = interpolateTrackPose(pts, (timeStartMs + timeEndMs) / 2);
      useUiStore.getState().setFollowDraftRange({
        timeStartMs,
        timeEndMs,
        lng: mid?.lng ?? hitLng,
        lat: mid?.lat ?? hitLat,
        targetId: followTargetId(),
      });
      setFollowRangeStartMs(null);
      followHoverMsRef.current = null;
      setStatusMessage("Range set — Confirm to save, or Redo to pick again.");
      syncTrackRangeHighlight();
    };

    type LngLatEvent = { lngLat: { lng: number; lat: number } };

    const onMove = (e: LngLatEvent) => {
      const ui = useUiStore.getState();
      if (
        ui.mode !== "edit" ||
        ui.editTool !== "comment" ||
        ui.commentTool !== "follow"
      )
        return;
      const startMs = dragStartMsRef.current ?? ui.followRangeStartMs;
      if (startMs == null) return;
      const pts = useProjectStore.getState().project.track.points;
      const hit = isNearTrack(
        map,
        pts,
        e.lngLat.lng,
        e.lngLat.lat,
        trackDragHitPx(),
      );
      if (hit?.timeOffsetMs == null) return;
      followHoverMsRef.current = hit.timeOffsetMs;
      // Mirror drag start into store only after movement so short taps don't
      // lock the user into two-tap mode.
      if (
        dragStartMsRef.current != null &&
        !dragCommittedStartRef.current &&
        Math.abs(hit.timeOffsetMs - dragStartMsRef.current) >= 300
      ) {
        dragCommittedStartRef.current = true;
        setFollowRangeStartMs(dragStartMsRef.current);
      }
      syncTrackRangeHighlight(hit.timeOffsetMs);
    };

    const onDown = (e: LngLatEvent) => {
      const ui = useUiStore.getState();
      if (
        ui.mode !== "edit" ||
        ui.editTool !== "comment" ||
        ui.commentTool !== "follow"
      )
        return;
      // Two-tap second point: wait for click, don't start a new drag.
      if (ui.followRangeStartMs != null && dragStartMsRef.current == null)
        return;
      const pts = useProjectStore.getState().project.track.points;
      const hit = isNearTrack(
        map,
        pts,
        e.lngLat.lng,
        e.lngLat.lat,
        trackDragHitPx(),
      );
      if (hit?.timeOffsetMs == null) return;
      // Replacing a draft: start a fresh drag over the track.
      if (ui.followDraftRange) {
        useUiStore.getState().setFollowDraftRange(null);
      }
      dragStartMsRef.current = hit.timeOffsetMs;
      dragCommittedStartRef.current = false;
      followHoverMsRef.current = hit.timeOffsetMs;
      lockDragPan();
    };

    const onUp = (e: LngLatEvent) => {
      const dragStart = dragStartMsRef.current;
      const committed = dragCommittedStartRef.current;
      dragStartMsRef.current = null;
      dragCommittedStartRef.current = false;
      unlockDragPan();
      if (dragStart == null) return;

      const ui = useUiStore.getState();
      if (
        ui.mode !== "edit" ||
        ui.editTool !== "comment" ||
        ui.commentTool !== "follow"
      )
        return;
      const pts = useProjectStore.getState().project.track.points;
      const hit = isNearTrack(
        map,
        pts,
        e.lngLat.lng,
        e.lngLat.lat,
        trackDragHitPx(),
      );
      if (hit?.timeOffsetMs == null || !committed) {
        // Short / cancelled drag — clear any partial start so pan stays free.
        if (committed || ui.followRangeStartMs === dragStart) {
          setFollowRangeStartMs(null);
          followHoverMsRef.current = null;
          syncTrackRangeHighlight();
        }
        return;
      }
      if (Math.abs(hit.timeOffsetMs - dragStart) < 300) {
        setFollowRangeStartMs(null);
        followHoverMsRef.current = null;
        syncTrackRangeHighlight();
        return;
      }

      const timeStartMs = Math.min(dragStart, hit.timeOffsetMs);
      const timeEndMs = Math.max(dragStart, hit.timeOffsetMs);
      skipFollowClickRef.current = true;
      stageFollowDraft(timeStartMs, timeEndMs, pts, hit.lng, hit.lat);
    };

    const onTouchMove = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length !== 1) return;
      onMove(e);
    };
    const onTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length !== 1) return;
      onDown(e);
    };
    const onTouchEnd = (e: maplibregl.MapTouchEvent) => {
      onUp(e);
    };
    const onTouchCancel = () => {
      dragStartMsRef.current = null;
      dragCommittedStartRef.current = false;
      unlockDragPan();
    };

    map.on("mousemove", onMove);
    map.on("mousedown", onDown);
    map.on("mouseup", onUp);
    map.on("touchmove", onTouchMove);
    map.on("touchstart", onTouchStart);
    map.on("touchend", onTouchEnd);
    map.on("touchcancel", onTouchCancel);
    return () => {
      unlockDragPan();
      map.off("mousemove", onMove);
      map.off("mousedown", onDown);
      map.off("mouseup", onUp);
      map.off("touchmove", onTouchMove);
      map.off("touchstart", onTouchStart);
      map.off("touchend", onTouchEnd);
      map.off("touchcancel", onTouchCancel);
    };
  }, [
    mapInstance,
    setFollowRangeStartMs,
    setStatusMessage,
    syncTrackRangeHighlight,
  ]);

  // Profile chart sync: hover near track in view mode scrubs playback time.
  // Touch is omitted so one-finger pan doesn't fight scrubbing (use profile chart).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const onProfileMove = (e: {
      lngLat: { lng: number; lat: number };
    }) => {
      const ui = useUiStore.getState();
      if (ui.mode !== "view" || ui.isPlaying || !ui.showProfileCharts) return;
      const pts = useProjectStore.getState().project.track.points;
      if (pts.length === 0) return;
      const hit = isNearTrack(map, pts, e.lngLat.lng, e.lngLat.lat);
      if (hit?.timeOffsetMs == null) return;
      ui.setIsPlaying(false);
      ui.setAnimationTimeMs(hit.timeOffsetMs);
    };

    map.on("mousemove", onProfileMove);
    return () => {
      map.off("mousemove", onProfileMove);
    };
  }, [mapInstance, showProfileCharts, isPlaying]);

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
      const ui = useUiStore.getState();
      const currentMode = ui.mode;
      const currentEditTool = ui.editTool;

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
              "Aligned. Repeat the 2-point cycle to fine-tune, or tap Done when finished.",
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

      if (currentMode === "edit" && currentEditTool === "plan") {
        const planId =
          useUiStore.getState().activeRoutePlanId ??
          useProjectStore.getState().project.routePlans[0]?.id;
        if (!planId) {
          setStatusMessage("Add a plan first, then tap the map to draw.");
          return;
        }
        appendPlanCoordinate(planId, [lngLat.lng, lngLat.lat]);
        return;
      }

      if (currentMode === "edit" && currentEditTool === "comment") {
        const tool = useUiStore.getState().commentTool;
        const pts = useProjectStore.getState().project.track.points;

        if (tool === "danmaku") {
          if (pts.length === 0) {
            setStatusMessage(
              "Load a GPS track before adding a danmaku comment.",
            );
            return;
          }
          const hit = isNearTrack(map, pts, lngLat.lng, lngLat.lat);
          if (!hit || hit.timeOffsetMs == null) {
            setStatusMessage(
              `${pointerVerb()} near the GPS track to place a danmaku.`,
            );
            return;
          }
          const id = addComment({
            kind: "danmaku",
            lng: hit.lng,
            lat: hit.lat,
            text: "",
            timeStartMs: hit.timeOffsetMs,
          });
          setCommentExpanded(id, true);
          setStatusMessage(
            "Danmaku added. Edit text in the panel, or drag the marker along the track.",
          );
          return;
        }

        if (tool === "map") {
          const id = addComment({
            kind: "map",
            lng: lngLat.lng,
            lat: lngLat.lat,
            text: "",
            popupWidth: DEFAULT_POPUP_WIDTH,
            popupHeight: DEFAULT_POPUP_HEIGHT,
            popupOpen: true,
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
        const hit = isNearTrack(
          map,
          pts,
          lngLat.lng,
          lngLat.lat,
          trackDragHitPx(),
        );
        if (!hit || hit.timeOffsetMs == null) {
          // Off-track tap cancels an in-progress start or clears guidance.
          const pending = useUiStore.getState().followRangeStartMs;
          if (pending != null) {
            setFollowRangeStartMs(null);
            followHoverMsRef.current = null;
            setStatusMessage(
              `${pointerVerb()} or drag along the GPS track to set the range`,
            );
            return;
          }
          setStatusMessage(
            `${pointerVerb()} near the GPS track to set the range.`,
          );
          return;
        }

        const draft = useUiStore.getState().followDraftRange;
        if (draft) {
          // Starting a new two-tap after a draft replaces it.
          useUiStore.getState().setFollowDraftRange(null);
        }

        const pendingStart = useUiStore.getState().followRangeStartMs;
        if (pendingStart == null) {
          setFollowRangeStartMs(hit.timeOffsetMs);
          setStatusMessage(
            `Range start set. ${pointerVerb()} the track again to set the end.`,
          );
          return;
        }

        const timeStartMs = Math.min(pendingStart, hit.timeOffsetMs);
        const timeEndMs = Math.max(pendingStart, hit.timeOffsetMs);
        if (timeEndMs - timeStartMs < 300) {
          setStatusMessage(
            "End is too close to start — pick farther along the track.",
          );
          return;
        }
        const mid = interpolateTrackPose(
          pts,
          (timeStartMs + timeEndMs) / 2,
        );
        const targetId =
          useUiStore.getState().followRangeTargetId ??
          (() => {
            const activeId =
              useUiStore.getState().expandedCommentIds[
                useUiStore.getState().expandedCommentIds.length - 1
              ] ?? null;
            const selected = useProjectStore
              .getState()
              .project.comments.find((c) => c.id === activeId);
            return selected?.kind === "follow" ? selected.id : null;
          })();
        useUiStore.getState().setFollowDraftRange({
          timeStartMs,
          timeEndMs,
          lng: mid?.lng ?? hit.lng,
          lat: mid?.lat ?? hit.lat,
          targetId,
        });
        setFollowRangeStartMs(null);
        followHoverMsRef.current = null;
        setStatusMessage("Range set — Confirm to save, or Redo to pick again.");
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
    setStatusMessage,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    const ui = useUiStore.getState();
    const hasDrawablePlan =
      editTool === "plan" &&
      routePlans.some((p) => p.id === ui.activeRoutePlanId);
    canvas.style.cursor =
      mode === "georef" ||
      (mode === "edit" && editTool === "comment") ||
      (mode === "edit" && hasDrawablePlan)
        ? "crosshair"
        : "";
  }, [mode, editTool, activeRoutePlanId, routePlans]);

  const showSpeedScale =
    showTrack &&
    speedColoredTrack != null &&
    !forceSolidTrack &&
    trackPoints.length >= 2;
  const legendPlans = routePlans.filter((p) => p.visible);
  const showTrackInLegend = showTrack && trackPoints.length >= 2;
  const showLayerLegend = showTrackInLegend || legendPlans.length > 0;

  return (
    <>
      <div ref={containerRef} className="map-view" />
      {showLayerLegend && (
        <div
          className="map-legend map-legend--layers"
          aria-label="Map layer legend"
        >
          {showTrackInLegend && (
            <div className="map-legend-row">
              <span
                className={
                  showSpeedScale
                    ? "map-legend-swatch map-legend-swatch--speed"
                    : "map-legend-swatch"
                }
                style={
                  showSpeedScale
                    ? undefined
                    : { backgroundColor: TRACK_SOLID_COLOR }
                }
                aria-hidden
              />
              <span className="map-legend-label">GPS track</span>
            </div>
          )}
          {legendPlans.map((plan) => (
            <div key={plan.id} className="map-legend-row">
              <span
                className="map-legend-dash"
                style={{ color: plan.color || "#2563eb" }}
                aria-hidden
              />
              <span className="map-legend-label" title={plan.name}>
                {plan.name}
              </span>
            </div>
          ))}
        </div>
      )}
      {showSpeedScale && speedColoredTrack && (
        <div
          className="map-legend map-legend--speed"
          aria-label="Track pace scale (min/km)"
        >
          <span className="map-legend-speed-label">
            Slow
            <br />
            {formatPaceValue(
              mpsToPaceMinPerKm(speedColoredTrack.minSpeedMps) ?? 0,
            )}
          </span>
          <div className="map-legend-speed-mid">
            <div className="map-legend-speed-bar" />
            <span className="map-legend-speed-unit">min/km</span>
          </div>
          <span className="map-legend-speed-label">
            Fast
            <br />
            {formatPaceValue(
              mpsToPaceMinPerKm(speedColoredTrack.maxSpeedMps) ?? 0,
            )}
          </span>
        </div>
      )}
      <CommentMarkers map={mapInstance} />
      <PlanVertexEditor map={mapInstance} />
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
