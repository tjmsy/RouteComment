import { useRef } from "react";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { parseGpx } from "../lib/gpx";
import {
  downloadBlob,
  loadProjectZip,
  saveProjectZip,
} from "../lib/projectZip";
import type { AppMode } from "../lib/types";

const MODES: { id: AppMode; label: string }[] = [
  { id: "view", label: "View" },
  { id: "georef", label: "Georef" },
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
  const undoPlanCoordinate = useProjectStore((s) => s.undoPlanCoordinate);
  const clearPlanCoordinates = useProjectStore((s) => s.clearPlanCoordinates);
  const togglePlanVisible = useProjectStore((s) => s.togglePlanVisible);

  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  const showTrack = useUiStore((s) => s.showTrack);
  const setShowTrack = useUiStore((s) => s.setShowTrack);
  const mapOpacity = useUiStore((s) => s.mapOpacity);
  const setMapOpacity = useUiStore((s) => s.setMapOpacity);
  const activeRoutePlanId = useUiStore((s) => s.activeRoutePlanId);
  const setActiveRoutePlanId = useUiStore((s) => s.setActiveRoutePlanId);
  const statusMessage = useUiStore((s) => s.statusMessage);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);
  const setAnimationTimeMs = useUiStore((s) => s.setAnimationTimeMs);
  const resetGeorefAlign = useUiStore((s) => s.resetGeorefAlign);

  const activePlan =
    project.routePlans.find((p) => p.id === activeRoutePlanId) ??
    project.routePlans[0];

  const onMapImage = async (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const size = await readImageSize(url);
      setMapImage(file, url, file.name, size);
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
      setStatusMessage(`Loaded ${points.length} track points.`);
    } catch {
      setStatusMessage("Failed to parse GPX.");
    }
  };

  const onSave = async () => {
    try {
      const blob = await saveProjectZip(project, mapImageBlob);
      const name = (project.name || "project").replace(/[^\w\-]+/g, "_");
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
      setMode("view");
      setStatusMessage("Project loaded.");
    } catch (e) {
      setStatusMessage(
        e instanceof Error ? e.message : "Failed to load project ZIP.",
      );
    }
  };

  return (
    <aside className="toolbar">
      <div className="brand">
        <h1>RouteComment</h1>
        <p className="tagline">Orienteering review</p>
      </div>

      <label className="field">
        <span>Project</span>
        <input
          type="text"
          value={project.name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="mode-row">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={mode === m.id ? "active" : ""}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <section className="panel">
        <h2>Files</h2>
        <div className="btn-row">
          <button type="button" onClick={() => mapInputRef.current?.click()}>
            Map image
          </button>
          <button type="button" onClick={() => gpxInputRef.current?.click()}>
            GPX
          </button>
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
      </section>

      <section className="panel">
        <h2>Layers</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={showTrack}
            onChange={(e) => setShowTrack(e.target.checked)}
          />
          GPS track
        </label>
        {project.routePlans.map((plan) => (
          <label key={plan.id} className="check">
            <input
              type="checkbox"
              checked={plan.visible}
              onChange={() => togglePlanVisible(plan.id)}
            />
            {plan.name}
          </label>
        ))}
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
      </section>

      {mode === "georef" && (
        <section className="panel">
          <h2>Georeference</h2>
          <p className="hint">
            Two-point align (streetview-o style):
            <br />
            1) Click a feature on the overlay → matching basemap point (move)
            <br />
            2) Click a second overlay feature → matching basemap point
            (rotate/scale)
            <br />
            Zoom the map to pick precisely. Repeat to fine-tune.
          </p>
          <button type="button" onClick={resetGeorefAlign}>
            Reset align steps
          </button>
        </section>
      )}

      {mode === "plan" && activePlan && (
        <section className="panel">
          <h2>Route plan</h2>
          <p className="hint">
            Editing {activePlan.name} — {activePlan.coordinates.length} vertices
          </p>
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
        </section>
      )}

      {statusMessage && <p className="status">{statusMessage}</p>}
    </aside>
  );
}
