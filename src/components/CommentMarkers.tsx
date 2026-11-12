import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
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
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { isEditingComment, isReviewReadonly } from "../ui/machine";
import { pointerVerb } from "../lib/mobile";
import { t } from "../i18n";

type Props = {
  map: maplibregl.Map | null;
};

export function CommentMarkers({ map }: Props) {
  const comments = useProjectStore((s) => s.project.comments);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const followTextEditId = useUiStore((s) => s.followTextEditId);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const screen = useUiStore((s) => s.screen);
  const commentTool = useUiStore((s) => s.commentTool);
  const showNotes = useUiStore((s) => s.showNotes);
  const commentEditing = isEditingComment(screen);

  if (!map) return null;

  return (
    <>
      {comments.map((comment) => {
        if (commentEditing && comment.kind !== commentTool) return null;
        if (comment.kind === "map") {
          // Editing notes forces visibility; otherwise respect the Layers toggle.
          if (!showNotes && !(commentEditing && commentTool === "map")) {
            return null;
          }
          const selected = expandedCommentIds.includes(comment.id);
          const textEditing = followTextEditId === comment.id;
          return (
            <MapPinMarker
              key={comment.id}
              map={map}
              comment={comment}
              popupOpen={comment.popupOpen !== false}
              draggable={commentEditing}
              selected={commentEditing && selected}
              textEditing={commentEditing && textEditing}
              onSelect={() => {
                useUiStore.getState().setFollowTextEditId(null);
                setCommentExpanded(comment.id, true);
              }}
              onEdit={() => {
                setCommentExpanded(comment.id, true);
                useUiStore.getState().setFollowTextEditId(comment.id);
              }}
            />
          );
        }
        if (comment.kind === "follow" && commentEditing) {
          const selected = expandedCommentIds.includes(comment.id);
          return (
            <FollowRangeMarker
              key={comment.id}
              map={map}
              comment={comment}
              selected={selected}
              textEditing={followTextEditId === comment.id}
              popupOpen={comment.popupOpen !== false}
              onSelect={() => {
                useUiStore.getState().setFollowTextEditId(null);
                useUiStore.getState().setCommentExpanded(comment.id, true);
              }}
              onEdit={() => {
                useProjectStore
                  .getState()
                  .updateComment(comment.id, { popupOpen: true });
                useUiStore.getState().setCommentExpanded(comment.id, true);
                useUiStore.getState().setFollowTextEditId(comment.id);
              }}
              onClose={() =>
                useUiStore.getState().setCommentExpanded(comment.id, false)
              }
            />
          );
        }
        if (comment.kind === "danmaku" && commentEditing) {
          return (
            <DanmakuMarker
              key={comment.id}
              map={map}
              comment={comment}
              selected={expandedCommentIds.includes(comment.id)}
              draggable={commentEditing}
              onSelect={() => setCommentExpanded(comment.id, true)}
            />
          );
        }
        return null;
      })}
      <FollowEndpointMarkers map={map} />
      <FollowBubbles map={map} />
    </>
  );
}

/** Folded map-comment chip (not a location pin — the bubble is the comment). */
const MAP_FOLD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm3 4v2h10V9H7zm0 4v2h7v-2H7z"/></svg>`;

/** Window-minimize affordance for note popups (fold to chip). */
const MINIMIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 16h14"/></svg>`;

/** Running person — edit-only landmark for follow comments. */
const RUNNER_ICON = "🏃";

/** Compact mark for danmaku timing on the track. */
const DANMAKU_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M4 6h16v3H4V6zm0 5h12v3H4v-3zm0 5h14v3H4v-3z"/></svg>`;

function createCommentPopup(
  className: string,
  opts?: { closeButton?: boolean; maxWidth?: string }
): maplibregl.Popup {
  return new maplibregl.Popup({
    closeButton: opts?.closeButton ?? true,
    closeOnClick: false,
    closeOnMove: false,
    focusAfterOpen: false,
    anchor: "bottom",
    offset: 12,
    maxWidth: opts?.maxWidth ?? "none",
    className,
  });
}

/** MapLibre-close-style control on the popup chrome (does not grow content). */
function mountPopupMinimize(
  popup: maplibregl.Popup,
  onMinimize: (e: Event) => void
): () => void {
  const root = popup.getElement();
  if (!root) return () => {};
  const existing = root.querySelector(".comment-popup-minimize");
  existing?.remove();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "comment-popup-minimize";
  btn.title = t("marker.minimize");
  btn.setAttribute("aria-label", t("marker.minimize"));
  btn.innerHTML = MINIMIZE_SVG;
  // iOS often never delivers click after map/touch negotiation; fire on
  // pointerup and swallow the synthetic click so we don't double-fold.
  let armedPointerId: number | null = null;
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    armedPointerId = e.pointerId;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (armedPointerId !== e.pointerId) return;
    armedPointerId = null;
    e.preventDefault();
    e.stopPropagation();
    onMinimize(e);
  };
  const onPointerCancel = (e: PointerEvent) => {
    if (armedPointerId === e.pointerId) armedPointerId = null;
  };
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  btn.addEventListener("pointerdown", onPointerDown);
  btn.addEventListener("pointerup", onPointerUp);
  btn.addEventListener("pointercancel", onPointerCancel);
  btn.addEventListener("click", onClick);
  root.appendChild(btn);
  return () => {
    btn.removeEventListener("pointerdown", onPointerDown);
    btn.removeEventListener("pointerup", onPointerUp);
    btn.removeEventListener("pointercancel", onPointerCancel);
    btn.removeEventListener("click", onClick);
    btn.remove();
  };
}

function MapPinMarker({
  map,
  comment,
  popupOpen,
  draggable,
  selected,
  textEditing,
  onSelect,
  onEdit,
}: {
  map: maplibregl.Map;
  comment: Comment;
  popupOpen: boolean;
  draggable: boolean;
  /** Selected in note-edit tool (display or text-edit). */
  selected: boolean;
  /** Textarea editor open. */
  textEditing: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
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
  const onSelectRef = useRef(onSelect);
  const onEditRef = useRef(onEdit);
  popupOpenRef.current = popupOpen;
  onSelectRef.current = onSelect;
  onEditRef.current = onEdit;

  // Bubble chrome (drag / resize) while selected; textarea only while text-editing.
  const interactive = selected;

  useEffect(() => {
    suppressCloseRef.current = false;

    const icon = document.createElement("button");
    icon.type = "button";
    icon.className = "comment-icon comment-icon-map";
    icon.title = t("marker.showMap");
    icon.innerHTML = MAP_FOLD_SVG;
    icon.setAttribute("aria-label", t("marker.showMap"));
    iconRef.current = icon;

    const content = document.createElement("div");
    content.className = textEditing
      ? "comment-popup-content comment-popup-content--note-edit"
      : selected
        ? "comment-popup-content comment-popup-content--note-view comment-popup-content--note-selected"
        : "comment-popup-content comment-popup-content--note-view";
    // Keep the user-chosen box in both edit and display; long text scrolls inside.
    content.style.width = `${comment.popupWidth ?? DEFAULT_POPUP_WIDTH}px`;
    content.style.height = `${comment.popupHeight ?? DEFAULT_POPUP_HEIGHT}px`;

    const body = document.createElement(textEditing ? "textarea" : "div");
    body.className = textEditing
      ? "comment-map-popup-body comment-map-popup-edit"
      : "comment-map-popup-body comment-map-popup-readonly";
    if (textEditing) {
      const ta = body as HTMLTextAreaElement;
      ta.value = comment.text;
      ta.placeholder = t("comment.placeholder");
      ta.addEventListener("input", () => {
        updateComment(comment.id, { text: ta.value });
      });
    } else {
      body.textContent = comment.text.trim()
        ? comment.text
        : t("common.noText");
      if (selected && onEdit) {
        body.classList.add("comment-map-popup-readonly--select");
        body.title = t("marker.noteTapEdit");
        body.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          onEditRef.current?.();
        });
      } else if (onSelect) {
        body.classList.add("comment-map-popup-readonly--select");
        body.title = t("marker.noteTapSelect", { verb: pointerVerb() });
        body.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelectRef.current?.();
        });
      }
    }
    content.appendChild(body);

    let handle: HTMLDivElement | null = null;
    if (interactive) {
      handle = document.createElement("div");
      handle.className = "comment-map-popup-resize";
      handle.title = t("marker.dragResize");
      content.appendChild(handle);
    }

    contentRef.current = content;
    bodyRef.current = body;

    const popup = createCommentPopup(
      textEditing
        ? "comment-maplibre-popup comment-maplibre-popup-note-edit"
        : selected
          ? "comment-maplibre-popup comment-maplibre-popup-note-view comment-maplibre-popup-note-view--selected"
          : "comment-maplibre-popup comment-maplibre-popup-note-view",
      { closeButton: false }
    );
    popup.setDOMContent(content).setLngLat([comment.lng, comment.lat]);

    const onMinimize = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      setCommentExpanded(comment.id, false);
      updateComment(comment.id, { popupOpen: false });
    };
    let unmountMinimize = () => {};
    const attachMinimize = () => {
      unmountMinimize();
      unmountMinimize = mountPopupMinimize(popup, onMinimize);
    };
    popup.on("open", attachMinimize);

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
      updateComment(comment.id, { popupOpen: true });
      onSelectRef.current?.();
    };
    icon.addEventListener("click", onIconClick);

    const onPopupClose = () => {
      if (suppressCloseRef.current) return;
      setCommentExpanded(comment.id, false);
      const latest = useProjectStore
        .getState()
        .project.comments.find((c) => c.id === comment.id);
      if (latest) {
        updateComment(comment.id, { popupOpen: false });
      }
    };
    popup.on("close", onPopupClose);

    // --- Resize (lock map pan so mobile gestures don't fight) ---
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startW = DEFAULT_POPUP_WIDTH;
    let startH = DEFAULT_POPUP_HEIGHT;

    const onResizeMove = (e: PointerEvent) => {
      if (!resizing || !contentRef.current) return;
      e.preventDefault();
      const nextW = Math.min(
        MAX_POPUP_SIZE,
        Math.max(MIN_POPUP_WIDTH, startW + (e.clientX - startX))
      );
      const nextH = Math.min(
        MAX_POPUP_SIZE,
        Math.max(MIN_POPUP_HEIGHT, startH + (e.clientY - startY))
      );
      contentRef.current.style.width = `${nextW}px`;
      contentRef.current.style.height = `${nextH}px`;
    };

    const onResizeUp = (e: PointerEvent) => {
      if (!resizing || !contentRef.current || !handle) return;
      resizing = false;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      map.dragPan.enable();
      updateComment(comment.id, {
        popupWidth: Math.round(contentRef.current.offsetWidth),
        popupHeight: Math.round(contentRef.current.offsetHeight),
      });
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeUp);
      window.removeEventListener("pointercancel", onResizeUp);
    };

    const onResizeDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!contentRef.current || !handle) return;
      resizing = true;
      map.dragPan.disable();
      startX = e.clientX;
      startY = e.clientY;
      startW = contentRef.current.offsetWidth;
      startH = contentRef.current.offsetHeight;
      handle.setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", onResizeMove, { passive: false });
      window.addEventListener("pointerup", onResizeUp);
      window.addEventListener("pointercancel", onResizeUp);
    };
    handle?.addEventListener("pointerdown", onResizeDown);

    // --- Drag open bubble when grabbing chrome / unfocused textarea ---
    let moving = false;
    let pendingFocus: { x: number; y: number; pointerId: number } | null = null;
    let moveOrigin: { x: number; y: number; lng: number; lat: number } | null =
      null;
    const DRAG_THRESHOLD_PX = 8;

    const isChromeTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (target === handle || handle?.contains(target)) return false;
      if (target.closest(".maplibregl-popup-close-button")) return false;
      if (target.closest(".comment-popup-minimize")) return false;
      if (target === body || body.contains(target)) return false;
      return content.contains(target);
    };

    const endBubbleMove = (e: PointerEvent) => {
      if (pendingFocus && e.pointerId === pendingFocus.pointerId) {
        const dx = e.clientX - pendingFocus.x;
        const dy = e.clientY - pendingFocus.y;
        pendingFocus = null;
        if (!moving && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
          (body as HTMLTextAreaElement).focus();
        }
      }
      if (!moving) return;
      moving = false;
      moveOrigin = null;
      content.classList.remove("comment-popup-content--dragging");
      try {
        if (content.hasPointerCapture(e.pointerId)) {
          content.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* already released */
      }
      map.dragPan.enable();
      const ll = popup.getLngLat();
      updateComment(comment.id, { lng: ll.lng, lat: ll.lat });
      window.removeEventListener("pointermove", onBubbleMove);
      window.removeEventListener("pointerup", endBubbleMove);
      window.removeEventListener("pointercancel", endBubbleMove);
    };

    const onBubbleMove = (e: PointerEvent) => {
      if (pendingFocus && e.pointerId === pendingFocus.pointerId) {
        const dx = e.clientX - pendingFocus.x;
        const dy = e.clientY - pendingFocus.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        // Promote pending textarea press into a bubble drag.
        const ll0 = popup.getLngLat();
        moveOrigin = {
          x: pendingFocus.x,
          y: pendingFocus.y,
          lng: ll0.lng,
          lat: ll0.lat,
        };
        pendingFocus = null;
        moving = true;
        map.dragPan.disable();
        content.classList.add("comment-popup-content--dragging");
        try {
          content.setPointerCapture(e.pointerId);
        } catch {
          /* capture unsupported */
        }
        if (body instanceof HTMLTextAreaElement) body.blur();
      }
      if (!moving || !moveOrigin) return;
      e.preventDefault();
      const start = map.project([moveOrigin.lng, moveOrigin.lat]);
      const next = map.unproject([
        start.x + (e.clientX - moveOrigin.x),
        start.y + (e.clientY - moveOrigin.y),
      ]);
      popup.setLngLat(next);
      marker.setLngLat(next);
    };

    const startBubbleMove = (e: PointerEvent, fromPending: boolean) => {
      if (resizing || moving) return;
      e.preventDefault();
      e.stopPropagation();
      const ll0 = popup.getLngLat();
      moveOrigin = {
        x: e.clientX,
        y: e.clientY,
        lng: ll0.lng,
        lat: ll0.lat,
      };
      moving = true;
      if (!fromPending && body instanceof HTMLTextAreaElement) {
        body.blur();
      }
      map.dragPan.disable();
      content.classList.add("comment-popup-content--dragging");
      try {
        content.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported */
      }
      window.addEventListener("pointermove", onBubbleMove, { passive: false });
      window.addEventListener("pointerup", endBubbleMove);
      window.addEventListener("pointercancel", endBubbleMove);
    };

    const onContentPointerDown = (e: PointerEvent) => {
      if (!interactive || e.button !== 0) return;
      if (isChromeTarget(e.target)) {
        startBubbleMove(e, false);
        return;
      }
      // Textarea: drag when not focused; otherwise leave to text editing.
      if (
        textEditing &&
        (e.target === body || body.contains(e.target as Node)) &&
        document.activeElement !== body
      ) {
        pendingFocus = {
          x: e.clientX,
          y: e.clientY,
          pointerId: e.pointerId,
        };
        e.preventDefault();
        e.stopPropagation();
        window.addEventListener("pointermove", onBubbleMove, {
          passive: false,
        });
        window.addEventListener("pointerup", endBubbleMove);
        window.addEventListener("pointercancel", endBubbleMove);
      } else if (
        !textEditing &&
        selected &&
        (e.target === body || body.contains(e.target as Node))
      ) {
        // Selected display: drag from the body so moving is easy before Edit.
        startBubbleMove(e, false);
      }
    };
    content.addEventListener("pointerdown", onContentPointerDown);

    markerRef.current = marker;
    popupRef.current = popup;

    if (popupOpenRef.current) {
      popup.addTo(map);
    } else {
      marker.addTo(map);
    }

    return () => {
      suppressCloseRef.current = true;
      icon.removeEventListener("click", onIconClick);
      unmountMinimize();
      popup.off("open", attachMinimize);
      popup.off("close", onPopupClose);
      handle?.removeEventListener("pointerdown", onResizeDown);
      content.removeEventListener("pointerdown", onContentPointerDown);
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeUp);
      window.removeEventListener("pointercancel", onResizeUp);
      window.removeEventListener("pointermove", onBubbleMove);
      window.removeEventListener("pointerup", endBubbleMove);
      window.removeEventListener("pointercancel", endBubbleMove);
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
  }, [map, comment.id, selected, textEditing]);

  useEffect(() => {
    markerRef.current?.setDraggable(draggable);
    if (iconRef.current) {
      iconRef.current.title = draggable
        ? t("marker.foldedDrag")
        : t("marker.foldedTap", { verb: pointerVerb() });
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
      suppressCloseRef.current = true;
      popup.remove();
      suppressCloseRef.current = false;
      marker.addTo(map);
    }
  }, [popupOpen, map, selected, textEditing]);

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
      body.textContent = comment.text.trim()
        ? comment.text
        : t("common.noText");
    }
  }, [comment.text]);

  return null;
}

function FollowRangeMarker({
  map,
  comment,
  selected,
  textEditing,
  popupOpen,
  onSelect,
  onEdit,
  onClose,
}: {
  map: maplibregl.Map;
  comment: Comment;
  selected: boolean;
  textEditing: boolean;
  popupOpen: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const editPopupRef = useRef<maplibregl.Popup | null>(null);
  const viewPopupRef = useRef<maplibregl.Popup | null>(null);
  const iconRef = useRef<HTMLButtonElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const viewContentRef = useRef<HTMLDivElement | null>(null);
  const textEditingRef = useRef(textEditing);
  const popupOpenRef = useRef(popupOpen);
  const onSelectRef = useRef(onSelect);
  const onEditRef = useRef(onEdit);
  const onCloseRef = useRef(onClose);
  const suppressCloseRef = useRef(false);
  const updateComment = useProjectStore((s) => s.updateComment);
  textEditingRef.current = textEditing;
  popupOpenRef.current = popupOpen;
  onSelectRef.current = onSelect;
  onEditRef.current = onEdit;
  onCloseRef.current = onClose;
  const hasText = comment.text.trim().length > 0;

  useEffect(() => {
    suppressCloseRef.current = false;

    const icon = document.createElement("button");
    icon.type = "button";
    icon.className = "comment-icon comment-icon-follow";
    icon.title = t("marker.followTitle", { verb: pointerVerb() });
    icon.textContent = RUNNER_ICON;
    icon.setAttribute("aria-label", t("marker.followAria"));
    iconRef.current = icon;

    const marker = new maplibregl.Marker({
      element: icon,
      anchor: "bottom",
    }).setLngLat([comment.lng, comment.lat]);

    const onIconClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      updateComment(comment.id, { popupOpen: true });
      onEditRef.current();
    };
    icon.addEventListener("click", onIconClick);
    markerRef.current = marker;

    const editContent = document.createElement("div");
    editContent.className =
      "comment-popup-content comment-follow-popup-content";
    editContent.style.width = "160px";
    editContent.style.height = "72px";

    const body = document.createElement("textarea");
    body.className = "comment-map-popup-body comment-map-popup-edit";
    body.value = comment.text;
    body.placeholder = t("comment.followPlaceholder");
    body.addEventListener("input", () => {
      updateComment(comment.id, { text: body.value });
    });
    editContent.appendChild(body);
    bodyRef.current = body;

    const editPopup = createCommentPopup(
      "comment-maplibre-popup comment-maplibre-popup-follow",
      { closeButton: false }
    );
    editPopup.setDOMContent(editContent).setLngLat([comment.lng, comment.lat]);

    const foldToMarker = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (bodyRef.current) {
        updateComment(comment.id, {
          text: bodyRef.current.value,
          popupOpen: false,
        });
      } else {
        updateComment(comment.id, { popupOpen: false });
      }
      onCloseRef.current();
    };
    let unmountEditMinimize = () => {};
    const attachEditMinimize = () => {
      unmountEditMinimize();
      unmountEditMinimize = mountPopupMinimize(editPopup, foldToMarker);
    };
    editPopup.on("open", attachEditMinimize);

    const onPopupClose = () => {
      if (suppressCloseRef.current) return;
      updateComment(comment.id, {
        text: body.value,
        popupOpen: false,
      });
      onCloseRef.current();
    };
    editPopup.on("close", onPopupClose);
    editPopupRef.current = editPopup;

    const viewContent = document.createElement("div");
    viewContent.className = "follow-bubble-content follow-bubble-content--edit";
    viewContent.textContent = comment.text.trim()
      ? comment.text
      : t("common.noText");
    viewContent.title = t("marker.followTapRange", { verb: pointerVerb() });
    viewContentRef.current = viewContent;

    const viewPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
      focusAfterOpen: false,
      anchor: "bottom",
      offset: 12,
      maxWidth: "200px",
      className: "comment-maplibre-popup comment-maplibre-popup-follow-view",
    })
      .setDOMContent(viewContent)
      .setLngLat([comment.lng, comment.lat]);

    let unmountViewMinimize = () => {};
    const attachViewMinimize = () => {
      unmountViewMinimize();
      unmountViewMinimize = mountPopupMinimize(viewPopup, foldToMarker);
    };
    viewPopup.on("open", attachViewMinimize);

    const selectFromBubble = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      // Select → amber range highlight; keep display bubble.
      onSelectRef.current();
    };
    const editFromBubble = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      onEditRef.current();
    };
    const blockMapGesture = (e: Event) => {
      e.stopPropagation();
    };
    // Bind on the popup root so padding clicks still select.
    const bindViewEl = () => {
      const el = viewPopup.getElement();
      if (!el || el.dataset.followBound === "1") return;
      el.dataset.followBound = "1";
      el.style.pointerEvents = "auto";
      el.addEventListener("click", selectFromBubble);
      el.addEventListener("dblclick", editFromBubble);
      el.addEventListener("pointerdown", blockMapGesture);
      el.addEventListener("mousedown", blockMapGesture);
    };
    viewPopup.on("open", bindViewEl);
    viewPopupRef.current = viewPopup;

    if (textEditingRef.current) {
      editPopup.addTo(map);
    } else if (comment.text.trim() && popupOpenRef.current) {
      viewPopup.addTo(map);
      bindViewEl();
    } else {
      marker.addTo(map);
    }

    return () => {
      suppressCloseRef.current = true;
      icon.removeEventListener("click", onIconClick);
      unmountEditMinimize();
      unmountViewMinimize();
      editPopup.off("open", attachEditMinimize);
      viewPopup.off("open", attachViewMinimize);
      const el = viewPopup.getElement();
      if (el) {
        el.removeEventListener("click", selectFromBubble);
        el.removeEventListener("dblclick", editFromBubble);
        el.removeEventListener("pointerdown", blockMapGesture);
        el.removeEventListener("mousedown", blockMapGesture);
        delete el.dataset.followBound;
      }
      viewPopup.off("open", bindViewEl);
      editPopup.off("close", onPopupClose);
      editPopup.remove();
      viewPopup.remove();
      marker.remove();
      markerRef.current = null;
      editPopupRef.current = null;
      viewPopupRef.current = null;
      iconRef.current = null;
      bodyRef.current = null;
      viewContentRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, comment.id]);

  useEffect(() => {
    markerRef.current?.setLngLat([comment.lng, comment.lat]);
    editPopupRef.current?.setLngLat([comment.lng, comment.lat]);
    viewPopupRef.current?.setLngLat([comment.lng, comment.lat]);
  }, [comment.lng, comment.lat]);

  useEffect(() => {
    const marker = markerRef.current;
    const editPopup = editPopupRef.current;
    const viewPopup = viewPopupRef.current;
    if (!marker || !editPopup || !viewPopup) return;

    const wantEdit = textEditing;
    const wantView = !textEditing && hasText && popupOpen;
    // Already showing the right chrome — avoid remove/add (steals textarea focus).
    if (wantEdit && editPopup.isOpen()) return;
    if (wantView && viewPopup.isOpen()) return;
    if (!wantEdit && !wantView && marker.getElement().isConnected) return;

    suppressCloseRef.current = true;
    const viewEl = viewPopup.getElement();
    if (viewEl) delete viewEl.dataset.followBound;
    editPopup.remove();
    viewPopup.remove();
    marker.remove();
    suppressCloseRef.current = false;

    if (wantEdit) {
      editPopup.addTo(map);
      // Focus after MapLibre attaches the DOM (next frame).
      requestAnimationFrame(() => bodyRef.current?.focus());
      return;
    }
    if (wantView) {
      viewPopup.addTo(map);
      return;
    }
    marker.addTo(map);
    // Do not remount when only `selected` changes — removing the popup under
    // the pointer can fall through as a map click and wipe the amber range.
  }, [textEditing, hasText, popupOpen, map]);

  useEffect(() => {
    viewPopupRef.current
      ?.getElement()
      ?.classList.toggle(
        "comment-maplibre-popup-follow-view--selected",
        selected
      );
  }, [selected, textEditing, hasText, popupOpen]);

  useEffect(() => {
    const body = bodyRef.current;
    if (body && document.activeElement !== body) body.value = comment.text;
    const view = viewContentRef.current;
    if (view) {
      view.textContent = comment.text.trim()
        ? comment.text
        : t("common.noText");
    }
  }, [comment.text]);

  return null;
}

function FollowEndpointMarkers({ map }: { map: maplibregl.Map }) {
  const screen = useUiStore((s) => s.screen);
  const commentTool = useUiStore((s) => s.commentTool);
  const followRangeStartMs = useUiStore((s) => s.followRangeStartMs);
  const followDraftRange = useUiStore((s) => s.followDraftRange);
  const setFollowRangeStartMs = useUiStore((s) => s.setFollowRangeStartMs);
  const setFollowDraftRange = useUiStore((s) => s.setFollowDraftRange);
  const trackPoints = useProjectStore((s) => s.project.track.points);

  if (!isEditingComment(screen) || commentTool !== "follow") {
    return null;
  }

  if (followDraftRange) {
    return (
      <>
        <FollowEndpointHandle
          map={map}
          label="A"
          timeMs={followDraftRange.aMs}
          trackPoints={trackPoints}
          onTimeMs={(ms) => {
            const mid = interpolateTrackPosition(
              trackPoints,
              (ms + followDraftRange.bMs) / 2
            );
            setFollowDraftRange({
              ...followDraftRange,
              aMs: ms,
              lng: mid?.lng ?? followDraftRange.lng,
              lat: mid?.lat ?? followDraftRange.lat,
            });
          }}
        />
        <FollowEndpointHandle
          map={map}
          label="B"
          timeMs={followDraftRange.bMs}
          trackPoints={trackPoints}
          onTimeMs={(ms) => {
            const mid = interpolateTrackPosition(
              trackPoints,
              (followDraftRange.aMs + ms) / 2
            );
            setFollowDraftRange({
              ...followDraftRange,
              bMs: ms,
              lng: mid?.lng ?? followDraftRange.lng,
              lat: mid?.lat ?? followDraftRange.lat,
            });
          }}
        />
      </>
    );
  }

  if (followRangeStartMs != null) {
    return (
      <FollowEndpointHandle
        map={map}
        label="A"
        timeMs={followRangeStartMs}
        trackPoints={trackPoints}
        onTimeMs={(ms) => setFollowRangeStartMs(ms)}
      />
    );
  }

  return null;
}

function FollowEndpointHandle({
  map,
  label,
  timeMs,
  trackPoints,
  onTimeMs,
}: {
  map: maplibregl.Map;
  label: string;
  timeMs: number;
  trackPoints: ReturnType<
    typeof useProjectStore.getState
  >["project"]["track"]["points"];
  onTimeMs: (ms: number) => void;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const draggingRef = useRef(false);
  const onTimeMsRef = useRef(onTimeMs);
  const trackPointsRef = useRef(trackPoints);
  onTimeMsRef.current = onTimeMs;
  trackPointsRef.current = trackPoints;

  useEffect(() => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "follow-endpoint-marker";
    el.textContent = label;
    el.title = t("marker.endpointTitle");
    el.setAttribute("aria-label", t("marker.endpointAria", { label }));

    const pos = interpolateTrackPosition(trackPointsRef.current, timeMs);
    const marker = new maplibregl.Marker({
      element: el,
      anchor: "center",
      draggable: true,
    }).setLngLat(pos ? [pos.lng, pos.lat] : map.getCenter().toArray());

    marker.on("dragstart", () => {
      draggingRef.current = true;
      map.dragPan.disable();
    });
    marker.on("drag", () => {
      const ll = marker.getLngLat();
      const hit = nearestTrackPoint(trackPointsRef.current, ll.lng, ll.lat);
      if (hit?.timeOffsetMs == null) return;
      const snap = interpolateTrackPosition(
        trackPointsRef.current,
        hit.timeOffsetMs
      );
      if (snap) marker.setLngLat([snap.lng, snap.lat]);
      onTimeMsRef.current(hit.timeOffsetMs);
    });
    marker.on("dragend", () => {
      draggingRef.current = false;
      map.dragPan.enable();
      const ll = marker.getLngLat();
      const hit = nearestTrackPoint(trackPointsRef.current, ll.lng, ll.lat);
      if (hit?.timeOffsetMs == null) return;
      const snap = interpolateTrackPosition(
        trackPointsRef.current,
        hit.timeOffsetMs
      );
      if (snap) marker.setLngLat([snap.lng, snap.lat]);
      onTimeMsRef.current(hit.timeOffsetMs);
    });

    marker.addTo(map);
    markerRef.current = marker;

    return () => {
      map.dragPan.enable();
      marker.remove();
      markerRef.current = null;
    };
    // Recreate only when label identity changes; position synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, label]);

  useEffect(() => {
    if (draggingRef.current) return;
    const pos = interpolateTrackPosition(trackPoints, timeMs);
    if (!pos || !markerRef.current) return;
    markerRef.current.setLngLat([pos.lng, pos.lat]);
  }, [timeMs, trackPoints]);

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
      ? t("marker.danmakuDrag")
      : t("marker.danmakuTap", { verb: pointerVerb() });
    el.innerHTML = DANMAKU_ICON_SVG;
    el.setAttribute("aria-label", t("marker.danmakuAria"));
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
        ? t("marker.danmakuDrag")
        : t("marker.danmakuTap", { verb: pointerVerb() });
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
  const showVoices = useUiStore((s) => s.showVoices);
  const screen = useUiStore((s) => s.screen);

  const active = comments.filter(
    (c) =>
      showVoices &&
      isReviewReadonly(screen) &&
      c.kind === "follow" &&
      c.text.trim().length > 0 &&
      commentActiveAt(c, animationTimeMs)
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
