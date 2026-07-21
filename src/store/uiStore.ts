import { create } from "zustand";
import type { AppMode } from "../lib/types";

/** Two-point fine-tune steps (streetview-o style). */
export type GeorefStep = 0 | 1 | 2 | 3;

type LngLat = { lng: number; lat: number };

type UiState = {
  mode: AppMode;
  expandedCommentIds: string[];
  animationTimeMs: number;
  isPlaying: boolean;
  playbackSpeed: number;
  headingUp: boolean;
  commentTool: "map" | "follow" | "danmaku";
  /** Follow-range pick: waiting for start click, or end click after startMs. */
  followRangeStartMs: number | null;
  activeRoutePlanId: string | null;
  showTrack: boolean;
  showBasemap: boolean;
  mapOpacity: number;
  terrain3d: boolean;
  /** GPX loaded or skipped during onboarding. */
  setupGpxDone: boolean;
  /** Map image loaded or skipped during onboarding. */
  setupMapDone: boolean;
  georefStep: GeorefStep;
  georefPin: LngLat | null;
  georefPendingFrom: LngLat | null;
  statusMessage: string;

  setMode: (mode: AppMode) => void;
  toggleCommentExpanded: (id: string) => void;
  setCommentExpanded: (id: string, expanded: boolean) => void;
  clearExpandedComments: () => void;
  setAnimationTimeMs: (ms: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setHeadingUp: (on: boolean) => void;
  setCommentTool: (tool: "map" | "follow" | "danmaku") => void;
  setFollowRangeStartMs: (ms: number | null) => void;
  setActiveRoutePlanId: (id: string | null) => void;
  setShowTrack: (show: boolean) => void;
  setShowBasemap: (show: boolean) => void;
  setMapOpacity: (opacity: number) => void;
  setTerrain3d: (on: boolean) => void;
  markSetupGpxDone: () => void;
  markSetupMapDone: () => void;
  skipSetupGpx: () => void;
  skipSetupMap: () => void;
  completeSetup: () => void;
  setGeorefStep: (step: GeorefStep) => void;
  setGeorefPin: (pin: LngLat | null) => void;
  setGeorefPendingFrom: (pt: LngLat | null) => void;
  resetGeorefAlign: () => void;
  setStatusMessage: (msg: string) => void;
};

const georefHint = (step: GeorefStep): string => {
  switch (step) {
    case 0:
      return "Georef: click a feature on the map image overlay";
    case 1:
      return "Georef: click the matching point on the basemap";
    case 2:
      return "Georef: click a second feature on the overlay";
    case 3:
      return "Georef: click the matching second point on the basemap";
  }
};

export const useUiStore = create<UiState>((set, get) => ({
  mode: "view",
  expandedCommentIds: [],
  animationTimeMs: 0,
  isPlaying: false,
  playbackSpeed: 1,
  headingUp: false,
  commentTool: "map",
  followRangeStartMs: null,
  activeRoutePlanId: null,
  showTrack: true,
  showBasemap: true,
  mapOpacity: 0.75,
  terrain3d: false,
  setupGpxDone: false,
  setupMapDone: false,
  georefStep: 0,
  georefPin: null,
  georefPendingFrom: null,
  statusMessage:
    "Start with GPX so the map jumps to the competition area, then add the map image.",

  setMode: (mode) => {
    const { setupGpxDone, setupMapDone } = get();
    const setupComplete = setupGpxDone && setupMapDone;
    if (
      !setupComplete &&
      (mode === "view" || mode === "plan" || mode === "comment")
    ) {
      set({
        statusMessage: !setupGpxDone
          ? "Finish Event setup: load GPX (or Skip), then map image (or Skip)."
          : "Finish Event setup: add a map image (or Skip) to continue.",
      });
      return;
    }
    set({
      mode,
      isPlaying: mode === "georef" ? false : get().isPlaying,
      georefStep: 0,
      georefPin: null,
      georefPendingFrom: null,
      followRangeStartMs: null,
      statusMessage:
        mode === "georef"
          ? georefHint(0)
          : mode === "plan"
            ? "Click the map to draw the route plan"
            : mode === "comment"
              ? get().commentTool === "follow"
                ? "Click the GPS track to set the range start"
                : get().commentTool === "danmaku"
                  ? "Click Add danmaku at the current playback time"
                  : "Click the map to place a comment"
              : "",
    });
  },

  toggleCommentExpanded: (id) => {
    const cur = get().expandedCommentIds;
    // Single selection: toggle off if already selected, otherwise switch to this id
    set({
      expandedCommentIds: cur.length === 1 && cur[0] === id ? [] : [id],
    });
  },

  setCommentExpanded: (id, expanded) => {
    set({ expandedCommentIds: expanded ? [id] : [] });
  },

  clearExpandedComments: () => set({ expandedCommentIds: [] }),

  setAnimationTimeMs: (ms) => set({ animationTimeMs: ms }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setHeadingUp: (on) => set({ headingUp: on }),
  setCommentTool: (tool) =>
    set({
      commentTool: tool,
      followRangeStartMs: null,
      statusMessage:
        tool === "follow"
          ? "Click the GPS track to set the range start, then the end"
          : tool === "danmaku"
            ? "Use Add danmaku to place a scrolling comment at the current playback time"
            : "Click the map to place a pin comment",
    }),
  setFollowRangeStartMs: (ms) => set({ followRangeStartMs: ms }),
  setActiveRoutePlanId: (id) => set({ activeRoutePlanId: id }),
  setShowTrack: (show) => set({ showTrack: show }),
  setShowBasemap: (show) => set({ showBasemap: show }),
  setMapOpacity: (opacity) => set({ mapOpacity: opacity }),
  setTerrain3d: (on) => set({ terrain3d: on }),
  markSetupGpxDone: () =>
    set({
      setupGpxDone: true,
      statusMessage: get().setupMapDone
        ? get().statusMessage
        : "Add a map image to georeference, or Skip to continue without one.",
    }),
  markSetupMapDone: () => set({ setupMapDone: true }),
  skipSetupGpx: () =>
    set({
      setupGpxDone: true,
      statusMessage:
        "GPX skipped. Add a map image to georeference, or Skip to continue without one.",
    }),
  skipSetupMap: () =>
    set({
      setupMapDone: true,
      mode: "view",
      statusMessage: "Setup complete. You can add a map image later in Event setup.",
    }),
  completeSetup: () =>
    set({
      setupGpxDone: true,
      setupMapDone: true,
    }),
  setGeorefStep: (step) =>
    set({ georefStep: step, statusMessage: georefHint(step) }),
  setGeorefPin: (pin) => set({ georefPin: pin }),
  setGeorefPendingFrom: (pt) => set({ georefPendingFrom: pt }),
  resetGeorefAlign: () =>
    set({
      georefStep: 0,
      georefPin: null,
      georefPendingFrom: null,
      statusMessage: georefHint(0),
    }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
}));
