import { pointerVerb } from "../../lib/mobile";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { CommentPanel } from "../CommentPanel";
import { useMobileLayout } from "../../hooks/useMobileLayout";

export function EditCommentBar() {
  const dispatch = useUiStore((s) => s.dispatch);
  const commentTool = useUiStore((s) => s.commentTool);
  const setCommentTool = useUiStore((s) => s.setCommentTool);
  const mobile = useMobileLayout();
  const verb = pointerVerb();

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
            onClick={() => setCommentTool("map")}
          >
            Pin
          </button>
          <button
            type="button"
            className={commentTool === "follow" ? "active" : ""}
            onClick={() => setCommentTool("follow")}
          >
            Follow
          </button>
          <button
            type="button"
            className={commentTool === "danmaku" ? "active" : ""}
            onClick={() => setCommentTool("danmaku")}
          >
            Danmaku
          </button>
        </div>
        <span className="hint tool-bar-hint">
          {commentTool === "follow"
            ? `${verb} the track to set a range`
            : commentTool === "danmaku"
              ? `${verb} the track to place (or use ＋ on Review for playhead)`
              : `${verb} the map to place a pin`}
        </span>
      </div>
      {!mobile && <CommentPanel />}
      {/* Keep project store subscribed for list updates */}
      <CommentListHint />
    </>
  );
}

function CommentListHint() {
  const n = useProjectStore((s) => s.project.comments.length);
  if (n === 0) return null;
  return (
    <p className="hint tool-bar-subhint">{n} comment(s) — tap markers to edit</p>
  );
}
