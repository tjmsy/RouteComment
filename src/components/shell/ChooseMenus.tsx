import { interpolateTrackPosition } from "../../lib/gpx";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { PanelHost } from "./PanelHost";

function addDanmakuAtPlayhead() {
  const points = useProjectStore.getState().project.track.points;
  const setStatusMessage = useUiStore.getState().setStatusMessage;
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
  useUiStore.getState().setCommentExpanded(id, true);
  setStatusMessage("Danmaku added at the current playback time.");
}

export function ChooseEditMenu() {
  const dispatch = useUiStore((s) => s.dispatch);

  return (
    <PanelHost title="Edit" role="action">
      <div className="btn-row btn-row-stack">
        <button
          type="button"
          className="setup-primary"
          onClick={() => dispatch({ type: "SELECT_PLAN" })}
        >
          Plan
        </button>
        <button
          type="button"
          className="setup-primary"
          onClick={() => dispatch({ type: "SELECT_COMMENT" })}
        >
          Comment
        </button>
      </div>
    </PanelHost>
  );
}

export function ChooseCommentMenu() {
  const dispatch = useUiStore((s) => s.dispatch);
  const setCommentTool = useUiStore((s) => s.setCommentTool);

  return (
    <PanelHost title="Add comment" role="action">
      <div className="btn-row btn-row-stack">
        <button
          type="button"
          className="setup-primary"
          onClick={() => {
            setCommentTool("danmaku");
            dispatch({ type: "SELECT_COMMENT_KIND", kind: "danmaku" });
            addDanmakuAtPlayhead();
          }}
        >
          Danmaku at playhead
        </button>
        <button
          type="button"
          className="setup-primary"
          onClick={() => {
            setCommentTool("map");
            dispatch({ type: "SELECT_COMMENT_KIND", kind: "map" });
          }}
        >
          Map pin
        </button>
        <button
          type="button"
          className="setup-primary"
          onClick={() => {
            setCommentTool("follow");
            dispatch({ type: "SELECT_COMMENT_KIND", kind: "follow" });
          }}
        >
          Follow range
        </button>
      </div>
    </PanelHost>
  );
}
