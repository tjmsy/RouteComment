import { pointerVerb } from "../../lib/mobile";
import { useUiStore } from "../../store/uiStore";
import { CommentPanel } from "../CommentPanel";
import { useMobileLayout } from "../../hooks/useMobileLayout";
import { t } from "../../i18n";

function CommentToolControls() {
  const dispatch = useUiStore((s) => s.dispatch);
  const commentTool = useUiStore((s) => s.commentTool);
  const verb = pointerVerb();

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

export function EditCommentBar() {
  const mobile = useMobileLayout();

  return (
    <>
      {mobile ? (
        <div className="tool-bar tool-bar--comment">
          <CommentToolControls />
        </div>
      ) : (
        <aside className="comment-float-panel comment-float-panel--right">
          <CommentToolControls />
          <CommentPanel variant="sidebar" />
        </aside>
      )}
    </>
  );
}
