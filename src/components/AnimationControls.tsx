import { useEffect, useRef } from "react";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { trackDurationMs } from "../lib/gpx";

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function AnimationControls() {
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const playbackSpeed = useUiStore((s) => s.playbackSpeed);
  const headingUp = useUiStore((s) => s.headingUp);
  const setAnimationTimeMs = useUiStore((s) => s.setAnimationTimeMs);
  const setIsPlaying = useUiStore((s) => s.setIsPlaying);
  const setPlaybackSpeed = useUiStore((s) => s.setPlaybackSpeed);
  const setHeadingUp = useUiStore((s) => s.setHeadingUp);
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
        {formatTime(animationTimeMs)} / {formatTime(duration)}
      </span>
      <label className="speed">
        Speed
        <select
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
        >
          <option value={1}>1×</option>
          <option value={5}>5×</option>
          <option value={10}>10×</option>
          <option value={30}>30×</option>
          <option value={60}>60×</option>
          <option value={120}>120×</option>
        </select>
      </label>
      <label className="heading-up check">
        <input
          type="checkbox"
          checked={headingUp}
          onChange={(e) => setHeadingUp(e.target.checked)}
        />
        Heading up
      </label>
    </div>
  );
}
