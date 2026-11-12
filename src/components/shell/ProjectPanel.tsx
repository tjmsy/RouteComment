import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { useProjectIO } from "../../hooks/useProjectIO";
import { formatDistanceKm } from "../../lib/trackProfile";
import { buildTrackSummary, formatSummaryTime } from "../../lib/trackSummary";
import { t } from "../../i18n";
import { PanelHost } from "./PanelHost";

export function ProjectPanel() {
  const project = useProjectStore((s) => s.project);
  const setName = useProjectStore((s) => s.setName);
  const elevationStatus = useUiStore((s) => s.elevationStatus);
  const dispatch = useUiStore((s) => s.dispatch);
  const resetGeorefAlign = useUiStore((s) => s.resetGeorefAlign);
  const { gpxInputRef, mapInputRef, zipInputRef, onSave, hiddenInputs } =
    useProjectIO();

  const trackSummary =
    project.track.points.length > 0
      ? buildTrackSummary(project.track.points)
      : null;
  const elevGainLoading =
    trackSummary != null &&
    elevationStatus === "loading" &&
    trackSummary.elevGainM == null;

  return (
    <PanelHost
      title={t("project.title")}
      side="right"
      footer={
        <div className="btn-row panel-host-footer-actions">
          <button
            type="button"
            className="setup-primary"
            onClick={() => void onSave()}
          >
            {t("project.saveZip")}
          </button>
          <button type="button" onClick={() => zipInputRef.current?.click()}>
            {t("project.loadZip")}
          </button>
        </div>
      }
    >
      <label className="field">
        <span>{t("project.name")}</span>
        <input
          type="text"
          value={project.name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("project.namePlaceholder")}
        />
      </label>

      {trackSummary && (
        <dl className="summary-stats">
          <div className="summary-stat">
            <dt>{t("project.distance")}</dt>
            <dd>{formatDistanceKm(trackSummary.totalDistanceM)}</dd>
          </div>
          <div className="summary-stat">
            <dt>{t("project.time")}</dt>
            <dd>{formatSummaryTime(trackSummary.durationMs)}</dd>
          </div>
          {(trackSummary.elevGainM != null || elevGainLoading) && (
            <div className="summary-stat">
              <dt>{t("project.elevGain")}</dt>
              <dd>
                {elevGainLoading
                  ? "…"
                  : `${trackSummary.elevGainM}\u00a0${t("project.unitM")}`}
              </dd>
            </div>
          )}
          {trackSummary.avgHeartRate != null && (
            <div className="summary-stat">
              <dt>{t("project.avgHr")}</dt>
              <dd>
                {trackSummary.avgHeartRate}&nbsp;{t("project.unitBpm")}
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="btn-row">
        <button type="button" onClick={() => gpxInputRef.current?.click()}>
          {t("project.gpx")}
        </button>
        <button type="button" onClick={() => mapInputRef.current?.click()}>
          {t("project.mapImage")}
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
          {t("project.georeference")}
        </button>
      </div>
      {hiddenInputs}
    </PanelHost>
  );
}
