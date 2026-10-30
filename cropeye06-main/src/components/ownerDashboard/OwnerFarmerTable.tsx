import React, { useMemo, useState } from "react";
import { Search, Tractor } from "lucide-react";
import {
  groupPlots,
  type OwnerFarmerRecord,
  type OwnerPlotRecord,
  type PortfolioSummary,
} from "../../utils/ownerPortfolio";
import { plotFarmerKey } from "./OwnerScopeSelector";
import { EmptyState, fmt, fmtInt } from "./ownerDashboardUi";
import { HEALTH_ORDER, type HealthStatus, type PlotHealth } from "../../hooks/useOwnerScopeHealth";
import type { SeasonStage } from "../../hooks/useOwnerSeasonStages";
import { MISSING_LABEL, satelliteState } from "../../utils/dataAvailability";
import { HEALTH_STYLE } from "./OwnerHealthBoard";

type Row = {
  key: string;
  name: string;
  phone: string;
  location: string;
  district: string;
  fieldOfficer: string;
  firstPlotKey: string | null;
  plots: OwnerPlotRecord[];
  summary: PortfolioSummary | null;
  health: HealthStatus | null;
};

const unique = (values: (string | null | undefined)[]) =>
  [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))];

/** "Flowering" for one stage, "Flowering +1" when plots are at different stages. */
const joinFirst = (values: string[]) => (values.length <= 1 ? values[0] ?? null : `${values[0]} +${values.length - 1}`);

const range = (values: number[]) => {
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? `Day ${lo}` : `Day ${lo}–${hi}`;
};

const newest = (dates: (string | null | undefined)[]) =>
  dates.filter((d): d is string => !!d).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

type Props = {
  /** Plots in the current scope. */
  plots: OwnerPlotRecord[];
  /** Registered farmers in the current scope, including those without plots. */
  farmers: OwnerFarmerRecord[];
  scopeLabel: string;
  selectedKey: string | null;
  onSelectPlot: (plotKey: string) => void;
  loading: boolean;
  agroLoading: boolean;
  /** Live health per plot key; a farmer shows their worst plot. */
  health: Map<string, PlotHealth>;
  /** Season stage per plot id from /grapes/stages. */
  stages: Map<string, SeasonStage>;
  stagesFailed: Set<string>;
};

const OwnerFarmerTable: React.FC<Props> = ({
  plots,
  farmers,
  scopeLabel,
  selectedKey,
  onSelectPlot,
  loading,
  agroLoading,
  health,
  stages,
  stagesFailed,
}) => {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const byKey = new Map<string, Row>();
    groupPlots(plots, plotFarmerKey, (p) => p.farmerName).forEach((g) => {
      const p = g.plots[0];
      byKey.set(g.key, {
        key: g.key,
        name: g.label,
        phone: "",
        location: [p.village, p.taluka].filter(Boolean).join(", "),
        district: p.district,
        fieldOfficer: p.fieldOfficerName,
        firstPlotKey: p.key,
        plots: g.plots,
        summary: g.summary,
        health:
          g.plots
            .map((x) => health.get(x.key)?.status)
            .filter((s): s is HealthStatus => !!s)
            .sort((a, b) => HEALTH_ORDER.indexOf(a) - HEALTH_ORDER.indexOf(b))[0] ?? null,
      });
    });
    farmers.forEach((f) => {
      const existing = byKey.get(f.key);
      if (existing) {
        existing.phone = f.phone;
        return;
      }
      byKey.set(f.key, {
        key: f.key,
        name: f.name,
        phone: f.phone,
        location: [f.village, f.taluka].filter(Boolean).join(", "),
        district: f.district,
        fieldOfficer: f.fieldOfficerName,
        firstPlotKey: null,
        plots: [],
        summary: null,
        health: null,
      });
    });
    return [...byKey.values()].sort(
      (a, b) =>
        (b.summary?.avgYield ?? -1) - (a.summary?.avgYield ?? -1) ||
        (b.summary?.plots ?? 0) - (a.summary?.plots ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }, [plots, farmers, health]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) =>
        [r.name, r.phone, r.location, r.district, r.fieldOfficer, ...r.plots.map((p) => p.variety ?? "")].some((v) =>
          v.toLowerCase().includes(q),
        ),
      )
    : rows;
  const withPlots = rows.filter((r) => r.summary).length;

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Tractor className="h-4 w-4 text-emerald-700" /> All farmers · {scopeLabel}
          </p>
          <p className="text-xs text-slate-500">
            {fmtInt(rows.length)} farmer{rows.length === 1 ? "" : "s"} · {fmtInt(withPlots)} with mapped plots.
            Click a farmer to open their plot above.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500">
          <Search className="h-3.5 w-3.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search farmer, village, variety…"
            className="w-44 border-0 bg-transparent p-0 text-xs text-slate-800 outline-none focus:ring-0"
            style={{ minHeight: 0 }}
          />
        </label>
      </div>

      {loading ? (
        <EmptyState loading message="Loading farmers…" />
      ) : shown.length === 0 ? (
        <EmptyState message={q ? "No farmer matches your search." : "No farmers registered in this selection."} />
      ) : (
        <div className="max-h-[460px] overflow-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Health</th>
                <th className="px-3 py-2">Farmer</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Field officer</th>
                <th className="px-3 py-2">Variety</th>
                <th className="px-3 py-2">Crop stage</th>
                <th className="px-3 py-2 whitespace-nowrap">After fruit pruning</th>
                <th className="px-3 py-2 text-right">Plots</th>
                <th className="px-3 py-2 text-right">Area (ac)</th>
                <th className="px-3 py-2 text-right">Yield (T/ac)</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Est. production (T)</th>
                <th className="px-3 py-2 text-right">Brix</th>
                <th className="px-3 py-2 text-right">Ready</th>
                <th className="px-3 py-2 whitespace-nowrap">Last satellite reading</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const active = r.summary != null && plots.some((p) => p.key === selectedKey && plotFarmerKey(p) === r.key);
                const varieties = unique(r.plots.map((p) => p.variety));
                const plotStages = r.plots.map((p) => stages.get(p.plotId)).filter((s): s is SeasonStage => !!s);
                const stagePending = r.plots.some((p) => p.plotId && !stages.has(p.plotId) && !stagesFailed.has(p.plotId));
                const stageName = joinFirst(unique(plotStages.map((s) => s.stageName)));
                const dafp = range(
                  plotStages.map((s) => s.daysAfterFruitPruning).filter((d): d is number => d != null),
                );
                const upcomingPruning = unique(
                  plotStages
                    .filter((s) => s.daysAfterFruitPruning == null && s.fruitPruningDate)
                    .map((s) => s.fruitPruningDate)
                    .filter((d) => new Date(`${d}T00:00:00`).getTime() > Date.now()),
                ).sort()[0];
                const healthPending = r.plots.some((p) => p.plotId && !health.has(p.key));
                const reading = satelliteState(newest(r.plots.map((p) => health.get(p.key)?.satelliteDate)));
                const pendingCell = <span className="text-xs text-slate-400">Loading…</span>;
                const missing = (why: string) => (
                  <span className="text-xs text-slate-400" title={why}>
                    {MISSING_LABEL.not_available}
                  </span>
                );
                return (
                  <tr
                    key={r.key}
                    onClick={() => r.firstPlotKey && onSelectPlot(r.firstPlotKey)}
                    className={`border-t border-slate-100 ${r.firstPlotKey ? "cursor-pointer hover:bg-slate-50" : ""} ${
                      active ? "bg-emerald-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      {r.health ? (
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${HEALTH_STYLE[r.health].chip}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${HEALTH_STYLE[r.health].dot}`} /> {r.health}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">{r.summary ? "Checking…" : "—"}</span>
                      )}
                    </td>
                    <td className="max-w-[200px] px-3 py-2">
                      <span className="block truncate font-medium text-slate-900">{r.name}</span>
                      {r.phone && <span className="block text-xs text-slate-500">{r.phone}</span>}
                    </td>
                    <td className="max-w-[200px] px-3 py-2 text-slate-600">
                      <span className="block truncate">{r.location || "—"}</span>
                      <span className="block truncate text-xs text-slate-400">{r.district}</span>
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-slate-600">{r.fieldOfficer}</td>
                    {r.summary ? (
                      <>
                        <td className="max-w-[160px] px-3 py-2 text-slate-700">
                          {varieties.length > 0 ? (
                            <span className="block truncate" title={varieties.join(", ")}>
                              {varieties.join(", ")}
                            </span>
                          ) : (
                            missing("Variety was not entered at farm registration.")
                          )}
                        </td>
                        <td className="max-w-[170px] px-3 py-2 text-slate-700">
                          {stageName ? (
                            <span className="block truncate" title={unique(plotStages.map((s) => s.stageName)).join(", ")}>
                              {stageName}
                            </span>
                          ) : stagePending ? (
                            pendingCell
                          ) : (
                            missing("Crop stage could not be read from /grapes/stages for this plot.")
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
                          {dafp ??
                            (stagePending ? (
                              pendingCell
                            ) : upcomingPruning ? (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                                Pruning on{" "}
                                {new Date(`${upcomingPruning}T00:00:00`).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
                            ) : (
                              missing("Fruit pruning date is not set.")
                            ))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.summary.plots)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(r.summary.areaAcres, 1)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">
                          {agroLoading ? "…" : fmt(r.summary.avgYield, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                          {agroLoading ? "…" : fmt(r.summary.estProductionT, 1)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {agroLoading ? "…" : fmt(r.summary.avgBrix, 1)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.summary.readyToHarvest)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">
                          {healthPending && reading.kind === "not_available" ? (
                            pendingCell
                          ) : reading.kind === "value" ? (
                            <span className="text-slate-700">{reading.text}</span>
                          ) : (
                            <span
                              title={reading.why}
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                reading.kind === "overdue" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {reading.kind === "overdue" ? `${MISSING_LABEL.overdue} · ${reading.text}` : reading.text}
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={10} className="px-3 py-2 text-right text-xs text-slate-400">
                        No plot mapped yet
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default OwnerFarmerTable;
