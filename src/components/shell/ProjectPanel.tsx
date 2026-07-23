import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { useProjectIO } from "../../hooks/useProjectIO";
import { formatDistanceKm } from "../../lib/trackProfile";
import {
  buildTrackSummary,
  formatSummaryTime,
} from "../../lib/trackSummary";
import { PanelHost } from "./PanelHost";

export function ProjectPanel() {
  const project = useProjectStore((s) => s.project);
  const setName = useProjectStore((s) => s.setName);
  const elevationStatus = useUiStore((s) => s.elevationStatus);
  const dispatch = useUiStore((s) => s.dispatch);
  const resetGeorefAlign = useUiStore((s) => s.resetGeorefAlign);
  const {
    gpxInputRef,
    mapInputRef,
    zipInputRef,
    onSave,
    hiddenInputs,
  } = useProjectIO();

  const trackSummary =
    project.track.points.length > 0
      ? buildTrackSummary(project.track.points)
      : null;
  const elevGainLoading =
    trackSummary != null &&
    elevationStatus === "loading" &&
    trackSummary.elevGainM == null;

  return (
    <PanelHost title="Project">
      <label className="field">
        <span>Project name</span>
        <input
          type="text"
          value={project.name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Local meet 2026"
        />
      </label>

      {trackSummary && (
        <dl className="summary-stats">
          <div className="summary-stat">
            <dt>Distance</dt>
            <dd>{formatDistanceKm(trackSummary.totalDistanceM)}</dd>
          </div>
          <div className="summary-stat">
            <dt>Time</dt>
            <dd>{formatSummaryTime(trackSummary.durationMs)}</dd>
          </div>
          {(trackSummary.elevGainM != null || elevGainLoading) && (
            <div className="summary-stat">
              <dt>Elev gain</dt>
              <dd>
                {elevGainLoading ? "…" : `${trackSummary.elevGainM}\u00a0m`}
              </dd>
            </div>
          )}
          {trackSummary.avgHeartRate != null && (
            <div className="summary-stat">
              <dt>Avg HR</dt>
              <dd>{trackSummary.avgHeartRate}&nbsp;bpm</dd>
            </div>
          )}
        </dl>
      )}

      <div className="btn-row">
        <button type="button" onClick={() => gpxInputRef.current?.click()}>
          GPX
        </button>
        <button type="button" onClick={() => mapInputRef.current?.click()}>
          Map image
        </button>
      </div>
      <div className="btn-row">
        <button
          type="button"
          disabled={!project.mapImage}
          onClick={() => {
            if (!project.mapImage) return;
            resetGeorefAlign();
            dispatch({ type: "START_GEOREF" });
          }}
        >
          Georeference
        </button>
      </div>
      <div className="btn-row">
        <button type="button" onClick={() => void onSave()}>
          Save ZIP
        </button>
        <button type="button" onClick={() => zipInputRef.current?.click()}>
          Load ZIP
        </button>
      </div>
      {hiddenInputs}
    </PanelHost>
  );
}
