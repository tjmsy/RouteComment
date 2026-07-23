import { useEffect, useRef, type MutableRefObject } from "react";
import maplibregl from "maplibre-gl";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";

type Props = {
  map: maplibregl.Map | null;
};

type MarkerKind = "vertex" | "mid";

type TrackedMarker = {
  marker: maplibregl.Marker;
  el: HTMLButtonElement;
  kind: MarkerKind;
  /** Vertex index, or segment start index for midpoints. */
  index: number;
};

type CoordUpdater = (
  planId: string,
  index: number,
  coord: [number, number],
) => void;

const EMPTY_COORDS: [number, number][] = [];

/**
 * Vertex / midpoint handles for the active route plan in Plan mode.
 * Markers are managed imperatively so a midpoint can promote to a vertex
 * mid-drag without losing the gesture.
 */
export function PlanVertexEditor({ map }: Props) {
  const mode = useUiStore((s) => s.mode);
  const editTool = useUiStore((s) => s.editTool);
  const activeRoutePlanId = useUiStore((s) => s.activeRoutePlanId);
  const routePlans = useProjectStore((s) => s.project.routePlans);
  const updatePlanCoordinate = useProjectStore((s) => s.updatePlanCoordinate);
  const insertPlanCoordinate = useProjectStore((s) => s.insertPlanCoordinate);
  const removePlanCoordinate = useProjectStore((s) => s.removePlanCoordinate);

  const markersRef = useRef<TrackedMarker[]>([]);
  const draggingRef = useRef(false);
  const planIdRef = useRef<string | null>(null);
  const updateRef = useRef(updatePlanCoordinate);
  const insertRef = useRef(insertPlanCoordinate);
  const removeRef = useRef(removePlanCoordinate);

  updateRef.current = updatePlanCoordinate;
  insertRef.current = insertPlanCoordinate;
  removeRef.current = removePlanCoordinate;

  const activePlan =
    mode === "edit" && editTool === "plan" && activeRoutePlanId
      ? routePlans.find((p) => p.id === activeRoutePlanId)
      : undefined;
  const editable = !!map && !!activePlan && activePlan.visible;
  const coordinates = editable ? activePlan.coordinates : EMPTY_COORDS;
  const color = activePlan?.color || "#2563eb";
  const planId = editable ? activePlan.id : null;
  planIdRef.current = planId;

  useEffect(() => {
    if (!map || !planId || draggingRef.current) return;

    clearMarkers(markersRef.current);
    markersRef.current = buildMarkers({
      map,
      coordinates,
      color,
      markersRef,
      draggingRef,
      planIdRef,
      updateRef,
      insertRef,
      removeRef,
    });

    return () => {
      if (draggingRef.current) return;
      clearMarkers(markersRef.current);
      markersRef.current = [];
    };
  }, [map, planId, coordinates, color]);

  useEffect(() => {
    return () => {
      clearMarkers(markersRef.current);
      markersRef.current = [];
      draggingRef.current = false;
      map?.dragPan.enable();
    };
  }, [map]);

  return null;
}

function clearMarkers(markers: TrackedMarker[]) {
  for (const m of markers) m.marker.remove();
}

function buildMarkers(opts: {
  map: maplibregl.Map;
  coordinates: [number, number][];
  color: string;
  markersRef: MutableRefObject<TrackedMarker[]>;
  draggingRef: MutableRefObject<boolean>;
  planIdRef: MutableRefObject<string | null>;
  updateRef: MutableRefObject<CoordUpdater>;
  insertRef: MutableRefObject<CoordUpdater>;
  removeRef: MutableRefObject<(planId: string, index: number) => void>;
}): TrackedMarker[] {
  const {
    map,
    coordinates,
    color,
    markersRef,
    draggingRef,
    planIdRef,
    updateRef,
    insertRef,
    removeRef,
  } = opts;
  const out: TrackedMarker[] = [];

  coordinates.forEach((coord, index) => {
    out.push(
      createHandle({
        map,
        kind: "vertex",
        index,
        lngLat: coord,
        color,
        title: "Drag to move · double-click or long-press to delete",
        markersRef,
        draggingRef,
        planIdRef,
        updateRef,
        insertRef,
        removeRef,
      }),
    );
  });

  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    out.push(
      createHandle({
        map,
        kind: "mid",
        index: i,
        lngLat: mid,
        color,
        title: "Drag to add a vertex",
        markersRef,
        draggingRef,
        planIdRef,
        updateRef,
        insertRef,
        removeRef,
      }),
    );
  }

  return out;
}

function createHandle(opts: {
  map: maplibregl.Map;
  kind: MarkerKind;
  index: number;
  lngLat: [number, number];
  color: string;
  title: string;
  markersRef: MutableRefObject<TrackedMarker[]>;
  draggingRef: MutableRefObject<boolean>;
  planIdRef: MutableRefObject<string | null>;
  updateRef: MutableRefObject<CoordUpdater>;
  insertRef: MutableRefObject<CoordUpdater>;
  removeRef: MutableRefObject<(planId: string, index: number) => void>;
}): TrackedMarker {
  const {
    map,
    kind,
    index,
    lngLat,
    color,
    title,
    markersRef,
    draggingRef,
    planIdRef,
    updateRef,
    insertRef,
    removeRef,
  } = opts;

  const el = document.createElement("button");
  el.type = "button";
  el.className =
    kind === "vertex" ? "plan-vertex-handle" : "plan-midpoint-handle";
  el.title = title;
  el.setAttribute(
    "aria-label",
    kind === "vertex" ? `Plan vertex ${index + 1}` : "Add plan vertex",
  );
  el.style.setProperty("--plan-handle-color", color);

  const tracked: TrackedMarker = {
    marker: null as unknown as maplibregl.Marker,
    el,
    kind,
    index,
  };

  const marker = new maplibregl.Marker({
    element: el,
    draggable: true,
    anchor: "center",
  })
    .setLngLat(lngLat)
    .addTo(map);

  tracked.marker = marker;

  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  const LONG_PRESS_MS = 550;
  const MOVE_CANCEL_PX = 10;
  let longPressTimer: number | null = null;
  let pressX = 0;
  let pressY = 0;
  let longPressFired = false;

  const clearLongPress = () => {
    if (longPressTimer != null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const deleteVertex = () => {
    if (tracked.kind !== "vertex") return;
    const id = planIdRef.current;
    if (!id) return;
    removeRef.current(id, tracked.index);
  };

  el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    if (tracked.kind !== "vertex") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longPressFired = false;
    pressX = e.clientX;
    pressY = e.clientY;
    clearLongPress();
    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      longPressFired = true;
      deleteVertex();
    }, LONG_PRESS_MS);
  });

  el.addEventListener("pointermove", (e) => {
    if (longPressTimer == null) return;
    if (
      Math.hypot(e.clientX - pressX, e.clientY - pressY) > MOVE_CANCEL_PX
    ) {
      clearLongPress();
    }
  });

  el.addEventListener("pointerup", clearLongPress);
  el.addEventListener("pointercancel", clearLongPress);

  el.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (longPressFired) return;
    deleteVertex();
  });

  marker.on("dragstart", () => {
    clearLongPress();
    draggingRef.current = true;
    map.dragPan.disable();

    if (tracked.kind === "mid") {
      const id = planIdRef.current;
      if (!id) return;
      const ll = marker.getLngLat();
      const insertAt = tracked.index + 1;
      insertRef.current(id, insertAt, [ll.lng, ll.lat]);
      tracked.kind = "vertex";
      tracked.index = insertAt;
      el.className = "plan-vertex-handle";
      el.title = "Drag to move · double-click or long-press to delete";
      el.setAttribute("aria-label", `Plan vertex ${insertAt + 1}`);

      for (const m of markersRef.current) {
        if (m !== tracked && m.kind === "mid") {
          m.el.style.visibility = "hidden";
        } else if (m !== tracked && m.kind === "vertex" && m.index >= insertAt) {
          m.index += 1;
        }
      }
    }
  });

  marker.on("drag", () => {
    const id = planIdRef.current;
    if (!id || tracked.kind !== "vertex") return;
    const ll = marker.getLngLat();
    updateRef.current(id, tracked.index, [ll.lng, ll.lat]);
  });

  marker.on("dragend", () => {
    map.dragPan.enable();
    draggingRef.current = false;
    const id = planIdRef.current;
    if (id && tracked.kind === "vertex") {
      const ll = marker.getLngLat();
      updateRef.current(id, tracked.index, [ll.lng, ll.lat]);
    }
    clearMarkers(markersRef.current);
    markersRef.current = buildMarkers({
      map,
      coordinates:
        useProjectStore
          .getState()
          .project.routePlans.find((p) => p.id === id)?.coordinates ??
        EMPTY_COORDS,
      color:
        useProjectStore
          .getState()
          .project.routePlans.find((p) => p.id === id)?.color || "#2563eb",
      markersRef,
      draggingRef,
      planIdRef,
      updateRef,
      insertRef,
      removeRef,
    });
  });

  return tracked;
}
