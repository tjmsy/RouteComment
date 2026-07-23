import { useUiStore } from "../../store/uiStore";
import { useProjectStore } from "../../store/projectStore";
import { useMobileLayout } from "../../hooks/useMobileLayout";

/** Thin Review hub chrome: Project, name, Edit, Layers, +. */
export function ReviewChrome() {
  const screen = useUiStore((s) => s.screen);
  const dispatch = useUiStore((s) => s.dispatch);
  const name = useProjectStore((s) => s.project.name);
  const mobile = useMobileLayout();

  const hideChrome =
    screen.kind === "empty" ||
    screen.kind === "createWizard" ||
    screen.kind === "georef";

  if (hideChrome) return null;

  const inTool = screen.kind === "editPlan" || screen.kind === "editComment";
  if (inTool) return null;

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
          title="Add comment at playhead"
          aria-label="Add comment at playhead"
          onClick={() => dispatch({ type: "OPEN_ADD_COMMENT" })}
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
