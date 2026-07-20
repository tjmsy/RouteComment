import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Comment } from "../lib/types";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";

type Props = {
  map: maplibregl.Map | null;
};

/**
 * Map markers are icon-only. Editing happens in CommentEditorPanel
 * (outside MapLibre) so inputs are not stolen by the map.
 */
export function CommentMarkers({ map }: Props) {
  const comments = useProjectStore((s) => s.project.comments);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const toggleCommentExpanded = useUiStore((s) => s.toggleCommentExpanded);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const isPlaying = useUiStore((s) => s.isPlaying);

  useEffect(() => {
    if (!isPlaying) return;
    const windowMs = 4000;
    comments.forEach((c) => {
      if (c.timeOffsetMs == null) return;
      const near = Math.abs(c.timeOffsetMs - animationTimeMs) <= windowMs;
      setCommentExpanded(c.id, near);
    });
  }, [animationTimeMs, isPlaying, comments, setCommentExpanded]);

  if (!map) return null;

  return (
    <>
      {comments.map((comment) => (
        <CommentIconMarker
          key={comment.id}
          map={map}
          comment={comment}
          expanded={expandedCommentIds.includes(comment.id)}
          onToggle={() => toggleCommentExpanded(comment.id)}
        />
      ))}
      <CommentEditorPanel />
    </>
  );
}

function CommentIconMarker({
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
  const elRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "comment-icon";
    el.title = "Toggle comment";
    el.textContent = "●";
    elRef.current = el;

    const stop = (e: Event) => {
      e.stopPropagation();
    };
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    });
    el.addEventListener("mousedown", stop);
    el.addEventListener("pointerdown", stop);
    el.addEventListener("dblclick", stop);

    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([comment.lng, comment.lat])
      .addTo(map);
    markerRef.current = marker;

    return () => {
      marker.remove();
      markerRef.current = null;
      elRef.current = null;
    };
    // onToggle identity is stable enough via zustand; remount on id/map only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, comment.id]);

  useEffect(() => {
    markerRef.current?.setLngLat([comment.lng, comment.lat]);
  }, [comment.lng, comment.lat]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    el.classList.toggle("expanded", expanded);
  }, [expanded]);

  // Keep click handler current
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    };
    el.onclick = handler;
  }, [onToggle]);

  return null;
}

function CommentEditorPanel() {
  const comments = useProjectStore((s) => s.project.comments);
  const updateComment = useProjectStore((s) => s.updateComment);
  const removeComment = useProjectStore((s) => s.removeComment);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);

  const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;
  const comment = comments.find((c) => c.id === activeId) ?? null;

  const [draft, setDraft] = useState("");
  const [timeDraft, setTimeDraft] = useState("");

  useEffect(() => {
    if (!comment) {
      setDraft("");
      setTimeDraft("");
      return;
    }
    setDraft(comment.text);
    setTimeDraft(
      comment.timeOffsetMs != null
        ? (comment.timeOffsetMs / 1000).toFixed(1)
        : "",
    );
  }, [comment?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- sync when switching comment

  if (!comment) return null;

  return (
    <div
      className="comment-editor-panel"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="comment-editor-header">
        <strong>Comment</strong>
        <button
          type="button"
          onClick={() => setCommentExpanded(comment.id, false)}
        >
          Close
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
      <label className="comment-time">
        <span title="Time along the GPS track for playback sync. Auto-filled from the nearest track point; edit or clear as needed.">
          Track time (s)
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={timeDraft}
          placeholder="—"
          onChange={(e) => {
            const v = e.target.value;
            setTimeDraft(v);
            if (v.trim() === "") {
              updateComment(comment.id, { timeOffsetMs: undefined });
              return;
            }
            const sec = Number(v);
            if (Number.isFinite(sec) && sec >= 0) {
              updateComment(comment.id, { timeOffsetMs: sec * 1000 });
            }
          }}
        />
      </label>
      <div className="comment-actions">
        <button
          type="button"
          onClick={() => {
            removeComment(comment.id);
            setCommentExpanded(comment.id, false);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
