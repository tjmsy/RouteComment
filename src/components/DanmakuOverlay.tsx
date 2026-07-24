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

function isDanmakuReady(
  c: Comment,
): c is Comment & { timeStartMs: number } {
  return (
    c.kind === "danmaku" &&
    typeof c.timeStartMs === "number" &&
    Number.isFinite(c.timeStartMs) &&
    c.text.trim().length > 0
  );
}

/**
 * Should this caption fire for a playhead step from `prev` → `next`?
 * - Crossed the trigger in this step (play / scrub forward / large jump)
 * - Or playhead sits in the scroll window after the trigger (scrub landed on it)
 */
export function shouldFireDanmaku(
  timeStartMs: number,
  prev: number,
  next: number,
): boolean {
  if (timeStartMs > prev && timeStartMs <= next) return true;
  if (next >= timeStartMs && next < timeStartMs + SCROLL_DURATION_MS) {
    return true;
  }
  return false;
}

/**
 * Niconico-style captions over the map during readonly review.
 * Playhead is observed via store.subscribe so every animation tick is seen.
 */
export function DanmakuOverlay() {
  const screen = useUiStore((s) => s.screen);
  const active = isReviewReadonly(screen);
  const comments = useProjectStore((s) => s.project.comments);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef(-1);
  const firedRef = useRef(new Set<string>());
  const activeBulletsRef = useRef<ActiveBullet[]>([]);
  const activeRef = useRef(active);
  const commentsRef = useRef(comments);
  activeRef.current = active;
  commentsRef.current = comments;

  const clearStage = () => {
    const root = containerRef.current;
    if (root) root.replaceChildren();
    activeBulletsRef.current = [];
    firedRef.current.clear();
  };

  const spawn = (comment: Comment & { timeStartMs: number }) => {
    const root = containerRef.current;
    if (!root || firedRef.current.has(comment.id)) return;

    firedRef.current.add(comment.id);
    const text = comment.text.trim();
    const textWidth = measureTextWidth(text);
    const width = root.clientWidth || window.innerWidth;
    const height = root.clientHeight || window.innerHeight;
    const distance = width + textWidth;
    const lane = pickLane(
      width,
      height,
      textWidth,
      activeBulletsRef.current,
    );

    const el = document.createElement("div");
    el.className = "danmaku-bullet";
    el.textContent = text;
    el.style.top = `${lane * ROW_HEIGHT + 8}px`;
    el.style.fontSize = `${FONT_SIZE}px`;
    root.appendChild(el);

    const bullet: ActiveBullet = {
      id: comment.id,
      el,
      lane,
      startedAt: performance.now(),
      textWidth,
    };
    activeBulletsRef.current.push(bullet);

    const finish = () => {
      el.remove();
      activeBulletsRef.current = activeBulletsRef.current.filter(
        (b) => b !== bullet,
      );
    };

    // WAAPI is reliable for elements created outside React; CSS keyframes
    // can leave the bullet stuck at left:100% (invisible) in some cases.
    if (typeof el.animate === "function") {
      const anim = el.animate(
        [
          { transform: "translateX(0)" },
          { transform: `translateX(-${distance}px)` },
        ],
        {
          duration: SCROLL_DURATION_MS,
          easing: "linear",
          fill: "forwards",
        },
      );
      anim.onfinish = finish;
      anim.oncancel = finish;
    } else {
      el.style.setProperty("--danmaku-distance", `${distance}px`);
      el.style.animationDuration = `${SCROLL_DURATION_MS}ms`;
      el.addEventListener("animationend", finish, { once: true });
    }
  };

  const onTime = (next: number) => {
    if (!activeRef.current) return;
    if (!containerRef.current) return;

    const prev = lastTimeRef.current;

    // Rewind: allow captions to fire again.
    if (next < prev) {
      clearStage();
    }

    for (const c of commentsRef.current) {
      if (!isDanmakuReady(c)) continue;
      if (firedRef.current.has(c.id)) continue;
      if (shouldFireDanmaku(c.timeStartMs, prev, next)) {
        spawn(c);
      }
    }

    lastTimeRef.current = next;
  };

  // Keep the latest handler in a ref so the store subscription stays stable.
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;

  useEffect(() => {
    clearStage();
    if (!active) {
      lastTimeRef.current = -1;
      return;
    }
    const t = useUiStore.getState().animationTimeMs;
    lastTimeRef.current = t <= 0 ? -1 : t;
    // Evaluate once for the current playhead (scrub-land / resume).
    onTimeRef.current(t);
  }, [active]);

  useEffect(() => {
    const unsub = useUiStore.subscribe((s, prev) => {
      if (s.animationTimeMs === prev.animationTimeMs) return;
      onTimeRef.current(s.animationTimeMs);
    });
    return unsub;
  }, []);

  // New/updated captions while the playhead is still.
  useEffect(() => {
    if (!active) return;
    onTimeRef.current(useUiStore.getState().animationTimeMs);
  }, [comments, active]);

  // Always mount the host so containerRef is ready before the first tick.
  return (
    <div
      ref={containerRef}
      className="danmaku-overlay"
      aria-hidden="true"
      hidden={!active}
    />
  );
}
