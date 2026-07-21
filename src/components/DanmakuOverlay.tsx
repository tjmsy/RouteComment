import { useEffect, useRef } from "react";
import type { Comment } from "../lib/types";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";

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

export function DanmakuOverlay() {
  const mode = useUiStore((s) => s.mode);
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const comments = useProjectStore((s) => s.project.comments);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef(animationTimeMs);
  const firedRef = useRef(new Set<string>());
  const activeRef = useRef<ActiveBullet[]>([]);

  const clearStage = () => {
    const root = containerRef.current;
    if (root) root.replaceChildren();
    activeRef.current = [];
    firedRef.current.clear();
  };

  // Entering view: sync cursor without back-filling past comments.
  // At t=0 use -1 so the first advance can still fire comments at 0.
  // Leaving view: tear down the stage.
  useEffect(() => {
    clearStage();
    const t = useUiStore.getState().animationTimeMs;
    lastTimeRef.current = mode === "view" && t <= 0 ? -1 : t;
  }, [mode]);

  useEffect(() => {
    if (mode !== "view") return;
    const root = containerRef.current;
    if (!root) return;

    const prev = lastTimeRef.current;
    const next = animationTimeMs;

    if (next < prev - 50) {
      clearStage();
      lastTimeRef.current = next <= 0 ? -1 : next;
      return;
    }

    const danmaku = comments.filter(
      (c): c is Comment & { timeStartMs: number } =>
        c.kind === "danmaku" &&
        typeof c.timeStartMs === "number" &&
        c.text.trim().length > 0,
    );

    for (const c of danmaku) {
      if (firedRef.current.has(c.id)) continue;
      if (c.timeStartMs > prev && c.timeStartMs <= next) {
        spawn(c, root);
      }
    }

    lastTimeRef.current = next;
  }, [animationTimeMs, comments, mode]);

  function spawn(
    comment: Comment & { timeStartMs: number },
    root: HTMLDivElement,
  ) {
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
  }

  if (mode !== "view") return null;

  return (
    <div ref={containerRef} className="danmaku-overlay" aria-hidden="true" />
  );
}
