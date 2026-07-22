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
import {
  formatYLabel,
  uniformYAxisSize,
  yRangeForKind,
  type ChartKind,
} from "../lib/chartScales";

type ChartRow = {
  kind: ChartKind;
  label: string;
  color: string;
  getValue: (s: ProfileSample) => number | undefined;
  formatValue: (v: number) => string;
};

const CHART_ROWS: ChartRow[] = [
  {
    kind: "ele",
    label: "Elevation",
    color: "#38bdf8",
    getValue: (s) => s.ele,
    formatValue: (v) => `${v.toFixed(0)} m`,
  },
  {
    kind: "hr",
    label: "Heart rate",
    color: "#f472b6",
    getValue: (s) => s.heartRate,
    formatValue: (v) => `${Math.round(v)} bpm`,
  },
  {
    kind: "speed",
    label: "Speed",
    color: "#a3e635",
    getValue: (s) => s.speedKmh,
    formatValue: (v) => `${v.toFixed(1)} km/h`,
  },
];

const PROFILE_HEADER_H = 32;
const ROW_TOGGLE_H = 22;
const PROFILE_MIN_HEIGHT = 60;
const PROFILE_MAX_HEIGHT_RATIO = 0.5;
const MIN_CHART_HEIGHT = 40;

function clampProfileHeight(h: number): number {
  const max = Math.floor(window.innerHeight * PROFILE_MAX_HEIGHT_RATIO);
  return Math.min(max, Math.max(PROFILE_MIN_HEIGHT, Math.round(h)));
}

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
  const profilePanelHeightPx = useUiStore((s) => s.profilePanelHeightPx);
  const profileChartCollapsed = useUiStore((s) => s.profileChartCollapsed);
  const setAnimationTimeMs = useUiStore((s) => s.setAnimationTimeMs);
  const setIsPlaying = useUiStore((s) => s.setIsPlaying);
  const setElevationStatus = useUiStore((s) => s.setElevationStatus);
  const setProfilePanelHeightPx = useUiStore((s) => s.setProfilePanelHeightPx);
  const toggleProfileChartCollapsed = useUiStore(
    (s) => s.toggleProfileChartCollapsed,
  );

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [elevationPoints, setElevationPoints] = useState(points);
  const [demLoading, setDemLoading] = useState(false);
  const [plotHosts, setPlotHosts] = useState<
    Partial<Record<ChartKind, HTMLDivElement>>
  >({});

  const bodyRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<ChartInstance[]>([]);
  const playheadSecRef = useRef(animationTimeMs / 1000);
  const rangesRef = useRef<{ startSec: number; endSec: number }[]>([]);
  const draggingRef = useRef(false);
  const resizeDragRef = useRef<{ startY: number; startH: number } | null>(null);
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

  const expandedRows = useMemo(
    () => rows.filter((r) => !profileChartCollapsed[r.kind]),
    [rows, profileChartCollapsed],
  );

  const bodyHeight = profilePanelHeightPx - PROFILE_HEADER_H;
  const chartHeight = useMemo(() => {
    if (expandedRows.length === 0) return 0;
    const available =
      bodyHeight - rows.length * ROW_TOGGLE_H - 8;
    return Math.max(
      MIN_CHART_HEIGHT,
      Math.floor(available / expandedRows.length),
    );
  }, [bodyHeight, expandedRows.length, rows.length]);

  const setPlotHost = useCallback(
    (kind: ChartKind, el: HTMLDivElement | null) => {
      setPlotHosts((prev) => {
        if (el) {
          if (prev[kind] === el) return prev;
          return { ...prev, [kind]: el };
        }
        if (!(kind in prev)) return prev;
        const next = { ...prev };
        delete next[kind];
        return next;
      });
    },
    [],
  );

  const destroyCharts = useCallback(() => {
    for (const { plot } of chartsRef.current) {
      plot.destroy();
    }
    chartsRef.current = [];
  }, []);

  const buildCharts = useCallback(() => {
    if (
      panelCollapsed ||
      rows.length === 0 ||
      profile.samples.length === 0 ||
      expandedRows.length === 0 ||
      chartHeight < MIN_CHART_HEIGHT
    ) {
      destroyCharts();
      return;
    }

    const hostsReady = expandedRows.every((r) => plotHosts[r.kind]);
    if (!hostsReady) return;

    const firstHost = plotHosts[expandedRows[0].kind];
    const width = firstHost?.clientWidth ?? 0;
    if (width < 20) return;

    destroyCharts();

    const times = profile.samples.map((s) => s.timeMs / 1000);

    const rowRanges = expandedRows.map((row) => {
      const nums = profile.samples
        .map((s) => row.getValue(s))
        .filter((v): v is number => v != null && Number.isFinite(v));
      return { kind: row.kind, ...yRangeForKind(row.kind, nums) };
    });
    const yAxisSize = uniformYAxisSize(rowRanges);

    const instances: ChartInstance[] = [];

    expandedRows.forEach((row, rowIdx) => {
      const plotHost = plotHosts[row.kind];
      if (!plotHost) return;

      const values = profile.samples.map((s) => row.getValue(s) ?? null);
      const yRange = rowRanges[rowIdx];
      const isLast = rowIdx === expandedRows.length - 1;

      const opts: uPlot.Options = {
        width,
        height: chartHeight,
        pxAlign: 1,
        cursor: { show: false },
        legend: { show: false },
        scales: {
          x: { time: false },
          y: { min: yRange.min, max: yRange.max },
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
            size: yAxisSize,
            font: "10px DM Sans, system-ui, sans-serif",
            gap: 4,
            values: (_u, splits) =>
              splits.map((v) => formatYLabel(row.kind, v)),
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
  }, [
    panelCollapsed,
    destroyCharts,
    profile,
    rows.length,
    expandedRows,
    plotHosts,
    chartHeight,
  ]);

  useEffect(() => {
    buildCharts();
  }, [buildCharts]);

  useEffect(() => {
    if (panelCollapsed) return;
    const el = bodyRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      buildCharts();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [panelCollapsed, buildCharts]);

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
        const metricParts = rows
          .map((row) => {
            const val = row.getValue(sample);
            return val != null ? row.formatValue(val) : null;
          })
          .filter((v): v is string => v != null);
        tooltip.style.display = "block";
        tooltip.style.left = `${clientX - bodyRect.left}px`;
        tooltip.textContent = [
          formatProfileTime(sample.timeMs),
          formatDistanceKm(sample.distanceM),
          ...metricParts,
        ].join(" · ");
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
    if (!el || panelCollapsed) return;

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
  }, [scrubToClientX, panelCollapsed, rows.length]);

  useEffect(() => {
    const onResizeMove = (e: PointerEvent) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const delta = drag.startY - e.clientY;
      setProfilePanelHeightPx(clampProfileHeight(drag.startH + delta));
    };

    const onResizeUp = () => {
      resizeDragRef.current = null;
    };

    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp);
    return () => {
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeUp);
    };
  }, [setProfilePanelHeightPx]);

  useEffect(() => () => destroyCharts(), [destroyCharts]);

  const onResizeHandleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    resizeDragRef.current = {
      startY: e.clientY,
      startH: profilePanelHeightPx,
    };
  };

  if (mode !== "view" || points.length === 0 || !showProfileCharts) return null;
  if (rows.length === 0 && !demLoading) return null;

  const activeFollow = comments.filter((c) =>
    commentActiveAt(c, animationTimeMs),
  );

  return (
    <div
      className={`profile-charts${panelCollapsed ? " profile-charts--collapsed" : ""}`}
      style={{ height: panelCollapsed ? undefined : profilePanelHeightPx }}
    >
      <div
        className="profile-charts-resize-handle"
        onPointerDown={onResizeHandleDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize profile panel"
      />
      <div className="profile-charts-header">
        <button
          type="button"
          className="profile-charts-toggle"
          onClick={() => setPanelCollapsed((c) => !c)}
          aria-expanded={!panelCollapsed}
        >
          {panelCollapsed ? "▸" : "▾"} Profile
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
      {!panelCollapsed && (
        <div
          className="profile-charts-body"
          ref={bodyRef}
          style={{ height: bodyHeight }}
        >
          {rows.map((row) => {
            const rowCollapsed = profileChartCollapsed[row.kind];
            return (
              <div key={row.kind} className="profile-chart-row">
                <button
                  type="button"
                  className="profile-chart-row-toggle"
                  onClick={() => toggleProfileChartCollapsed(row.kind)}
                  aria-expanded={!rowCollapsed}
                >
                  {rowCollapsed ? "▸" : "▾"} {row.label}
                </button>
                {!rowCollapsed && (
                  <div
                    className="profile-chart-plot"
                    style={{ height: chartHeight }}
                    ref={(el) => setPlotHost(row.kind, el)}
                  />
                )}
              </div>
            );
          })}
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
