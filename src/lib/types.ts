import type { OMapPose } from "./omapPose";
import { t } from "../i18n";

export type { OMapPose };

export type TrackPoint = {
  lng: number;
  lat: number;
  time?: string;
  timeOffsetMs?: number;
  /** Meters above sea level (GPX <ele> or DEM). */
  ele?: number;
  /** Beats per minute (GPX extensions). */
  heartRate?: number;
};

export const PLAN_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
  "#16a34a",
  "#ea580c",
  "#db2777",
] as const;

export type RoutePlan = {
  id: string;
  name: string;
  coordinates: [number, number][]; // lng, lat
  visible: boolean;
  color: string;
  /** MapLibre line width in pixels */
  lineWidth: number;
};

/**
 * map = pinned on map;
 * follow = bubble follows runner in a track-time range;
 * danmaku = niconico-style scroll once at timeStartMs
 */
export type CommentKind = "map" | "follow" | "danmaku";

export const DEFAULT_POPUP_WIDTH = 180;
export const DEFAULT_POPUP_HEIGHT = 100;
/** Narrow enough for a one-character checkpoint label (e.g. "c"). */
export const MIN_POPUP_WIDTH = 24;
/** One line of 0.8rem text + light padding (was 36 ≈ two lines). */
export const MIN_POPUP_HEIGHT = 24;
export const MAX_POPUP_SIZE = 480;

export type Comment = {
  id: string;
  kind: CommentKind;
  lng: number;
  lat: number;
  text: string;
  /** Inclusive start of the track-time range for follow comments (ms).
   * For danmaku: trigger time (fires once when playback crosses this). */
  timeStartMs?: number;
  /** Inclusive end of the track-time range for follow comments (ms). */
  timeEndMs?: number;
  /** Map-pin popup width in CSS pixels (persisted per comment). */
  popupWidth?: number;
  /** Map-pin popup height in CSS pixels (persisted per comment). */
  popupHeight?: number;
  /** Map-pin: whether the speech-bubble popup is open (persisted). Default true. */
  popupOpen?: boolean;
};

export type ProjectData = {
  version: 1;
  name: string;
  mapImage: { fileName: string } | null;
  georef: {
    pose: OMapPose | null;
  };
  track: { points: TrackPoint[] };
  routePlans: RoutePlan[];
  comments: Comment[];
  /** Layer visibility prefs (UI); omitted in older ZIPs. */
  layers: ProjectLayerPrefs;
};

/** On/off prefs for the Layers panel (persisted in project.json). */
export type ProjectLayerPrefs = {
  basemap: boolean;
  gpsTrack: boolean;
  colorBySpeed: boolean;
  profileCharts: boolean;
  voices: boolean;
  notes: boolean;
  captions: boolean;
};

export const DEFAULT_LAYER_PREFS: ProjectLayerPrefs = {
  basemap: true,
  gpsTrack: true,
  colorBySpeed: true,
  profileCharts: true,
  voices: true,
  notes: true,
  captions: true,
};

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function normalizeLayerPrefs(
  raw: Partial<ProjectLayerPrefs> | null | undefined
): ProjectLayerPrefs {
  const d = DEFAULT_LAYER_PREFS;
  if (!raw || typeof raw !== "object") return { ...d };
  return {
    basemap: asBool(raw.basemap, d.basemap),
    gpsTrack: asBool(raw.gpsTrack, d.gpsTrack),
    colorBySpeed: asBool(raw.colorBySpeed, d.colorBySpeed),
    profileCharts: asBool(raw.profileCharts, d.profileCharts),
    voices: asBool(raw.voices, d.voices),
    notes: asBool(raw.notes, d.notes),
    captions: asBool(raw.captions, d.captions),
  };
}

export type AppMode = "view" | "georef" | "edit";

/** Sub-tool while AppMode is "edit" (or Setup during georef). */
export type EditTool = "setup" | "plan" | "comment";

export type ImageSourceCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

export function nextPlanColor(existing: RoutePlan[]): string {
  const used = new Set(existing.map((p) => p.color));
  const free = PLAN_COLORS.find((c) => !used.has(c));
  return free ?? PLAN_COLORS[existing.length % PLAN_COLORS.length];
}

export function createEmptyProject(name = t("common.untitled")): ProjectData {
  return {
    version: 1,
    name,
    mapImage: null,
    georef: { pose: null },
    track: { points: [] },
    routePlans: [],
    comments: [],
    layers: { ...DEFAULT_LAYER_PREFS },
  };
}

function clampPopupSize(
  n: number | undefined,
  fallback: number,
  min: number
): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(MAX_POPUP_SIZE, Math.max(min, Math.round(n)));
}

/** Normalize legacy comments that only had timeOffsetMs / no kind. */
export function normalizeComment(
  raw: Partial<Comment> & { timeOffsetMs?: number }
): Comment {
  const timeStartMs =
    raw.timeStartMs ??
    (typeof raw.timeOffsetMs === "number" ? raw.timeOffsetMs : undefined);
  let timeEndMs = raw.timeEndMs;
  if (timeEndMs == null && timeStartMs != null) {
    timeEndMs = timeStartMs + 5000;
  }
  const kind: CommentKind =
    raw.kind === "follow" || raw.kind === "map" || raw.kind === "danmaku"
      ? raw.kind
      : timeStartMs != null
        ? "follow"
        : "map";
  const popupWidth =
    kind === "map"
      ? clampPopupSize(raw.popupWidth, DEFAULT_POPUP_WIDTH, MIN_POPUP_WIDTH)
      : undefined;
  const popupHeight =
    kind === "map"
      ? clampPopupSize(raw.popupHeight, DEFAULT_POPUP_HEIGHT, MIN_POPUP_HEIGHT)
      : undefined;
  const popupOpen =
    kind === "map" || kind === "follow" ? raw.popupOpen !== false : undefined;
  return {
    id: raw.id ?? crypto.randomUUID(),
    kind,
    lng: raw.lng ?? 0,
    lat: raw.lat ?? 0,
    text: raw.text ?? "",
    timeStartMs:
      kind === "follow" || kind === "danmaku" ? (timeStartMs ?? 0) : undefined,
    timeEndMs: kind === "follow" ? timeEndMs : undefined,
    popupWidth,
    popupHeight,
    popupOpen,
  };
}

export function normalizeRoutePlan(
  raw: Partial<RoutePlan>,
  index: number
): RoutePlan {
  const lineWidth =
    typeof raw.lineWidth === "number" &&
    Number.isFinite(raw.lineWidth) &&
    raw.lineWidth > 0
      ? Math.min(20, Math.max(1, raw.lineWidth))
      : 3;
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: raw.name ?? "Plan",
    coordinates: raw.coordinates ?? [],
    visible: raw.visible !== false,
    color: raw.color ?? PLAN_COLORS[index % PLAN_COLORS.length],
    lineWidth,
  };
}

export function commentActiveAt(comment: Comment, timeMs: number): boolean {
  if (comment.kind !== "follow") return false;
  if (comment.timeStartMs == null || comment.timeEndMs == null) return false;
  const a = Math.min(comment.timeStartMs, comment.timeEndMs);
  const b = Math.max(comment.timeStartMs, comment.timeEndMs);
  return timeMs >= a && timeMs <= b;
}
