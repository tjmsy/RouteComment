import type { Comment } from "./types";

/**
 * Track-time window to notice the trigger (same idea as follow's
 * commentActiveAt range). Wide enough that 120× playback still hits it.
 */
export const DANMAKU_ARM_MS = 60_000;
/** Wall-clock scroll once the caption has been armed. */
export const DANMAKU_SCROLL_MS = 7000;

export function singleLineDanmakuCaption(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Playhead is in the arming window — same style as commentActiveAt(follow).
 */
export function danmakuActiveAt(comment: Comment, timeMs: number): boolean {
  if (comment.kind !== "danmaku") return false;
  if (comment.timeStartMs == null || !Number.isFinite(comment.timeStartMs)) {
    return false;
  }
  if (!singleLineDanmakuCaption(comment.text)) return false;
  const start = comment.timeStartMs;
  return timeMs >= start && timeMs < start + DANMAKU_ARM_MS;
}
