import { pointerVerb } from "../../lib/mobile";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore, type GeorefStep } from "../../store/uiStore";
import { t } from "../../i18n";

function georefStepHint(step: GeorefStep): string {
  const verb = pointerVerb().toLowerCase();
  switch (step) {
    case 0:
      return t("status.georef0", { verb });
    case 1:
      return t("status.georef1", { verb });
    case 2:
      return t("status.georef2", { verb });
    case 3:
      return t("status.georef3", { verb });
  }
}

export function GeorefBar() {
  const dispatch = useUiStore((s) => s.dispatch);
  const mapOpacity = useUiStore((s) => s.mapOpacity);
  const setMapOpacity = useUiStore((s) => s.setMapOpacity);
  const georefStep = useUiStore((s) => s.georefStep);
  const project = useProjectStore((s) => s.project);

  return (
    <div className="tool-bar georef-bar">
      <button
        type="button"
        className="btn-done"
        onClick={() => dispatch({ type: "GEOREF_DONE" })}
      >
        {t("common.done")}
      </button>
      <p className="hint">{georefStepHint(georefStep)}</p>
      {project.mapImage && (
        <label className="field georef-opacity">
          <span>{t("georef.opacity")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={mapOpacity}
            onChange={(e) => setMapOpacity(Number(e.target.value))}
          />
        </label>
      )}
    </div>
  );
}
