import { pointerVerb } from "../../lib/mobile";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { CommentPanel } from "../CommentPanel";
import { useMobileLayout } from "../../hooks/useMobileLayout";
import { t } from "../../i18n";

function commentToolLabel(kind: "map" | "follow" | "danmaku"): string {
  if (kind === "follow") return t("commentTool.kindFollow");
  if (kind === "danmaku") return t("commentTool.kindDanmaku");
  return t("commentTool.kindMap");
}

function CommentToolControls() {
  const dispatch = useUiStore((s) => s.dispatch);
  const commentTool = useUiStore((s) => s.commentTool);
  const setCommentTool = useUiStore((s) => s.setCommentTool);
  const clearExpandedComments = useUiStore((s) => s.clearExpandedComments);
  const clearFollowRangeSession = useUiStore((s) => s.clearFollowRangeSession);
  const verb = pointerVerb();

  const pickTool = (tool: "map" | "follow" | "danmaku") => {
    setCommentTool(tool);
    clearExpandedComments();
    clearFollowRangeSession();
  };

  return (
    <>
      <div className="comment-tool-controls">
        <button
          type="button"
          className="btn-done"
          onClick={() => dispatch({ type: "TOOL_DONE" })}
        >
          {t("common.done")}
        </button>
        <div className="mode-row comment-tool-row">
          <button
            type="button"
            className={commentTool === "follow" ? "active" : ""}
            onClick={() => pickTool("follow")}
          >
            {t("commentTool.follow")}
          </button>
          <button
            type="button"
            className={commentTool === "map" ? "active" : ""}
            onClick={() => pickTool("map")}
          >
            {t("commentTool.map")}
          </button>
          <button
            type="button"
            className={commentTool === "danmaku" ? "active" : ""}
            onClick={() => pickTool("danmaku")}
          >
            {t("commentTool.danmaku")}
          </button>
        </div>
      </div>
      <p className="hint comment-tool-hint">
        {commentTool === "follow"
          ? t("commentTool.hintFollow", { verb })
          : commentTool === "danmaku"
            ? t("commentTool.hintDanmaku", { verb })
            : t("commentTool.hintMap", { verb })}
      </p>
    </>
  );
}

function CommentList() {
  const comments = useProjectStore((s) => s.project.comments);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const removeComment = useProjectStore((s) => s.removeComment);
  const clearFollowRangeSession = useUiStore((s) => s.clearFollowRangeSession);
  const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;

  if (comments.length === 0) {
    return <p className="hint">{t("commentTool.noComments")}</p>;
  }

  return (
    <ul className="cp-list">
      {comments.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className={c.id === activeId ? "active" : ""}
            onClick={() => {
              clearFollowRangeSession();
              setCommentExpanded(c.id, true);
            }}
          >
            <span className="cp-kind">{commentToolLabel(c.kind)}</span>
            {c.text.trim() || t("common.noText")}
          </button>
          <button
            type="button"
            className="cp-delete"
            title={t("common.delete")}
            onClick={() => {
              removeComment(c.id);
              if (c.id === activeId) setCommentExpanded(c.id, false);
            }}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

export function EditCommentBar() {
  const mobile = useMobileLayout();

  return (
    <>
      {mobile ? (
        <div className="tool-bar tool-bar--comment">
          <CommentToolControls />
          <details className="comment-list-details">
            <summary>{t("commentTool.comments")}</summary>
            <CommentList />
          </details>
        </div>
      ) : (
        <aside className="comment-float-panel comment-float-panel--right">
          <CommentToolControls />
          <h3 className="comment-float-title">{t("commentTool.comments")}</h3>
          <CommentList />
          <CommentPanel variant="sidebar" />
        </aside>
      )}
    </>
  );
}
