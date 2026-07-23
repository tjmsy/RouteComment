import { create } from "zustand";
import type { ChartKind } from "../lib/chartScales";
import { pointerVerb } from "../lib/mobile";
import type { AppMode, EditTool } from "../lib/types";
import {
  deriveLegacyEditTool,
  deriveLegacyMode,
  INITIAL_UI_STATE,
  isEditingComment,
  isReviewReadonly,
  reduceUiState,
  type UiEvent,
  type UiState as ScreenState,
} from "../ui/machine";

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
  /** Screen-mode machine (IA v6). Source of truth for navigation. */
  screen: ScreenState;
  /** @deprecated Prefer screen + dispatch; kept in sync for legacy UI. */
  mode: AppMode;
  /** @deprecated Prefer screen + dispatch; kept in sync for legacy UI. */
  editTool: EditTool;
  toolbarCollapsed: boolean;
  expandedCommentIds: string[];
  animationTimeMs: number;
  isPlaying: boolean;
  playbackSpeed: number;
  headingUp: boolean;
  commentTool: "map" | "follow" | "danmaku";
  followRangeStartMs: number | null;
  activeRoutePlanId: string | null;
  showTrack: boolean;
  colorTrackBySpeed: boolean;
  trackLineWidth: number;
  showBasemap: boolean;
  mapOpacity: number;
  terrain3d: boolean;
  showProfileCharts: boolean;
  elevationStatus: "idle" | "loading" | "done" | "failed";
  profilePanelHeightPx: number;
  profileChartCollapsed: ProfileChartCollapsed;
  setupGpxDone: boolean;
  setupMapDone: boolean;
  georefStep: GeorefStep;
  georefPin: LngLat | null;
  georefPendingFrom: LngLat | null;
  statusMessage: string;

  dispatch: (event: UiEvent) => void;
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
  const verb = pointerVerb().toLowerCase();
  switch (step) {
    case 0:
      return `Georef: ${verb} a feature on the map image overlay`;
    case 1:
      return `Georef: ${verb} the matching point on the basemap`;
    case 2:
      return `Georef: ${verb} a second feature on the overlay`;
    case 3:
      return `Georef: ${verb} the matching second point on the basemap`;
  }
};

const editToolHint = (
  tool: EditTool,
  commentTool: "map" | "follow" | "danmaku",
): string => {
  const verb = pointerVerb();
  if (tool === "setup") return "";
  if (tool === "plan")
    return `Add a plan first, then ${verb.toLowerCase()} the map to draw`;
  if (commentTool === "follow")
    return `${verb} or drag along the GPS track to set the range`;
  if (commentTool === "danmaku")
    return `${verb} Add danmaku at the current playback time`;
  return `${verb} the map to place a comment bubble`;
};

function applyScreen(screen: ScreenState, prev: UiState): Partial<UiState> {
  const mode = deriveLegacyMode(screen);
  const editTool = deriveLegacyEditTool(screen);
  const leavingView = prev.mode === "view" && mode !== "view";
  const enteringGeoref = mode === "georef" && prev.mode !== "georef";
  const editingComment = isEditingComment(screen);
  const wasEditingComment = isEditingComment(prev.screen);
  return {
    screen,
    mode,
    editTool,
    isPlaying: mode === "georef" || leavingView ? false : prev.isPlaying,
    terrain3d: leavingView ? false : prev.terrain3d,
    headingUp: leavingView ? false : prev.headingUp,
    georefStep: enteringGeoref || mode !== "georef" ? 0 : prev.georefStep,
    georefPin: mode === "georef" ? prev.georefPin : null,
    georefPendingFrom: mode === "georef" ? prev.georefPendingFrom : null,
    followRangeStartMs:
      editingComment || wasEditingComment
        ? editingComment
          ? prev.followRangeStartMs
          : null
        : null,
    expandedCommentIds:
      editingComment || isReviewReadonly(screen)
        ? prev.expandedCommentIds
        : [],
    commentTool:
      editingComment && !wasEditingComment ? "follow" : prev.commentTool,
    statusMessage:
      mode === "georef"
        ? georefHint(0)
        : mode === "edit"
          ? editToolHint(
              editTool,
              editingComment && !wasEditingComment
                ? "follow"
                : prev.commentTool,
            )
          : prev.statusMessage,
  };
}

function screenForLegacyMode(mode: AppMode, editTool: EditTool): ScreenState {
  if (mode === "view") return { kind: "review" };
  if (mode === "georef") return { kind: "georef" };
  if (editTool === "plan") return { kind: "editPlan" };
  if (editTool === "comment") return { kind: "editComment" };
  return { kind: "project" };
}

function sameScreen(a: ScreenState, b: ScreenState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "createWizard" && b.kind === "createWizard") {
    return a.step === b.step;
  }
  return true;
}

export const useUiStore = create<UiState>((set, get) => ({
  screen: INITIAL_UI_STATE,
  mode: deriveLegacyMode(INITIAL_UI_STATE),
  editTool: deriveLegacyEditTool(INITIAL_UI_STATE),
  toolbarCollapsed: false,
  expandedCommentIds: [],
  animationTimeMs: 0,
  isPlaying: false,
  playbackSpeed: 30,
  headingUp: false,
  commentTool: "follow",
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

  dispatch: (event) => {
    const prev = get();
    const screen = reduceUiState(prev.screen, event);
    if (sameScreen(screen, prev.screen)) return;
    set(applyScreen(screen, prev));
  },

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
      const screen: ScreenState = { kind: "project" };
      set({
        ...applyScreen(screen, prev),
        statusMessage: get().statusMessage,
      });
      return;
    }
    const screen = screenForLegacyMode(mode, editTool);
    set({
      ...applyScreen(screen, prev),
      mode,
      editTool: mode === "georef" ? "setup" : editTool,
      isPlaying: mode === "georef" || leavingView ? false : prev.isPlaying,
      terrain3d: leavingView ? false : prev.terrain3d,
      headingUp: leavingView ? false : prev.headingUp,
      georefStep: 0,
      georefPin: null,
      georefPendingFrom: null,
      followRangeStartMs: null,
      expandedCommentIds:
        mode === "edit" && editTool === "comment"
          ? prev.expandedCommentIds
          : [],
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
    const nextMode = leaveGeoref || leavingView ? "edit" : mode;
    const screen = screenForLegacyMode(nextMode, tool);
    set({
      ...applyScreen(screen, prev),
      mode: nextMode,
      editTool: tool,
      isPlaying: leaveGeoref || leavingView ? false : prev.isPlaying,
      terrain3d: leavingView ? false : prev.terrain3d,
      headingUp: leavingView ? false : prev.headingUp,
      georefStep: 0,
      georefPin: null,
      georefPendingFrom: null,
      followRangeStartMs: null,
      expandedCommentIds: tool === "comment" ? prev.expandedCommentIds : [],
      statusMessage: editToolHint(tool, commentTool),
    });
  },

  setToolbarCollapsed: (collapsed) => set({ toolbarCollapsed: collapsed }),

  toggleCommentExpanded: (id) => {
    const cur = get().expandedCommentIds;
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
          ? `${pointerVerb()} or drag along the GPS track to set the range`
          : tool === "danmaku"
            ? `${pointerVerb()} the GPS track to place a scrolling comment`
            : `${pointerVerb()} the map to place a comment bubble`,
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
      screen: { kind: "review" },
      editTool: deriveLegacyEditTool({ kind: "review" }),
      statusMessage:
        "Setup complete. You can add a map image later in Edit → Setup.",
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
