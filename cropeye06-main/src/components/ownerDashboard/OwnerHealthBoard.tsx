import React, { useMemo, useState } from "react";
import { HeartPulse, Loader2 } from "lucide-react";
import { HEALTH_ORDER, type HealthStatus, type PlotHealth } from "../../hooks/useOwnerScopeHealth";
import type { OwnerPlotRecord } from "../../utils/ownerPortfolio";
import { Card, SectionHeader } from "./ownerDashboardUi";

export const HEALTH_STYLE: Record<HealthStatus, { dot: string; chip: string; tile: string }> = {
  "Immediate action": { dot: "bg-red-500", chip: "bg-red-50 text-red-700", tile: "border-red-200 bg-red-50/60" },
  Stressed: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700", tile: "border-amber-200 bg-amber-50/60" },
  "Under observation": { dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700", tile: "border-sky-200 bg-sky-50/60" },
  Healthy: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", tile: "border-emerald-200 bg-emerald-50/60" },
};

const HEALTH_HINT: Record<HealthStatus, string> = {
  "Immediate action": "Critical alert — act today",
  Stressed: "Warning — plan a visit",
  "Under observation": "No live reading or data gap",
  Healthy: "No issues detected",
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Props = {
  plots: OwnerPlotRecord[];
  health: Map<string, PlotHealth>;
  loading: boolean;
  pending: number;
  scopeLabel: string;
  selectedKey: string | null;
  onSelect: (plotKey: string) => void;
};

const OwnerHealthBoard: React.FC<Props> = ({ plots, health, loading, pending, scopeLabel, selectedKey, onSelect }) => {
  const [filter, setFilter] = useState<HealthStatus | null>(null);

  const counts = useMemo(() => {
    const c = Object.fromEntries(HEALTH_ORDER.map((s) => [s, 0])) as Record<HealthStatus, number>;
    health.forEach((h) => (c[h.status] += 1));
    return c;
  }, [health]);

  const rows = useMemo(
    () =>
      plots
        .map((p) => ({ plot: p, h: health.get(p.key) ?? null }))
        .filter((r) => !filter || r.h?.status === filter)
        .sort(
          (a, b) =>
            (a.h ? HEALTH_ORDER.indexOf(a.h.status) : 9) - (b.h ? HEALTH_ORDER.indexOf(b.h.status) : 9) ||
            a.plot.farmerName.localeCompare(b.plot.farmerName),
        ),
    [plots, health, filter],
  );

  return (
    <Card>
      <SectionHeader
        icon={<HeartPulse className="h-5 w-5" />}
        title={`Vineyard health · ${scopeLabel}`}
        subtitle="Live status of every plot from its latest satellite indices, soil moisture and satellite yield statistics."
        action={
          loading ? (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking {pending} plot{pending === 1 ? "" : "s"}…
            </span>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {HEALTH_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(filter === s ? null : s)}
            className={`rounded-xl border p-3 text-left transition ${HEALTH_STYLE[s].tile} ${
              filter === s ? "ring-2 ring-slate-400" : ""
            }`}
            style={{ minHeight: 0 }}
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_STYLE[s].dot}`} /> {s}
            </span>
            <span className="mt-1 block text-2xl font-bold tabular-nums text-slate-900">{counts[s]}</span>
            <span className="block text-[11px] text-slate-500">{HEALTH_HINT[s]}</span>
          </button>
        ))}
      </div>

      <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Farmer · Plot</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Recommended action</th>
              <th className="px-3 py-2">Last satellite reading</th>
              <th className="px-3 py-2">Checked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ plot, h }) => (
              <tr
                key={plot.key}
                onClick={() => onSelect(plot.key)}
                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                  plot.key === selectedKey ? "bg-emerald-50" : ""
                }`}
              >
                <td className="px-3 py-2">
                  {h ? (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${HEALTH_STYLE[h.status].chip}`}>
                      <span className={`h-2 w-2 rounded-full ${HEALTH_STYLE[h.status].dot}`} /> {h.status}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> Checking
                    </span>
                  )}
                </td>
                <td className="max-w-[200px] px-3 py-2">
                  <span className="block truncate font-medium text-slate-900">{plot.farmerName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {plot.plotLabel} · {[plot.village, plot.taluka].filter(Boolean).join(", ")}
                  </span>
                </td>
                <td className="max-w-[240px] px-3 py-2 text-slate-700">{h?.reason ?? "—"}</td>
                <td className="max-w-[220px] px-3 py-2 text-xs text-slate-600">{h?.action ?? "—"}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-600">{fmtDate(h?.satelliteDate ?? null)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{h ? fmtTime(h.checkedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Pest &amp; disease risk is included for the selected plot only. Readings are re-checked every 6 hours.
      </p>
    </Card>
  );
};

export default OwnerHealthBoard;
