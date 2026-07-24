import { create } from "zustand";
import type { ChartKind } from "../lib/chartScales";
import type { AppMode, EditTool } from "../lib/types";
import { t } from "../i18n";
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
import { useProjectStore } from "./projectStore";

/** Two-point fine-tune steps (streetview-o style). */
export type GeorefStep = 0 | 1 | 2 | 3;

type LngLat = { lng: number; lat: number };

export type ProfileChartCollapsed = Record<ChartKind, boolean>;

/** Draft follow range awaiting explicit Confirm (not yet written / expanded). */
export type FollowDraftRange = {
  /** Unordered endpoints — keep identity stable while dragging markers. */
  aMs: number;
  bMs: number;
  lng: number;
  lat: number;
  /** Existing follow to update; null = create on confirm. */
  targetId: string | null;
};

export function followDraftTimes(d: FollowDraftRange): {
  timeStartMs: number;
  timeEndMs: number;
} {
  return {
    timeStartMs: Math.min(d.aMs, d.bMs),
    timeEndMs: Math.max(d.aMs, d.bMs),
  };
}

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
  /** Provisional range; Confirm writes comment and opens editor. */
  followDraftRange: FollowDraftRange | null;
  /** Prefer this id when applying / confirming a follow range (reselect). */
  followRangeTargetId: string | null;
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
  setFollowDraftRange: (draft: FollowDraftRange | null) => void;
  setFollowRangeTargetId: (id: string | null) => void;
  /** Clear start + draft + target (keep expanded as-is). */
  clearFollowRangeSession: () => void;
  /** Hide sheet and pick a new range for an existing follow. */
  beginFollowReselect: (commentId: string) => void;
  /** Write draft to project and open the comment editor. */
  confirmFollowDraft: () => string | null;
  /** Discard draft and start over. */
  redoFollowDraft: () => void;
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

function applyScreen(screen: ScreenState, prev: UiState): Partial<UiState> {
  const mode = deriveLegacyMode(screen);
  const editTool = deriveLegacyEditTool(screen);
  const leavingView = prev.mode === "view" && mode !== "view";
  const enteringGeoref = mode === "georef" && prev.mode !== "georef";
  const leavingGeoref = prev.mode === "georef" && mode !== "georef";
  const hideBasemapAfterGeoref = leavingGeoref && mode === "view";
  const editingComment = isEditingComment(screen);
  const wasEditingComment = isEditingComment(prev.screen);
  const inToolMode = mode === "georef" || mode === "edit";
  return {
    screen,
    mode,
    editTool,
    isPlaying: mode === "georef" || leavingView ? false : prev.isPlaying,
    terrain3d: leavingView ? false : prev.terrain3d,
    headingUp: leavingView ? false : prev.headingUp,
    showBasemap: hideBasemapAfterGeoref ? false : prev.showBasemap,
    georefStep: enteringGeoref || mode !== "georef" ? 0 : prev.georefStep,
    georefPin: mode === "georef" ? prev.georefPin : null,
    georefPendingFrom: mode === "georef" ? prev.georefPendingFrom : null,
    followRangeStartMs:
      editingComment || wasEditingComment
        ? editingComment
          ? prev.followRangeStartMs
          : null
        : null,
    followDraftRange: editingComment
      ? prev.followDraftRange
      : null,
    followRangeTargetId: editingComment
      ? prev.followRangeTargetId
      : null,
    expandedCommentIds:
      editingComment || isReviewReadonly(screen)
        ? prev.expandedCommentIds
        : [],
    commentTool:
      editingComment && !wasEditingComment ? "follow" : prev.commentTool,
    // Mode guidance lives in tool-bar inline hints; clear toast on enter.
    statusMessage: inToolMode ? "" : prev.statusMessage,
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
  followDraftRange: null,
  followRangeTargetId: null,
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
  statusMessage: t("status.startWithGpx"),

  dispatch: (event) => {
    const prev = get();
    const screen = reduceUiState(prev.screen, event);
    if (sameScreen(screen, prev.screen)) return;
    set(applyScreen(screen, prev));
  },

  setMode: (mode) => {
    const prev = get();
    const { setupGpxDone, setupMapDone, editTool } = prev;
    const setupComplete = setupGpxDone && setupMapDone;
    const leavingView = prev.mode === "view" && mode !== "view";
    if (!setupComplete && (mode === "view" || mode === "edit")) {
      if (mode === "view") {
        set({
          statusMessage: !setupGpxDone
            ? t("status.finishSetupGpx")
            : t("status.finishSetupMap"),
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
      followDraftRange: null,
      followRangeTargetId: null,
      expandedCommentIds:
        mode === "edit" && editTool === "comment"
          ? prev.expandedCommentIds
          : [],
      // Tool-bar inline hints cover mode guidance; toast only for setup blocks above.
      statusMessage: "",
    });
  },

  setEditTool: (tool) => {
    const prev = get();
    const { setupGpxDone, setupMapDone, mode } = prev;
    const setupComplete = setupGpxDone && setupMapDone;
    if (!setupComplete && tool !== "setup") {
      set({
        statusMessage: !setupGpxDone
          ? t("status.finishSetupGpx")
          : t("status.finishSetupMap"),
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
      followDraftRange: null,
      followRangeTargetId: null,
      expandedCommentIds: tool === "comment" ? prev.expandedCommentIds : [],
      statusMessage: "",
    });
  },

  setToolbarCollapsed: (collapsed) => set({ toolbarCollapsed: collapsed }),

  toggleCommentExpanded: (id) => {
    const cur = get().expandedCommentIds;
    const collapsing = cur.length === 1 && cur[0] === id;
    set({
      expandedCommentIds: collapsing ? [] : [id],
      ...(collapsing
        ? {}
        : {
            followRangeStartMs: null,
            followDraftRange: null,
            followRangeTargetId: null,
          }),
    });
  },

  setCommentExpanded: (id, expanded) => {
    set({
      expandedCommentIds: expanded ? [id] : [],
      ...(expanded
        ? {
            followRangeStartMs: null,
            followDraftRange: null,
            followRangeTargetId: null,
          }
        : {}),
    });
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
      followDraftRange: null,
      followRangeTargetId: null,
      // EditCommentBar inline hint already covers tool guidance.
      statusMessage: "",
    }),
  setFollowRangeStartMs: (ms) => set({ followRangeStartMs: ms }),
  setFollowDraftRange: (draft) => set({ followDraftRange: draft }),
  setFollowRangeTargetId: (id) => set({ followRangeTargetId: id }),
  clearFollowRangeSession: () =>
    set({
      followRangeStartMs: null,
      followDraftRange: null,
      followRangeTargetId: null,
    }),
  beginFollowReselect: (commentId) =>
    set({
      commentTool: "follow",
      followRangeTargetId: commentId,
      followRangeStartMs: null,
      followDraftRange: null,
      expandedCommentIds: [],
      // FollowRangeConfirmBar shows reselecting hint.
      statusMessage: "",
    }),
  confirmFollowDraft: () => {
    const draft = get().followDraftRange;
    if (!draft) return null;
    const { timeStartMs, timeEndMs } = followDraftTimes(draft);
    const patch = {
      lng: draft.lng,
      lat: draft.lat,
      timeStartMs,
      timeEndMs,
    };
    let id = draft.targetId;
    if (id) {
      useProjectStore.getState().updateComment(id, patch);
    } else {
      id = useProjectStore.getState().addComment({
        kind: "follow",
        text: "",
        ...patch,
      });
    }
    set({
      followDraftRange: null,
      followRangeStartMs: null,
      followRangeTargetId: null,
      expandedCommentIds: [id],
      statusMessage: t("status.followSaved"),
    });
    return id;
  },
  redoFollowDraft: () =>
    set({
      followDraftRange: null,
      followRangeStartMs: null,
      // EditCommentBar inline hint covers follow guidance.
      statusMessage: "",
    }),
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
        : t("status.addMapImage"),
    }),
  markSetupMapDone: () => set({ setupMapDone: true }),
  skipSetupGpx: () =>
    set({
      setupGpxDone: true,
      statusMessage: t("status.gpxSkipped"),
    }),
  skipSetupMap: () =>
    set({
      setupMapDone: true,
      mode: "view",
      screen: { kind: "review" },
      editTool: deriveLegacyEditTool({ kind: "review" }),
      statusMessage: t("status.setupComplete"),
    }),
  completeSetup: () =>
    set({
      setupGpxDone: true,
      setupMapDone: true,
    }),
  setGeorefStep: (step) => set({ georefStep: step }),
  setGeorefPin: (pin) => set({ georefPin: pin }),
  setGeorefPendingFrom: (pt) => set({ georefPendingFrom: pt }),
  resetGeorefAlign: () =>
    set({
      georefStep: 0,
      georefPin: null,
      georefPendingFrom: null,
    }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
}));
