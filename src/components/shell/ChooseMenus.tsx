import { useUiStore } from "../../store/uiStore";
import { PanelHost } from "./PanelHost";

export function ChooseEditMenu() {
  const dispatch = useUiStore((s) => s.dispatch);

  return (
    <PanelHost title="Edit" role="action" side="right">
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
