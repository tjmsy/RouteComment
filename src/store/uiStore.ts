import { create } from "zustand";
import type { ChartKind } from "../lib/chartScales";
import type { AppMode, EditTool } from "../lib/types";
import type { ProjectLayerPrefs } from "../lib/types";
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

function removeEmptyTextComments(): void {
  const { project, removeComment } = useProjectStore.getState();
  for (const c of project.comments) {
    if (!(c.text ?? "").trim()) {
      removeComment(c.id);
    }
  }
}

function discardEmptyComment(id: string): void {
  const { project, removeComment } = useProjectStore.getState();
  const c = project.comments.find((x) => x.id === id);
  if (c && !(c.text ?? "").trim()) {
    removeComment(id);
  }
}

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
  /** Comment showing the textarea editor (follow or note). */
  followTextEditId: string | null;
  activeRoutePlanId: string | null;
  showTrack: boolean;
  colorTrackBySpeed: boolean;
  trackLineWidth: number;
  showBasemap: boolean;
  mapOpacity: number;
  terrain3d: boolean;
  showProfileCharts: boolean;
  /** Review / playback visibility for each comment kind. */
  showVoices: boolean;
  showNotes: boolean;
  showCaptions: boolean;
  /** Caption (danmaku) font size in px while reviewing. Session-only. */
  captionFontSize: number;
  elevationStatus: "idle" | "loading" | "done" | "failed";
  profilePanelHeightPx: number;
  /** Whole profile panel folded to header only. */
  profilePanelCollapsed: boolean;
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
  setFollowTextEditId: (id: string | null) => void;
  /** Clear start + draft + target (keep expanded as-is). */
  clearFollowRangeSession: () => void;
  /** Write draft to project and open the comment editor. */
  confirmFollowDraft: () => string | null;
  /** Discard draft endpoints and start over (keeps selected comment). */
  redoFollowDraft: () => void;
  setActiveRoutePlanId: (id: string | null) => void;
  setShowTrack: (show: boolean) => void;
  setColorTrackBySpeed: (on: boolean) => void;
  setTrackLineWidth: (width: number) => void;
  setShowBasemap: (show: boolean) => void;
  setMapOpacity: (opacity: number) => void;
  setTerrain3d: (on: boolean) => void;
  setShowProfileCharts: (on: boolean) => void;
  setShowVoices: (show: boolean) => void;
  setShowNotes: (show: boolean) => void;
  setShowCaptions: (show: boolean) => void;
  setCaptionFontSize: (size: number) => void;
  /** Apply layer prefs from project.json (ZIP load). */
  applyLayerPrefs: (prefs: ProjectLayerPrefs) => void;
  /** Snapshot current layer toggles for project.json (ZIP save). */
  layerPrefsSnapshot: () => ProjectLayerPrefs;
  setElevationStatus: (status: UiState["elevationStatus"]) => void;
  setProfilePanelHeightPx: (height: number) => void;
  setProfilePanelCollapsed: (collapsed: boolean) => void;
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
  /** Bump to force MapView to fit track (or map image) after load. */
  mapFitRequestId: number;
  requestMapFit: () => void;
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
  if (wasEditingComment && !editingComment) {
    removeEmptyTextComments();
  }
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
    followDraftRange: editingComment ? prev.followDraftRange : null,
    followRangeTargetId: editingComment ? prev.followRangeTargetId : null,
    followTextEditId: editingComment ? prev.followTextEditId : null,
    // Leaving comment edit must collapse the sheet/selection; keeping it open
    // under review would flash the readonly caption header + hint.
    expandedCommentIds: editingComment
      ? prev.expandedCommentIds
      : wasEditingComment
        ? []
        : isReviewReadonly(screen)
          ? prev.expandedCommentIds
          : [],
    commentTool: prev.commentTool,
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
  followTextEditId: null,
  activeRoutePlanId: null,
  showTrack: true,
  colorTrackBySpeed: true,
  trackLineWidth: 5,
  showBasemap: true,
  mapOpacity: 0.75,
  terrain3d: false,
  showProfileCharts: true,
  showVoices: true,
  showNotes: true,
  showCaptions: true,
  captionFontSize: 26,
  elevationStatus: "idle",
  profilePanelHeightPx: 280,
  profilePanelCollapsed: false,
  profileChartCollapsed: { ...DEFAULT_PROFILE_CHART_COLLAPSED },
  setupGpxDone: false,
  setupMapDone: false,
  georefStep: 0,
  georefPin: null,
  georefPendingFrom: null,
  statusMessage: "",
  mapFitRequestId: 0,

  dispatch: (event) => {
    const prev = get();
    const screen = reduceUiState(prev.screen, event);
    if (sameScreen(screen, prev.screen)) return;
    const next = applyScreen(screen, prev);
    if (event.type === "SELECT_COMMENT_KIND") {
      set({
        ...next,
        commentTool: event.kind,
        expandedCommentIds: [],
        followRangeStartMs: null,
        followDraftRange: null,
        followRangeTargetId: null,
      });
      return;
    }
    set(next);
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
    if (collapsing) {
      discardEmptyComment(id);
      set({ expandedCommentIds: [], followTextEditId: null });
      return;
    }
    for (const prevId of cur) {
      if (prevId !== id) discardEmptyComment(prevId);
    }
    set({
      expandedCommentIds: [id],
      followRangeStartMs: null,
      followDraftRange: null,
      followRangeTargetId: null,
      followTextEditId: null,
    });
  },

  setCommentExpanded: (id, expanded) => {
    if (!expanded) {
      discardEmptyComment(id);
      set({
        expandedCommentIds: [],
        followTextEditId: null,
      });
      return;
    }
    const prev = get().expandedCommentIds;
    for (const prevId of prev) {
      if (prevId !== id) discardEmptyComment(prevId);
    }
    set({
      expandedCommentIds: [id],
      followRangeStartMs: null,
      followDraftRange: null,
      followRangeTargetId: null,
      // Selecting clears text-edit; callers that need the editor set it after.
      followTextEditId: null,
    });
  },

  clearExpandedComments: () => {
    for (const id of get().expandedCommentIds) {
      discardEmptyComment(id);
    }
    set({ expandedCommentIds: [], followTextEditId: null });
  },

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
      followTextEditId: null,
      // EditCommentBar inline hint already covers tool guidance.
      statusMessage: "",
    }),
  setFollowRangeStartMs: (ms) => set({ followRangeStartMs: ms }),
  setFollowDraftRange: (draft) => set({ followDraftRange: draft }),
  setFollowRangeTargetId: (id) => set({ followRangeTargetId: id }),
  setFollowTextEditId: (id) => set({ followTextEditId: id }),
  clearFollowRangeSession: () =>
    set({
      followRangeStartMs: null,
      followDraftRange: null,
      followRangeTargetId: null,
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
      followTextEditId: id,
      // Popup opens for text edit; skip success toast.
      statusMessage: "",
    });
    return id;
  },
  redoFollowDraft: () =>
    set({
      followDraftRange: null,
      followRangeStartMs: null,
      followRangeTargetId: null,
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
  setShowVoices: (show) => set({ showVoices: show }),
  setShowNotes: (show) => set({ showNotes: show }),
  setShowCaptions: (show) => set({ showCaptions: show }),
  setCaptionFontSize: (size) =>
    set({ captionFontSize: Math.min(48, Math.max(14, Math.round(size))) }),
  applyLayerPrefs: (prefs) =>
    set({
      showBasemap: prefs.basemap,
      showTrack: prefs.gpsTrack,
      colorTrackBySpeed: prefs.colorBySpeed,
      showProfileCharts: prefs.profileCharts,
      showVoices: prefs.voices,
      showNotes: prefs.notes,
      showCaptions: prefs.captions,
    }),
  layerPrefsSnapshot: () => {
    const s = get();
    return {
      basemap: s.showBasemap,
      gpsTrack: s.showTrack,
      colorBySpeed: s.colorTrackBySpeed,
      profileCharts: s.showProfileCharts,
      voices: s.showVoices,
      notes: s.showNotes,
      captions: s.showCaptions,
    };
  },
  setElevationStatus: (status) => set({ elevationStatus: status }),
  setProfilePanelHeightPx: (height) => set({ profilePanelHeightPx: height }),
  setProfilePanelCollapsed: (collapsed) =>
    set({ profilePanelCollapsed: collapsed }),
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
  requestMapFit: () => set((s) => ({ mapFitRequestId: s.mapFitRequestId + 1 })),
}));
