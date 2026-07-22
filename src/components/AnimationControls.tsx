import { useEffect, useRef } from "react";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { trackDurationMs } from "../lib/gpx";

function formatTime(ms: number, minuteDigits = 1): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m.toString().padStart(minuteDigits, "0")}:${rem.toString().padStart(2, "0")}`;
}

export function AnimationControls() {
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const playbackSpeed = useUiStore((s) => s.playbackSpeed);
  const setAnimationTimeMs = useUiStore((s) => s.setAnimationTimeMs);
  const setIsPlaying = useUiStore((s) => s.setIsPlaying);
  const mode = useUiStore((s) => s.mode);

  const points = useProjectStore((s) => s.project.track.points);
  const duration = trackDurationMs(points);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying || duration <= 0) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }

    const loop = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) * playbackSpeed;
      lastTsRef.current = ts;

      const cur = useUiStore.getState().animationTimeMs;
      const next = cur + dt;
      if (next >= duration) {
        setAnimationTimeMs(duration);
        setIsPlaying(false);
        return;
      }
      setAnimationTimeMs(next);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [isPlaying, duration, playbackSpeed, setAnimationTimeMs, setIsPlaying]);

  if (mode !== "view" || points.length === 0) return null;

  // Keep label width stable so the range does not jitter as digits change.
  const minuteDigits = Math.max(
    1,
    String(Math.floor(Math.max(duration, 0) / 60_000)).length,
  );

  return (
    <div className="animation-bar">
      <button
        type="button"
        onClick={() => setIsPlaying(!isPlaying)}
        disabled={duration <= 0}
      >
        {isPlaying ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(duration, 1)}
        step={100}
        value={Math.min(animationTimeMs, duration)}
        onChange={(e) => {
          setIsPlaying(false);
          setAnimationTimeMs(Number(e.target.value));
        }}
        disabled={duration <= 0}
      />
      <span className="time-label">
        {formatTime(animationTimeMs, minuteDigits)} /{" "}
        {formatTime(duration, minuteDigits)}
      </span>
    </div>
  );
}
