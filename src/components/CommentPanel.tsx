import { useEffect, useMemo, useState } from "react";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { isEditingComment, isReviewReadonly } from "../ui/machine";
import { t } from "../i18n";

/** Captions scroll as one line — collapse newlines from paste / legacy data. */
function singleLineText(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

/**
 * Caption editor / reader as a bottom sheet.
 * Timing is set by dragging the track marker — no hh:mm:ss fields.
 * Edit-mode delete/close/hint live in EditCommentBar; this sheet is input-only.
 */
export function CommentPanel({
  variant = "sheet",
}: {
  variant?: "sidebar" | "sheet";
}) {
  const mobile = useMobileLayout();
  const screen = useUiStore((s) => s.screen);
  const comments = useProjectStore((s) => s.project.comments);
  const updateComment = useProjectStore((s) => s.updateComment);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);

  const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;
  const comment = comments.find((c) => c.id === activeId) ?? null;
  const editable = isEditingComment(screen);

  const [draft, setDraft] = useState("");
  const cleanedCaption = useMemo(
    () => (comment ? singleLineText(comment.text) : ""),
    [comment]
  );

  useEffect(() => {
    if (!comment) {
      queueMicrotask(() => setDraft(""));
      return;
    }
    queueMicrotask(() => {
      setDraft(cleanedCaption);
      if (comment.kind === "danmaku" && cleanedCaption !== comment.text) {
        updateComment(comment.id, { text: cleanedCaption });
      }
    });
  }, [comment, cleanedCaption, updateComment]);

  if (!comment || comment.kind !== "danmaku") return null;
  if (!editable && !isReviewReadonly(screen)) return null;

  const panelClass =
    variant === "sheet"
      ? "panel comment-side-panel comment-sheet"
      : "panel comment-side-panel";

  return (
    <section className={panelClass}>
      {!editable && (
        <div className="comment-editor-header">
          <strong>{t("comment.kindDanmaku")}</strong>
          <div className="comment-editor-header-actions">
            <button
              type="button"
              className="btn-done"
              onClick={() => setCommentExpanded(comment.id, false)}
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}

      {editable ? (
        <input
          type="text"
          className="comment-danmaku-input"
          value={draft}
          placeholder={t("comment.danmakuPlaceholder")}
          autoFocus={!mobile}
          onChange={(e) => {
            const v = singleLineText(e.target.value);
            setDraft(v);
            updateComment(comment.id, { text: v });
          }}
        />
      ) : (
        <>
          <p className="comment-readonly-text">
            {comment.text.trim()
              ? singleLineText(comment.text)
              : t("common.noText")}
          </p>
          <p className="hint">{t("comment.danmakuReadonlyHint")}</p>
        </>
      )}
    </section>
  );
}
