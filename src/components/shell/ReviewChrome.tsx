import { interpolateTrackPosition } from "../../lib/gpx";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { useMobileLayout } from "../../hooks/useMobileLayout";

/** Thin Review hub chrome: Project, name, Edit, Layers, +. */
export function ReviewChrome() {
  const screen = useUiStore((s) => s.screen);
  const dispatch = useUiStore((s) => s.dispatch);
  const name = useProjectStore((s) => s.project.name);
  const mobile = useMobileLayout();
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);

  const hideChrome =
    screen.kind === "empty" ||
    screen.kind === "createWizard" ||
    screen.kind === "georef";

  if (hideChrome) return null;

  const inTool = screen.kind === "editPlan" || screen.kind === "editComment";
  if (inTool) return null;

  const addDanmakuAtPlayhead = () => {
    const points = useProjectStore.getState().project.track.points;
    if (points.length === 0) {
      setStatusMessage("Load a GPS track before adding a danmaku comment.");
      return;
    }
    const t = useUiStore.getState().animationTimeMs;
    const pos = interpolateTrackPosition(points, t);
    if (!pos) return;
    const id = useProjectStore.getState().addComment({
      kind: "danmaku",
      lng: pos.lng,
      lat: pos.lat,
      text: "",
      timeStartMs: t,
    });
    setCommentExpanded(id, true);
    dispatch({ type: "SELECT_COMMENT" });
    useUiStore.getState().setCommentTool("danmaku");
    setStatusMessage("Danmaku added at the current playback time. Edit text below.");
  };

  return (
    <header className={`review-chrome${mobile ? " review-chrome--mobile" : ""}`}>
      <button
        type="button"
        className={screen.kind === "project" ? "active" : ""}
        onClick={() =>
          dispatch(
            screen.kind === "project"
              ? { type: "DISMISS" }
              : { type: "OPEN_PROJECT" },
          )
        }
      >
        Project
      </button>
      <span className="review-chrome-name" title={name}>
        {name || "Untitled"}
      </span>
      <div className="review-chrome-actions">
        <button
          type="button"
          title="Layers"
          aria-label="Layers"
          className={screen.kind === "layers" ? "active" : ""}
          onClick={() =>
            dispatch(
              screen.kind === "layers"
                ? { type: "DISMISS" }
                : { type: "OPEN_LAYERS" },
            )
          }
        >
          □
        </button>
        <button
          type="button"
          title="Add danmaku at playhead"
          aria-label="Add danmaku at playhead"
          onClick={addDanmakuAtPlayhead}
        >
          ＋
        </button>
        <button
          type="button"
          title="Edit"
          aria-label="Edit"
          onClick={() => dispatch({ type: "OPEN_EDIT_MENU" })}
        >
          ✎
        </button>
      </div>
    </header>
  );
}
