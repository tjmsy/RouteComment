import { useEffect, useRef, useState } from "react";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { pointerVerb } from "../lib/mobile";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { isEditingComment, isReviewReadonly } from "../ui/machine";

function formatHms(ms: number | undefined): string {
  if (ms == null) return "";
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Parse hh:mm:ss, mm:ss, or plain seconds. */
function parseHms(v: string): number | undefined {
  const t = v.trim();
  if (t === "") return undefined;
  const parts = t.split(":");
  if (parts.length > 3) return undefined;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return undefined;
  let sec = 0;
  if (nums.length === 3) sec = nums[0] * 3600 + nums[1] * 60 + nums[2];
  else if (nums.length === 2) sec = nums[0] * 60 + nums[1];
  else sec = nums[0];
  return sec * 1000;
}

function kindLabel(kind: string): string {
  if (kind === "follow") return "Follow comment";
  if (kind === "danmaku") return "Danmaku comment";
  return "Map comment";
}

/**
 * Selected comment editor / reader.
 * Comment mode: editable. View mode: read-only.
 * On mobile this is hosted as a bottom sheet from App.
 */
export function CommentPanel({ variant = "sidebar" }: { variant?: "sidebar" | "sheet" }) {
  const mobile = useMobileLayout();
  const screen = useUiStore((s) => s.screen);
  const comments = useProjectStore((s) => s.project.comments);
  const updateComment = useProjectStore((s) => s.updateComment);
  const removeComment = useProjectStore((s) => s.removeComment);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const beginFollowReselect = useUiStore((s) => s.beginFollowReselect);

  const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;
  const comment = comments.find((c) => c.id === activeId) ?? null;
  const editable = isEditingComment(screen);

  const [draft, setDraft] = useState("");
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startFocusedRef = useRef(false);
  const endFocusedRef = useRef(false);

  useEffect(() => {
    setConfirmDelete(false);
    if (!comment) {
      setDraft("");
      setStartDraft("");
      setEndDraft("");
      return;
    }
    setDraft(comment.text);
    if (!startFocusedRef.current) {
      setStartDraft(formatHms(comment.timeStartMs));
    }
    if (!endFocusedRef.current) {
      setEndDraft(formatHms(comment.timeEndMs));
    }
  }, [comment?.id, comment?.text, comment?.timeStartMs, comment?.timeEndMs]);

  if (!comment) return null;
  if (!editable && !isReviewReadonly(screen)) return null;

  const isFollow = comment.kind === "follow";
  const isDanmaku = comment.kind === "danmaku";
  const isMap = comment.kind === "map";
  const panelClass =
    variant === "sheet"
      ? "panel comment-side-panel comment-sheet"
      : "panel comment-side-panel";

  const commitStart = () => {
    startFocusedRef.current = false;
    const ms = parseHms(startDraft);
    if (ms != null) {
      setStartDraft(formatHms(ms));
      updateComment(comment.id, { timeStartMs: ms });
    } else {
      setStartDraft(formatHms(comment.timeStartMs));
    }
  };

  const commitEnd = () => {
    endFocusedRef.current = false;
    const ms = parseHms(endDraft);
    if (ms != null) {
      setEndDraft(formatHms(ms));
      updateComment(comment.id, { timeEndMs: ms });
    } else {
      setEndDraft(formatHms(comment.timeEndMs));
    }
  };

  return (
    <section className={panelClass}>
      <div className="comment-editor-header">
        <strong>{kindLabel(comment.kind)}</strong>
        <button
          type="button"
          className="btn-done"
          onClick={() => setCommentExpanded(comment.id, false)}
        >
          Close
        </button>
      </div>

      {editable && !isFollow && !isMap ? (
        <textarea
          value={draft}
          rows={variant === "sheet" ? 3 : 4}
          placeholder="Write a comment…"
          autoFocus={!mobile}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            updateComment(comment.id, { text: v });
          }}
        />
      ) : !editable ? (
        <p className="comment-readonly-text">
          {comment.text.trim() ? comment.text : "(No text)"}
        </p>
      ) : isFollow ? (
        <p className="hint">Edit text in the map popup.</p>
      ) : null}

      {isFollow && (
        <>
          {editable ? (
            <>
              <div className="comment-range-row">
                <label className="comment-time">
                  <span>Start</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="hh:mm:ss"
                    value={startDraft}
                    onFocus={() => {
                      startFocusedRef.current = true;
                    }}
                    onChange={(e) => setStartDraft(e.target.value)}
                    onBlur={commitStart}
                  />
                </label>
                <label className="comment-time">
                  <span>End</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="hh:mm:ss"
                    value={endDraft}
                    onFocus={() => {
                      endFocusedRef.current = true;
                    }}
                    onChange={(e) => setEndDraft(e.target.value)}
                    onBlur={commitEnd}
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn-reselect-range"
                onClick={() => beginFollowReselect(comment.id)}
              >
                Re-select range on map
              </button>
            </>
          ) : (
            <p className="hint comment-range-readonly">
              {formatHms(comment.timeStartMs)} – {formatHms(comment.timeEndMs)}
            </p>
          )}
        </>
      )}

      {isDanmaku && (
        <>
          {editable ? (
            <label className="comment-time">
              <span>Trigger time</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="hh:mm:ss"
                value={startDraft}
                onFocus={() => {
                  startFocusedRef.current = true;
                }}
                onChange={(e) => setStartDraft(e.target.value)}
                onBlur={commitStart}
              />
            </label>
          ) : (
            <p className="hint comment-range-readonly">
              At {formatHms(comment.timeStartMs)}
            </p>
          )}
        </>
      )}

      {!editable && isMap && (
        <p className="hint">
          {pointerVerb()} the pin icon on the map to open it. Switch to Comment
          mode to edit or move the pin.
        </p>
      )}

      {!editable && isDanmaku && (
        <p className="hint">
          Scrolls right-to-left once when playback reaches the trigger time.
        </p>
      )}

      {editable && (
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
      )}
    </section>
  );
}
