import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Comment } from "../lib/types";
import { commentActiveAt } from "../lib/types";
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
            onToggle={() => toggleCommentExpanded(comment.id)}
          />
        ) : (
          <FollowRangeMarker
            key={comment.id}
            map={map}
            comment={comment}
            expanded={expandedCommentIds.includes(comment.id)}
            onToggle={() => toggleCommentExpanded(comment.id)}
          />
        ),
      )}
      <FollowBubbles map={map} />
      <CommentEditorPanel />
    </>
  );
}

function MapPinMarker({
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
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const updateComment = useProjectStore((s) => s.updateComment);

  useEffect(() => {
    // div (not button): <button> breaks MapLibre marker dragging in many browsers
    const el = document.createElement("div");
    el.className = "comment-icon comment-icon-map";
    el.title = "Map comment (drag to move)";
    el.textContent = "📍";
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    elRef.current = el;

    const marker = new maplibregl.Marker({
      element: el,
      anchor: "bottom",
      draggable: true,
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
    el.addEventListener("click", onClick);

    markerRef.current = marker;
    return () => {
      el.removeEventListener("click", onClick);
      map.dragPan.enable();
      marker.remove();
      markerRef.current = null;
      elRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, comment.id]);

  useEffect(() => {
    if (draggingRef.current) return;
    markerRef.current?.setLngLat([comment.lng, comment.lat]);
  }, [comment.lng, comment.lat]);

  useEffect(() => {
    elRef.current?.classList.toggle("expanded", expanded);
  }, [expanded]);

  return null;
}

/** Small tick at range mid — not the follow bubble (that follows the runner). */
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
    el.title = "Follow comment (range on track)";
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

function formatSec(ms: number | undefined): string {
  if (ms == null) return "";
  return (ms / 1000).toFixed(1);
}

function CommentEditorPanel() {
  const comments = useProjectStore((s) => s.project.comments);
  const updateComment = useProjectStore((s) => s.updateComment);
  const removeComment = useProjectStore((s) => s.removeComment);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);

  const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;
  const comment = comments.find((c) => c.id === activeId) ?? null;

  const [draft, setDraft] = useState("");
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    if (!comment) {
      setDraft("");
      setStartDraft("");
      setEndDraft("");
      return;
    }
    setDraft(comment.text);
    setStartDraft(formatSec(comment.timeStartMs));
    setEndDraft(formatSec(comment.timeEndMs));
  }, [comment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!comment) return null;

  const parseSec = (v: string): number | undefined => {
    if (v.trim() === "") return undefined;
    const sec = Number(v);
    return Number.isFinite(sec) && sec >= 0 ? sec * 1000 : undefined;
  };

  const isFollow = comment.kind === "follow";

  return (
    <div
      className="comment-editor-panel"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="comment-editor-header">
        <strong>{isFollow ? "Follow comment" : "Map comment"}</strong>
        <button
          type="button"
          className="btn-done"
          onClick={() => setCommentExpanded(comment.id, false)}
        >
          Done
        </button>
      </div>
      <textarea
        value={draft}
        rows={4}
        placeholder="Write a comment…"
        autoFocus
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          updateComment(comment.id, { text: v });
        }}
      />
      {isFollow ? (
        <>
          <p className="hint">
            Bubble follows the runner while track time is in this range.
          </p>
          <div className="comment-range-row">
            <label className="comment-time">
              <span>Start (s)</span>
              <input
                type="text"
                inputMode="decimal"
                value={startDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDraft(v);
                  updateComment(comment.id, { timeStartMs: parseSec(v) });
                }}
              />
            </label>
            <label className="comment-time">
              <span>End (s)</span>
              <input
                type="text"
                inputMode="decimal"
                value={endDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  setEndDraft(v);
                  updateComment(comment.id, { timeEndMs: parseSec(v) });
                }}
              />
            </label>
          </div>
          <div className="btn-row">
            <button
              type="button"
              onClick={() => {
                const ms = animationTimeMs;
                setStartDraft(formatSec(ms));
                updateComment(comment.id, { timeStartMs: ms });
              }}
            >
              Start = playhead
            </button>
            <button
              type="button"
              onClick={() => {
                const ms = animationTimeMs;
                setEndDraft(formatSec(ms));
                updateComment(comment.id, { timeEndMs: ms });
              }}
            >
              End = playhead
            </button>
          </div>
        </>
      ) : (
        <p className="hint">Drag the pin on the map to reposition.</p>
      )}

      <div className="comment-danger-zone">
        {!confirmDelete ? (
          <button
            type="button"
            className="btn-delete"
            onClick={() => setConfirmDelete(true)}
          >
            Delete comment…
          </button>
        ) : (
          <div className="comment-delete-confirm">
            <span>Delete permanently?</span>
            <button
              type="button"
              className="btn-delete-confirm"
              onClick={() => {
                removeComment(comment.id);
                setCommentExpanded(comment.id, false);
              }}
            >
              Confirm delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
