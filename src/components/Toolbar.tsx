import { useRef } from "react";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { parseGpx } from "../lib/gpx";
import {
  downloadBlob,
  loadProjectZip,
  saveProjectZip,
} from "../lib/projectZip";
import { PLAN_COLORS, type AppMode } from "../lib/types";
import { CommentPanel } from "./CommentPanel";

/** Primary workspace modes (Georef lives under Event setup). */
const MODES: { id: Exclude<AppMode, "georef">; label: string }[] = [
  { id: "view", label: "View" },
  { id: "plan", label: "Plan" },
  { id: "comment", label: "Comment" },
];

async function readImageSize(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

export function Toolbar() {
  const mapInputRef = useRef<HTMLInputElement>(null);
  const gpxInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const project = useProjectStore((s) => s.project);
  const mapImageBlob = useProjectStore((s) => s.mapImageBlob);
  const setName = useProjectStore((s) => s.setName);
  const setMapImage = useProjectStore((s) => s.setMapImage);
  const setTrack = useProjectStore((s) => s.setTrack);
  const loadProject = useProjectStore((s) => s.loadProject);
  const addRoutePlan = useProjectStore((s) => s.addRoutePlan);
  const removeRoutePlan = useProjectStore((s) => s.removeRoutePlan);
  const updateRoutePlan = useProjectStore((s) => s.updateRoutePlan);
  const undoPlanCoordinate = useProjectStore((s) => s.undoPlanCoordinate);
  const clearPlanCoordinates = useProjectStore((s) => s.clearPlanCoordinates);
  const togglePlanVisible = useProjectStore((s) => s.togglePlanVisible);

  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  const showTrack = useUiStore((s) => s.showTrack);
  const setShowTrack = useUiStore((s) => s.setShowTrack);
  const showBasemap = useUiStore((s) => s.showBasemap);
  const setShowBasemap = useUiStore((s) => s.setShowBasemap);
  const mapOpacity = useUiStore((s) => s.mapOpacity);
  const setMapOpacity = useUiStore((s) => s.setMapOpacity);
  const terrain3d = useUiStore((s) => s.terrain3d);
  const setTerrain3d = useUiStore((s) => s.setTerrain3d);
  const setupGpxDone = useUiStore((s) => s.setupGpxDone);
  const setupMapDone = useUiStore((s) => s.setupMapDone);
  const markSetupGpxDone = useUiStore((s) => s.markSetupGpxDone);
  const markSetupMapDone = useUiStore((s) => s.markSetupMapDone);
  const skipSetupGpx = useUiStore((s) => s.skipSetupGpx);
  const skipSetupMap = useUiStore((s) => s.skipSetupMap);
  const completeSetup = useUiStore((s) => s.completeSetup);
  const activeRoutePlanId = useUiStore((s) => s.activeRoutePlanId);
  const setActiveRoutePlanId = useUiStore((s) => s.setActiveRoutePlanId);
  const statusMessage = useUiStore((s) => s.statusMessage);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);
  const setAnimationTimeMs = useUiStore((s) => s.setAnimationTimeMs);
  const resetGeorefAlign = useUiStore((s) => s.resetGeorefAlign);
  const commentTool = useUiStore((s) => s.commentTool);
  const setCommentTool = useUiStore((s) => s.setCommentTool);
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);
  const addComment = useProjectStore((s) => s.addComment);

  const setupComplete = setupGpxDone && setupMapDone;

  const activePlan =
    project.routePlans.find((p) => p.id === activeRoutePlanId) ??
    project.routePlans[0];

  const onMapImage = async (file: File | undefined) => {
    if (!file) return;
    if (!setupGpxDone) {
      setStatusMessage(
        "Load GPX first (or Skip) so the map zooms to the course area.",
      );
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const size = await readImageSize(url);
      setMapImage(file, url, file.name, size);
      markSetupMapDone();
      setMode("georef");
      resetGeorefAlign();
      setStatusMessage(
        "Map image placed on the map. Click a feature on the overlay, then the matching basemap point.",
      );
    } catch {
      URL.revokeObjectURL(url);
      setStatusMessage("Failed to load map image.");
    }
  };

  const onGpx = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    try {
      const points = parseGpx(text);
      if (points.length === 0) {
        setStatusMessage("No track points found in GPX.");
        return;
      }
      setTrack(points);
      setAnimationTimeMs(0);
      markSetupGpxDone();
      setStatusMessage(
        setupMapDone
          ? `Loaded ${points.length} track points.`
          : `Loaded ${points.length} track points. Add a map image to georeference, or Skip to continue without one.`,
      );
    } catch {
      setStatusMessage("Failed to parse GPX.");
    }
  };

  const onSave = async () => {
    try {
      const blob = await saveProjectZip(project, mapImageBlob);
      const name = (project.name || "project").replace(/[^\w-]+/g, "_");
      downloadBlob(blob, `${name}.zip`);
      setStatusMessage("Project saved.");
    } catch {
      setStatusMessage("Failed to save project.");
    }
  };

  const onLoadZip = async (file: File | undefined) => {
    if (!file) return;
    try {
      const loaded = await loadProjectZip(file);
      let size: { width: number; height: number } | null = null;
      if (loaded.mapImageUrl) {
        size = await readImageSize(loaded.mapImageUrl);
      }
      loadProject(
        loaded.data,
        loaded.mapImageBlob,
        loaded.mapImageUrl,
        size,
      );
      if (loaded.data.routePlans[0]) {
        setActiveRoutePlanId(loaded.data.routePlans[0].id);
      }
      setAnimationTimeMs(0);
      completeSetup();
      setMode("view");
      setStatusMessage("Project loaded.");
    } catch (e) {
      setStatusMessage(
        e instanceof Error ? e.message : "Failed to load project ZIP.",
      );
    }
  };

  const enterGeoref = () => {
    if (!setupGpxDone) {
      setStatusMessage(
        "Load GPX first (or Skip) so the map zooms to the course area.",
      );
      return;
    }
    if (!project.mapImage) {
      setStatusMessage("Load a map image first (Event setup → Map image).");
      return;
    }
    markSetupMapDone();
    setMode("georef");
    resetGeorefAlign();
  };

  const onSkipGpx = () => {
    skipSetupGpx();
  };

  const onSkipMap = () => {
    skipSetupMap();
  };

  return (
    <aside className="toolbar">
      <div className="brand">
        <h1>RouteComment</h1>
        <p className="tagline">Orienteering review</p>
      </div>

      <div
        className={
          setupComplete
            ? "mode-row mode-row-main"
            : "mode-row mode-row-main mode-row-locked"
        }
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={mode === m.id && setupComplete ? "active" : ""}
            disabled={!setupComplete}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <details
        className="panel event-setup"
        {...(!setupComplete || mode === "georef" ? { open: true as const } : {})}
      >
        <summary>Event setup</summary>
        <label className="field">
          <span>Event / project name</span>
          <input
            type="text"
            value={project.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Local meet 2026"
          />
        </label>

        {!setupComplete && !setupGpxDone && (
          <p className="hint setup-hint">
            Start with GPX so the map jumps to the competition area, then add
            the map image.
          </p>
        )}
        {!setupComplete && setupGpxDone && !setupMapDone && (
          <p className="hint setup-hint">
            Add a map image to georeference, or Skip to continue without one.
          </p>
        )}

        <div className="setup-step">
          <div className="btn-row">
            <button
              type="button"
              className={!setupGpxDone ? "setup-primary" : ""}
              onClick={() => gpxInputRef.current?.click()}
            >
              GPX
            </button>
            {!setupComplete && !setupGpxDone && (
              <button type="button" className="btn-skip" onClick={onSkipGpx}>
                Skip GPX
              </button>
            )}
          </div>
        </div>

        <div className="setup-step">
          <div className="btn-row">
            <button
              type="button"
              className={
                setupGpxDone && !setupMapDone ? "setup-primary" : ""
              }
              disabled={!setupGpxDone}
              title={
                setupGpxDone
                  ? undefined
                  : "Load GPX first (or Skip) so the map zooms to the course area."
              }
              onClick={() => mapInputRef.current?.click()}
            >
              Map image
            </button>
            {!setupComplete && setupGpxDone && !setupMapDone && (
              <button type="button" className="btn-skip" onClick={onSkipMap}>
                Skip map
              </button>
            )}
          </div>
          {!setupGpxDone && (
            <p className="hint">
              Load GPX first (or Skip) so the map zooms to the course area.
            </p>
          )}
        </div>

        <div className="btn-row">
          <button type="button" onClick={onSave}>
            Save ZIP
          </button>
          <button type="button" onClick={() => zipInputRef.current?.click()}>
            Load ZIP
          </button>
        </div>
        <input
          ref={mapInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            void onMapImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={gpxInputRef}
          type="file"
          accept=".gpx,application/gpx+xml,text/xml"
          hidden
          onChange={(e) => {
            void onGpx(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            void onLoadZip(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="event-georef-block">
          <button
            type="button"
            className={mode === "georef" ? "active-mode-btn" : ""}
            disabled={!setupGpxDone || !project.mapImage}
            onClick={enterGeoref}
          >
            Georeference map
          </button>
          {mode === "georef" && (
            <>
              <p className="hint">
                Two-point align:
                <br />
                1) Overlay feature → matching basemap point (move)
                <br />
                2) Second overlay feature → basemap point (rotate/scale)
                <br />
                After a full cycle, click overlay again to fine-tune, or leave and
                re-enter Georeference to start over.
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
            </>
          )}
        </div>
      </details>

      <details className="panel layers-panel" open>
        <summary>Layers</summary>
        {(project.track.points.length > 0 || project.mapImage) && (
          <label className="check">
            <input
              type="checkbox"
              checked={showBasemap}
              onChange={(e) => setShowBasemap(e.target.checked)}
            />
            Basemap
          </label>
        )}
        {project.track.points.length > 0 && (
          <label className="check">
            <input
              type="checkbox"
              checked={showTrack}
              onChange={(e) => setShowTrack(e.target.checked)}
            />
            GPS track
          </label>
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
        {project.track.points.length > 0 && (
          <label className="check">
            <input
              type="checkbox"
              checked={terrain3d}
              onChange={(e) => setTerrain3d(e.target.checked)}
            />
            Terrain 3D
          </label>
        )}
        {project.track.points.length === 0 &&
          project.routePlans.length === 0 &&
          !project.mapImage && (
            <p className="hint">Open Event setup to load a map or GPX.</p>
          )}
      </details>

      {mode === "comment" && (
        <section className="panel">
          <h2>Comment tool</h2>
          <div className="mode-row comment-tool-row">
            <button
              type="button"
              className={commentTool === "map" ? "active" : ""}
              onClick={() => setCommentTool("map")}
            >
              Map pin
            </button>
            <button
              type="button"
              className={commentTool === "follow" ? "active" : ""}
              onClick={() => setCommentTool("follow")}
            >
              Follow
            </button>
            <button
              type="button"
              className={commentTool === "danmaku" ? "active" : ""}
              onClick={() => setCommentTool("danmaku")}
            >
              Danmaku
            </button>
          </div>
          <p className="hint">
            {commentTool === "map"
              ? "Click the map to place a bubble. Drag the icon to move it; click to open the popup."
              : commentTool === "follow"
                ? "Click or drag along the GPS track to set a time range. The bubble follows the runner in that range."
                : "Adds a scrolling comment that fires once at the current playback time (set time in View mode first)."}
          </p>
          {commentTool === "danmaku" && (
            <button
              type="button"
              className="btn-add-danmaku"
              onClick={() => {
                if (project.track.points.length === 0) {
                  setStatusMessage(
                    "Load a GPS track before adding a danmaku comment.",
                  );
                  return;
                }
                const id = addComment({
                  kind: "danmaku",
                  lng: 0,
                  lat: 0,
                  text: "",
                  timeStartMs: animationTimeMs,
                });
                setCommentExpanded(id, true);
                setStatusMessage(
                  "Danmaku added at the current playback time. Edit text in the panel.",
                );
              }}
            >
              Add danmaku at current time
            </button>
          )}
        </section>
      )}

      <CommentPanel />

      {mode === "plan" && (
        <section className="panel">
          <h2>Route plans</h2>
          {project.routePlans.length === 0 && (
            <p className="hint">No plans yet. Add one to start drawing.</p>
          )}
          <ul className="plan-list">
            {project.routePlans.map((plan) => (
              <li key={plan.id} className="plan-list-item">
                <button
                  type="button"
                  className={
                    plan.id === activePlan?.id
                      ? "plan-select active"
                      : "plan-select"
                  }
                  onClick={() => setActiveRoutePlanId(plan.id)}
                >
                  <span
                    className="plan-swatch"
                    style={{ background: plan.color }}
                  />
                  <input
                    type="text"
                    value={plan.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updateRoutePlan(plan.id, { name: e.target.value })
                    }
                  />
                </button>
                <input
                  type="color"
                  value={plan.color}
                  title="Color"
                  list="plan-color-presets"
                  onChange={(e) =>
                    updateRoutePlan(plan.id, { color: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="plan-remove"
                  title="Remove plan"
                  onClick={() => {
                    removeRoutePlan(plan.id);
                    if (activeRoutePlanId === plan.id) {
                      const next = project.routePlans.find(
                        (p) => p.id !== plan.id,
                      );
                      setActiveRoutePlanId(next?.id ?? null);
                    }
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <datalist id="plan-color-presets">
            {PLAN_COLORS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => {
              const id = addRoutePlan();
              setActiveRoutePlanId(id);
            }}
          >
            Add plan
          </button>
          {activePlan && (
            <>
              <p className="hint">
                Editing <strong>{activePlan.name}</strong> —{" "}
                {activePlan.coordinates.length} vertices. Click the map to add.
              </p>
              <label className="field">
                <span>Line width ({activePlan.lineWidth ?? 3})</span>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={activePlan.lineWidth ?? 3}
                  onChange={(e) =>
                    updateRoutePlan(activePlan.id, {
                      lineWidth: Number(e.target.value),
                    })
                  }
                />
              </label>
              <div className="btn-row">
                <button
                  type="button"
                  onClick={() => undoPlanCoordinate(activePlan.id)}
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => clearPlanCoordinates(activePlan.id)}
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {statusMessage && <p className="status">{statusMessage}</p>}
    </aside>
  );
}
