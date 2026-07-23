import { useCallback, useRef } from "react";
import { interpolateTrackPosition, parseGpx } from "../lib/gpx";
import {
  downloadBlob,
  loadProjectZip,
  saveProjectZip,
} from "../lib/projectZip";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";

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

/** Shared GPX / map / ZIP load-save used by empty, wizard, and project panel. */
export function useProjectIO() {
  const mapInputRef = useRef<HTMLInputElement>(null);
  const gpxInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const project = useProjectStore((s) => s.project);
  const mapImageBlob = useProjectStore((s) => s.mapImageBlob);
  const setMapImage = useProjectStore((s) => s.setMapImage);
  const setTrack = useProjectStore((s) => s.setTrack);
  const loadProject = useProjectStore((s) => s.loadProject);

  const dispatch = useUiStore((s) => s.dispatch);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);
  const setAnimationTimeMs = useUiStore((s) => s.setAnimationTimeMs);
  const setActiveRoutePlanId = useUiStore((s) => s.setActiveRoutePlanId);
  const markSetupGpxDone = useUiStore((s) => s.markSetupGpxDone);
  const markSetupMapDone = useUiStore((s) => s.markSetupMapDone);
  const completeSetup = useUiStore((s) => s.completeSetup);
  const resetGeorefAlign = useUiStore((s) => s.resetGeorefAlign);
  const screen = useUiStore((s) => s.screen);

  const onGpx = useCallback(
    async (file: File | undefined) => {
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
        setStatusMessage(`Loaded ${points.length} track points.`);
        if (screen.kind === "createWizard") {
          dispatch({ type: "WIZARD_NEXT" });
        }
      } catch {
        setStatusMessage("Failed to parse GPX.");
      }
    },
    [
      dispatch,
      markSetupGpxDone,
      screen.kind,
      setAnimationTimeMs,
      setStatusMessage,
      setTrack,
    ],
  );

  const onMapImage = useCallback(
    async (file: File | undefined, enterGeoref = true) => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      try {
        const size = await readImageSize(url);
        setMapImage(file, url, file.name, size);
        markSetupMapDone();
        setStatusMessage("Map image placed on the map.");
        if (screen.kind === "createWizard") {
          dispatch({ type: "WIZARD_NEXT" });
        } else if (enterGeoref) {
          resetGeorefAlign();
          dispatch({ type: "START_GEOREF" });
        }
      } catch {
        URL.revokeObjectURL(url);
        setStatusMessage("Failed to load map image.");
      }
    },
    [
      dispatch,
      markSetupMapDone,
      resetGeorefAlign,
      screen.kind,
      setMapImage,
      setStatusMessage,
    ],
  );

  const onSave = useCallback(async () => {
    try {
      const blob = await saveProjectZip(project, mapImageBlob);
      const name = (project.name || "project").replace(/[^\w-]+/g, "_");
      downloadBlob(blob, `${name}.zip`);
      setStatusMessage("Project saved.");
    } catch {
      setStatusMessage("Failed to save project.");
    }
  }, [mapImageBlob, project, setStatusMessage]);

  const onLoadZip = useCallback(
    async (file: File | undefined) => {
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
        dispatch({ type: "LOAD_ZIP_SUCCESS" });
        setStatusMessage("Project loaded.");
      } catch (e) {
        setStatusMessage(
          e instanceof Error ? e.message : "Failed to load project ZIP.",
        );
      }
    },
    [
      completeSetup,
      dispatch,
      loadProject,
      setActiveRoutePlanId,
      setAnimationTimeMs,
      setStatusMessage,
    ],
  );

  const addDanmakuAtPlayhead = useCallback(() => {
    const points = useProjectStore.getState().project.track.points;
    if (points.length === 0) {
      setStatusMessage("Load a GPS track before adding a danmaku comment.");
      return;
    }
    const t = useUiStore.getState().animationTimeMs;
    const pos = interpolateTrackPosition(points, t);
    if (!pos) return;
    const id = useProjectStore.getState().addComment({
      kind: "danmaku",
      lng: pos.lng,
      lat: pos.lat,
      text: "",
      timeStartMs: t,
    });
    useUiStore.getState().setCommentExpanded(id, true);
    setStatusMessage("Danmaku added at the current playback time.");
  }, [setStatusMessage]);

  return {
    mapInputRef,
    gpxInputRef,
    zipInputRef,
    onGpx,
    onMapImage,
    onSave,
    onLoadZip,
    addDanmakuAtPlayhead,
    hiddenInputs: (
      <>
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
      </>
    ),
  };
}
