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
export const MIN_POPUP_WIDTH = 48;
export const MIN_POPUP_HEIGHT = 36;
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
};

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
  };
}

function clampPopupSize(
  n: number | undefined,
  fallback: number,
  min: number,
): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(MAX_POPUP_SIZE, Math.max(min, Math.round(n)));
}

/** Normalize legacy comments that only had timeOffsetMs / no kind. */
export function normalizeComment(
  raw: Partial<Comment> & { timeOffsetMs?: number },
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
  const popupOpen = kind === "map" ? raw.popupOpen !== false : undefined;
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
  index: number,
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
