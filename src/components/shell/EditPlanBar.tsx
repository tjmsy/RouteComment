import { PLAN_COLORS } from "../../lib/types";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";

export function EditPlanBar() {
  const dispatch = useUiStore((s) => s.dispatch);
  const project = useProjectStore((s) => s.project);
  const addRoutePlan = useProjectStore((s) => s.addRoutePlan);
  const removeRoutePlan = useProjectStore((s) => s.removeRoutePlan);
  const updateRoutePlan = useProjectStore((s) => s.updateRoutePlan);
  const undoPlanCoordinate = useProjectStore((s) => s.undoPlanCoordinate);
  const clearPlanCoordinates = useProjectStore((s) => s.clearPlanCoordinates);
  const activeRoutePlanId = useUiStore((s) => s.activeRoutePlanId);
  const setActiveRoutePlanId = useUiStore((s) => s.setActiveRoutePlanId);

  const activePlan =
    project.routePlans.find((p) => p.id === activeRoutePlanId) ??
    project.routePlans[0] ??
    null;

  return (
    <div className="tool-bar">
      <button
        type="button"
        className="btn-done"
        onClick={() => dispatch({ type: "TOOL_DONE" })}
      >
        Done
      </button>
      <button
        type="button"
        disabled={!activePlan || activePlan.coordinates.length === 0}
        onClick={() => activePlan && undoPlanCoordinate(activePlan.id)}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={() => {
          const id = addRoutePlan();
          setActiveRoutePlanId(id);
        }}
      >
        Add plan
      </button>
      {project.routePlans.length > 0 && (
        <select
          className="tool-bar-plan-select"
          value={activePlan?.id ?? ""}
          onChange={(e) => setActiveRoutePlanId(e.target.value || null)}
          aria-label="Active plan"
        >
          {project.routePlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.coordinates.length})
            </option>
          ))}
        </select>
      )}
      {activePlan && (
        <>
          <input
            className="tool-bar-name"
            value={activePlan.name}
            onChange={(e) =>
              updateRoutePlan(activePlan.id, { name: e.target.value })
            }
          />
          <select
            value={activePlan.color}
            onChange={(e) =>
              updateRoutePlan(activePlan.id, { color: e.target.value })
            }
            aria-label="Plan color"
          >
            {PLAN_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => clearPlanCoordinates(activePlan.id)}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              const id = activePlan.id;
              removeRoutePlan(id);
              const rest = useProjectStore
                .getState()
                .project.routePlans.filter((p) => p.id !== id);
              setActiveRoutePlanId(rest[0]?.id ?? null);
            }}
          >
            Delete
          </button>
        </>
      )}
      {!activePlan && (
        <span className="hint">Add a plan first, then tap the map to draw.</span>
      )}
      {activePlan && (
        <span className="hint tool-bar-hint">
          Editing {activePlan.name} — tap the map to add vertices.
        </span>
      )}
    </div>
  );
}
