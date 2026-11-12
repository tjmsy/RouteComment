import { useCallback, useRef } from "react";
import { parseGpx } from "../lib/gpx";
import {
  downloadBlob,
  loadProjectZip,
  saveProjectZip,
} from "../lib/projectZip";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { t } from "../i18n";

async function readImageSize(
  url: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(t("io.failedLoadImage")));
    img.src = url;
  });
}

/** Keep Unicode letters; strip path-illegal characters for download names. */
function sanitizeDownloadName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .trim();
  return cleaned.slice(0, 80) || "project";
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
  const requestMapFit = useUiStore((s) => s.requestMapFit);
  const screen = useUiStore((s) => s.screen);

  const onGpx = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const text = await file.text();
      try {
        const points = parseGpx(text);
        if (points.length === 0) {
          setStatusMessage(t("io.noTrackPoints"));
          return;
        }
        setTrack(points);
        setAnimationTimeMs(0);
        markSetupGpxDone();
        requestMapFit();
        setStatusMessage(t("io.loadedTrackPoints", { count: points.length }));
        if (screen.kind === "createWizard") {
          dispatch({ type: "WIZARD_NEXT" });
        }
      } catch {
        setStatusMessage(t("io.failedParseGpx"));
      }
    },
    [
      dispatch,
      markSetupGpxDone,
      requestMapFit,
      screen.kind,
      setAnimationTimeMs,
      setStatusMessage,
      setTrack,
    ]
  );

  const onMapImage = useCallback(
    async (file: File | undefined, enterGeoref = true) => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      try {
        const size = await readImageSize(url);
        setMapImage(file, url, file.name, size);
        markSetupMapDone();
        setStatusMessage(t("io.mapPlaced"));
        if (screen.kind === "createWizard") {
          dispatch({ type: "WIZARD_NEXT" });
        } else if (enterGeoref) {
          resetGeorefAlign();
          dispatch({ type: "START_GEOREF" });
        }
      } catch {
        URL.revokeObjectURL(url);
        setStatusMessage(t("io.failedLoadMap"));
      }
    },
    [
      dispatch,
      markSetupMapDone,
      resetGeorefAlign,
      screen.kind,
      setMapImage,
      setStatusMessage,
    ]
  );

  const onSave = useCallback(async () => {
    try {
      const layers = useUiStore.getState().layerPrefsSnapshot();
      const blob = await saveProjectZip({ ...project, layers }, mapImageBlob);
      const name = sanitizeDownloadName(
        project.name || t("common.projectFallback")
      );
      downloadBlob(blob, `${name}.zip`);
      setStatusMessage(t("io.projectSaved"));
    } catch {
      setStatusMessage(t("io.failedSave"));
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
        loadProject(loaded.data, loaded.mapImageBlob, loaded.mapImageUrl, size);
        if (loaded.data.routePlans[0]) {
          setActiveRoutePlanId(loaded.data.routePlans[0].id);
        }
        setAnimationTimeMs(0);
        completeSetup();
        dispatch({ type: "LOAD_ZIP_SUCCESS" });
        useUiStore.getState().applyLayerPrefs(loaded.data.layers);
        requestMapFit();
        setStatusMessage(t("io.projectLoaded"));
      } catch (e) {
        setStatusMessage(
          e instanceof Error ? e.message : t("io.failedLoadZip")
        );
      }
    },
    [
      completeSetup,
      dispatch,
      loadProject,
      requestMapFit,
      setActiveRoutePlanId,
      setAnimationTimeMs,
      setStatusMessage,
    ]
  );

  return {
    mapInputRef,
    gpxInputRef,
    zipInputRef,
    onGpx,
    onMapImage,
    onSave,
    onLoadZip,
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
          // iOS: .gpx alone is often rejected; XML / octet-stream keeps it selectable.
          accept=".gpx,.xml,application/gpx+xml,application/xml,text/xml,application/octet-stream"
          hidden
          onChange={(e) => {
            void onGpx(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={zipInputRef}
          type="file"
          // Extension-only: pairing with application/zip makes some OS pickers
          // also list related types such as .osm.zip (not a RouteComment format).
          accept=".zip"
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
