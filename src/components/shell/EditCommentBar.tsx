import { pointerVerb } from "../../lib/mobile";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { CommentPanel } from "../CommentPanel";
import { useMobileLayout } from "../../hooks/useMobileLayout";

export function EditCommentBar() {
  const dispatch = useUiStore((s) => s.dispatch);
  const commentTool = useUiStore((s) => s.commentTool);
  const setCommentTool = useUiStore((s) => s.setCommentTool);
  const clearExpandedComments = useUiStore((s) => s.clearExpandedComments);
  const comments = useProjectStore((s) => s.project.comments);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const removeComment = useProjectStore((s) => s.removeComment);
  const mobile = useMobileLayout();
  const verb = pointerVerb();
  const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;

  const pickTool = (tool: "map" | "follow" | "danmaku") => {
    setCommentTool(tool);
    clearExpandedComments();
  };

  return (
    <>
      <div className="tool-bar">
        <button
          type="button"
          className="btn-done"
          onClick={() => dispatch({ type: "TOOL_DONE" })}
        >
          Done
        </button>
        <div className="mode-row comment-tool-row">
          <button
            type="button"
            className={commentTool === "map" ? "active" : ""}
            onClick={() => pickTool("map")}
          >
            Map
          </button>
          <button
            type="button"
            className={commentTool === "follow" ? "active" : ""}
            onClick={() => pickTool("follow")}
          >
            Follow
          </button>
          <button
            type="button"
            className={commentTool === "danmaku" ? "active" : ""}
            onClick={() => pickTool("danmaku")}
          >
            Danmaku
          </button>
        </div>
        <span className="hint tool-bar-hint">
          {commentTool === "follow"
            ? `${verb} or drag on the GPS track to set a time range`
            : commentTool === "danmaku"
              ? `${verb} the track to place a scrolling comment`
              : `${verb} the map to place a comment bubble (× collapses long text)`}
        </span>
      </div>
      {!mobile && (
        <aside className="comment-float-panel comment-float-panel--right">
          <h3 className="comment-float-title">Comments</h3>
          {comments.length === 0 ? (
            <p className="hint">No comments yet.</p>
          ) : (
            <ul className="cp-list">
              {comments.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={c.id === activeId ? "active" : ""}
                    onClick={() => setCommentExpanded(c.id, true)}
                  >
                    <span className="cp-kind">{c.kind}</span>
                    {c.text.trim() || "(No text)"}
                  </button>
                  <button
                    type="button"
                    className="cp-delete"
                    title="Delete"
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
          )}
          <CommentPanel variant="sidebar" />
        </aside>
      )}
    </>
  );
}
