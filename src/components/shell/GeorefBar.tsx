import { pointerVerb } from "../../lib/mobile";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { t } from "../../i18n";

export function GeorefBar() {
  const dispatch = useUiStore((s) => s.dispatch);
  const mapOpacity = useUiStore((s) => s.mapOpacity);
  const setMapOpacity = useUiStore((s) => s.setMapOpacity);
  const project = useProjectStore((s) => s.project);
  const verb = pointerVerb();

  return (
    <div className="tool-bar georef-bar">
      <button
        type="button"
        className="btn-done"
        onClick={() => dispatch({ type: "GEOREF_DONE" })}
      >
        {t("common.done")}
      </button>
      <p className="hint">{t("georef.hint", { verb })}</p>
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
