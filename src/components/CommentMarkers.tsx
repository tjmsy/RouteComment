import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Comment } from "../lib/types";
import {
  commentActiveAt,
  DEFAULT_POPUP_HEIGHT,
  DEFAULT_POPUP_WIDTH,
  MAX_POPUP_SIZE,
  MIN_POPUP_HEIGHT,
  MIN_POPUP_WIDTH,
} from "../lib/types";
import { interpolateTrackPosition, nearestTrackPoint } from "../lib/gpx";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { isMobileViewport } from "../lib/mobile";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";

type Props = {
  map: maplibregl.Map | null;
};

export function CommentMarkers({ map }: Props) {
  const comments = useProjectStore((s) => s.project.comments);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const toggleCommentExpanded = useUiStore((s) => s.toggleCommentExpanded);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const mode = useUiStore((s) => s.mode);
  const editTool = useUiStore((s) => s.editTool);
  const mobile = useMobileLayout();
  const commentEditing = mode === "edit" && editTool === "comment";
  const showTrackComments = commentEditing || mode === "view";
  /** Desktop edit: inline map popup. Mobile / view: sheet or side panel. */
  const mapPopupEditable = commentEditing && !mobile;

  if (!map) return null;

  return (
    <>
      {comments.map((comment) =>
        comment.kind === "map" ? (
          <MapPinMarker
            key={comment.id}
            map={map}
            comment={comment}
            popupOpen={comment.popupOpen !== false}
            draggable={commentEditing}
            editable={mapPopupEditable}
          />
        ) : comment.kind === "follow" && showTrackComments ? (
          <FollowRangeMarker
            key={comment.id}
            map={map}
            comment={comment}
            expanded={expandedCommentIds.includes(comment.id)}
            useMapPopup={mapPopupEditable}
            onToggle={() => toggleCommentExpanded(comment.id)}
            onClose={() => setCommentExpanded(comment.id, false)}
          />
        ) : comment.kind === "danmaku" && showTrackComments ? (
          <DanmakuMarker
            key={comment.id}
            map={map}
            comment={comment}
            selected={expandedCommentIds.includes(comment.id)}
            draggable={commentEditing}
            onSelect={() => setCommentExpanded(comment.id, true)}
          />
        ) : null,
      )}
      <FollowBubbles map={map} />
    </>
  );
}

/** Simple map pin (neutral slate, no open/closed color flip). */
const PIN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`;

/** Running person for follow comments. */
const RUNNER_ICON = "🏃";

/** Compact mark for danmaku timing on the track. */
const DANMAKU_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M4 6h16v3H4V6zm0 5h12v3H4v-3zm0 5h14v3H4v-3z"/></svg>`;

function createCommentPopup(className: string): maplibregl.Popup {
  return new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    closeOnMove: false,
    focusAfterOpen: false,
    anchor: "bottom",
    offset: 12,
    maxWidth: "none",
    className,
  });
}

function MapPinMarker({
  map,
  comment,
  popupOpen,
  draggable,
  editable,
}: {
  map: maplibregl.Map;
  comment: Comment;
  popupOpen: boolean;
  draggable: boolean;
  editable: boolean;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const iconRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const popupOpenRef = useRef(popupOpen);
  const suppressCloseRef = useRef(false);
  const updateComment = useProjectStore((s) => s.updateComment);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  popupOpenRef.current = popupOpen;

  useEffect(() => {
    suppressCloseRef.current = false;

    const icon = document.createElement("button");
    icon.type = "button";
    icon.className = "comment-icon comment-icon-map";
    icon.title = "Map comment";
    icon.innerHTML = PIN_ICON_SVG;
    icon.setAttribute("aria-label", "Map comment");
    iconRef.current = icon;

    const content = document.createElement("div");
    content.className = "comment-popup-content";
    content.style.width = `${comment.popupWidth ?? DEFAULT_POPUP_WIDTH}px`;
    content.style.height = `${comment.popupHeight ?? DEFAULT_POPUP_HEIGHT}px`;

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
    } else {
      body.textContent = comment.text.trim() ? comment.text : "(No text)";
    }
    content.appendChild(body);

    let handle: HTMLDivElement | null = null;
    if (editable) {
      handle = document.createElement("div");
      handle.className = "comment-map-popup-resize";
      handle.title = "Drag to resize";
      content.appendChild(handle);
    }

    contentRef.current = content;
    bodyRef.current = body;

    const popup = createCommentPopup("comment-maplibre-popup");
    popup.setDOMContent(content).setLngLat([comment.lng, comment.lat]);

    const marker = new maplibregl.Marker({
      element: icon,
      anchor: "bottom",
      draggable,
    }).setLngLat([comment.lng, comment.lat]);

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

    const onIconClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      // Mobile: sheet only. Desktop: open map popup (+ side panel).
      if (isMobileViewport()) {
        setCommentExpanded(comment.id, true);
      } else {
        updateComment(comment.id, { popupOpen: true });
        setCommentExpanded(comment.id, true);
      }
    };
    icon.addEventListener("click", onIconClick);

    const onPopupClose = () => {
      // Ignore teardown (mode / editable rebuild) so popupOpen is not cleared.
      if (suppressCloseRef.current) return;
      updateComment(comment.id, { popupOpen: false });
    };
    popup.on("close", onPopupClose);

    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startW = DEFAULT_POPUP_WIDTH;
    let startH = DEFAULT_POPUP_HEIGHT;

    const onResizeMove = (e: PointerEvent) => {
      if (!resizing || !contentRef.current) return;
      const nextW = Math.min(
        MAX_POPUP_SIZE,
        Math.max(MIN_POPUP_WIDTH, startW + (e.clientX - startX)),
      );
      const nextH = Math.min(
        MAX_POPUP_SIZE,
        Math.max(MIN_POPUP_HEIGHT, startH + (e.clientY - startY)),
      );
      contentRef.current.style.width = `${nextW}px`;
      contentRef.current.style.height = `${nextH}px`;
    };

    const onResizeUp = (e: PointerEvent) => {
      if (!resizing || !contentRef.current || !handle) return;
      resizing = false;
      handle.releasePointerCapture(e.pointerId);
      updateComment(comment.id, {
        popupWidth: Math.round(contentRef.current.offsetWidth),
        popupHeight: Math.round(contentRef.current.offsetHeight),
      });
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeUp);
    };

    const onResizeDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!contentRef.current || !handle) return;
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = contentRef.current.offsetWidth;
      startH = contentRef.current.offsetHeight;
      handle.setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", onResizeMove);
      window.addEventListener("pointerup", onResizeUp);
    };
    handle?.addEventListener("pointerdown", onResizeDown);

    markerRef.current = marker;
    popupRef.current = popup;

    // Visibility effect may not re-run when only `editable` rebuilds us.
    if (popupOpenRef.current) {
      popup.addTo(map);
    } else {
      marker.addTo(map);
    }

    return () => {
      suppressCloseRef.current = true;
      icon.removeEventListener("click", onIconClick);
      popup.off("close", onPopupClose);
      handle?.removeEventListener("pointerdown", onResizeDown);
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeUp);
      map.dragPan.enable();
      popup.remove();
      marker.remove();
      markerRef.current = null;
      popupRef.current = null;
      iconRef.current = null;
      contentRef.current = null;
      bodyRef.current = null;
    };
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
    popupRef.current?.setLngLat([comment.lng, comment.lat]);
  }, [comment.lng, comment.lat]);

  useEffect(() => {
    const marker = markerRef.current;
    const popup = popupRef.current;
    if (!marker || !popup) return;

    if (popupOpen) {
      marker.remove();
      if (!popup.isOpen()) {
        popup.addTo(map);
      }
    } else {
      // Programmatic collapse must not clear popupOpen via the close handler.
      suppressCloseRef.current = true;
      popup.remove();
      suppressCloseRef.current = false;
      marker.addTo(map);
    }
  }, [popupOpen, map, editable]);

  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.style.width = `${comment.popupWidth ?? DEFAULT_POPUP_WIDTH}px`;
    contentRef.current.style.height = `${comment.popupHeight ?? DEFAULT_POPUP_HEIGHT}px`;
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
  useMapPopup,
  onToggle,
  onClose,
}: {
  map: maplibregl.Map;
  comment: Comment;
  expanded: boolean;
  /** When false, selection is shown via icon + side panel / sheet only. */
  useMapPopup: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const iconRef = useRef<HTMLButtonElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const expandedRef = useRef(expanded);
  const suppressCloseRef = useRef(false);
  const updateComment = useProjectStore((s) => s.updateComment);
  expandedRef.current = expanded;

  useEffect(() => {
    suppressCloseRef.current = false;

    const icon = document.createElement("button");
    icon.type = "button";
    icon.className = "comment-icon comment-icon-follow";
    icon.title = useMapPopup
      ? "Follow comment — click to edit text / show range"
      : "Follow comment — tap to open";
    icon.textContent = RUNNER_ICON;
    icon.setAttribute("aria-label", "Follow comment");
    iconRef.current = icon;

    const marker = new maplibregl.Marker({
      element: icon,
      anchor: "bottom",
    }).setLngLat([comment.lng, comment.lat]);

    const onIconClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    };
    icon.addEventListener("click", onIconClick);

    markerRef.current = marker;

    if (useMapPopup) {
      const content = document.createElement("div");
      content.className = "comment-popup-content comment-follow-popup-content";
      content.style.width = "160px";
      content.style.height = "72px";

      const body = document.createElement("textarea");
      body.className = "comment-map-popup-body comment-map-popup-edit";
      body.value = comment.text;
      body.placeholder = "Write a follow comment…";
      body.addEventListener("input", () => {
        updateComment(comment.id, { text: body.value });
      });
      content.appendChild(body);
      bodyRef.current = body;

      const popup = createCommentPopup(
        "comment-maplibre-popup comment-maplibre-popup-follow",
      );
      popup.setDOMContent(content).setLngLat([comment.lng, comment.lat]);

      const onPopupClose = () => {
        if (suppressCloseRef.current) return;
        onClose();
      };
      popup.on("close", onPopupClose);
      popupRef.current = popup;

      if (expandedRef.current) {
        popup.addTo(map);
      } else {
        marker.addTo(map);
      }

      return () => {
        suppressCloseRef.current = true;
        icon.removeEventListener("click", onIconClick);
        popup.off("close", onPopupClose);
        popup.remove();
        marker.remove();
        markerRef.current = null;
        popupRef.current = null;
        iconRef.current = null;
        bodyRef.current = null;
      };
    }

    marker.addTo(map);
    icon.classList.toggle("comment-icon-selected", expandedRef.current);

    return () => {
      icon.removeEventListener("click", onIconClick);
      marker.remove();
      markerRef.current = null;
      popupRef.current = null;
      iconRef.current = null;
      bodyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, comment.id, useMapPopup]);

  useEffect(() => {
    markerRef.current?.setLngLat([comment.lng, comment.lat]);
    popupRef.current?.setLngLat([comment.lng, comment.lat]);
  }, [comment.lng, comment.lat]);

  useEffect(() => {
    if (!useMapPopup) {
      if (!markerRef.current?.getElement().isConnected) {
        markerRef.current?.addTo(map);
      }
      iconRef.current?.classList.toggle("comment-icon-selected", expanded);
      return;
    }

    const marker = markerRef.current;
    const popup = popupRef.current;
    if (!marker || !popup) return;

    if (expanded) {
      marker.remove();
      if (!popup.isOpen()) {
        popup.addTo(map);
      }
    } else {
      suppressCloseRef.current = true;
      popup.remove();
      suppressCloseRef.current = false;
      marker.addTo(map);
    }
  }, [expanded, map, useMapPopup]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (document.activeElement !== body) body.value = comment.text;
  }, [comment.text]);

  return null;
}

function DanmakuMarker({
  map,
  comment,
  selected,
  draggable,
  onSelect,
}: {
  map: maplibregl.Map;
  comment: Comment;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const elRef = useRef<HTMLButtonElement | null>(null);
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const updateComment = useProjectStore((s) => s.updateComment);
  const trackPoints = useProjectStore((s) => s.project.track.points);

  useEffect(() => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "comment-icon comment-icon-danmaku";
    el.title = draggable
      ? "Danmaku — drag along track to set time"
      : "Danmaku — tap to open";
    el.innerHTML = DANMAKU_ICON_SVG;
    el.setAttribute("aria-label", "Danmaku comment");
    elRef.current = el;

    const marker = new maplibregl.Marker({
      element: el,
      anchor: "bottom",
      draggable,
    })
      .setLngLat([comment.lng, comment.lat])
      .addTo(map);
    markerRef.current = marker;

    const snapToTrack = () => {
      const ll = marker.getLngLat();
      const pts = useProjectStore.getState().project.track.points;
      const hit = nearestTrackPoint(pts, ll.lng, ll.lat);
      if (!hit || hit.timeOffsetMs == null) return;
      marker.setLngLat([hit.lng, hit.lat]);
      updateComment(comment.id, {
        lng: hit.lng,
        lat: hit.lat,
        timeStartMs: hit.timeOffsetMs,
      });
    };

    marker.on("dragstart", () => {
      if (!draggable) return;
      draggingRef.current = true;
      suppressClickRef.current = false;
      map.dragPan.disable();
    });
    marker.on("drag", () => {
      if (!draggable) return;
      suppressClickRef.current = true;
      const ll = marker.getLngLat();
      const pts = useProjectStore.getState().project.track.points;
      const hit = nearestTrackPoint(pts, ll.lng, ll.lat);
      if (hit) marker.setLngLat([hit.lng, hit.lat]);
    });
    marker.on("dragend", () => {
      if (!draggable) return;
      map.dragPan.enable();
      draggingRef.current = false;
      snapToTrack();
    });

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onSelect();
    };
    el.addEventListener("click", onClick);

    return () => {
      el.removeEventListener("click", onClick);
      map.dragPan.enable();
      marker.remove();
      markerRef.current = null;
      elRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, comment.id, draggable]);

  useEffect(() => {
    markerRef.current?.setDraggable(draggable);
    if (elRef.current) {
      elRef.current.title = draggable
        ? "Danmaku — drag along track to set time"
        : "Danmaku — tap to open";
      elRef.current.classList.toggle("comment-icon-nodrag", !draggable);
    }
  }, [draggable]);

  useEffect(() => {
    if (draggingRef.current) return;
    if (comment.lng === 0 && comment.lat === 0 && trackPoints.length > 0) {
      const t = comment.timeStartMs ?? 0;
      const pos = interpolateTrackPosition(trackPoints, t);
      if (pos) {
        markerRef.current?.setLngLat([pos.lng, pos.lat]);
        return;
      }
    }
    markerRef.current?.setLngLat([comment.lng, comment.lat]);
  }, [comment.lng, comment.lat, comment.timeStartMs, trackPoints]);

  useEffect(() => {
    elRef.current?.classList.toggle("comment-icon-selected", selected);
  }, [selected]);

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
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    const content = document.createElement("div");
    content.className = "follow-bubble-content";
    content.textContent = text;

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
      focusAfterOpen: false,
      anchor: "bottom",
      offset: 12,
      maxWidth: "200px",
      className: "comment-maplibre-popup comment-maplibre-popup-follow-view",
    })
      .setDOMContent(content)
      .setLngLat([lng, lat])
      .addTo(map);

    popupRef.current = popup;
    return () => {
      popup.remove();
      popupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    popupRef.current?.setLngLat([lng, lat]);
  }, [lng, lat]);

  useEffect(() => {
    const el = popupRef.current
      ?.getElement()
      ?.querySelector(".follow-bubble-content");
    if (el) el.textContent = text;
  }, [text]);

  return null;
}
