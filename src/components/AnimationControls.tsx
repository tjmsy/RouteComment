import { useEffect, useRef } from "react";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { trackDurationMs } from "../lib/gpx";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { isReviewChrome } from "../ui/machine";
import { t } from "../i18n";

const SPEED_OPTIONS = [1, 5, 10, 30, 60, 120] as const;

function formatTime(ms: number, minuteDigits = 1): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m.toString().padStart(minuteDigits, "0")}:${rem.toString().padStart(2, "0")}`;
}

export function AnimationControls() {
  const mobile = useMobileLayout();
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const playbackSpeed = useUiStore((s) => s.playbackSpeed);
  const headingUp = useUiStore((s) => s.headingUp);
  const terrain3d = useUiStore((s) => s.terrain3d);
  const setAnimationTimeMs = useUiStore((s) => s.setAnimationTimeMs);
  const setIsPlaying = useUiStore((s) => s.setIsPlaying);
  const setPlaybackSpeed = useUiStore((s) => s.setPlaybackSpeed);
  const setHeadingUp = useUiStore((s) => s.setHeadingUp);
  const setTerrain3d = useUiStore((s) => s.setTerrain3d);
  const screen = useUiStore((s) => s.screen);

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

  if (!isReviewChrome(screen) || points.length === 0) return null;

  const minuteDigits = Math.max(
    1,
    String(Math.floor(Math.max(duration, 0) / 60_000)).length,
  );

  const cycleSpeed = () => {
    const idx = SPEED_OPTIONS.indexOf(
      playbackSpeed as (typeof SPEED_OPTIONS)[number],
    );
    const next = SPEED_OPTIONS[(idx >= 0 ? idx + 1 : 0) % SPEED_OPTIONS.length];
    setPlaybackSpeed(next);
  };

  const showExtras =
    screen.kind === "review" ||
    screen.kind === "playback" ||
    screen.kind === "layers";

  return (
    <div
      className={
        mobile
          ? "animation-bar animation-bar--mobile"
          : "animation-bar animation-bar--desktop"
      }
    >
      <button
        type="button"
        onClick={() => setIsPlaying(!isPlaying)}
        disabled={duration <= 0}
      >
        {isPlaying ? t("anim.pause") : t("anim.play")}
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
      {showExtras && (
        <div className="animation-bar-extras">
          <button
            type="button"
            className="animation-chip"
            onClick={cycleSpeed}
            title={t("anim.speedTitle")}
          >
            {playbackSpeed}×
          </button>
          <button
            type="button"
            className={headingUp ? "animation-chip active" : "animation-chip"}
            onClick={() => setHeadingUp(!headingUp)}
            title={t("anim.headingTitle")}
            aria-pressed={headingUp}
          >
            {t("anim.headingLabel")}
          </button>
          <button
            type="button"
            className={terrain3d ? "animation-chip active" : "animation-chip"}
            onClick={() => setTerrain3d(!terrain3d)}
            title={t("anim.terrainTitle")}
            aria-pressed={terrain3d}
          >
            {t("anim.terrainLabel")}
          </button>
        </div>
      )}
    </div>
  );
}
