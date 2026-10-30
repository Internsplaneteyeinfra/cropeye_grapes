import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, Minimize2, X } from "lucide-react";
import {
  plotBoundary,
  plotCenter,
  type OwnerPlotRecord,
} from "../../utils/ownerPortfolio";
import type { SeasonStage } from "../../hooks/useOwnerSeasonStages";
import { monthLabel, monthOf } from "../../utils/pruningOverview";
import { plotFarmerKey } from "./OwnerScopeSelector";
import { fmt, fmtInt } from "./ownerDashboardUi";

export type MapColorMode = "stage" | "foundation" | "fruit" | "yield" | "brix";

export const MAP_COLOR_MODES: { key: MapColorMode; label: string }[] = [
  { key: "stage", label: "Crop stage" },
  { key: "foundation", label: "Foundation pruning" },
  { key: "fruit", label: "Fruit pruning" },
  { key: "yield", label: "Expected yield" },
  { key: "brix", label: "Brix" },
];

/** Geographic centre of Maharashtra, used only until plots are loaded. */
const MAHARASHTRA_CENTER: [number, number] = [19.6, 75.5];
const POLYGON_LIMIT = 600;

const PALETTE = [
  "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6",
  "#ef4444", "#84cc16", "#6366f1", "#f97316", "#06b6d4", "#eab308",
];
const RAMP = { high: "#16a34a", medium: "#f59e0b", low: "#ef4444" };
const MUTED = { none: "#94a3b8", loading: "#cbd5e1", unavailable: "#64748b" };

type Category = { key: string; label: string; color: string; plots: number; farmers: number };

const isPruningMode = (m: MapColorMode) => m === "foundation" || m === "fruit";

const brixOf = (p: OwnerPlotRecord) => {
  const v = p.agro?.brix;
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
};
const yieldOf = (p: OwnerPlotRecord) => {
  const v = p.agro?.yieldTPerAcre;
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
};

const formatDay = (iso: string | null) => {
  if (!iso) return "Not saved";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "Not saved";
};

const FitToPlots: React.FC<{ points: [number, number][]; fitKey: string }> = ({ points, fitKey }) => {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 200);
    return () => window.clearTimeout(timer);
  }, [map]);
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 16);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
};

/** Keeps the overview zoom; only pans when the selected plot is outside the visible area. */
const FocusPlot: React.FC<{ point: [number, number] | null }> = ({ point }) => {
  const map = useMap();
  useEffect(() => {
    if (point && !map.getBounds().pad(-0.1).contains(point)) {
      map.panTo(point, { animate: true, duration: 0.5 });
    }
  }, [map, point]);
  return null;
};

/** Leaflet only tracks window resizes; the card height follows the side column, so watch the container. */
const ResizeOnChange: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);
  return null;
};

type Props = {
  plots: OwnerPlotRecord[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  colorMode: MapColorMode;
  onColorModeChange: (mode: MapColorMode) => void;
  stages: Map<string, SeasonStage>;
  stagesFailed: Set<string>;
};

const OwnerPortfolioMap: React.FC<Props> = ({
  plots,
  selectedKey,
  onSelect,
  colorMode,
  onColorModeChange,
  stages,
  stagesFailed,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isFull, setIsFull] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [dismissedSelectedPopup, setDismissedSelectedPopup] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => setHighlight(null), [colorMode, plots]);
  useEffect(() => setDismissedSelectedPopup(null), [selectedKey]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen?.();
  };

  const located = useMemo(
    () =>
      plots
        .map((p) => ({ plot: p, center: plotCenter(p), boundary: plotBoundary(p) }))
        .filter((p): p is { plot: OwnerPlotRecord; center: [number, number]; boundary: [number, number][] | null } =>
          p.center != null,
        ),
    [plots],
  );

  const range = useMemo(() => {
    const values = located
      .map((p) => (colorMode === "yield" ? yieldOf(p.plot) : brixOf(p.plot)))
      .filter((v): v is number => v != null);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
  }, [located, colorMode]);

  /** Raw category key and label for one plot in the current colour mode. */
  const rawCategory = (plot: OwnerPlotRecord): { key: string; label: string } => {
    if (colorMode === "yield" || colorMode === "brix") {
      const v = colorMode === "yield" ? yieldOf(plot) : brixOf(plot);
      if (v == null || !range) return { key: "~none", label: "No data" };
      const t = range.max > range.min ? (v - range.min) / (range.max - range.min) : 0.5;
      const unit = colorMode === "yield" ? " T/ac" : "°";
      const lowCut = range.min + (range.max - range.min) * 0.33;
      const highCut = range.min + (range.max - range.min) * 0.66;
      if (t >= 0.66) return { key: "high", label: `High (≥ ${fmt(highCut, 1)}${unit})` };
      if (t >= 0.33) return { key: "medium", label: "Medium" };
      return { key: "low", label: `Low (< ${fmt(lowCut, 1)}${unit})` };
    }
    const stage = stages.get(plot.plotId);
    if (!stage) {
      return stagesFailed.has(plot.plotId)
        ? { key: "~unavailable", label: "Schedule unavailable" }
        : { key: "~loading", label: "Loading…" };
    }
    if (colorMode === "stage") {
      return stage.stageName ? { key: stage.stageName, label: stage.stageName } : { key: "~none", label: "No stage" };
    }
    const month = monthOf(colorMode === "foundation" ? stage.savedFoundationPruningDate : stage.savedFruitPruningDate);
    return month ? { key: month, label: monthLabel(month) } : { key: "~none", label: "No date saved" };
  };

  const plotCategory = useMemo(() => {
    const out = new Map<string, string>();
    located.forEach(({ plot }) => out.set(plot.key, rawCategory(plot).key));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located, colorMode, stages, stagesFailed, range]);

  const categories = useMemo<Category[]>(() => {
    const acc = new Map<string, { label: string; plots: number; farmers: Set<string> }>();
    located.forEach(({ plot }) => {
      const { key, label } = rawCategory(plot);
      const entry = acc.get(key) ?? { label, plots: 0, farmers: new Set<string>() };
      entry.plots += 1;
      entry.farmers.add(plotFarmerKey(plot));
      acc.set(key, entry);
    });
    const rampOrder = ["high", "medium", "low"];
    const list = [...acc.entries()].sort(([a, x], [b, y]) => {
      const am = a.startsWith("~");
      const bm = b.startsWith("~");
      if (am !== bm) return am ? 1 : -1;
      if (colorMode === "yield" || colorMode === "brix") return rampOrder.indexOf(a) - rampOrder.indexOf(b);
      if (isPruningMode(colorMode)) return a.localeCompare(b);
      return y.plots - x.plots || a.localeCompare(b);
    });
    let paletteIndex = 0;
    return list.map(([key, v]) => {
      let color: string;
      if (key === "~none") color = MUTED.none;
      else if (key === "~loading") color = MUTED.loading;
      else if (key === "~unavailable") color = MUTED.unavailable;
      else if (key in RAMP) color = RAMP[key as keyof typeof RAMP];
      else color = PALETTE[paletteIndex++ % PALETTE.length];
      return { key, label: v.label, color, plots: v.plots, farmers: v.farmers.size };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located, colorMode, stages, stagesFailed, range]);

  const colorByKey = useMemo(() => new Map(categories.map((c) => [c.key, c.color])), [categories]);
  const countUnit = isPruningMode(colorMode) ? "farmer" : "plot";
  const countOf = (c: Category) => (isPruningMode(colorMode) ? c.farmers : c.plots);
  const summary = categories.filter((c) => !c.key.startsWith("~")).slice(0, 3);

  const fitPoints = useMemo(() => {
    const subset = highlight ? located.filter((p) => plotCategory.get(p.plot.key) === highlight) : located;
    return subset.flatMap((p) => (p.boundary && p.boundary.length ? p.boundary : [p.center]));
  }, [located, highlight, plotCategory]);
  const plotsKey = useMemo(() => located.map((p) => p.plot.key).join("|"), [located]);
  const fitKey = `${plotsKey}:${highlight ?? ""}:${fitNonce}`;

  const selected = located.find((p) => p.plot.key === selectedKey) ?? null;
  const drawPolygons = located.length <= POLYGON_LIMIT;
  // Leaflet stacks layers in render order: dimmed plots first, the selected plot last.
  const ordered = useMemo(() => {
    const dimmed = (p: (typeof located)[number]) => highlight != null && plotCategory.get(p.plot.key) !== highlight;
    const rest = located.filter((p) => p !== selected);
    return [...rest.filter(dimmed), ...rest.filter((p) => !dimmed(p)), ...(selected ? [selected] : [])];
  }, [located, selected, highlight, plotCategory]);

  const totalPlots = located.length;
  const totalFarmers = useMemo(() => new Set(located.map((p) => plotFarmerKey(p.plot))).size, [located]);
  const modeLabel = MAP_COLOR_MODES.find((m) => m.key === colorMode)?.label ?? "";

  return (
    <div
      ref={wrapRef}
      className={`flex w-full flex-col gap-3 lg:absolute lg:inset-0 lg:flex-row ${isFull ? "bg-white p-3" : ""}`}
    >
    <div className="owner-portfolio-map relative min-h-[320px] flex-1 overflow-hidden rounded-xl">
      <MapContainer
        center={MAHARASHTRA_CENTER}
        zoom={7}
        minZoom={5}
        maxZoom={20}
        scrollWheelZoom
        className="h-full w-full"
        style={{ height: "100%", width: "100%", borderRadius: "inherit" }}
      >
        <TileLayer
          url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
          attribution="© Google"
          maxZoom={20}
          maxNativeZoom={20}
        />
        <FitToPlots points={fitPoints} fitKey={fitKey} />
        <FocusPlot point={selected?.center ?? null} />
        <ResizeOnChange />

        {ordered.map(({ plot, center, boundary }) => {
          const category = plotCategory.get(plot.key) ?? "~none";
          const color = colorByKey.get(category) ?? MUTED.none;
          const isSelected = plot.key === selectedKey;
          const dim = highlight != null && category !== highlight && !isSelected;
          const stage = stages.get(plot.plotId);
          return (
            <React.Fragment key={plot.key}>
              {drawPolygons && boundary && (
                <Polygon
                  positions={boundary}
                  pathOptions={{
                    color: isSelected ? "#facc15" : color,
                    fillColor: color,
                    fillOpacity: dim ? 0.05 : isSelected ? 0.6 : 0.45,
                    opacity: dim ? 0.25 : 1,
                    weight: isSelected ? 4 : 2,
                  }}
                  eventHandlers={{
                    click: () => {
                      setDismissedSelectedPopup(null);
                      onSelect(plot.key);
                    },
                  }}
                />
              )}
              <CircleMarker
                center={center}
                radius={isSelected ? 10 : 6}
                pathOptions={{
                  color: isSelected ? "#facc15" : "#0f172a",
                  weight: isSelected ? 4 : 1,
                  opacity: dim ? 0.2 : 1,
                  fillColor: color,
                  fillOpacity: dim ? 0.2 : 0.95,
                }}
                eventHandlers={{
                  click: () => {
                    setDismissedSelectedPopup(null);
                    onSelect(plot.key);
                  },
                }}
              >
                {dismissedSelectedPopup !== plot.key && (
                  <Tooltip
                    key={isSelected ? "selected" : "hover"}
                    direction="top"
                    offset={[0, -6]}
                    permanent={isSelected}
                    interactive={isSelected}
                  >
                    <div className="text-xs leading-snug">
                      {isSelected && (
                        <div className="mb-1 flex items-start justify-between gap-3">
                          <div className="min-w-0 font-semibold">{plot.plotLabel}</div>
                          <button
                            type="button"
                            aria-label="Close plot details"
                            title="Close plot details"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setDismissedSelectedPopup(plot.key);
                            }}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {!isSelected && <div className="font-semibold">{plot.plotLabel}</div>}
                      <div>{plot.farmerName}</div>
                      <div className="text-slate-500">{[plot.village, plot.district].filter(Boolean).join(", ")}</div>
                      <div>Stage: {stage?.stageName ?? "—"}</div>
                      <div>Foundation pruning: {stage ? formatDay(stage.savedFoundationPruningDate) : "—"}</div>
                      <div>Fruit pruning: {stage ? formatDay(stage.savedFruitPruningDate) : "—"}</div>
                      <div>
                        Yield {fmt(yieldOf(plot), 1, " T/acre")} · Brix {fmt(brixOf(plot), 1, "°")}
                      </div>
                    </div>
                  </Tooltip>
                )}
              </CircleMarker>
            </React.Fragment>
          );
        })}
      </MapContainer>

      {summary.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-12 z-[500] hidden max-w-[60%] -translate-x-1/2 truncate rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-white shadow sm:block">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400" />
          {summary.map((c) => `${c.label}: ${fmtInt(countOf(c))}`).join(" · ")}
          {isPruningMode(colorMode) && <span className="text-white/70"> farmers</span>}
        </div>
      )}

      <div className="absolute left-14 right-14 top-3 z-[500] flex min-w-0 flex-row items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
        {/* <span className="mt-1 rounded bg-white/80 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
          Colour by
        </span> */}
        {MAP_COLOR_MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onColorModeChange(m.key)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold shadow ${
              colorMode === m.key ? "bg-emerald-600 text-white" : "bg-white/95 text-slate-700 hover:bg-white"
            }`}
            style={{ minHeight: 0 }}
          >
            {m.label}
          </button>
        ))}
        {located.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setHighlight(null);
              setFitNonce((n) => n + 1);
            }}
            className="shrink-0 rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow hover:bg-white"
            style={{ minHeight: 0 }}
          >
            Show all plots
          </button>
        )}
      </div>

      <div className="absolute right-3 top-3 z-[500]">
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-md bg-white/95 p-1.5 text-slate-700 shadow hover:bg-white"
          style={{ minHeight: 0 }}
          title={isFull ? "Exit full screen" : "Full screen"}
          aria-label={isFull ? "Exit full screen" : "Full screen"}
        >
          {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {located.length === 0 && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-white/70 text-sm text-slate-600">
          No plot locations available for this selection.
        </div>
      )}
    </div>

      <aside className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-3 lg:w-80 lg:shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{modeLabel}</p>
            <p className="mt-0.5 text-sm text-slate-700">
              <span className="font-bold tabular-nums text-slate-900">{fmtInt(totalPlots)}</span> plots ·{" "}
              <span className="font-bold tabular-nums text-slate-900">{fmtInt(totalFarmers)}</span> farmers
            </p>
          </div>
          {highlight && (
            <button
              type="button"
              onClick={() => setHighlight(null)}
              className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
              style={{ minHeight: 0 }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-slate-200 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          <span>{isPruningMode(colorMode) ? "Month" : "Category"}</span>
          <span className="text-right">Plots</span>
          <span className="text-right">Farmers</span>
        </div>
        <ul className="mt-1 flex-1 space-y-1 overflow-y-auto">
          {categories.length === 0 && <li className="py-3 text-center text-xs text-slate-500">No plots to show.</li>}
          {categories.map((c) => {
            const active = highlight === c.key;
            const clickable = c.key !== "~loading";
            const share = (countOf(c) / Math.max(1, isPruningMode(colorMode) ? totalFarmers : totalPlots)) * 100;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => setHighlight(active ? null : c.key)}
                  className={`w-full rounded-lg px-2 py-1.5 text-left transition ${
                    active ? "bg-white ring-1 ring-emerald-500 shadow-sm" : clickable ? "hover:bg-white" : ""
                  } ${highlight && !active ? "opacity-60" : ""}`}
                  style={{ minHeight: 0 }}
                  title={clickable ? "Click to highlight these plots on the map" : undefined}
                >
                  <span className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                      <span className="truncate font-medium text-slate-800">{c.label}</span>
                    </span>
                    <span className="text-right tabular-nums text-slate-600">{fmtInt(c.plots)}</span>
                    <span className="text-right font-semibold tabular-nums text-slate-900">{fmtInt(c.farmers)}</span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-200">
                    <span className="block h-full rounded-full" style={{ width: `${share}%`, background: c.color }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[10px] leading-snug text-slate-400">
          Bars show share of {countUnit}s. A farmer with plots in several {isPruningMode(colorMode) ? "months" : "categories"} is counted in each.
        </p>
      </aside>
    </div>
  );
};

export default OwnerPortfolioMap;
