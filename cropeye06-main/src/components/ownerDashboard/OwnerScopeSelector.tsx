import React from "react";
import {
  MapPin,
  Tractor,
  LandPlot,
  Grape,
  Ruler,
  SlidersHorizontal,
} from "lucide-react";
import { plotArea, type OwnerPlotRecord } from "../../utils/ownerPortfolio";
import { Card, fmtInt } from "./ownerDashboardUi";

export const SCOPE_ALL = "__all__";
export const TALUKA_NOT_SET = "Taluka not set";
export const VARIETY_NOT_SET = "Variety not set";

export const plotTaluka = (p: OwnerPlotRecord) => p.taluka || TALUKA_NOT_SET;
export const plotFarmerKey = (p: OwnerPlotRecord) => `${p.fieldOfficerId}:${p.farmerName}`;
export const plotVariety = (p: OwnerPlotRecord) => p.variety?.trim() || VARIETY_NOT_SET;

const AREA_BUCKETS: { key: string; label: string; min: number; max: number }[] = [
  { key: "lt1", label: "Below 1 acre", min: 0, max: 1 },
  { key: "1to2", label: "1 – 2 acres", min: 1, max: 2 },
  { key: "2to5", label: "2 – 5 acres", min: 2, max: 5 },
  { key: "gt5", label: "5 acres & above", min: 5, max: Infinity },
];

export function plotAreaBucket(p: OwnerPlotRecord): string {
  const a = plotArea(p);
  if (a == null || !Number.isFinite(a) || a <= 0) return "unknown";
  return AREA_BUCKETS.find((b) => a >= b.min && a < b.max)?.key ?? "unknown";
}

export function areaOptions(plots: OwnerPlotRecord[]): ScopeOption[] {
  const counts = new Map<string, number>();
  plots.forEach((p) => {
    const k = plotAreaBucket(p);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  const opts: ScopeOption[] = AREA_BUCKETS.filter((b) => counts.has(b.key)).map((b) => ({
    key: b.key,
    label: b.label,
    count: counts.get(b.key)!,
  }));
  if (counts.has("unknown")) opts.push({ key: "unknown", label: "Area not set", count: counts.get("unknown")! });
  return opts;
}

export type ScopeOption = { key: string; label: string; count: number };

/** Unique options with plot counts, sorted by label. */
export function scopeOptions(
  plots: OwnerPlotRecord[],
  key: (p: OwnerPlotRecord) => string,
  label: (p: OwnerPlotRecord) => string = key,
): ScopeOption[] {
  const map = new Map<string, ScopeOption>();
  plots.forEach((p) => {
    const k = key(p);
    const existing = map.get(k);
    if (existing) existing.count += 1;
    else map.set(k, { key: k, label: label(p), count: 1 });
  });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

type Props = {
  unitName: string;
  scopeLabel: string;
  districts: ScopeOption[];
  talukas: ScopeOption[];
  farmers: ScopeOption[];
  plots: OwnerPlotRecord[];
  district: string;
  taluka: string;
  farmer: string;
  selectedKey: string | null;
  onDistrict: (v: string) => void;
  onTaluka: (v: string) => void;
  onFarmer: (v: string) => void;
  onPlot: (v: string) => void;
  extraFilters: boolean;
  onToggleExtra: () => void;
  varieties: ScopeOption[];
  areas: ScopeOption[];
  variety: string;
  area: string;
  onVariety: (v: string) => void;
  onArea: (v: string) => void;
};

const selectClass =
  "w-full rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

const Step: React.FC<{
  n?: number;
  icon: React.ReactNode;
  title: string;
  count: number;
  unit: string;
  unitPlural?: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ n, icon, title, count, unit, unitPlural, hint, children }) => (
  <div className="min-w-0">
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
        {n != null && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
            {n}
          </span>
        )}
        <span className="text-emerald-700">{icon}</span>
        {title}
      </p>
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-700">
        {fmtInt(count)} {count === 1 ? unit : unitPlural ?? `${unit}s`}
      </span>
    </div>
    {children}
    {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
  </div>
);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "M";

const OwnerScopeSelector: React.FC<Props> = ({
  unitName,
  scopeLabel,
  districts,
  talukas,
  farmers,
  plots,
  district,
  taluka,
  farmer,
  selectedKey,
  onDistrict,
  onTaluka,
  onFarmer,
  onPlot,
  extraFilters,
  onToggleExtra,
  varieties,
  areas,
  variety,
  area,
  onVariety,
  onArea,
}) => {
  const plotFilterActive = variety !== SCOPE_ALL || area !== SCOPE_ALL;
  const locationReady = district !== SCOPE_ALL && taluka !== SCOPE_ALL;
  const farmerReady = locationReady && farmer !== SCOPE_ALL;
  const filterLabel = [
    variety !== SCOPE_ALL ? varieties.find((v) => v.key === variety)?.label ?? variety : null,
    area !== SCOPE_ALL ? areas.find((a) => a.key === area)?.label ?? area : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
  <Card>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white">
          {initials(unitName)}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Farm unit</p>
          <p className="truncate font-semibold text-slate-900">{unitName}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={extraFilters}
          onClick={onToggleExtra}
          className="flex items-center gap-2 text-sm font-medium text-slate-700"
          style={{ minHeight: 0, padding: 0, background: "none" }}
        >
          <SlidersHorizontal className="h-4 w-4 text-emerald-700" />
          Variety &amp; Area
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
              extraFilters ? "bg-emerald-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${
                extraFilters ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
        <p className="truncate text-xs text-slate-500">
          Scope: <b className="text-slate-800">{scopeLabel}</b>
        </p>
      </div>
    </div>

    {extraFilters && (
      <div className="mb-4 grid grid-cols-1 gap-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 sm:grid-cols-2">
        <Step
          icon={<Grape className="h-4 w-4" />}
          title="Variety"
          count={varieties.length}
          unit="variety"
          unitPlural="varieties"
          hint="Show only plots of one grape variety."
        >
          <select className={selectClass} value={variety} onChange={(e) => onVariety(e.target.value)}>
            <option value={SCOPE_ALL}>All varieties</option>
            {varieties.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label} ({v.count} plot{v.count === 1 ? "" : "s"})
              </option>
            ))}
          </select>
        </Step>
        <Step
          icon={<Ruler className="h-4 w-4" />}
          title="Area"
          count={areas.length}
          unit="size group"
          hint="Show only plots within a size range."
        >
          <select className={selectClass} value={area} onChange={(e) => onArea(e.target.value)}>
            <option value={SCOPE_ALL}>All plot sizes</option>
            {areas.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label} ({a.count} plot{a.count === 1 ? "" : "s"})
              </option>
            ))}
          </select>
        </Step>
        {plotFilterActive && (
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-medium text-slate-600">
              {fmtInt(plots.length)} plot{plots.length === 1 ? "" : "s"} · {filterLabel}
              {plots.length > 0 && <span className="font-normal text-slate-500"> — click a plot to open it</span>}
            </p>
            {plots.length === 0 ? (
              <p className="text-xs text-slate-500">No plots match this filter in the chosen location.</p>
            ) : (
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {plots.map((p) => {
                  const active = p.key === selectedKey;
                  const acres = plotArea(p);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => onPlot(p.key)}
                      className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                        active
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-emerald-200 bg-white text-slate-700 hover:border-emerald-400"
                      }`}
                      style={{ minHeight: 0 }}
                    >
                      <span className="font-semibold">{p.farmerName}</span> · {p.plotLabel}
                      {acres != null && acres > 0 && <span className="opacity-75"> · {acres.toFixed(2)} ac</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )}

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Step
        n={1}
        icon={<MapPin className="h-4 w-4" />}
        title="Location"
        count={talukas.length}
        unit="taluka"
        hint="Pick a district, then a taluka inside it."
      >
        <div className="grid grid-cols-2 gap-2">
          <select className={selectClass} value={district} onChange={(e) => onDistrict(e.target.value)}>
            <option value={SCOPE_ALL}>All districts</option>
            {districts.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label} ({d.count})
              </option>
            ))}
          </select>
          <select className={selectClass} value={taluka} onChange={(e) => onTaluka(e.target.value)}>
            <option value={SCOPE_ALL}>All talukas</option>
            {talukas.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label} ({t.count})
              </option>
            ))}
          </select>
        </div>
      </Step>

      <Step
        n={2}
        icon={<Tractor className="h-4 w-4" />}
        title="Farmer"
        count={locationReady ? farmers.length : 0}
        unit="farmer"
        hint={
          locationReady
            ? "Farmers in the chosen location. Number in brackets = their plots."
            : "Select a district and taluka first."
        }
      >
        <select
          className={selectClass}
          value={locationReady ? farmer : SCOPE_ALL}
          disabled={!locationReady}
          onChange={(e) => onFarmer(e.target.value)}
        >
          {!locationReady ? (
            <option value={SCOPE_ALL}>Select district &amp; taluka first</option>
          ) : (
            <>
              <option value={SCOPE_ALL}>Select a farmer</option>
              {farmers.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.count} plot{f.count === 1 ? "" : "s"})
                </option>
              ))}
            </>
          )}
        </select>
      </Step>

      <Step
        n={3}
        icon={<LandPlot className="h-4 w-4" />}
        title="Plot"
        count={farmerReady ? plots.length : 0}
        unit="plot"
        hint={
          farmerReady
            ? "Pick a plot to open its full details below."
            : "Select district, taluka and farmer first."
        }
      >
        <select
          className={selectClass}
          value={farmerReady ? selectedKey ?? "" : ""}
          disabled={!farmerReady || plots.length === 0}
          onChange={(e) => e.target.value && onPlot(e.target.value)}
        >
          {!farmerReady ? (
            <option value="">Select a farmer first</option>
          ) : plots.length === 0 ? (
            <option value="">No matching plots</option>
          ) : (
            <>
              {!selectedKey && <option value="">Select a plot</option>}
              {plots.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.plotLabel}
                </option>
              ))}
            </>
          )}
        </select>
      </Step>
    </div>

  </Card>
  );
};

export default OwnerScopeSelector;
