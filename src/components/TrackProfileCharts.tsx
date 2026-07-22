import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
  uniformYAxisLayout,
  yRangeForKind,
  type ChartKind,
} from "../lib/chartScales";
import { formatPaceValue, clampPace } from "../lib/trackSpeed";

const CURSOR_SYNC_KEY = "profile";
/** Reserve the same bottom space as a visible x-axis on every chart. */
const X_AXIS_SPACE = 22;

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
    label: "Pace",
    color: "#a3e635",
    getValue: (s) =>
      s.paceMinPerKm != null ? clampPace(s.paceMinPerKm) : undefined,
    formatValue: (v) => `${formatPaceValue(v)} min/km`,
  },
];

const PROFILE_HEADER_MIN_H = 36;
const PROFILE_MIN_HEIGHT = 60;
const PROFILE_MAX_HEIGHT_RATIO = 0.5;
const MIN_CHART_HEIGHT = 40;
/** Matches `.profile-chart-row` margin-bottom. */
const CHART_ROW_GAP_PX = 2;

function clampProfileHeight(h: number): number {
  const max = Math.floor(window.innerHeight * PROFILE_MAX_HEIGHT_RATIO);
  return Math.min(max, Math.max(PROFILE_MIN_HEIGHT, Math.round(h)));
}

function fillSeriesGaps(values: (number | undefined | null)[]): number[] {
  const n = values.length;
  if (n === 0) return [];

  const out = new Array<number>(n);
  const valid = values.map((v) =>
    v != null && Number.isFinite(v) ? v : null,
  );

  let last: number | null = null;
  for (let i = 0; i < n; i++) {
    if (valid[i] != null) last = valid[i];
  }
  let next: number | null = null;
  for (let i = n - 1; i >= 0; i--) {
    if (valid[i] != null) next = valid[i];
    if (valid[i] == null && next != null) valid[i] = next;
    next = valid[i] ?? next;
  }
  for (let i = 0; i < n; i++) {
    if (valid[i] == null && last != null) valid[i] = last;
    if (valid[i] != null) last = valid[i];
    out[i] = valid[i] ?? 0;
  }
  return out;
}

type ScrubHandler = (
  plot: uPlot,
  clientX: number,
  source: "hover" | "drag",
) => void;

function attachPlotScrub(
  plot: uPlot,
  onScrub: ScrubHandler,
  onScrubEnd: () => void,
): () => void {
  const over = plot.over;

  const scrub = (e: PointerEvent, source: "hover" | "drag") =>
    onScrub(plot, e.clientX, source);

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    over.setPointerCapture(e.pointerId);
    scrub(e, "drag");
  };

  const onMove = (e: PointerEvent) => {
    if (over.hasPointerCapture(e.pointerId)) {
      scrub(e, "drag");
      return;
    }
    scrub(e, "hover");
  };

  const end = (e: PointerEvent) => {
    if (over.hasPointerCapture(e.pointerId)) {
      over.releasePointerCapture(e.pointerId);
    }
    onScrubEnd();
  };

  over.addEventListener("pointerdown", onDown);
  over.addEventListener("pointermove", onMove);
  over.addEventListener("pointerup", end);
  over.addEventListener("pointercancel", end);

  return () => {
    over.removeEventListener("pointerdown", onDown);
    over.removeEventListener("pointermove", onMove);
    over.removeEventListener("pointerup", end);
    over.removeEventListener("pointercancel", end);
  };
}

function scheduleChartBuild(
  buildFn: () => void,
  scheduleRef: { current: number },
) {
  cancelAnimationFrame(scheduleRef.current);
  scheduleRef.current = requestAnimationFrame(() => {
    buildFn();
    scheduleRef.current = requestAnimationFrame(buildFn);
  });
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
  /** Content-box height of the charts body (excludes padding). */
  const [bodyContentH, setBodyContentH] = useState(0);

  const bodyRef = useRef<HTMLDivElement>(null);
  const plotHostsRef = useRef<Partial<Record<ChartKind, HTMLDivElement>>>({});
  const chartsRef = useRef<ChartInstance[]>([]);
  const scrubCleanupRef = useRef<(() => void)[]>([]);
  const buildChartsRef = useRef<() => void>(() => {});
  const scheduleBuildRef = useRef(0);
  const playheadSecRef = useRef(animationTimeMs / 1000);
  const rangesRef = useRef<{ startSec: number; endSec: number }[]>([]);
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

  const chartHeight = useMemo(() => {
    if (expandedRows.length === 0) return 0;
    // Prefer measured body content height so chrome (handle/header/padding)
    // cannot push charts past the panel and force a scrollbar.
    const n = expandedRows.length;
    const gaps = Math.max(0, n - 1) * CHART_ROW_GAP_PX;
    const measured = bodyContentH > 0 ? bodyContentH - gaps : 0;
    if (measured > 0) {
      return Math.max(MIN_CHART_HEIGHT, Math.floor(measured / n));
    }
    const fallback =
      profilePanelHeightPx - PROFILE_HEADER_MIN_H - 14 - gaps;
    return Math.max(MIN_CHART_HEIGHT, Math.floor(fallback / n));
  }, [profilePanelHeightPx, expandedRows.length, bodyContentH]);

  const hideTooltip = useCallback(() => {
    const tooltip = tooltipRef.current;
    if (tooltip) tooltip.style.display = "none";
  }, []);

  const scrubOnPlot = useCallback(
    (plot: uPlot, clientX: number, source: "hover" | "drag") => {
      // Hover scrub while playing would jump the playhead and pause — ignore it.
      // Intentional click/drag still seeks and pauses.
      if (source === "hover" && useUiStore.getState().isPlaying) return;
      if (profile.samples.length === 0) return;
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
        tooltip.textContent = [
          formatProfileTime(sample.timeMs),
          formatDistanceKm(sample.distanceM),
          ...metricParts,
        ].join(" · ");
        tooltip.style.display = "block";
        // Center on cursor, then clamp so the tooltip stays inside the panel.
        const pad = 4;
        const half = tooltip.offsetWidth / 2;
        const x = clientX - bodyRect.left;
        const minX = half + pad;
        const maxX = bodyRect.width - half - pad;
        const left = maxX >= minX ? Math.min(maxX, Math.max(minX, x)) : bodyRect.width / 2;
        tooltip.style.left = `${left}px`;
      }
    },
    [profile, rows, setAnimationTimeMs, setIsPlaying],
  );

  const bindPlotHost = useCallback((kind: ChartKind, el: HTMLDivElement | null) => {
    const prev = plotHostsRef.current[kind];
    if (el) plotHostsRef.current[kind] = el;
    else delete plotHostsRef.current[kind];
    if (prev === el || !el) return;
    scheduleChartBuild(() => buildChartsRef.current(), scheduleBuildRef);
  }, []);

  const destroyCharts = useCallback(() => {
    for (const cleanup of scrubCleanupRef.current) cleanup();
    scrubCleanupRef.current = [];
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

    const hosts = plotHostsRef.current;
    const hostsReady = expandedRows.every((r) => hosts[r.kind]);
    if (!hostsReady) return;

    const firstHost = hosts[expandedRows[0].kind];
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
    const yAxisLayout = uniformYAxisLayout(rowRanges);
    const { size: yAxisSize, labelChars: yLabelChars } = yAxisLayout;

    const instances: ChartInstance[] = [];

    expandedRows.forEach((row, rowIdx) => {
      const plotHost = hosts[row.kind];
      if (!plotHost) return;

      const values = fillSeriesGaps(
        profile.samples.map((s) => row.getValue(s)),
      );
      const yRange = rowRanges[rowIdx];
      const isLast = rowIdx === expandedRows.length - 1;

      const opts: uPlot.Options = {
        width,
        height: chartHeight,
        pxAlign: 1,
        padding: [4, 8, 4, 0],
        cursor: {
          show: true,
          x: true,
          y: false,
          points: { show: false },
          drag: { setScale: false, x: false, y: false },
          sync: { key: CURSOR_SYNC_KEY, scales: ["x", null] },
        },
        legend: { show: false },
        scales: {
          x: { time: false },
          y:
            row.kind === "speed"
              ? {
                  // Fixed range array disables uPlot y auto-scale. Default
                  // redraw() re-sets x and would otherwise re-range y from
                  // full data (widening pace thresholds when Play starts).
                  dir: -1,
                  range: [yRange.min, yRange.max],
                }
              : { range: [yRange.min, yRange.max] },
        },
        axes: [
          {
            show: true,
            size: X_AXIS_SPACE,
            stroke: isLast ? "#9aab9e" : "transparent",
            grid: {
              show: isLast,
              stroke: "rgba(154,171,158,0.15)",
            },
            ticks: { show: isLast, stroke: "#9aab9e" },
            values: isLast
              ? (_u, splits) => splits.map((v) => formatAxisTime(v))
              : () => [],
            font: "10px DM Sans, system-ui, sans-serif",
            gap: 4,
          },
          {
            show: true,
            stroke: "#9aab9e",
            grid: { show: true, stroke: "rgba(154,171,158,0.1)" },
            ticks: { show: false },
            size: () => yAxisSize,
            font: "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            gap: 4,
            values: (_u, splits) =>
              splits.map((v) =>
                formatYLabel(row.kind, v).padStart(yLabelChars, " "),
              ),
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
      scrubCleanupRef.current.push(
        attachPlotScrub(plot, scrubOnPlot, hideTooltip),
      );
      instances.push({ kind: row.kind, plot });
    });

    chartsRef.current = instances;
  }, [
    panelCollapsed,
    destroyCharts,
    profile,
    rows.length,
    expandedRows,
    chartHeight,
    scrubOnPlot,
    hideTooltip,
  ]);

  buildChartsRef.current = buildCharts;

  useLayoutEffect(() => {
    buildCharts();
    if (
      !panelCollapsed &&
      expandedRows.length > 0 &&
      profile.samples.length > 0 &&
      chartHeight >= MIN_CHART_HEIGHT &&
      chartsRef.current.length === 0
    ) {
      scheduleChartBuild(() => buildChartsRef.current(), scheduleBuildRef);
    }
  }, [buildCharts, panelCollapsed, expandedRows.length, profile.samples.length, chartHeight]);

  useEffect(
    () => () => cancelAnimationFrame(scheduleBuildRef.current),
    [],
  );

  useLayoutEffect(() => {
    if (panelCollapsed) {
      setBodyContentH(0);
      return;
    }
    const el = bodyRef.current;
    if (!el) return;

    const measure = () => {
      const style = getComputedStyle(el);
      const padY =
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0);
      const next = Math.max(0, Math.floor(el.clientHeight - padY));
      setBodyContentH((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(() => {
      measure();
      const charts = chartsRef.current;
      const width =
        plotHostsRef.current[expandedRows[0]?.kind]?.clientWidth ?? 0;
      if (charts.length > 0 && width >= 20) {
        for (const { plot } of charts) {
          // Height is driven by chartHeight → buildCharts; only sync width here.
          if (plot.width !== width) {
            plot.setSize({ width, height: plot.height });
          }
        }
        return;
      }
      buildCharts();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [panelCollapsed, buildCharts, expandedRows]);

  useEffect(() => {
    for (const { plot } of chartsRef.current) {
      // rebuildPaths=false: redraw playhead without setScale('x'), which would
      // auto-expand y ranges and compress the pace series when Play starts.
      plot.redraw(false);
    }
  }, [animationTimeMs, expandedCommentIds]);

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
        {!panelCollapsed && rows.length > 0 && (
          <div
            className="profile-charts-series-toggles"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {rows.map((row) => (
              <label
                key={row.kind}
                className="profile-charts-series-toggle"
                style={{ "--series-color": row.color } as CSSProperties}
              >
                <input
                  type="checkbox"
                  checked={!profileChartCollapsed[row.kind]}
                  onChange={() => toggleProfileChartCollapsed(row.kind)}
                />
                {row.label}
              </label>
            ))}
          </div>
        )}
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
        <div className="profile-charts-body" ref={bodyRef}>
          {expandedRows.length === 0 && rows.length > 0 && (
            <p className="profile-charts-empty">
              Select a series above to show charts.
            </p>
          )}
          {expandedRows.map((row) => (
            <div key={row.kind} className="profile-chart-row">
              <div
                className="profile-chart-plot"
                style={{ height: chartHeight }}
                ref={(el) => bindPlotHost(row.kind, el)}
              />
            </div>
          ))}
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
