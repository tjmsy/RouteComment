import { create } from "zustand";
import type { ChartKind } from "../lib/chartScales";
import type { AppMode, EditTool } from "../lib/types";

/** Two-point fine-tune steps (streetview-o style). */
export type GeorefStep = 0 | 1 | 2 | 3;

type LngLat = { lng: number; lat: number };

export type ProfileChartCollapsed = Record<ChartKind, boolean>;

const DEFAULT_PROFILE_CHART_COLLAPSED: ProfileChartCollapsed = {
  ele: false,
  hr: false,
  speed: false,
};

type UiState = {
  mode: AppMode;
  editTool: EditTool;
  toolbarCollapsed: boolean;
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
  /** Color GPS track by segment speed (red=slow, blue=fast). */
  colorTrackBySpeed: boolean;
  /** GPS track line width in pixels. */
  trackLineWidth: number;
  showBasemap: boolean;
  mapOpacity: number;
  terrain3d: boolean;
  /** Profile charts panel (elevation / HR / speed). */
  showProfileCharts: boolean;
  /** DEM elevation fetch status for profile charts. */
  elevationStatus: "idle" | "loading" | "done" | "failed";
  /** Total height of the profile charts panel (px). */
  profilePanelHeightPx: number;
  /** Per-series collapse state for profile charts. */
  profileChartCollapsed: ProfileChartCollapsed;
  /** GPX loaded or skipped during onboarding. */
  setupGpxDone: boolean;
  /** Map image loaded or skipped during onboarding. */
  setupMapDone: boolean;
  georefStep: GeorefStep;
  georefPin: LngLat | null;
  georefPendingFrom: LngLat | null;
  statusMessage: string;

  setMode: (mode: AppMode) => void;
  setEditTool: (tool: EditTool) => void;
  setToolbarCollapsed: (collapsed: boolean) => void;
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
  setColorTrackBySpeed: (on: boolean) => void;
  setTrackLineWidth: (width: number) => void;
  setShowBasemap: (show: boolean) => void;
  setMapOpacity: (opacity: number) => void;
  setTerrain3d: (on: boolean) => void;
  setShowProfileCharts: (on: boolean) => void;
  setElevationStatus: (status: UiState["elevationStatus"]) => void;
  setProfilePanelHeightPx: (height: number) => void;
  toggleProfileChartCollapsed: (kind: ChartKind) => void;
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

const editToolHint = (
  tool: EditTool,
  commentTool: "map" | "follow" | "danmaku",
): string => {
  if (tool === "setup") return "";
  if (tool === "plan") return "Click the map to draw the route plan";
  if (commentTool === "follow") return "Click the GPS track to set the range start";
  if (commentTool === "danmaku")
    return "Click Add danmaku at the current playback time";
  return "Click the map to place a comment";
};

export const useUiStore = create<UiState>((set, get) => ({
  mode: "edit",
  editTool: "setup",
  toolbarCollapsed: false,
  expandedCommentIds: [],
  animationTimeMs: 0,
  isPlaying: false,
  playbackSpeed: 30,
  headingUp: false,
  commentTool: "map",
  followRangeStartMs: null,
  activeRoutePlanId: null,
  showTrack: true,
  colorTrackBySpeed: true,
  trackLineWidth: 5,
  showBasemap: true,
  mapOpacity: 0.75,
  terrain3d: false,
  showProfileCharts: true,
  elevationStatus: "idle",
  profilePanelHeightPx: 200,
  profileChartCollapsed: { ...DEFAULT_PROFILE_CHART_COLLAPSED },
  setupGpxDone: false,
  setupMapDone: false,
  georefStep: 0,
  georefPin: null,
  georefPendingFrom: null,
  statusMessage:
    "Start with GPX so the map jumps to the competition area, then add the map image.",

  setMode: (mode) => {
    const prev = get();
    const { setupGpxDone, setupMapDone, editTool, commentTool } = prev;
    const setupComplete = setupGpxDone && setupMapDone;
    const leavingView = prev.mode === "view" && mode !== "view";
    if (!setupComplete && (mode === "view" || mode === "edit")) {
      if (mode === "view") {
        set({
          statusMessage: !setupGpxDone
            ? "Finish Setup: load GPX (or Skip), then map image (or Skip)."
            : "Finish Setup: add a map image (or Skip) to continue.",
        });
        return;
      }
      // Allow edit during onboarding, but keep Setup tool.
      set({
        mode: "edit",
        editTool: "setup",
        isPlaying: false,
        georefStep: 0,
        georefPin: null,
        georefPendingFrom: null,
        followRangeStartMs: null,
        statusMessage: get().statusMessage,
      });
      return;
    }
    set({
      mode,
      editTool: mode === "georef" ? "setup" : editTool,
      isPlaying: mode === "georef" || leavingView ? false : prev.isPlaying,
      terrain3d: leavingView ? false : prev.terrain3d,
      headingUp: leavingView ? false : prev.headingUp,
      georefStep: 0,
      georefPin: null,
      georefPendingFrom: null,
      followRangeStartMs: null,
      statusMessage:
        mode === "georef"
          ? georefHint(0)
          : mode === "edit"
            ? editToolHint(editTool, commentTool)
            : "",
    });
  },

  setEditTool: (tool) => {
    const prev = get();
    const { setupGpxDone, setupMapDone, mode, commentTool } = prev;
    const setupComplete = setupGpxDone && setupMapDone;
    if (!setupComplete && tool !== "setup") {
      set({
        statusMessage: !setupGpxDone
          ? "Finish Setup: load GPX (or Skip), then map image (or Skip)."
          : "Finish Setup: add a map image (or Skip) to continue.",
      });
      return;
    }
    const leaveGeoref = mode === "georef";
    const leavingView = mode === "view";
    set({
      mode: leaveGeoref || leavingView ? "edit" : mode,
      editTool: tool,
      isPlaying: leaveGeoref || leavingView ? false : prev.isPlaying,
      terrain3d: leavingView ? false : prev.terrain3d,
      headingUp: leavingView ? false : prev.headingUp,
      georefStep: 0,
      georefPin: null,
      georefPendingFrom: null,
      followRangeStartMs: null,
      statusMessage: editToolHint(tool, commentTool),
    });
  },

  setToolbarCollapsed: (collapsed) => set({ toolbarCollapsed: collapsed }),

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
  setColorTrackBySpeed: (on) => set({ colorTrackBySpeed: on }),
  setTrackLineWidth: (width) => set({ trackLineWidth: width }),
  setShowBasemap: (show) => set({ showBasemap: show }),
  setMapOpacity: (opacity) => set({ mapOpacity: opacity }),
  setTerrain3d: (on) => set({ terrain3d: on }),
  setShowProfileCharts: (on) => set({ showProfileCharts: on }),
  setElevationStatus: (status) => set({ elevationStatus: status }),
  setProfilePanelHeightPx: (height) => set({ profilePanelHeightPx: height }),
  toggleProfileChartCollapsed: (kind) =>
    set((s) => ({
      profileChartCollapsed: {
        ...s.profileChartCollapsed,
        [kind]: !s.profileChartCollapsed[kind],
      },
    })),
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
      statusMessage: "Setup complete. You can add a map image later in Edit → Setup.",
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
