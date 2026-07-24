import { useEffect, useRef } from "react";
import type { Comment } from "../lib/types";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { isReviewReadonly } from "../ui/machine";

/** Inspired by sweet-danmaku / rc-danmaku lane allocation. */
const FONT_SIZE = 26;
const ROW_HEIGHT = Math.round(FONT_SIZE * 1.4);
const AREA_RATIO = 0.65;
const MIN_GAP_PX = 40;
const SCROLL_DURATION_MS = 7000;
/** After a scrub/seek, fire bullets whose trigger lies in (playhead - NEAR, playhead]. */
const NEAR_MS = 400;

const measureCanvas =
  typeof document !== "undefined" ? document.createElement("canvas") : null;

type ActiveBullet = {
  id: string;
  el: HTMLDivElement;
  lane: number;
  startedAt: number;
  textWidth: number;
};

function measureTextWidth(text: string): number {
  const ctx = measureCanvas?.getContext("2d");
  if (!ctx) return text.length * FONT_SIZE * 0.6;
  ctx.font = `600 ${FONT_SIZE}px "DM Sans", system-ui, sans-serif`;
  return ctx.measureText(text).width;
}

function maxLanes(containerHeight: number): number {
  return Math.max(1, Math.floor((containerHeight * AREA_RATIO) / ROW_HEIGHT));
}

/**
 * Estimate whether a new bullet can enter a lane without overlapping an
 * existing one still near the right edge (rc-danmaku-style gap check).
 */
function laneIsFree(
  lane: number,
  now: number,
  containerWidth: number,
  textWidth: number,
  active: ActiveBullet[],
): boolean {
  const speed = (containerWidth + textWidth) / SCROLL_DURATION_MS;
  for (const b of active) {
    if (b.lane !== lane) continue;
    const elapsed = now - b.startedAt;
    if (elapsed < 0 || elapsed >= SCROLL_DURATION_MS) continue;
    const existingRight =
      containerWidth -
      elapsed * ((containerWidth + b.textWidth) / SCROLL_DURATION_MS);
    if (existingRight > containerWidth - MIN_GAP_PX) return false;
    const existingSpeed = (containerWidth + b.textWidth) / SCROLL_DURATION_MS;
    if (speed > existingSpeed) {
      const catchUpTime =
        (existingRight - (containerWidth - textWidth)) /
        (speed - existingSpeed);
      if (catchUpTime > 0 && catchUpTime < SCROLL_DURATION_MS - elapsed) {
        return false;
      }
    }
  }
  return true;
}

function pickLane(
  containerWidth: number,
  containerHeight: number,
  textWidth: number,
  active: ActiveBullet[],
): number {
  const lanes = maxLanes(containerHeight);
  const now = performance.now();
  for (let lane = 0; lane < lanes; lane++) {
    if (laneIsFree(lane, now, containerWidth, textWidth, active)) return lane;
  }
  let best = 0;
  let oldest = Infinity;
  for (let lane = 0; lane < lanes; lane++) {
    const onLane = active.filter((b) => b.lane === lane);
    if (onLane.length === 0) return lane;
    const newest = Math.max(...onLane.map((b) => b.startedAt));
    if (newest < oldest) {
      oldest = newest;
      best = lane;
    }
  }
  return best;
}

function danmakuList(
  comments: Comment[],
): (Comment & { timeStartMs: number })[] {
  return comments.filter(
    (c): c is Comment & { timeStartMs: number } =>
      c.kind === "danmaku" &&
      typeof c.timeStartMs === "number" &&
      c.text.trim().length > 0,
  );
}

/**
 * Niconico-style captions: fire once when the playhead crosses timeStartMs.
 * Time updates are read from the store subscribe (same pattern as the runner
 * marker) so React render coalescing cannot skip a crossing during Play.
 */
export function DanmakuOverlay() {
  const screen = useUiStore((s) => s.screen);
  const active = isReviewReadonly(screen);
  const comments = useProjectStore((s) => s.project.comments);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef(0);
  const firedRef = useRef(new Set<string>());
  const activeRef = useRef<ActiveBullet[]>([]);
  /** Last non-empty text seen per id — detect late text fill at the playhead. */
  const textSeenRef = useRef(new Map<string, string>());
  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  const clearStage = () => {
    const root = containerRef.current;
    if (root) root.replaceChildren();
    activeRef.current = [];
    firedRef.current.clear();
  };

  const spawn = (
    comment: Comment & { timeStartMs: number },
    root: HTMLDivElement,
  ) => {
    firedRef.current.add(comment.id);
    const text = comment.text.trim();
    const textWidth = measureTextWidth(text);
    const rect = root.getBoundingClientRect();
    const lane = pickLane(
      rect.width || window.innerWidth,
      rect.height || window.innerHeight,
      textWidth,
      activeRef.current,
    );

    const el = document.createElement("div");
    el.className = "danmaku-bullet";
    el.textContent = text;
    el.style.top = `${lane * ROW_HEIGHT + 8}px`;
    el.style.fontSize = `${FONT_SIZE}px`;
    el.style.setProperty(
      "--danmaku-distance",
      `${(rect.width || window.innerWidth) + textWidth}px`,
    );
    el.style.animationDuration = `${SCROLL_DURATION_MS}ms`;

    const bullet: ActiveBullet = {
      id: comment.id,
      el,
      lane,
      startedAt: performance.now(),
      textWidth,
    };
    activeRef.current.push(bullet);
    root.appendChild(el);

    const onEnd = () => {
      el.removeEventListener("animationend", onEnd);
      el.remove();
      activeRef.current = activeRef.current.filter((b) => b !== bullet);
    };
    el.addEventListener("animationend", onEnd);
  };

  /** Fire bullets whose timeStartMs lies in (from, to]. */
  const fireInRange = (from: number, to: number, root: HTMLDivElement) => {
    if (!(to > from)) return;
    for (const c of danmakuList(commentsRef.current)) {
      if (firedRef.current.has(c.id)) continue;
      if (c.timeStartMs > from && c.timeStartMs <= to) {
        spawn(c, root);
      }
    }
  };

  const onTime = (next: number) => {
    const root = containerRef.current;
    if (!root) return;

    const prev = lastTimeRef.current;

    // Rewind / scrub backward: reset and show bullets near the new playhead.
    if (next < prev) {
      clearStage();
      fireInRange(next - NEAR_MS, next, root);
      lastTimeRef.current = next;
      return;
    }

    fireInRange(prev, next, root);

    // Late text fill while paused/scrubbed on the trigger.
    for (const c of danmakuList(commentsRef.current)) {
      const text = c.text.trim();
      const prevText = textSeenRef.current.get(c.id);
      const textJustFilled =
        (prevText == null || prevText === "") && text !== "";
      textSeenRef.current.set(c.id, text);
      if (firedRef.current.has(c.id)) continue;
      if (textJustFilled && Math.abs(c.timeStartMs - next) <= NEAR_MS) {
        spawn(c, root);
      }
    }

    for (const id of [...textSeenRef.current.keys()]) {
      if (!commentsRef.current.some((c) => c.id === id)) {
        textSeenRef.current.delete(id);
      }
    }

    lastTimeRef.current = next;
  };

  // Enter / leave readonly review: reset without back-filling the whole track.
  useEffect(() => {
    clearStage();
    textSeenRef.current.clear();
    if (!active) return;
    const t = useUiStore.getState().animationTimeMs;
    lastTimeRef.current = t <= 0 ? -1 : t;
  }, [active]);

  // Subscribe to every playhead tick (do not rely on React render coalescing).
  useEffect(() => {
    if (!active) return;
    const unsub = useUiStore.subscribe((s, prev) => {
      if (s.animationTimeMs === prev.animationTimeMs) return;
      onTime(s.animationTimeMs);
    });
    return unsub;
    // onTime closes over refs; rebind only when becoming active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Comment list changes (new caption / text edit) while playhead is still.
  useEffect(() => {
    if (!active) return;
    onTime(useUiStore.getState().animationTimeMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, active]);

  if (!active) return null;

  return (
    <div ref={containerRef} className="danmaku-overlay" aria-hidden="true" />
  );
}
