import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { t } from "../../i18n";
import { PanelHost } from "./PanelHost";

export function LayersPanel() {
  const project = useProjectStore((s) => s.project);
  const togglePlanVisible = useProjectStore((s) => s.togglePlanVisible);
  const showTrack = useUiStore((s) => s.showTrack);
  const setShowTrack = useUiStore((s) => s.setShowTrack);
  const colorTrackBySpeed = useUiStore((s) => s.colorTrackBySpeed);
  const setColorTrackBySpeed = useUiStore((s) => s.setColorTrackBySpeed);
  const trackLineWidth = useUiStore((s) => s.trackLineWidth);
  const setTrackLineWidth = useUiStore((s) => s.setTrackLineWidth);
  const showBasemap = useUiStore((s) => s.showBasemap);
  const setShowBasemap = useUiStore((s) => s.setShowBasemap);
  const showProfileCharts = useUiStore((s) => s.showProfileCharts);
  const setShowProfileCharts = useUiStore((s) => s.setShowProfileCharts);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const elevationStatus = useUiStore((s) => s.elevationStatus);

  return (
    <PanelHost title={t("layers.title")} side="right">
      {(project.track.points.length > 0 || project.mapImage) && (
        <label
          className={`check${isPlaying ? " check--disabled" : ""}`}
          title={isPlaying ? t("layers.pauseBasemap") : undefined}
        >
          <input
            type="checkbox"
            checked={showBasemap}
            disabled={isPlaying}
            onChange={(e) => setShowBasemap(e.target.checked)}
          />
          {t("layers.basemap")}
        </label>
      )}
      {project.track.points.length > 0 && (
        <label className="check">
          <input
            type="checkbox"
            checked={showTrack}
            onChange={(e) => setShowTrack(e.target.checked)}
          />
          {t("layers.gpsTrack")}
        </label>
      )}
      {project.track.points.length > 0 && showTrack && (
        <label className="check">
          <input
            type="checkbox"
            checked={colorTrackBySpeed}
            onChange={(e) => setColorTrackBySpeed(e.target.checked)}
          />
          {t("layers.colorBySpeed")}
        </label>
      )}
      {project.track.points.length > 0 && showTrack && (
        <label className="field">
          <span>{t("layers.trackWidth", { width: trackLineWidth })}</span>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={trackLineWidth}
            onChange={(e) => setTrackLineWidth(Number(e.target.value))}
          />
        </label>
      )}
      {project.track.points.length > 0 && (
        <label className="check">
          <input
            type="checkbox"
            checked={showProfileCharts}
            onChange={(e) => setShowProfileCharts(e.target.checked)}
          />
          {t("layers.profileCharts")}
        </label>
      )}
      {elevationStatus === "failed" && (
        <p className="hint">{t("layers.elevationFailed")}</p>
      )}
      {project.routePlans.map((plan) => (
        <label key={plan.id} className="check plan-layer-row">
          <input
            type="checkbox"
            checked={plan.visible}
            onChange={() => togglePlanVisible(plan.id)}
          />
          <span
            className="plan-swatch"
            style={{ background: plan.color }}
            aria-hidden
          />
          {plan.name}
        </label>
      ))}
    </PanelHost>
  );
}
