import { useEffect, useState } from "react";
import { pointerVerb } from "../../lib/mobile";
import { PLAN_COLORS } from "../../lib/types";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";

type ConfirmAction = null | "clear" | "delete";

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
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const verb = pointerVerb();

  const activePlan =
    project.routePlans.find((p) => p.id === activeRoutePlanId) ??
    project.routePlans[0] ??
    null;

  useEffect(() => {
    setConfirmAction(null);
  }, [activePlan?.id]);

  const deleteActivePlan = () => {
    if (!activePlan) return;
    const id = activePlan.id;
    removeRoutePlan(id);
    const rest = useProjectStore
      .getState()
      .project.routePlans.filter((p) => p.id !== id);
    setActiveRoutePlanId(rest[0]?.id ?? null);
    setConfirmAction(null);
  };

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
          onChange={(e) => {
            setConfirmAction(null);
            setActiveRoutePlanId(e.target.value || null);
          }}
          aria-label="Active plan"
        >
          {project.routePlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
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
          <div className="plan-color-swatches" role="group" aria-label="Plan color">
            {PLAN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={
                  c === activePlan.color
                    ? "plan-color-swatch plan-color-swatch--active"
                    : "plan-color-swatch"
                }
                style={{ background: c }}
                title={c}
                aria-label={`Color ${c}`}
                aria-pressed={c === activePlan.color}
                onClick={() => updateRoutePlan(activePlan.id, { color: c })}
              />
            ))}
          </div>
          {confirmAction == null ? (
            <>
              <button
                type="button"
                disabled={activePlan.coordinates.length === 0}
                onClick={() => setConfirmAction("clear")}
              >
                Clear path…
              </button>
              <button type="button" onClick={() => setConfirmAction("delete")}>
                Delete plan…
              </button>
            </>
          ) : confirmAction === "clear" ? (
            <div className="plan-action-confirm">
              <span>Clear all points?</span>
              <button
                type="button"
                className="btn-delete-confirm"
                onClick={() => {
                  clearPlanCoordinates(activePlan.id);
                  setConfirmAction(null);
                }}
              >
                Confirm
              </button>
              <button type="button" onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="plan-action-confirm">
              <span>Delete permanently?</span>
              <button
                type="button"
                className="btn-delete-confirm"
                onClick={deleteActivePlan}
              >
                Confirm
              </button>
              <button type="button" onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}
      {!activePlan && (
        <span className="hint">
          Add a plan first, then {verb.toLowerCase()} the map to draw.
        </span>
      )}
      {activePlan && (
        <span className="hint tool-bar-hint">
          Editing {activePlan.name} — {verb.toLowerCase()} map to add · drag
          handles to move · double-click / long-press a vertex to delete
        </span>
      )}
    </div>
  );
}
