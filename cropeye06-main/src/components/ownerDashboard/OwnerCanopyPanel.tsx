import React, { useMemo } from "react";
import { Droplets, Leaf, Loader2, Satellite } from "lucide-react";
import type { IndexPoint } from "../../hooks/useOwnerPlotInsights";
import type { SoilMoistureParsed } from "../../utils/soilMoistureApi";
import { daysSince, SATELLITE_STALE_DAYS } from "../../utils/dataAvailability";

export type Tone = "red" | "amber" | "sky" | "emerald";

export type WaterInsight = {
  text: string;
  tone: Tone;
};

export function deriveWaterInsight(
  soil: number | null,
  ndmi: number | null,
  band: { minOptimal: number; maxOptimal: number; wiltingPoint: number },
): WaterInsight | null {
  if (
    soil == null ||
    ndmi == null ||
    !Number.isFinite(soil) ||
    !Number.isFinite(ndmi)
  ) {
    return null;
  }
  if (soil < band.minOptimal && ndmi < 0) {
    return { text: "Soil is dry and leaves are short of water — irrigation is likely needed.", tone: "red" };
  }
  if (soil >= band.minOptimal && ndmi < 0) {
    return { text: "Soil moisture is adequate but leaves are short of water — check drip delivery and heat stress.", tone: "amber" };
  }
  if (soil < band.minOptimal) {
    return { text: "Soil is drying while leaves are still hydrated — plan the next irrigation.", tone: "amber" };
  }
  return { text: "Soil and leaf water both look adequate.", tone: "emerald" };
}

const TONE: Record<Tone, { chip: string; line: string }> = {
  red: { chip: "bg-red-50 text-red-700 ring-red-200", line: "#dc2626" },
  amber: { chip: "bg-amber-50 text-amber-700 ring-amber-200", line: "#d97706" },
  sky: { chip: "bg-sky-50 text-sky-700 ring-sky-200", line: "#0284c7" },
  emerald: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", line: "#059669" },
};

type IndexKey = "growth" | "moisture" | "stress";

/**
 * Indices shown from GET /plots/{plot}/indices. MSAVI is left out because the API returns values above
 * its valid −1…1 range; NDWI is left out because it repeats NDMI's leaf-water signal.
 */
export const INDEX_DEFS: {
  key: IndexKey;
  short: string;
  name: string;
  measures: string;
  status: (v: number) => { label: string; tone: Tone };
}[] = [
  {
    key: "growth",
    short: "NDVI",
    name: "Normalized Difference Vegetation Index",
    measures: "Canopy greenness and density",
    status: (v) =>
      v < 0.2
        ? { label: "Sparse canopy", tone: "amber" }
        : v < 0.4
          ? { label: "Developing", tone: "sky" }
          : v < 0.6
            ? { label: "Healthy", tone: "emerald" }
            : { label: "Dense", tone: "emerald" },
  },
  {
    key: "moisture",
    short: "NDRE",
    name: "Normalized Difference Red Edge",
    measures: "Leaf chlorophyll / nitrogen",
    status: (v) =>
      v < 0.15
        ? { label: "Low chlorophyll", tone: "amber" }
        : v < 0.3
          ? { label: "Moderate", tone: "sky" }
          : { label: "High", tone: "emerald" },
  },
  {
    key: "stress",
    short: "NDMI",
    name: "Normalized Difference Moisture Index",
    measures: "Water held in the leaves (not soil moisture)",
    status: (v) =>
      v < -0.1
        ? { label: "Leaf water stress", tone: "red" }
        : v < 0
          ? { label: "Mild water stress", tone: "amber" }
          : { label: "Leaves hydrated", tone: "emerald" },
  },
];

const BASELINE_DAYS = 30;
const SPARK_POINTS = 12;

export type IndexReading = {
  latest: number;
  date: string;
  /** Mean of readings in the 30 days before the latest one; null when there are none. */
  baseline: number | null;
  history: number[];
};

export function indexReading(series: IndexPoint[], key: IndexKey): IndexReading | null {
  const points = series
    .filter((p) => p[key] != null && Number.isFinite(p[key] as number))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = points[points.length - 1];
  if (!last) return null;
  const lastT = new Date(last.date).getTime();
  const prior = points
    .slice(0, -1)
    .filter((p) => lastT - new Date(p.date).getTime() <= BASELINE_DAYS * 86_400_000)
    .map((p) => p[key] as number);
  return {
    latest: last[key] as number,
    date: last.date,
    baseline: prior.length ? prior.reduce((s, v) => s + v, 0) / prior.length : null,
    history: points.slice(-SPARK_POINTS).map((p) => p[key] as number),
  };
}

const Spark: React.FC<{ values: number[]; color: string }> = ({ values, color }) => {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * 60).toFixed(1)},${(20 - ((v - min) / span) * 18 - 1).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 60 20" className="h-5 w-16 shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
};

const Tag: React.FC<{ kind: "measured" | "derived" }> = ({ kind }) => (
  <span
    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
      kind === "measured" ? "bg-slate-800 text-white" : "bg-violet-100 text-violet-700"
    }`}
    title={kind === "measured" ? "Value reported by the satellite / sensor API" : "Interpreted from the measured values"}
  >
    {kind}
  </span>
);

export const WaterInsightMessage: React.FC<{ insight: WaterInsight }> = ({ insight }) => (
  <p className={`flex w-full items-start gap-1.5 rounded-lg px-3 py-3 text-[11px] ring-1 ${TONE[insight.tone].chip}`}>
    <Tag kind="derived" />
    <span>{insight.text}</span>
  </p>
);

const SubHead: React.FC<{ icon: React.ReactNode; title: string; tag?: "measured" | "derived"; right?: React.ReactNode }> = ({
  icon,
  title,
  tag,
  right,
}) => (
  <div className="mb-1.5 flex items-center justify-between gap-2">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {icon}
      {title}
      {tag && <Tag kind={tag} />}
    </p>
    {right}
  </div>
);

const Muted: React.FC<{ children: React.ReactNode; loading?: boolean }> = ({ children, loading }) => (
  <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">
    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />}
    {children}
  </p>
);

type Props = {
  plotId: string | null;
  plotLabel: string | null;
  indices: { data: IndexPoint[] | null; loading: boolean; error: string | null };
  moisture: { data: SoilMoistureParsed | null; loading: boolean; error: string | null };
  band: { minOptimal: number; maxOptimal: number; wiltingPoint: number };
  stageName: string | null;
  daysAfterFruitPruning: number | null;
};

/** Selected plot's canopy, vigour and water condition, built only from data the dashboard already loaded. */
const OwnerCanopyPanel: React.FC<Props> = ({
  plotId,
  plotLabel,
  indices,
  moisture,
  band,
  stageName,
  daysAfterFruitPruning,
}) => {
  const readings = useMemo(
    () =>
      INDEX_DEFS.map((def) => ({ def, reading: indexReading(indices.data ?? [], def.key) })).filter(
        (r): r is { def: (typeof INDEX_DEFS)[number]; reading: IndexReading } => r.reading != null,
      ),
    [indices.data],
  );

  if (!plotId) {
    return <Muted>Select a plot to see its canopy and vigour.</Muted>;
  }

  const latestDate = readings.reduce<string | null>((d, r) => (!d || r.reading.date > d ? r.reading.date : d), null);
  const age = daysSince(latestDate);
  const ndmi = readings.find((r) => r.def.key === "stress")?.reading ?? null;
  const soil = moisture.data && Number.isFinite(moisture.data.currentMoisture) ? moisture.data.currentMoisture : null;
  const soilState =
    soil == null
      ? null
      : soil <= band.wiltingPoint
        ? { label: "At wilting point", tone: "red" as Tone }
        : soil < band.minOptimal
          ? { label: "Below optimal", tone: "amber" as Tone }
          : soil > band.maxOptimal
            ? { label: "Above optimal", tone: "sky" as Tone }
            : { label: "Within optimal", tone: "emerald" as Tone };

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-slate-200/80 bg-slate-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          Canopy &amp; vigour <span className="font-normal text-slate-500">· {plotLabel}</span>
        </p>
        {latestDate && (
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
              age != null && age > SATELLITE_STALE_DAYS ? TONE.amber.chip : "bg-white text-slate-600 ring-slate-200"
            }`}
            title={age != null && age > SATELLITE_STALE_DAYS ? `Older than ${SATELLITE_STALE_DAYS} days` : undefined}
          >
            <Satellite className="h-3 w-3" />
            {new Date(latestDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
      {stageName && (
        <p className="-mt-2 text-[11px] text-slate-500">
          Stage: <span className="font-semibold text-slate-700">{stageName}</span>
          {daysAfterFruitPruning != null && ` · day ${daysAfterFruitPruning} after fruit pruning`}
        </p>
      )}

      <section>
        <SubHead icon={<Leaf className="h-3.5 w-3.5" />} title="Vegetation indices" tag="measured" />
        {indices.loading ? (
          <Muted loading>Loading satellite indices…</Muted>
        ) : indices.error ? (
          <Muted>{indices.error}</Muted>
        ) : readings.length === 0 ? (
          <Muted>No clear satellite image for this plot yet.</Muted>
        ) : (
          <ul className="space-y-1.5">
            {readings.map(({ def, reading }) => {
              const s = def.status(reading.latest);
              const delta = reading.baseline != null ? reading.latest - reading.baseline : null;
              return (
                <li key={def.key} className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-200/80">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800" title={def.name}>
                        {def.short} <span className="font-normal text-slate-500">· {def.name}</span>
                      </p>
                      <p className="truncate text-[10px] text-slate-500">{def.measures}</p>
                    </div>
                    <Spark values={reading.history} color={TONE[s.tone].line} />
                    <span className="w-11 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">
                      {reading.latest.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                    <span className={`rounded-full px-1.5 py-0.5 font-semibold ring-1 ${TONE[s.tone].chip}`}>{s.label}</span>
                    {delta != null && (
                      <span className={delta >= 0 ? "text-emerald-700" : "text-red-600"}>
                        {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} vs {BASELINE_DAYS}-day avg
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-1 flex-col">
        <SubHead icon={<Droplets className="h-3.5 w-3.5" />} title="Soil & crop water" />
        {moisture.loading ? (
          <Muted loading>Loading soil moisture…</Muted>
        ) : soilState == null && !ndmi ? (
          <Muted>{moisture.error ?? "No soil moisture reading for this plot yet."}</Muted>
        ) : (
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-200/80">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                  Soil moisture <Tag kind="measured" />
                </p>
                {soilState ? (
                  <>
                    <p className="text-sm font-bold tabular-nums text-slate-900">{soil!.toFixed(1)}%</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${TONE[soilState.tone].chip}`}>
                      {soilState.label} ({band.minOptimal}–{band.maxOptimal}%)
                    </span>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">{moisture.error ?? "No reading"}</p>
                )}
              </div>
              <div className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-200/80">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                  Leaf water (NDMI) <Tag kind="measured" />
                </p>
                {ndmi ? (
                  <>
                    <p className="text-sm font-bold tabular-nums text-slate-900">{ndmi.latest.toFixed(2)}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${TONE[INDEX_DEFS[2].status(ndmi.latest).tone].chip}`}>
                      {INDEX_DEFS[2].status(ndmi.latest).label}
                    </span>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">No reading</p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default OwnerCanopyPanel;
