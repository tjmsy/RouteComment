import { useEffect } from "react";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { useProjectIO } from "../../hooks/useProjectIO";
import { pointerVerb } from "../../lib/mobile";
import { t } from "../../i18n";

export function CreateWizard() {
  const screen = useUiStore((s) => s.screen);
  const dispatch = useUiStore((s) => s.dispatch);
  const mapOpacity = useUiStore((s) => s.mapOpacity);
  const setMapOpacity = useUiStore((s) => s.setMapOpacity);
  const markSetupGpxDone = useUiStore((s) => s.markSetupGpxDone);
  const markSetupMapDone = useUiStore((s) => s.markSetupMapDone);
  const completeSetup = useUiStore((s) => s.completeSetup);
  const resetGeorefAlign = useUiStore((s) => s.resetGeorefAlign);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);
  const project = useProjectStore((s) => s.project);
  const clearMapImage = useProjectStore((s) => s.clearMapImage);
  const { gpxInputRef, mapInputRef, hiddenInputs } = useProjectIO();

  const wizardStep = screen.kind === "createWizard" ? screen.step : null;

  useEffect(() => {
    if (wizardStep === "georef" && project.mapImage) {
      resetGeorefAlign();
    }
  }, [wizardStep, project.mapImage, resetGeorefAlign]);

  if (screen.kind !== "createWizard") return null;
  const step = screen.step;
  const verb = pointerVerb();

  const finish = () => {
    completeSetup();
    dispatch({ type: "WIZARD_DONE" });
  };

  const cancelMapImage = () => {
    clearMapImage();
    setStatusMessage(t("wizard.mapRemoved"));
    dispatch({ type: "WIZARD_BACK" });
  };

  return (
    <div className="create-wizard">
      <header className="create-wizard-header">
        <h1>{t("wizard.title")}</h1>
        {step !== "georef" && (
          <button type="button" className="btn-done" onClick={finish}>
            {t("common.done")}
          </button>
        )}
      </header>

      {step === "gpx" && (
        <section className="panel">
          <p className="hint">{t("wizard.gpxHint")}</p>
          <div className="btn-row">
            <button
              type="button"
              className="setup-primary"
              onClick={() => gpxInputRef.current?.click()}
            >
              {t("wizard.gpx")}
            </button>
            <button
              type="button"
              className="btn-skip"
              onClick={() => {
                markSetupGpxDone();
                dispatch({ type: "WIZARD_SKIP" });
              }}
            >
              {t("wizard.skipGpx")}
            </button>
          </div>
        </section>
      )}

      {step === "map" && (
        <section className="panel">
          <p className="hint">
            {t("wizard.mapHint")}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="setup-primary"
              onClick={() => mapInputRef.current?.click()}
            >
              {t("wizard.mapImage")}
            </button>
            <button
              type="button"
              className="btn-skip"
              onClick={() => {
                markSetupMapDone();
                completeSetup();
                dispatch({ type: "WIZARD_SKIP" });
              }}
            >
              {t("wizard.skipMap")}
            </button>
          </div>
        </section>
      )}

      {step === "georef" && (
        <section className="panel">
          <p className="hint">
            {t("wizard.georefHint", { verb: verb.toLowerCase() })}
          </p>
          {project.mapImage && (
            <label className="field">
              <span>{t("wizard.mapOpacity")}</span>
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
          <div className="btn-row">
            <button type="button" className="btn-skip" onClick={cancelMapImage}>
              {t("wizard.cancelMap")}
            </button>
            <button type="button" className="btn-done" onClick={finish}>
              {t("common.done")}
            </button>
          </div>
        </section>
      )}

      {hiddenInputs}
    </div>
  );
}
