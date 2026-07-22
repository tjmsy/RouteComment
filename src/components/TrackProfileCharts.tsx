import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { fillElevationFromDem, needsDemElevation } from "../lib/demElevation";
import {
  buildTrackProfile,
  formatDistanceKm,
  formatProfileTime,
  nearestSampleIndex,
  type ProfileSample,
  type TrackProfile,
} from "../lib/trackProfile";
import type { Comment } from "../lib/types";
import { commentActiveAt } from "../lib/types";

type ChartKind = "ele" | "hr" | "speed";

type ChartRow = {
  kind: ChartKind;
  label: string;
  unit: string;
  color: string;
  height: number;
  getValue: (s: ProfileSample) => number | undefined;
  formatValue: (v: number) => string;
};

const CHART_ROWS: ChartRow[] = [
  {
    kind: "ele",
    label: "Elevation",
    unit: "m",
    color: "#38bdf8",
    height: 80,
    getValue: (s) => s.ele,
    formatValue: (v) => `${v.toFixed(0)} m`,
  },
  {
    kind: "hr",
    label: "Heart rate",
    unit: "bpm",
    color: "#f472b6",
    height: 60,
    getValue: (s) => s.heartRate,
    formatValue: (v) => `${Math.round(v)} bpm`,
  },
  {
    kind: "speed",
    label: "Speed",
    unit: "km/h",
    color: "#a3e635",
    height: 60,
    getValue: (s) => s.speedKmh,
    formatValue: (v) => `${v.toFixed(1)} km/h`,
  },
];

function playheadPlugin(getTimeSec: () => number): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const timeSec = getTimeSec();
        if (!Number.isFinite(timeSec)) return;
        const { left, top, width, height } = u.bbox;
        const x = u.valToPos(timeSec, "x", true);
        if (x < left || x > left + width) return;
        const ctx = u.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "#e11d48";
        ctx.lineWidth = 2;
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + height);
        ctx.stroke();
        ctx.restore();
      },
    },
  };
}

function rangeBandsPlugin(
  getRanges: () => { startSec: number; endSec: number }[],
): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const ranges = getRanges();
        if (ranges.length === 0) return;
        const { top, height } = u.bbox;
        const ctx = u.ctx;
        ctx.save();
        for (const { startSec, endSec } of ranges) {
          const x0 = u.valToPos(startSec, "x", true);
          const x1 = u.valToPos(endSec, "x", true);
          ctx.fillStyle = "rgba(245, 158, 11, 0.2)";
          ctx.fillRect(x0, top, x1 - x0, height);
        }
        ctx.restore();
      },
    },
  };
}

function formatAxisTime(sec: number): string {
  return formatProfileTime(sec * 1000);
}

function visibleRows(profile: TrackProfile): ChartRow[] {
  return CHART_ROWS.filter((row) => {
    if (row.kind === "ele") return profile.hasElevation;
    if (row.kind === "hr") return profile.hasHeartRate;
    if (row.kind === "speed") return profile.hasSpeed;
    return false;
  });
}

function selectedFollowRanges(
  comments: Comment[],
  expandedIds: string[],
): { startSec: number; endSec: number }[] {
  const ranges: { startSec: number; endSec: number }[] = [];
  for (const id of expandedIds) {
    const c = comments.find((x) => x.id === id);
    if (!c || c.kind !== "follow") continue;
    if (c.timeStartMs == null || c.timeEndMs == null) continue;
    ranges.push({
      startSec: Math.min(c.timeStartMs, c.timeEndMs) / 1000,
      endSec: Math.max(c.timeStartMs, c.timeEndMs) / 1000,
    });
  }
  return ranges;
}

type ChartInstance = {
  kind: ChartKind;
  plot: uPlot;
};

export function TrackProfileCharts() {
  const points = useProjectStore((s) => s.project.track.points);
  const setTrack = useProjectStore((s) => s.setTrack);
  const comments = useProjectStore((s) => s.project.comments);
  const mode = useUiStore((s) => s.mode);
  const showProfileCharts = useUiStore((s) => s.showProfileCharts);
  const animationTimeMs = useUiStore((s) => s.animationTimeMs);
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const setAnimationTimeMs = useUiStore((s) => s.setAnimationTimeMs);
  const setIsPlaying = useUiStore((s) => s.setIsPlaying);
  const setElevationStatus = useUiStore((s) => s.setElevationStatus);

  const [collapsed, setCollapsed] = useState(false);
  const [elevationPoints, setElevationPoints] = useState(points);
  const [demLoading, setDemLoading] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const chartsMountRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<ChartInstance[]>([]);
  const playheadSecRef = useRef(animationTimeMs / 1000);
  const rangesRef = useRef<{ startSec: number; endSec: number }[]>([]);
  const draggingRef = useRef(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  playheadSecRef.current = animationTimeMs / 1000;
  rangesRef.current = selectedFollowRanges(comments, expandedCommentIds);

  useEffect(() => {
    setElevationPoints(points);
  }, [points]);

  useEffect(() => {
    if (!needsDemElevation(points)) {
      setElevationStatus("done");
      return;
    }

    const controller = new AbortController();
    setDemLoading(true);
    setElevationStatus("loading");

    fillElevationFromDem(points, { signal: controller.signal })
      .then((filled) => {
        setElevationPoints(filled);
        const merged = filled.some(
          (p) => typeof p.ele === "number" && Number.isFinite(p.ele),
        );
        if (merged) {
          setTrack(filled);
          setElevationStatus("done");
        } else {
          setElevationStatus("failed");
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setElevationStatus("failed");
        }
      })
      .finally(() => {
        setDemLoading(false);
      });

    return () => controller.abort();
  }, [points, setTrack, setElevationStatus]);

  const profile = useMemo(
    () => buildTrackProfile(elevationPoints),
    [elevationPoints],
  );

  const rows = useMemo(() => visibleRows(profile), [profile]);

  const destroyCharts = useCallback(() => {
    for (const { plot } of chartsRef.current) {
      plot.destroy();
    }
    chartsRef.current = [];
    chartsMountRef.current?.replaceChildren();
  }, []);

  const buildCharts = useCallback(() => {
    const mount = chartsMountRef.current;
    if (!mount || collapsed || rows.length === 0 || profile.samples.length === 0) {
      return;
    }

    const width = mount.clientWidth;
    if (width < 20) return;

    destroyCharts();

    const times = profile.samples.map((s) => s.timeMs / 1000);
    const instances: ChartInstance[] = [];

    rows.forEach((row, rowIdx) => {
      const values = profile.samples.map((s) => row.getValue(s) ?? null);

      const rowEl = document.createElement("div");
      rowEl.className = "profile-chart-row";

      const label = document.createElement("span");
      label.className = "profile-chart-label";
      label.textContent = row.label;
      rowEl.appendChild(label);

      const plotHost = document.createElement("div");
      plotHost.className = "profile-chart-plot";
      rowEl.appendChild(plotHost);
      mount.appendChild(rowEl);

      const isLast = rowIdx === rows.length - 1;

      const opts: uPlot.Options = {
        width,
        height: row.height,
        pxAlign: 1,
        cursor: { show: false },
        legend: { show: false },
        scales: {
          x: { time: false },
          y: { auto: true },
        },
        axes: [
          {
            show: isLast,
            stroke: "#9aab9e",
            grid: { show: true, stroke: "rgba(154,171,158,0.15)" },
            ticks: { show: isLast, stroke: "#9aab9e" },
            values: (_u, splits) => splits.map((v) => formatAxisTime(v)),
            font: "10px DM Sans, system-ui, sans-serif",
            gap: 4,
          },
          {
            show: true,
            stroke: "#9aab9e",
            grid: { show: true, stroke: "rgba(154,171,158,0.1)" },
            ticks: { show: false },
            size: 42,
            font: "10px DM Sans, system-ui, sans-serif",
            gap: 4,
          },
        ],
        series: [
          {},
          {
            label: row.label,
            stroke: row.color,
            width: 1.5,
            fill: row.kind === "ele" ? "rgba(56,189,248,0.15)" : undefined,
            points: { show: false },
          },
        ],
        plugins: [
          rangeBandsPlugin(() => rangesRef.current),
          playheadPlugin(() => playheadSecRef.current),
        ],
      };

      const plot = new uPlot(opts, [times, values], plotHost);
      instances.push({ kind: row.kind, plot });
    });

    chartsRef.current = instances;
  }, [collapsed, destroyCharts, profile, rows]);

  useEffect(() => {
    if (collapsed) {
      destroyCharts();
      return;
    }
    buildCharts();
  }, [collapsed, buildCharts, destroyCharts]);

  useEffect(() => {
    if (collapsed) return;
    const mount = chartsMountRef.current;
    if (!mount) return;

    const ro = new ResizeObserver(() => {
      buildCharts();
    });
    ro.observe(mount);
    return () => ro.disconnect();
  }, [collapsed, buildCharts]);

  const scrubToClientX = useCallback(
    (clientX: number) => {
      const charts = chartsRef.current;
      if (charts.length === 0 || profile.samples.length === 0) return;
      const plot = charts[0].plot;
      const rect = plot.over.getBoundingClientRect();
      const relX = clientX - rect.left;
      const timeSec = plot.posToVal(relX, "x");
      const maxSec = profile.samples[profile.samples.length - 1].timeMs / 1000;
      const clamped = Math.max(0, Math.min(maxSec, timeSec));
      setIsPlaying(false);
      setAnimationTimeMs(clamped * 1000);

      const idx = nearestSampleIndex(profile.samples, clamped * 1000);
      const sample = profile.samples[idx];
      const tooltip = tooltipRef.current;
      const body = bodyRef.current;
      if (tooltip && sample && body) {
        const bodyRect = body.getBoundingClientRect();
        const row = rows[0];
        const val = row?.getValue(sample);
        tooltip.style.display = "block";
        tooltip.style.left = `${clientX - bodyRect.left}px`;
        tooltip.textContent = [
          formatProfileTime(sample.timeMs),
          formatDistanceKm(sample.distanceM),
          val != null && row ? row.formatValue(val) : "",
        ]
          .filter(Boolean)
          .join(" · ");
      }
    },
    [profile, rows, setAnimationTimeMs, setIsPlaying],
  );

  useEffect(() => {
    for (const { plot } of chartsRef.current) {
      plot.redraw();
    }
  }, [animationTimeMs, expandedCommentIds]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || collapsed) return;

    const onMove = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) return;
      scrubToClientX(e.clientX);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      draggingRef.current = true;
      el.setPointerCapture(e.pointerId);
      scrubToClientX(e.clientX);
    };

    const onUp = (e: PointerEvent) => {
      draggingRef.current = false;
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      const tooltip = tooltipRef.current;
      if (tooltip && !draggingRef.current) {
        tooltip.style.display = "none";
      }
    };

    const onLeave = () => {
      draggingRef.current = false;
      const tooltip = tooltipRef.current;
      if (tooltip) tooltip.style.display = "none";
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [scrubToClientX, collapsed, rows.length]);

  useEffect(() => () => destroyCharts(), [destroyCharts]);

  if (mode !== "view" || points.length === 0 || !showProfileCharts) return null;
  if (rows.length === 0 && !demLoading) return null;

  const activeFollow = comments.filter((c) =>
    commentActiveAt(c, animationTimeMs),
  );

  return (
    <div className={`profile-charts${collapsed ? " profile-charts--collapsed" : ""}`}>
      <div className="profile-charts-header">
        <button
          type="button"
          className="profile-charts-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? "▸" : "▾"} Profile
        </button>
        {demLoading && (
          <span className="profile-charts-status">Loading elevation…</span>
        )}
        {!demLoading && !profile.hasElevation && needsDemElevation(points) && (
          <span className="profile-charts-status profile-charts-status--warn">
            Elevation unavailable
          </span>
        )}
        {activeFollow.length > 0 && (
          <span className="profile-charts-follow">
            {activeFollow.map((c) => c.text).join(" · ")}
          </span>
        )}
      </div>
      {!collapsed && (
        <div className="profile-charts-body" ref={bodyRef}>
          <div ref={chartsMountRef} className="profile-charts-mount" />
          {rows.length === 0 && demLoading && (
            <p className="profile-charts-empty">Waiting for elevation data…</p>
          )}
          <div
            ref={tooltipRef}
            className="profile-chart-tooltip"
            style={{ display: "none" }}
          />
        </div>
      )}
    </div>
  );
}
