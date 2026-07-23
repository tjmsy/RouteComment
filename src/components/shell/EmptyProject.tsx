import { useProjectIO } from "../../hooks/useProjectIO";
import { useUiStore } from "../../store/uiStore";

export function EmptyProject() {
  const dispatch = useUiStore((s) => s.dispatch);
  const { zipInputRef, hiddenInputs } = useProjectIO();

  return (
    <div className="empty-project">
      <p className="empty-project-lead">Open or start a competition project</p>
      <div className="empty-project-actions">
        <button
          type="button"
          className="empty-cta"
          onClick={() => zipInputRef.current?.click()}
        >
          Load ZIP
        </button>
        <button
          type="button"
          className="empty-cta"
          onClick={() => dispatch({ type: "START_CREATE" })}
        >
          Create Project
        </button>
      </div>
      {hiddenInputs}
    </div>
  );
}
