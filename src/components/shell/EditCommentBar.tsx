import { useEffect, useState } from "react";
import { pointerVerb } from "../../lib/mobile";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { t } from "../../i18n";

export function EditCommentBar() {
  const dispatch = useUiStore((s) => s.dispatch);
  const commentTool = useUiStore((s) => s.commentTool);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const followDraftRange = useUiStore((s) => s.followDraftRange);
  const followRangeStartMs = useUiStore((s) => s.followRangeStartMs);
  const followRangeTargetId = useUiStore((s) => s.followRangeTargetId);
  const confirmFollowDraft = useUiStore((s) => s.confirmFollowDraft);
  const redoFollowDraft = useUiStore((s) => s.redoFollowDraft);
  const followTextEditId = useUiStore((s) => s.followTextEditId);
  const setFollowTextEditId = useUiStore((s) => s.setFollowTextEditId);
  const comments = useProjectStore((s) => s.project.comments);
  const removeComment = useProjectStore((s) => s.removeComment);
  const updateComment = useProjectStore((s) => s.updateComment);
  const verb = pointerVerb();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;
  const active = comments.find((c) => c.id === activeId) ?? null;
  const showSelectionActions =
    active != null &&
    active.kind === commentTool &&
    (active.kind === "follow" ||
      active.kind === "map" ||
      active.kind === "danmaku");

  const inFollowSession =
    commentTool === "follow" &&
    (followDraftRange != null ||
      followRangeStartMs != null ||
      followRangeTargetId != null);
  const showFollowDraftActions = followDraftRange != null;
  const showFollowConfirm =
    showSelectionActions &&
    active.kind === "follow" &&
    !inFollowSession &&
    !confirmDelete;
  const showNoteConfirm =
    showSelectionActions && active.kind === "map" && !confirmDelete;
  const showNoteEdit = showNoteConfirm && followTextEditId !== active.id;
  const showDanmakuConfirm =
    showSelectionActions && active.kind === "danmaku" && !confirmDelete;

  useEffect(() => {
    queueMicrotask(() => setConfirmDelete(false));
  }, [activeId, commentTool]);

  const deleteSelected = () => {
    if (!active) return;
    if (active.kind === "map") {
      updateComment(active.id, { popupOpen: false });
    }
    removeComment(active.id);
    setCommentExpanded(active.id, false);
    setConfirmDelete(false);
  };

  const hint = (() => {
    if (commentTool === "follow") {
      if (followDraftRange) return t("followBar.dragConfirm");
      if (followRangeStartMs != null) {
        return t("status.startSet", { verb });
      }
      if (active?.kind === "follow") {
        return t("commentTool.hintFollowEditing");
      }
      return t("commentTool.hintFollow", { verb });
    }
    if (commentTool === "danmaku") {
      if (active?.kind === "danmaku") return t("comment.danmakuEditHint");
      return t("commentTool.hintDanmaku", { verb });
    }
    if (active?.kind === "map") {
      if (followTextEditId === active.id) {
        return t("commentTool.hintMapEditing");
      }
      return t("commentTool.hintMapSelected");
    }
    return t("commentTool.hintMap", { verb });
  })();

  return (
    <div className="tool-bar">
      {showFollowConfirm && (
        <button
          type="button"
          className="btn-done"
          onClick={() => {
            // Flush IME / focused textarea before leaving edit chrome.
            const el = document.activeElement;
            if (el instanceof HTMLTextAreaElement) {
              updateComment(active.id, { text: el.value });
              el.blur();
            }
            if (followTextEditId === active.id) {
              // Leave display bubble selected so the amber range stays visible.
              setFollowTextEditId(null);
              return;
            }
            // Second Confirm (or Confirm while already in display) clears selection
            // so the next two track taps create a new voice.
            setCommentExpanded(active.id, false);
          }}
        >
          {t("common.confirm")}
        </button>
      )}
      {showNoteEdit && (
        <button
          type="button"
          className="btn-comment-action"
          onClick={() => setFollowTextEditId(active.id)}
        >
          {t("review.edit")}
        </button>
      )}
      {showNoteConfirm && (
        <button
          type="button"
          className="btn-done"
          onClick={() => {
            const el = document.activeElement;
            if (el instanceof HTMLTextAreaElement) {
              updateComment(active.id, { text: el.value });
              el.blur();
            }
            if (followTextEditId === active.id) {
              setFollowTextEditId(null);
              return;
            }
            setCommentExpanded(active.id, false);
          }}
        >
          {t("common.confirm")}
        </button>
      )}
      {showSelectionActions &&
        !inFollowSession &&
        (!confirmDelete ? (
          <button
            type="button"
            className="btn-comment-action btn-comment-action--danger"
            onClick={() => setConfirmDelete(true)}
          >
            {t("common.delete")}
          </button>
        ) : (
          <div className="comment-tool-delete-confirm">
            <span>{t("comment.deleteConfirm")}</span>
            <button
              type="button"
              className="btn-comment-action btn-comment-action--danger"
              onClick={deleteSelected}
            >
              {t("comment.confirmDelete")}
            </button>
            <button
              type="button"
              className="btn-comment-action"
              onClick={() => setConfirmDelete(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        ))}
      {showDanmakuConfirm && (
        <button
          type="button"
          className="btn-done"
          onClick={() => setCommentExpanded(active.id, false)}
        >
          {t("common.confirm")}
        </button>
      )}
      {showFollowDraftActions && (
        <>
          <button type="button" onClick={() => redoFollowDraft()}>
            {t("common.redo")}
          </button>
          <button
            type="button"
            className="btn-done"
            onClick={() => confirmFollowDraft()}
          >
            {t("common.confirm")}
          </button>
        </>
      )}
      <button
        type="button"
        className="btn-done"
        onClick={() => dispatch({ type: "TOOL_DONE" })}
      >
        {t("common.done")}
      </button>
      <span className="hint tool-bar-hint">{hint}</span>
    </div>
  );
}
