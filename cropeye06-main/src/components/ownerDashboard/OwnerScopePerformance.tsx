import React, { useMemo } from "react";
import { Activity, Loader2, Target, Trophy, Users } from "lucide-react";
import { useCanopyVigour } from "../../hooks/useCanopyVigour";
import { vigourToBarRows } from "../../utils/canopyVigour";
import { plotFarmerKey } from "./OwnerScopeSelector";
import type { OwnerPlotRecord } from "../../utils/ownerPortfolio";
import { Card, fmt } from "./ownerDashboardUi";

type Spread = { min: number; mean: number; max: number; count: number };

function spread(values: (number | null | undefined)[]): Spread | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x) && x > 0);
  if (v.length === 0) return null;
  return {
    min: Math.min(...v),
    max: Math.max(...v),
    mean: v.reduce((s, x) => s + x, 0) / v.length,
    count: v.length,
  };
}

/** Round the gauge ceiling up to a readable number just above the scope's highest plot. */
function gaugeMax(max: number): number {
  const target = max * 1.2;
  const step = target <= 10 ? 1 : target <= 50 ? 5 : 10;
  return Math.max(step, Math.ceil(target / step) * step);
}

const Gauge: React.FC<{ value: number; max: number; color: string; caption: string }> = ({
  value,
  max,
  color,
  caption,
}) => {
  const cx = 100;
  const cy = 100;
  const r = 78;
  const frac = Math.min(1, Math.max(0, value / max));
  const point = (f: number, radius = r) => {
    const a = Math.PI * (1 - f);
    return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)];
  };
  const [ex, ey] = point(frac);
  const [nx, ny] = point(frac, r - 18);
  return (
    <svg viewBox="0 0 200 128" className="h-[150px] w-full max-w-[260px]">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#eef0f4" strokeWidth={20} />
      {frac > 0 && (
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`}
          fill="none"
          stroke={color}
          strokeWidth={20}
        />
      )}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#1f2937" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill="#1f2937" />
      <text x={cx - r} y={cy + 18} textAnchor="middle" fontSize={10} fill="#94a3b8">0</text>
      <text x={cx + r} y={cy + 18} textAnchor="middle" fontSize={10} fill="#94a3b8">{max}</text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize={11} fill="#64748b">{caption}</text>
    </svg>
  );
};

const SpreadLegend: React.FC<{ s: Spread; unit: string }> = ({ s, unit }) => (
  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
    <span className="flex items-center gap-1 text-red-600">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> min {fmt(s.min, 1)} {unit}
    </span>
    <span className="flex items-center gap-1 text-violet-600">
      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> mean {fmt(s.mean, 1)} {unit}
    </span>
    <span className="flex items-center gap-1 text-emerald-600">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> max {fmt(s.max, 1)} {unit}
    </span>
  </div>
);

const CardTitle: React.FC<{ icon: React.ReactNode; title: string; subtitle: string }> = ({
  icon,
  title,
  subtitle,
}) => (
  <div className="mb-2 flex items-start gap-3">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
      {icon}
    </span>
    <div className="min-w-0">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="truncate text-xs text-slate-500">{subtitle}</p>
    </div>
  </div>
);

type Props = {
  plots: OwnerPlotRecord[];
  scopeLabel: string;
  selectedPlot: OwnerPlotRecord | null;
  loading: boolean;
};

const OwnerScopePerformance: React.FC<Props> = ({ plots, scopeLabel, selectedPlot, loading }) => {
  const yieldSpread = useMemo(() => spread(plots.map((p) => p.agro?.yieldTPerAcre)), [plots]);
  const biomassSpread = useMemo(() => spread(plots.map((p) => p.agro?.biomass)), [plots]);
  const vigour = useCanopyVigour(selectedPlot?.plotId ?? null);

  const topFarmers = useMemo(() => {
    const byFarmer = new Map<string, { name: string; plots: number; yields: number[] }>();
    plots.forEach((p) => {
      const y = p.agro?.yieldTPerAcre;
      const k = plotFarmerKey(p);
      const row = byFarmer.get(k) ?? { name: p.farmerName, plots: 0, yields: [] };
      row.plots += 1;
      if (y != null && Number.isFinite(y) && y > 0) row.yields.push(y);
      byFarmer.set(k, row);
    });
    return [...byFarmer.values()]
      .filter((f) => f.yields.length > 0)
      .map((f) => ({ ...f, avg: f.yields.reduce((s, x) => s + x, 0) / f.yields.length }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
  }, [plots]);

  const ratio =
    yieldSpread && biomassSpread && biomassSpread.mean > 0 ? yieldSpread.mean / biomassSpread.mean : null;

  const waiting = (message: string) => (
    <div className="flex h-[190px] flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
      {loading && <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />}
      {loading ? "Loading satellite statistics…" : message}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card>
        <CardTitle icon={<Target className="h-5 w-5" />} title="Grapes Yield Projection" subtitle={scopeLabel} />
        {yieldSpread ? (
          <div className="flex flex-col items-center">
            <p className="text-3xl font-bold tabular-nums text-slate-900">
              {fmt(yieldSpread.mean, 1)} <span className="text-sm font-semibold text-slate-500">T/acre</span>
            </p>
            <Gauge value={yieldSpread.mean} max={gaugeMax(yieldSpread.max)} color="#f97316" caption="Grapes Yield Forecast" />
            <SpreadLegend s={yieldSpread} unit="T/acre" />
            <p className="mt-2 text-[11px] text-slate-500">
              Across {yieldSpread.count} plot{yieldSpread.count === 1 ? "" : "s"} with a satellite yield estimate
            </p>
          </div>
        ) : (
          waiting("No satellite yield estimate for plots in this selection.")
        )}
      </Card>

      <Card>
        <CardTitle icon={<Activity className="h-5 w-5" />} title="Biomass Performance" subtitle={scopeLabel} />
        {biomassSpread ? (
          <div className="flex flex-col items-center">
            <p className="text-3xl font-bold tabular-nums text-slate-900">
              {fmt(biomassSpread.mean, 1)} <span className="text-sm font-semibold text-slate-500">T/acre</span>
            </p>
            <Gauge value={biomassSpread.mean} max={gaugeMax(biomassSpread.max)} color="#eab308" caption="Biomass Forecast" />
            <SpreadLegend s={biomassSpread} unit="T/acre" />
            {ratio != null && (
              <p className="mt-3 w-full rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Yield vs biomass ratio: <b className="text-slate-900">{ratio.toFixed(2)}</b> — higher means more
                fruit per unit of vine growth
              </p>
            )}
          </div>
        ) : (
          waiting("No satellite biomass for plots in this selection.")
        )}
      </Card>

      <Card>
        <CardTitle
          icon={<Users className="h-5 w-5" />}
          title="Canopy Vigour"
          subtitle={selectedPlot ? `Plot ${selectedPlot.plotLabel} · ${selectedPlot.farmerName}` : "Select a plot"}
        />
        {vigour.loading ? (
          <div className="flex h-[120px] items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> Loading canopy vigour…
          </div>
        ) : vigour.data ? (
          <div className="space-y-2">
            {vigourToBarRows(vigour.data).map((row) => (
              <div key={row.label} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-right text-slate-600">{row.label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${row.heightPct}%`, background: row.color }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-slate-800">
                  {row.pctLabel}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="flex h-[120px] items-center justify-center text-center text-sm text-slate-500">
            {!selectedPlot
              ? "Select a plot to see its canopy vigour."
              : vigour.error ?? "No canopy vigour data for this plot yet."}
          </p>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Trophy className="h-4 w-4 text-amber-500" /> Top farmers by yield
        </p>
        {topFarmers.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">No yield estimates in this selection yet.</p>
        ) : (
          <ol className="mt-1 space-y-1 text-xs">
            {topFarmers.map((f, i) => (
              <li key={f.name + i} className="flex items-center gap-2">
                <span className="w-3 text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate uppercase text-slate-700">{f.name}</span>
                <span className="shrink-0 text-slate-400">
                  {f.plots} plot{f.plots === 1 ? "" : "s"}
                </span>
                <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-emerald-700">
                  {fmt(f.avg, 1)} T/ac
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
};

export default OwnerScopePerformance;
