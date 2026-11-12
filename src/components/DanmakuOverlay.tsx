import { useEffect, useRef, useState } from "react";
import type { Comment } from "../lib/types";
import {
  DANMAKU_SCROLL_MS,
  danmakuActiveAt,
  singleLineDanmakuCaption,
} from "../lib/danmakuTiming";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { isReviewReadonly } from "../ui/machine";

const AREA_RATIO = 0.65;

function rowHeight(fontSize: number): number {
  return Math.round(fontSize * 1.4);
}

function maxLanes(containerHeight: number, fontSize: number): number {
  return Math.max(
    1,
    Math.floor((containerHeight * AREA_RATIO) / rowHeight(fontSize))
  );
}

function laneForId(id: string, laneCount: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % Math.max(1, laneCount);
}

type ArmedBullet = {
  comment: Comment;
  lane: number;
  armedAt: number;
};

/**
 * Captions mirror follow bubbles: React subscribes to animationTimeMs and
 * arms when danmakuActiveAt is true. Display then runs on wall-clock so high
 * playback speed cannot tear the bullet down mid-scroll.
 */
export function DanmakuOverlay() {
  const screen = useUiStore((s) => s.screen);
  const review = isReviewReadonly(screen);
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const showCaptions = useUiStore((s) => s.showCaptions);
  const captionFontSize = useUiStore((s) => s.captionFontSize);
  const comments = useProjectStore((s) => s.project.comments);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [laneCount, setLaneCount] = useState(3);
  const [armed, setArmed] = useState<ArmedBullet[]>([]);
  const lastTimeRef = useRef(animationTimeMs);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const update = () =>
      queueMicrotask(() =>
        setLaneCount(maxLanes(el.clientHeight || 300, captionFontSize))
      );
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [review, captionFontSize]);

  useEffect(() => {
    if (!review || !showCaptions) {
      queueMicrotask(() => {
        setArmed([]);
        lastTimeRef.current = 0;
      });
    }
  }, [review, showCaptions]);

  useEffect(() => {
    if (!review || !showCaptions) return;

    const prev = lastTimeRef.current;
    const next = animationTimeMs;
    lastTimeRef.current = next;
    const now = performance.now();

    queueMicrotask(() => {
      setArmed((curr) => {
        // Drop finished scrolls and captions rewound before their trigger.
        let list = curr.filter((b) => {
          const start = b.comment.timeStartMs ?? 0;
          if (next < start) return false;
          if (now - b.armedAt >= DANMAKU_SCROLL_MS) return false;
          return true;
        });

        const armedIds = new Set(list.map((b) => b.comment.id));

        const tryArm = (c: Comment) => {
          if (armedIds.has(c.id)) return;
          if (c.kind !== "danmaku" || !singleLineDanmakuCaption(c.text)) return;
          if (c.timeStartMs == null) return;
          list = [
            ...list,
            {
              comment: c,
              lane: laneForId(c.id, laneCount),
              armedAt: now,
            },
          ];
          armedIds.add(c.id);
        };

        // Same gate as follow: playhead inside the active window.
        for (const c of comments) {
          if (danmakuActiveAt(c, next)) tryArm(c);
        }

        // High-speed jump that skipped the window: still arm if we crossed.
        if (next > prev) {
          for (const c of comments) {
            if (c.kind !== "danmaku" || c.timeStartMs == null) continue;
            if (!singleLineDanmakuCaption(c.text)) continue;
            if (c.timeStartMs > prev && c.timeStartMs <= next) tryArm(c);
          }
        }

        return list;
      });
    });
  }, [animationTimeMs, comments, review, laneCount, showCaptions]);

  useEffect(() => {
    if (armed.length === 0) return;
    const id = window.setInterval(() => {
      const now = performance.now();
      setArmed((curr) => {
        const next = curr.filter((b) => now - b.armedAt < DANMAKU_SCROLL_MS);
        return next.length === curr.length ? curr : next;
      });
    }, 400);
    return () => window.clearInterval(id);
  }, [armed.length]);

  if (!review) return null;

  return (
    <div ref={overlayRef} className="danmaku-overlay" aria-hidden="true">
      {armed.map((b) => (
        <DanmakuBullet
          key={`${b.comment.id}-${Math.round(b.armedAt)}`}
          text={singleLineDanmakuCaption(b.comment.text)}
          lane={b.lane}
          fontSize={captionFontSize}
        />
      ))}
    </div>
  );
}

function DanmakuBullet({
  text,
  lane,
  fontSize,
}: {
  text: string;
  lane: number;
  fontSize: number;
}) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const parent = el.parentElement;
    const width = parent?.clientWidth || window.innerWidth;
    const textWidth = el.offsetWidth || text.length * fontSize * 0.6;
    el.style.setProperty("--danmaku-distance", `${width + textWidth}px`);
  }, [text, fontSize]);

  return (
    <div
      ref={elRef}
      className="danmaku-bullet"
      style={{
        top: `${lane * rowHeight(fontSize) + 8}px`,
        fontSize: `${fontSize}px`,
        animationDuration: `${DANMAKU_SCROLL_MS}ms`,
      }}
    >
      {text}
    </div>
  );
}
