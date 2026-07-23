import { useEffect } from "react";
import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { useProjectIO } from "../../hooks/useProjectIO";
import { pointerVerb } from "../../lib/mobile";

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
    setStatusMessage("Map image removed. Load another, or skip map.");
    dispatch({ type: "WIZARD_BACK" });
  };

  return (
    <div className="create-wizard">
      <header className="create-wizard-header">
        <h1>Create project</h1>
        {step !== "georef" && (
          <button type="button" className="btn-done" onClick={finish}>
            Done
          </button>
        )}
      </header>

      {step === "gpx" && (
        <section className="panel">
          <p className="hint">Load a GPX so the map jumps to the course area.</p>
          <div className="btn-row">
            <button
              type="button"
              className="setup-primary"
              onClick={() => gpxInputRef.current?.click()}
            >
              GPX
            </button>
            <button
              type="button"
              className="btn-skip"
              onClick={() => {
                markSetupGpxDone();
                dispatch({ type: "WIZARD_SKIP" });
              }}
            >
              Skip GPX
            </button>
          </div>
        </section>
      )}

      {step === "map" && (
        <section className="panel">
          <p className="hint">
            Add a map image to georeference, or skip to continue without one.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="setup-primary"
              onClick={() => mapInputRef.current?.click()}
            >
              Map image
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
              Skip map
            </button>
          </div>
        </section>
      )}

      {step === "georef" && (
        <section className="panel">
          <p className="hint">
            Two-point align: {verb.toLowerCase()} overlay feature → basemap,
            then a second pair. When finished, tap Done.
          </p>
          {project.mapImage && (
            <label className="field">
              <span>Map opacity</span>
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
              Cancel map image
            </button>
            <button type="button" className="btn-done" onClick={finish}>
              Done
            </button>
          </div>
        </section>
      )}

      {hiddenInputs}
    </div>
  );
}
