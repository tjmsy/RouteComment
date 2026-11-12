import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { cornersFromPose } from "../lib/omapPose";
import {
  poseTranslatedByPoint,
  poseFromPinnedSimilarity,
} from "../lib/omapSimilarity";
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
import { createInitialPose } from "../lib/mapInitialPose";
import { CommentMarkers } from "./CommentMarkers";
import { PlanVertexEditor } from "./PlanVertexEditor";
import {
  DEFAULT_POPUP_HEIGHT,
  DEFAULT_POPUP_WIDTH,
  type Comment,
} from "../lib/types";
import { t } from "../i18n";

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

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const TERRAIN_SOURCE = "mapterhorn-dem";
const TERRAIN_PITCH = 45;
const DEFAULT_MAX_PITCH = 60;
const MAP_BG = "#ffffff";

/** True when comment list changes affect track paint / amber range (not text). */
function commentsAffectTrackPaint(prev: Comment[], next: Comment[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i++) {
    const a = prev[i]!;
    const b = next[i]!;
    if (
      a.id !== b.id ||
      a.kind !== b.kind ||
      a.timeStartMs !== b.timeStartMs ||
      a.timeEndMs !== b.timeEndMs
    ) {
      return true;
    }
  }
  return false;
}

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
function captureBackgroundColors(map: maplibregl.Map): Record<string, string> {
  const out: Record<string, string> = {};
  const style = map.getStyle();
  style?.layers?.forEach((layer) => {
    if (layer.type === "background") {
      const paint = (layer as { paint?: Record<string, unknown> }).paint;
      const c = paint?.["background-color"];
      out[layer.id] = typeof c === "string" ? c : MAP_BG;
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
  originalBg: Record<string, string>
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
          visible ? (originalBg[id] ?? MAP_BG) : MAP_BG
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
  data: GeoJSON.FeatureCollection | GeoJSON.Feature
) {
  const existing = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
  } else {
    map.addSource(id, { type: "geojson", data });
  }
}

/** True when the style JSON is present. Do NOT use isStyleLoaded() here —
 * that stays false while basemap tiles load and would skip overlay paints. */
function styleHasLayers(map: maplibregl.Map): boolean {
  return (
    (map.getStyle()?.layers?.length ?? 0) > 0 || !!map.getLayer(TRACK_LAYER)
  );
}

/** Amber slice for follow draft / selected voice — painted with the GPS track. */
function paintTrackRangeHighlight(map: maplibregl.Map) {
  if (!styleHasLayers(map)) return;

  const ui = useUiStore.getState();
  const pts = useProjectStore.getState().project.track.points;
  let coords: [number, number][] = [];

  if (ui.followDraftRange && pts.length > 0) {
    const a = Math.min(ui.followDraftRange.aMs, ui.followDraftRange.bMs);
    const b = Math.max(ui.followDraftRange.aMs, ui.followDraftRange.bMs);
    coords = trackSliceCoordinates(pts, a, b);
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
        selected.timeEndMs
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

  try {
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
    } else {
      map.setLayoutProperty(TRACK_RANGE_LAYER, "visibility", "visible");
      map.setPaintProperty(TRACK_RANGE_LAYER, "line-color", "#f59e0b");
      map.setPaintProperty(TRACK_RANGE_LAYER, "line-width", 5);
      map.setPaintProperty(TRACK_RANGE_LAYER, "line-opacity", 0.85);
    }
  } catch {
    // Style may be mid-swap; idle / next apply will retry.
  }
}

/** Keep the amber range above the red GPS line (halo → track → range → runner). */
function bringRangeAboveTrack(map: maplibregl.Map) {
  const stack = [
    TRACK_HALO_LAYER,
    TRACK_LAYER,
    TRACK_RANGE_LAYER,
    RUNNER_LAYER,
  ];
  for (const id of stack) {
    if (!map.getLayer(id)) continue;
    try {
      map.moveLayer(id);
    } catch {
      // ignore
    }
  }
}

/** Bottom → top: omap image, plans, then track stack (see bringRangeAboveTrack). */
function ensureLayerOrder(map: maplibregl.Map) {
  const style = map.getStyle();
  const planLayers =
    style?.layers
      ?.map((l) => l.id)
      .filter((id) => id.startsWith(PLAN_SOURCE_PREFIX)) ?? [];

  const bottomToTop = [MAP_IMAGE_LAYER, ...planLayers];

  for (const id of bottomToTop) {
    if (map.getLayer(id)) {
      try {
        map.moveLayer(id);
      } catch {
        // ignore
      }
    }
  }
  bringRangeAboveTrack(map);
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
  maxPx?: number
): ReturnType<typeof nearestTrackPoint> {
  const limit = maxPx ?? trackHitPx();
  const hit = nearestTrackPoint(points, lng, lat);
  if (!hit) return null;
  const a = map.project([hit.lng, hit.lat]);
  const b = map.project([lng, lat]);
  if (Math.hypot(a.x - b.x, a.y - b.y) > limit) return null;
  return hit;
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
  const commentTool = useUiStore((s) => s.commentTool);
  const mapOpacity = useUiStore((s) => s.mapOpacity);
  const showTrack = useUiStore((s) => s.showTrack);
  const colorTrackBySpeed = useUiStore((s) => s.colorTrackBySpeed);
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
  const mapFitRequestId = useUiStore((s) => s.mapFitRequestId);
  const removeComment = useProjectStore((s) => s.removeComment);

  const appliedImageUrlRef = useRef<string | null>(null);
  const pendingFitImageRef = useRef(false);
  /** Original OpenFreeMap background colors, captured on first load. */
  const originalBgRef = useRef<Record<string, string>>({});
  const headingBearingRef = useRef<number | null>(null);
  const headingRafRef = useRef<number | null>(null);
  /** While true, skip heading-up camera writes so wheel zoom can animate. */
  const headingWheelPauseRef = useRef(false);
  const headingWheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
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
        originalBgRef.current
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

  const clearAlignMarkers = useCallback(() => {
    alignMarkersRef.current.forEach((m) => m.remove());
    alignMarkersRef.current = [];
  }, []);

  const addAlignMarker = useCallback(
    (
      lngLat: { lng: number; lat: number },
      label: string,
      kind: "source" | "target"
    ) => {
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
    []
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
          mapImageSize.height
        );
        setPose(currentPose);
      }

      const coordinates = cornersFromPose(currentPose);
      const opacity = useUiStore.getState().mode === "georef" ? mapOpacity : 1;
      const src = map.getSource(MAP_IMAGE_SOURCE) as
        maplibregl.ImageSource | undefined;
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
        // Prefer GPS track bounds when a track is present (ZIP load).
        const pts = useProjectStore.getState().project.track.points;
        if (pts.length >= 2) return;
        const corners = cornersFromPose(currentPose);
        const bounds = new maplibregl.LngLatBounds(corners[0], corners[0]);
        corners.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 500 });
      }
    };

    syncImage();
    map.on("style.load", syncImage);
    // Retry when the first pass bailed on !isStyleLoaded (ZIP mounts MapView
    // after mapImageUrl is already set; appliedImageUrlRef stays null then).
    const onIdle = () => {
      if (mapImageUrl && mapImageSize && !map.getSource(MAP_IMAGE_SOURCE)) {
        syncImage();
      }
    };
    map.on("idle", onIdle);
    const unsubProj = useProjectStore.subscribe((s, prev) => {
      if (
        s.mapImageUrl !== prev.mapImageUrl ||
        s.mapImageSize !== prev.mapImageSize ||
        s.project.georef.pose !== prev.project.georef.pose
      ) {
        syncImage();
      }
    });
    return () => {
      map.off("style.load", syncImage);
      map.off("idle", onIdle);
      unsubProj();
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
        originalBgRef.current
      );
      if (map.getLayer(MAP_IMAGE_LAYER)) {
        map.setPaintProperty(
          MAP_IMAGE_LAYER,
          "raster-opacity",
          ui.mode === "georef" ? ui.mapOpacity : 1
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
      const instant = ui.isPlaying || (ui.headingUp && ui.mode === "view");
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
            maxzoom: 16,
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

  // Track — apply() always reads stores so style.load / idle cannot re-paint
  // a stale solid track after leaving follow edit (same pattern as basemap).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const forceSolidFrom = (
      ui: ReturnType<typeof useUiStore.getState>,
      commentsList: typeof comments
    ) => {
      if (ui.mode !== "edit" || ui.editTool !== "comment") return false;
      if (ui.followRangeStartMs != null || ui.followDraftRange != null) {
        return true;
      }
      const activeId =
        ui.expandedCommentIds[ui.expandedCommentIds.length - 1] ?? null;
      if (!activeId) return false;
      return commentsList.some((c) => c.id === activeId && c.kind === "follow");
    };

    const apply = () => {
      // isStyleLoaded() is false while tiles load. If the GPS track already
      // exists, still refresh the amber range; otherwise wait for a full load.
      if (!map.isStyleLoaded()) {
        if (map.getLayer(TRACK_LAYER)) {
          paintTrackRangeHighlight(map);
          bringRangeAboveTrack(map);
        }
        return;
      }
      const ui = useUiStore.getState();
      const proj = useProjectStore.getState();
      const pts = proj.project.track.points;
      const forceSolid = forceSolidFrom(ui, proj.project.comments);
      const speedColored =
        ui.colorTrackBySpeed && pts.length >= 2
          ? buildSpeedColoredTrackFeatures(pts)
          : null;
      const visible = ui.showTrack && pts.length >= 2;
      const useSpeedColors = visible && speedColored != null && !forceSolid;
      const lineData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: !visible
          ? []
          : useSpeedColors
            ? speedColored.features
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
      const lineOpacity = useSpeedColors ? 0.72 : 0.9;
      const haloOpacity = useSpeedColors ? 0.55 : 0.85;
      const haloWidth = ui.trackLineWidth + TRACK_HALO_EXTRA_WIDTH;
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
            "line-opacity": haloOpacity,
          },
        });
      } else if (map.getLayer(TRACK_HALO_LAYER)) {
        map.setPaintProperty(TRACK_HALO_LAYER, "line-width", haloWidth);
        map.setPaintProperty(TRACK_HALO_LAYER, "line-opacity", haloOpacity);
      }

      if (!map.getLayer(TRACK_LAYER) && pts.length >= 2) {
        map.addLayer({
          id: TRACK_LAYER,
          type: "line",
          source: TRACK_SOURCE,
          paint: {
            "line-color": lineColor,
            "line-width": ui.trackLineWidth,
            "line-opacity": lineOpacity,
          },
        });
      } else if (map.getLayer(TRACK_LAYER)) {
        map.setPaintProperty(TRACK_LAYER, "line-color", lineColor);
        map.setPaintProperty(TRACK_LAYER, "line-width", ui.trackLineWidth);
        map.setPaintProperty(TRACK_LAYER, "line-opacity", lineOpacity);
      }

      if (map.getLayer(TRACK_HALO_LAYER)) {
        map.setLayoutProperty(TRACK_HALO_LAYER, "visibility", visibility);
      }
      if (map.getLayer(TRACK_LAYER)) {
        map.setLayoutProperty(TRACK_LAYER, "visibility", visibility);
      }
      // Same pass as the GPS track so draft/selection amber never lags or drops.
      paintTrackRangeHighlight(map);
      ensureLayerOrder(map);
      // Track apply can leave the red line on top if range layers were just
      // created — force amber above red one more time.
      bringRangeAboveTrack(map);
    };

    apply();
    map.on("style.load", apply);
    const onIdle = () => {
      const pts = useProjectStore.getState().project.track.points;
      const ui = useUiStore.getState();
      const want = ui.showTrack && pts.length >= 2;
      if (want && !map.getLayer(TRACK_LAYER)) {
        apply();
        return;
      }
      // Tiles finished loading after a pick that saw isStyleLoaded=false.
      if (
        ui.followDraftRange != null ||
        (ui.expandedCommentIds.length > 0 && !map.getLayer(TRACK_RANGE_LAYER))
      ) {
        paintTrackRangeHighlight(map);
        bringRangeAboveTrack(map);
      }
    };
    map.on("idle", onIdle);
    const unsubUi = useUiStore.subscribe((s, prev) => {
      if (
        s.showTrack !== prev.showTrack ||
        s.colorTrackBySpeed !== prev.colorTrackBySpeed ||
        s.trackLineWidth !== prev.trackLineWidth ||
        s.mode !== prev.mode ||
        s.editTool !== prev.editTool ||
        s.followRangeStartMs !== prev.followRangeStartMs ||
        s.followDraftRange !== prev.followDraftRange ||
        s.expandedCommentIds !== prev.expandedCommentIds
      ) {
        apply();
      }
    });
    const unsubProj = useProjectStore.subscribe((s, prev) => {
      if (s.project.track.points !== prev.project.track.points) {
        apply();
        return;
      }
      if (
        s.project.comments !== prev.project.comments &&
        commentsAffectTrackPaint(prev.project.comments, s.project.comments)
      ) {
        apply();
      }
    });
    return () => {
      map.off("style.load", apply);
      map.off("idle", onIdle);
      unsubUi();
      unsubProj();
    };
  }, [mapInstance]);

  const fittedTrackRef = useRef("");
  const lastFitRequestRef = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const forceFit = mapFitRequestId !== lastFitRequestRef.current;
    if (forceFit) lastFitRequestRef.current = mapFitRequestId;

    if (trackPoints.length >= 2) {
      const key = `${trackPoints[0].lng},${trackPoints[0].lat}-${trackPoints.length}`;
      if (!forceFit && fittedTrackRef.current === key) return;
      fittedTrackRef.current = key;
      const bounds = new maplibregl.LngLatBounds(
        [trackPoints[0].lng, trackPoints[0].lat],
        [trackPoints[0].lng, trackPoints[0].lat]
      );
      trackPoints.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 16, animate: false });
      return;
    }

    if (forceFit) {
      const currentPose = useProjectStore.getState().project.georef.pose;
      if (!currentPose) return;
      const corners = cornersFromPose(currentPose);
      const bounds = new maplibregl.LngLatBounds(corners[0], corners[0]);
      corners.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 48, maxZoom: 16, animate: false });
    }
  }, [trackPoints, mapInstance, mapFitRequestId]);

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
          plan.visible && plan.coordinates.length >= 2 ? "visible" : "none"
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
          plan.visible && plan.coordinates.length > 0 ? "visible" : "none"
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
          const currentBearing = headingBearingRef.current ?? map.getBearing();
          // Higher alpha while scrubbing so the map snaps to the new heading faster
          const alpha = playing ? 0.14 : 0.35;
          const nextBearing = lerpBearing(
            currentBearing,
            runnerPose.bearing,
            alpha
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

  // Follow range highlight is painted inside the track apply() pass above
  // (draft endpoints or selected voice). Keep a style.reload hook only.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;
    const sync = () => {
      paintTrackRangeHighlight(map);
      ensureLayerOrder(map);
    };
    sync();
    map.on("style.load", sync);
    return () => {
      map.off("style.load", sync);
    };
  }, [mapInstance, followDraftRange, followRangeStartMs, expandedCommentIds]);

  // Follow range uses two track taps + draggable endpoint markers (no drag-select).
  // Endpoint markers live in CommentMarkers / FollowEndpointMarkers.

  // Profile chart sync: hover near track in view mode scrubs playback time.
  // Touch is omitted so one-finger pan doesn't fight scrubbing (use profile chart).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const onProfileMove = (e: { lngLat: { lng: number; lat: number } }) => {
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
      // Clicks on comment popups must not start a new follow range on the track.
      const oe = e.originalEvent?.target;
      if (
        oe instanceof Element &&
        oe.closest(".maplibregl-popup, .comment-icon")
      ) {
        return;
      }

      const lngLat = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      const ui = useUiStore.getState();
      const currentMode = ui.mode;
      const currentEditTool = ui.editTool;

      if (currentMode === "georef") {
        const currentPose = useProjectStore.getState().project.georef.pose;
        if (!currentPose) {
          setStatusMessage(t("status.loadMapFirst"));
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
            lngLat
          );
          if (next) {
            setPose(next);
            clearAlignMarkers();
            setGeorefPendingFrom(null);
            setGeorefPin(null);
            setGeorefStep(0);
            setStatusMessage(t("status.aligned", { verb: pointerVerb() }));
          } else {
            clearAlignMarkers();
            resetGeorefAlign();
            setStatusMessage(t("status.pointsTooClose"));
          }
        }
        return;
      }

      if (currentMode === "edit" && currentEditTool === "plan") {
        const planId =
          useUiStore.getState().activeRoutePlanId ??
          useProjectStore.getState().project.routePlans[0]?.id;
        if (!planId) {
          // EditPlanBar already shows plan.hintNoPlan inline.
          return;
        }
        appendPlanCoordinate(planId, [lngLat.lng, lngLat.lat]);
        return;
      }

      if (currentMode === "edit" && currentEditTool === "comment") {
        const tool = useUiStore.getState().commentTool;
        const pts = useProjectStore.getState().project.track.points;

        // Drop empty-text comments when the user clicks elsewhere on the map.
        for (const c of useProjectStore.getState().project.comments) {
          if (!(c.text ?? "").trim()) {
            removeComment(c.id);
          }
        }
        const still = new Set(
          useProjectStore.getState().project.comments.map((c) => c.id)
        );
        const expanded = useUiStore.getState().expandedCommentIds;
        if (expanded.some((id) => !still.has(id))) {
          useUiStore.setState({
            expandedCommentIds: expanded.filter((id) => still.has(id)),
          });
        }

        if (tool === "danmaku") {
          if (pts.length === 0) {
            setStatusMessage(t("status.loadTrackDanmaku"));
            return;
          }
          const hit = isNearTrack(map, pts, lngLat.lng, lngLat.lat);
          if (!hit || hit.timeOffsetMs == null) {
            setStatusMessage(t("status.placeDanmaku", { verb: pointerVerb() }));
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
          // EditCommentBar shows danmakuEditHint; skip toast over the sheet.
          setStatusMessage("");
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
          useUiStore.getState().setFollowTextEditId(id);
          // Keep the popup on-screen: pad the top so the bubble above the pin fits.
          const padTop = Math.min(
            180,
            Math.round(map.getContainer().clientHeight * 0.38)
          );
          map.easeTo({
            center: [lngLat.lng, lngLat.lat],
            duration: 280,
            padding: { top: padTop, bottom: 24, left: 24, right: 24 },
          });
          return;
        }

        // follow: two track taps → endpoints; then drag markers to adjust
        if (pts.length === 0) {
          setStatusMessage(t("status.loadTrackFollow"));
          return;
        }
        const draft = useUiStore.getState().followDraftRange;
        if (draft) {
          // EditCommentBar already shows drag/confirm guidance.
          return;
        }
        const hit = isNearTrack(
          map,
          pts,
          lngLat.lng,
          lngLat.lat,
          trackDragHitPx()
        );
        if (!hit || hit.timeOffsetMs == null) {
          const pending = useUiStore.getState().followRangeStartMs;
          if (pending != null) {
            setFollowRangeStartMs(null);
            // EditCommentBar inline hint covers follow placement.
            return;
          }
          setStatusMessage(t("status.nearTrackRange", { verb: pointerVerb() }));
          return;
        }

        const pendingStart = useUiStore.getState().followRangeStartMs;
        if (pendingStart == null) {
          setFollowRangeStartMs(hit.timeOffsetMs);
          setStatusMessage("");
          return;
        }

        if (Math.abs(hit.timeOffsetMs - pendingStart) < 300) {
          setStatusMessage(t("status.endTooClose"));
          return;
        }
        const mid = interpolateTrackPose(
          pts,
          (pendingStart + hit.timeOffsetMs) / 2
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
          aMs: pendingStart,
          bMs: hit.timeOffsetMs,
          lng: mid?.lng ?? hit.lng,
          lat: mid?.lat ?? hit.lat,
          targetId,
        });
        setFollowRangeStartMs(null);
        // Paint immediately — isStyleLoaded() may be false while tiles load,
        // which would otherwise skip the store-driven track apply.
        paintTrackRangeHighlight(map);
        ensureLayerOrder(map);
        bringRangeAboveTrack(map);
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
    removeComment,
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
    if (!map || !mapInstance) return;
    const canvas = map.getCanvas();
    const ui = useUiStore.getState();
    const hasDrawablePlan =
      editTool === "plan" &&
      routePlans.some((p) => p.id === ui.activeRoutePlanId);

    /** Always crosshair: georef, notes (place anywhere), plan drawing. */
    const staticCrosshair =
      mode === "georef" ||
      (mode === "edit" && editTool === "comment" && commentTool === "map") ||
      (mode === "edit" && hasDrawablePlan);

    /** Voices / captions: crosshair only while hovering the GPS track. */
    const trackHoverCrosshair =
      mode === "edit" &&
      editTool === "comment" &&
      (commentTool === "follow" || commentTool === "danmaku");

    if (staticCrosshair) {
      canvas.style.cursor = "crosshair";
      return () => {
        canvas.style.cursor = "";
      };
    }

    if (!trackHoverCrosshair) {
      canvas.style.cursor = "";
      return;
    }

    // queryRenderedFeatures is cheap (GPU index); rAF coalesces move events.
    let raf = 0;
    let pending: { x: number; y: number } | null = null;
    const flush = () => {
      raf = 0;
      const point = pending;
      pending = null;
      if (!point) return;
      const layers = [TRACK_HALO_LAYER, TRACK_LAYER].filter((id) =>
        map.getLayer(id)
      );
      if (layers.length === 0) {
        canvas.style.cursor = "";
        return;
      }
      const pad = Math.max(6, Math.round(trackHitPx() * 0.35));
      const hits = map.queryRenderedFeatures(
        [
          [point.x - pad, point.y - pad],
          [point.x + pad, point.y + pad],
        ],
        { layers }
      );
      canvas.style.cursor = hits.length > 0 ? "crosshair" : "";
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      pending = { x: e.point.x, y: e.point.y };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onLeave = () => {
      pending = null;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      canvas.style.cursor = "";
    };
    map.on("mousemove", onMove);
    map.getContainer().addEventListener("mouseleave", onLeave);
    return () => {
      map.off("mousemove", onMove);
      map.getContainer().removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      canvas.style.cursor = "";
    };
  }, [mode, editTool, commentTool, activeRoutePlanId, routePlans, mapInstance]);

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
          aria-label={t("map.legendAria")}
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
              <span className="map-legend-label">{t("map.gpsTrack")}</span>
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
          className="maplibregl-ctrl-bottom-left map-legend-speed-anchor"
          aria-hidden={false}
        >
          <div
            className="maplibregl-ctrl map-legend map-legend--speed"
            aria-label={t("map.paceScaleAria")}
          >
            <span className="map-legend-speed-label">
              {t("map.slow")}
              <br />
              {formatPaceValue(
                mpsToPaceMinPerKm(speedColoredTrack.minSpeedMps) ?? 0
              )}
            </span>
            <div className="map-legend-speed-mid">
              <div className="map-legend-speed-bar" />
              <span className="map-legend-speed-unit">{t("map.paceUnit")}</span>
            </div>
            <span className="map-legend-speed-label">
              {t("map.fast")}
              <br />
              {formatPaceValue(
                mpsToPaceMinPerKm(speedColoredTrack.maxSpeedMps) ?? 0
              )}
            </span>
          </div>
        </div>
      )}
      <CommentMarkers map={mapInstance} />
      <PlanVertexEditor map={mapInstance} />
    </>
  );
}
