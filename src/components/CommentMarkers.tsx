import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Comment } from "../lib/types";
import {
  commentActiveAt,
  DEFAULT_POPUP_HEIGHT,
  DEFAULT_POPUP_WIDTH,
} from "../lib/types";
import { interpolateTrackPosition } from "../lib/gpx";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";

type Props = {
  map: maplibregl.Map | null;
};

export function CommentMarkers({ map }: Props) {
  const comments = useProjectStore((s) => s.project.comments);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const toggleCommentExpanded = useUiStore((s) => s.toggleCommentExpanded);
  const mode = useUiStore((s) => s.mode);
  const editTool = useUiStore((s) => s.editTool);
  const commentEditing = mode === "edit" && editTool === "comment";

  if (!map) return null;

  return (
    <>
      {comments.map((comment) =>
        comment.kind === "map" ? (
          <MapPinMarker
            key={comment.id}
            map={map}
            comment={comment}
            expanded={expandedCommentIds.includes(comment.id)}
            draggable={commentEditing}
            editable={commentEditing}
            onToggle={() => toggleCommentExpanded(comment.id)}
          />
        ) : comment.kind === "follow" && commentEditing ? (
          <FollowRangeMarker
            key={comment.id}
            map={map}
            comment={comment}
            expanded={expandedCommentIds.includes(comment.id)}
            onToggle={() => toggleCommentExpanded(comment.id)}
          />
        ) : null,
      )}
      <FollowBubbles map={map} />
    </>
  );
}

const BUBBLE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6.2L8 21.5V17H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4v2h8V8H6zm0 4v2h5v-2H6z"/></svg>`;

function MapPinMarker({
  map,
  comment,
  expanded,
  draggable,
  editable,
  onToggle,
}: {
  map: maplibregl.Map;
  comment: Comment;
  expanded: boolean;
  draggable: boolean;
  editable: boolean;
  onToggle: () => void;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const iconRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const updateComment = useProjectStore((s) => s.updateComment);

  useEffect(() => {
    const host = document.createElement("div");
    host.className = "comment-marker-host";

    const icon = document.createElement("button");
    icon.type = "button";
    icon.className = "comment-icon comment-icon-map";
    icon.title = "Map comment";
    icon.innerHTML = BUBBLE_ICON_SVG;
    icon.setAttribute("aria-label", "Map comment");

    const popup = document.createElement("div");
    popup.className = "comment-map-popup";
    popup.style.width = `${comment.popupWidth ?? DEFAULT_POPUP_WIDTH}px`;
    popup.style.height = `${comment.popupHeight ?? DEFAULT_POPUP_HEIGHT}px`;

    const body = document.createElement(editable ? "textarea" : "div");
    body.className = editable
      ? "comment-map-popup-body comment-map-popup-edit"
      : "comment-map-popup-body comment-map-popup-readonly";
    if (editable) {
      const ta = body as HTMLTextAreaElement;
      ta.value = comment.text;
      ta.placeholder = "Write a comment…";
      ta.addEventListener("input", () => {
        updateComment(comment.id, { text: ta.value });
      });
      ta.addEventListener("click", (e) => e.stopPropagation());
      ta.addEventListener("mousedown", (e) => e.stopPropagation());
    } else {
      body.textContent = comment.text.trim() ? comment.text : "(No text)";
    }

    const handle = document.createElement("div");
    handle.className = "comment-map-popup-resize";
    handle.title = "Drag to resize";

    popup.appendChild(body);
    popup.appendChild(handle);
    host.appendChild(icon);
    host.appendChild(popup);

    popup.addEventListener("mousedown", (e) => e.stopPropagation());
    popup.addEventListener("pointerdown", (e) => {
      if (e.target !== handle) e.stopPropagation();
    });
    popup.addEventListener("click", (e) => e.stopPropagation());

    hostRef.current = host;
    iconRef.current = icon;
    popupRef.current = popup;
    bodyRef.current = body;

    const marker = new maplibregl.Marker({
      element: host,
      anchor: "bottom",
      draggable,
    })
      .setLngLat([comment.lng, comment.lat])
      .addTo(map);

    marker.on("dragstart", () => {
      draggingRef.current = true;
      suppressClickRef.current = false;
      map.dragPan.disable();
    });
    marker.on("drag", () => {
      suppressClickRef.current = true;
    });
    marker.on("dragend", () => {
      map.dragPan.enable();
      draggingRef.current = false;
      const ll = marker.getLngLat();
      updateComment(comment.id, { lng: ll.lng, lat: ll.lat });
    });

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onToggle();
    };
    icon.addEventListener("click", onClick);

    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startW = DEFAULT_POPUP_WIDTH;
    let startH = DEFAULT_POPUP_HEIGHT;

    const onResizeMove = (e: PointerEvent) => {
      if (!resizing || !popupRef.current) return;
      const nextW = Math.min(
        480,
        Math.max(120, startW + (e.clientX - startX)),
      );
      const nextH = Math.min(
        480,
        Math.max(120, startH + (e.clientY - startY)),
      );
      popupRef.current.style.width = `${nextW}px`;
      popupRef.current.style.height = `${nextH}px`;
    };

    const onResizeUp = (e: PointerEvent) => {
      if (!resizing || !popupRef.current) return;
      resizing = false;
      handle.releasePointerCapture(e.pointerId);
      const nextW = Math.round(popupRef.current.offsetWidth);
      const nextH = Math.round(popupRef.current.offsetHeight);
      updateComment(comment.id, {
        popupWidth: nextW,
        popupHeight: nextH,
      });
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeUp);
    };

    const onResizeDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!popupRef.current) return;
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = popupRef.current.offsetWidth;
      startH = popupRef.current.offsetHeight;
      handle.setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", onResizeMove);
      window.addEventListener("pointerup", onResizeUp);
    };
    handle.addEventListener("pointerdown", onResizeDown);

    markerRef.current = marker;
    return () => {
      icon.removeEventListener("click", onClick);
      handle.removeEventListener("pointerdown", onResizeDown);
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeUp);
      map.dragPan.enable();
      marker.remove();
      markerRef.current = null;
      hostRef.current = null;
      iconRef.current = null;
      popupRef.current = null;
      bodyRef.current = null;
    };
    // Recreate when id or editability changes; text/size synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, comment.id, editable]);

  useEffect(() => {
    markerRef.current?.setDraggable(draggable);
    if (iconRef.current) {
      iconRef.current.title = draggable
        ? "Map comment (drag to move)"
        : "Map comment";
      iconRef.current.classList.toggle("comment-icon-nodrag", !draggable);
    }
  }, [draggable]);

  useEffect(() => {
    if (draggingRef.current) return;
    markerRef.current?.setLngLat([comment.lng, comment.lat]);
  }, [comment.lng, comment.lat]);

  useEffect(() => {
    iconRef.current?.classList.toggle("expanded", expanded);
    popupRef.current?.classList.toggle("open", expanded);
  }, [expanded]);

  useEffect(() => {
    if (!popupRef.current) return;
    popupRef.current.style.width = `${comment.popupWidth ?? DEFAULT_POPUP_WIDTH}px`;
    popupRef.current.style.height = `${comment.popupHeight ?? DEFAULT_POPUP_HEIGHT}px`;
  }, [comment.popupWidth, comment.popupHeight]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (body instanceof HTMLTextAreaElement) {
      if (document.activeElement !== body) body.value = comment.text;
    } else {
      body.textContent = comment.text.trim() ? comment.text : "(No text)";
    }
  }, [comment.text]);

  return null;
}

function FollowRangeMarker({
  map,
  comment,
  expanded,
  onToggle,
}: {
  map: maplibregl.Map;
  comment: Comment;
  expanded: boolean;
  onToggle: () => void;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.className = "comment-icon comment-icon-follow";
    el.title = "Follow comment — click to show range";
    el.textContent = "⏱";
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    elRef.current = el;

    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([comment.lng, comment.lat])
      .addTo(map);
    markerRef.current = marker;

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    };
    el.addEventListener("click", onClick);

    return () => {
      el.removeEventListener("click", onClick);
      marker.remove();
      markerRef.current = null;
      elRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, comment.id]);

  useEffect(() => {
    markerRef.current?.setLngLat([comment.lng, comment.lat]);
  }, [comment.lng, comment.lat]);

  useEffect(() => {
    elRef.current?.classList.toggle("expanded", expanded);
  }, [expanded]);

  return null;
}

function FollowBubbles({ map }: { map: maplibregl.Map }) {
  const comments = useProjectStore((s) => s.project.comments);
  const trackPoints = useProjectStore((s) => s.project.track.points);
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const mode = useUiStore((s) => s.mode);

  const active = comments.filter(
    (c) =>
      mode === "view" &&
      c.kind === "follow" &&
      c.text.trim().length > 0 &&
      commentActiveAt(c, animationTimeMs),
  );

  const pos = interpolateTrackPosition(trackPoints, animationTimeMs);

  return (
    <>
      {active.map((comment) => (
        <FollowBubble
          key={`follow-${comment.id}`}
          map={map}
          text={comment.text}
          lng={pos?.lng ?? comment.lng}
          lat={pos?.lat ?? comment.lat}
        />
      ))}
    </>
  );
}

function FollowBubble({
  map,
  text,
  lng,
  lat,
}: {
  map: maplibregl.Map;
  text: string;
  lng: number;
  lat: number;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.className = "follow-bubble";
    elRef.current = el;
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat])
      .addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
      elRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat]);
  }, [lng, lat]);

  useEffect(() => {
    if (elRef.current) elRef.current.textContent = text;
  }, [text]);

  return null;
}
