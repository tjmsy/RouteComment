import { useEffect, useRef, useState } from "react";
import { pointerVerb } from "../../lib/mobile";
import { PLAN_COLORS } from "../../lib/types";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { t } from "../../i18n";

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
  const [colorOpen, setColorOpen] = useState(false);
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const colorWrapRef = useRef<HTMLDivElement>(null);
  const planMenuRef = useRef<HTMLDivElement>(null);
  const verb = pointerVerb();

  const activePlan =
    project.routePlans.find((p) => p.id === activeRoutePlanId) ??
    project.routePlans[0] ??
    null;

  useEffect(() => {
    setConfirmAction(null);
    setColorOpen(false);
    setPlanMenuOpen(false);
  }, [activePlan?.id]);

  useEffect(() => {
    if (!colorOpen && !planMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (colorOpen && colorWrapRef.current && !colorWrapRef.current.contains(t)) {
        setColorOpen(false);
      }
      if (planMenuOpen && planMenuRef.current && !planMenuRef.current.contains(t)) {
        setPlanMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colorOpen, planMenuOpen]);

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
        {t("plan.done")}
      </button>
      <button
        type="button"
        disabled={!activePlan || activePlan.coordinates.length === 0}
        onClick={() => activePlan && undoPlanCoordinate(activePlan.id)}
      >
        {t("plan.undo")}
      </button>
      <button
        type="button"
        onClick={() => {
          const id = addRoutePlan();
          setActiveRoutePlanId(id);
        }}
      >
        {t("plan.add")}
      </button>
      {project.routePlans.length > 0 && (
        <div className="plan-picker" ref={planMenuRef}>
          <button
            type="button"
            className="plan-picker-trigger"
            aria-haspopup="listbox"
            aria-expanded={planMenuOpen}
            aria-label={t("plan.activeAria")}
            onClick={() => {
              setPlanMenuOpen((o) => !o);
              setColorOpen(false);
            }}
          >
            {activePlan && (
              <span
                className="plan-picker-swatch"
                style={{ background: activePlan.color }}
                aria-hidden
              />
            )}
            <span className="plan-picker-label">
              {activePlan?.name ?? t("plan.select")}
            </span>
            <span className="plan-picker-caret" aria-hidden>
              ▾
            </span>
          </button>
          {planMenuOpen && (
            <ul className="plan-picker-menu" role="listbox">
              {project.routePlans.map((p) => (
                <li key={p.id} role="option" aria-selected={p.id === activePlan?.id}>
                  <button
                    type="button"
                    className={
                      p.id === activePlan?.id
                        ? "plan-picker-option plan-picker-option--active"
                        : "plan-picker-option"
                    }
                    onClick={() => {
                      setConfirmAction(null);
                      setActiveRoutePlanId(p.id);
                      setPlanMenuOpen(false);
                    }}
                  >
                    <span
                      className="plan-picker-swatch"
                      style={{ background: p.color }}
                      aria-hidden
                    />
                    <span>{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
          <div className="plan-color-picker" ref={colorWrapRef}>
            <button
              type="button"
              className="plan-color-trigger"
              aria-label={t("plan.colorAria")}
              aria-haspopup="true"
              aria-expanded={colorOpen}
              onClick={() => {
                setColorOpen((o) => !o);
                setPlanMenuOpen(false);
              }}
            >
              <span
                className="plan-color-swatch"
                style={{ background: activePlan.color }}
              />
              <span className="plan-picker-caret" aria-hidden>
                ▾
              </span>
            </button>
            {colorOpen && (
              <div
                className="plan-color-popover"
                role="listbox"
                aria-label={t("plan.colorsAria")}
              >
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
                    aria-label={t("plan.colorSwatchAria", { color: c })}
                    aria-selected={c === activePlan.color}
                    onClick={() => {
                      updateRoutePlan(activePlan.id, { color: c });
                      setColorOpen(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          {confirmAction == null ? (
            <>
              <button
                type="button"
                disabled={activePlan.coordinates.length === 0}
                onClick={() => setConfirmAction("clear")}
              >
                {t("plan.clearPath")}
              </button>
              <button type="button" onClick={() => setConfirmAction("delete")}>
                {t("plan.deletePlan")}
              </button>
            </>
          ) : confirmAction === "clear" ? (
            <div className="plan-action-confirm">
              <span>{t("plan.clearConfirm")}</span>
              <button
                type="button"
                className="btn-delete-confirm"
                onClick={() => {
                  clearPlanCoordinates(activePlan.id);
                  setConfirmAction(null);
                }}
              >
                {t("common.confirm")}
              </button>
              <button type="button" onClick={() => setConfirmAction(null)}>
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <div className="plan-action-confirm">
              <span>{t("plan.deleteConfirm")}</span>
              <button
                type="button"
                className="btn-delete-confirm"
                onClick={deleteActivePlan}
              >
                {t("common.confirm")}
              </button>
              <button type="button" onClick={() => setConfirmAction(null)}>
                {t("common.cancel")}
              </button>
            </div>
          )}
        </>
      )}
      {!activePlan && (
        <span className="hint">
          {t("plan.hintNoPlan", { verb: verb.toLowerCase() })}
        </span>
      )}
      {activePlan && (
        <span className="hint tool-bar-hint">
          {t("plan.hintEditing", {
            name: activePlan.name,
            verb: verb.toLowerCase(),
          })}
        </span>
      )}
    </div>
  );
}
