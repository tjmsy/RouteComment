import { useEffect, useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";

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

/**
 * Selected comment in the side panel.
 * Comment mode: editable. View mode: read-only.
 */
export function CommentPanel() {
  const mode = useUiStore((s) => s.mode);
  const comments = useProjectStore((s) => s.project.comments);
  const updateComment = useProjectStore((s) => s.updateComment);
  const removeComment = useProjectStore((s) => s.removeComment);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);

  const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;
  const comment = comments.find((c) => c.id === activeId) ?? null;
  const editable = mode === "comment";

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
    setStartDraft(formatHms(comment.timeStartMs));
    setEndDraft(formatHms(comment.timeEndMs));
  }, [comment?.id, comment?.text, comment?.timeStartMs, comment?.timeEndMs]);

  if (!comment) return null;
  if (mode !== "comment" && mode !== "view") return null;

  const isFollow = comment.kind === "follow";

  return (
    <section className="panel comment-side-panel">
      <div className="comment-editor-header">
        <strong>{isFollow ? "Follow comment" : "Map comment"}</strong>
        <button
          type="button"
          className="btn-done"
          onClick={() => setCommentExpanded(comment.id, false)}
        >
          Close
        </button>
      </div>

      {editable ? (
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
      ) : (
        <p className="comment-readonly-text">
          {comment.text.trim() ? comment.text : "(No text)"}
        </p>
      )}

      {isFollow && (
        <>
          {editable ? (
            <div className="comment-range-row">
              <label className="comment-time">
                <span>Start</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="hh:mm:ss"
                  value={startDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartDraft(v);
                    const ms = parseHms(v);
                    if (ms != null) {
                      updateComment(comment.id, { timeStartMs: ms });
                    }
                  }}
                  onBlur={() => {
                    const ms = parseHms(startDraft);
                    if (ms != null) setStartDraft(formatHms(ms));
                    else setStartDraft(formatHms(comment.timeStartMs));
                  }}
                />
              </label>
              <label className="comment-time">
                <span>End</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="hh:mm:ss"
                  value={endDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEndDraft(v);
                    const ms = parseHms(v);
                    if (ms != null) {
                      updateComment(comment.id, { timeEndMs: ms });
                    }
                  }}
                  onBlur={() => {
                    const ms = parseHms(endDraft);
                    if (ms != null) setEndDraft(formatHms(ms));
                    else setEndDraft(formatHms(comment.timeEndMs));
                  }}
                />
              </label>
            </div>
          ) : (
            <p className="hint comment-range-readonly">
              {formatHms(comment.timeStartMs)} – {formatHms(comment.timeEndMs)}
            </p>
          )}
        </>
      )}

      {!editable && !isFollow && (
        <p className="hint">Switch to Comment mode to edit or move the pin.</p>
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

