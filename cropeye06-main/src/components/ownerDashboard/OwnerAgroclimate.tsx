import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppContext } from "../../context/AppContext";
import {
  getOrFetchWeatherChartDays,
  type ForecastChartDay,
} from "../../services/weatherForecastService";
import {
  fetchForecastCurrentWeather,
  type ForecastCurrentWeather,
} from "../../services/weatherService";
import {
  GDD_BASE_C,
  HISTORY_MAX_DAYS,
  RAINY_DAY_MM,
  addDays,
  summarizePeriod,
  todayIST,
  useAgroclimateHistory,
  type AgroDay,
} from "../../hooks/useAgroclimateHistory";
import { EmptyState, Stat, fmt } from "./ownerDashboardUi";

type Props = {
  location: [number, number] | null;
  label: string;
};

type Metric = "temp" | "water" | "air" | "gdd";
type Range = 7 | 30 | 90 | "forecast";

const METRICS: { key: Metric; label: string }[] = [
  { key: "temp", label: "Temperature" },
  { key: "water", label: "Rain & ET₀" },
  { key: "air", label: "Humidity & wind" },
  { key: "gdd", label: "Degree days" },
];
const RANGES: { key: Range; label: string }[] = [
  { key: 7, label: "7 days" },
  { key: 30, label: "30 days" },
  { key: HISTORY_MAX_DAYS as 90, label: "90 days" },
  { key: "forecast", label: "Next 7 days" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

const UNITS: Record<string, string> = {
  tMax: "°C",
  tMin: "°C",
  rain: " mm",
  et0: " mm",
  humidity: "%",
  windMax: " km/h",
  gdd: " °C·d",
  cumGdd: " °C·d",
};

const Toggle = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="flex flex-wrap rounded-lg bg-slate-100 p-1 text-xs">
    {options.map((o) => (
      <button
        key={String(o.key)}
        type="button"
        onClick={() => onChange(o.key)}
        className={`rounded-md px-2.5 py-1 font-medium ${
          value === o.key ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
        }`}
        style={{ minHeight: 0 }}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const OwnerAgroclimate: React.FC<Props> = ({ location, label }) => {
  const { getCached, setCached } = useAppContext();
  const [forecastDays, setForecastDays] = useState<ForecastChartDay[]>([]);
  const [current, setCurrent] = useState<ForecastCurrentWeather | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [metric, setMetric] = useState<Metric>("temp");
  const [range, setRange] = useState<Range>(30);
  const history = useAgroclimateHistory(location);

  const lat = location ? Number(location[0].toFixed(3)) : null;
  const lon = location ? Number(location[1].toFixed(3)) : null;

  useEffect(() => {
    if (lat == null || lon == null) return;
    let cancelled = false;
    setLiveLoading(true);
    Promise.allSettled([
      getOrFetchWeatherChartDays(lat, lon, getCached, setCached),
      fetchForecastCurrentWeather(lat, lon),
    ]).then(([forecast, now]) => {
      if (cancelled) return;
      setForecastDays(forecast.status === "fulfilled" ? forecast.value.chartDays : []);
      setCurrent(now.status === "fulfilled" ? now.value : null);
      setLiveLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, getCached, setCached]);

  const today = todayIST();
  const todayRow = useMemo(() => history.rows.find((r) => r.date === today) ?? null, [history.rows, today]);

  /** Complete past days in the chosen window (today is excluded: its daily totals are still accumulating). */
  const pastRows = useMemo(() => {
    if (range === "forecast") return [];
    const from = addDays(today, -range);
    return history.rows.filter((r) => r.date >= from && r.date < today);
  }, [history.rows, range, today]);
  const period = useMemo(() => summarizePeriod(pastRows), [pastRows]);

  const chartRows = useMemo(() => {
    let cum = 0;
    const rows = todayRow ? [...pastRows, todayRow] : pastRows;
    return rows.map((r: AgroDay) => {
      if (r.gdd != null) cum += r.gdd;
      return { ...r, label: r.date === today ? "Today" : shortDate(r.date), cumGdd: Number(cum.toFixed(1)) };
    });
  }, [pastRows, todayRow, today]);

  if (lat == null || lon == null) {
    return <EmptyState message="No plot coordinates available to look up local weather." />;
  }

  const liveMissing = !liveLoading && !current;
  const forecastRain = forecastDays
    .map((d) => (d.rainfall == null ? Number.NaN : Number(d.rainfall)))
    .filter((v) => Number.isFinite(v));
  const forecastRainTotal = forecastRain.length ? forecastRain.reduce((s, v) => s + v, 0) : null;

  const tooltipFormatter = (value: number, _name: string, item: { dataKey?: string | number }) =>
    value == null ? "—" : `${fmt(value, 1)}${UNITS[String(item.dataKey)] ?? ""}`;

  const renderHistoryChart = () => {
    if (history.loading && chartRows.length === 0) {
      return <EmptyState loading message="Loading historical weather…" />;
    }
    if (history.error || chartRows.length === 0) {
      return <EmptyState message={history.error ?? "No historical weather returned for this location."} />;
    }
    const tickGap = range === 7 ? 0 : range === 30 ? 3 : 10;
    return (
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={tickGap} />
          {metric === "temp" && (
            <>
              <YAxis tick={{ fontSize: 11 }} unit="°" domain={["dataMin - 2", "dataMax + 2"]} />
              <Line dataKey="tMax" name="Max temp" stroke="#f97316" strokeWidth={2} dot={range === 7} connectNulls={false} />
              <Line dataKey="tMin" name="Min temp" stroke="#3b82f6" strokeWidth={2} dot={range === 7} connectNulls={false} />
            </>
          )}
          {metric === "water" && (
            <>
              <YAxis tick={{ fontSize: 11 }} unit="mm" />
              <Bar dataKey="rain" name="Rainfall" fill="#38bdf8" radius={[3, 3, 0, 0]} />
              <Line dataKey="et0" name="Reference ET₀" stroke="#d97706" strokeWidth={2} dot={false} connectNulls={false} />
            </>
          )}
          {metric === "air" && (
            <>
              <YAxis yAxisId="h" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
              <YAxis yAxisId="w" orientation="right" tick={{ fontSize: 11 }} unit=" km/h" width={56} />
              <Line yAxisId="h" dataKey="humidity" name="Mean humidity" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls={false} />
              <Line yAxisId="w" dataKey="windMax" name="Max wind" stroke="#64748b" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} />
            </>
          )}
          {metric === "gdd" && (
            <>
              <YAxis yAxisId="d" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 11 }} width={48} />
              <Bar yAxisId="d" dataKey="gdd" name={`Daily GDD (base ${GDD_BASE_C}°C)`} fill="#a3e635" radius={[3, 3, 0, 0]} />
              <Line yAxisId="c" dataKey="cumGdd" name="Accumulated GDD" stroke="#4d7c0f" strokeWidth={2} dot={false} />
            </>
          )}
          {todayRow && (
            <ReferenceLine
              x="Today"
              yAxisId={metric === "air" ? "h" : metric === "gdd" ? "d" : undefined}
              stroke="#059669"
              strokeDasharray="3 3"
              label={{ value: "Today", position: "insideTopRight", fontSize: 10, fill: "#059669" }}
            />
          )}
          <Tooltip formatter={tooltipFormatter as never} labelFormatter={(l) => (l === "Today" ? `Today (${shortDate(today)}, so far)` : l)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  const renderForecastChart = () =>
    forecastDays.length === 0 ? (
      <EmptyState loading={liveLoading} message={liveLoading ? "Loading forecast…" : "Forecast unavailable for this location."} />
    ) : (
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={forecastDays} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="t" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} unit="mm" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="r" dataKey="rainfall" name="Rainfall (mm)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
          <Line yAxisId="t" dataKey="temperature" name="Max temp (°C)" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
          <Line yAxisId="t" dataKey="humidity" name="Humidity (%)" stroke="#16a34a" strokeWidth={2} strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Today */}
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-gradient-to-br from-sky-600 to-emerald-600 p-4 text-white">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-white/80">Today · {shortDate(today)}</p>
            {current && (
              <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-300" /> Live
              </span>
            )}
          </div>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {liveLoading && !current ? "…" : fmt(current?.temperature_c, 1, "°C")}
          </p>
          <p className="text-sm text-white/90">
            {current?.location || label}
            {current?.condition_text ? ` · ${current.condition_text}` : ""}
          </p>
          {todayRow && (todayRow.tMax != null || todayRow.tMin != null) && (
            <p className="mt-1 text-xs text-white/85">
              High {fmt(todayRow.tMax, 1, "°")} · Low {fmt(todayRow.tMin, 1, "°")}
            </p>
          )}
          {current?.rain_alert && (
            <p className="mt-2 rounded-md bg-white/15 px-2 py-1 text-xs">
              Rain alert: {current.rain_alert}
              {current.rain_probability ? ` (${current.rain_probability})` : ""}
            </p>
          )}
          {liveMissing && (
            <p className="mt-2 rounded-md bg-white/15 px-2 py-1 text-xs">Live weather is not responding right now.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Humidity" value={fmt(current?.humidity, 0, "%")} />
          <Stat label="Wind" value={fmt(current?.wind_kph, 1, " km/h")} />
          <Stat label="Rain today" value={fmt(current?.precip_mm, 1, " mm")} accent="text-sky-700" />
          <Stat label="ET₀ today" value={fmt(todayRow?.et0, 2, " mm")} accent="text-amber-700" />
          <Stat label={`GDD today (base ${GDD_BASE_C}°)`} value={fmt(todayRow?.gdd, 1)} accent="text-lime-700" />
          <Stat label="Next 7 days rain" value={fmt(forecastRainTotal, 1, " mm")} accent="text-sky-700" />
        </div>
        <p className="text-[11px] leading-snug text-slate-400">
          Temperature, humidity, wind and rain are live readings. High/low, ET₀ and GDD are today's Open-Meteo daily
          values and still include forecast hours.
        </p>
      </div>

      {/* History */}
      <div className="flex min-w-0 flex-col gap-3 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {range === "forecast" ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Forecast · next 7 days</p>
          ) : (
            <Toggle options={METRICS} value={metric} onChange={setMetric} />
          )}
          <Toggle options={RANGES} value={range} onChange={setRange} />
        </div>

        <div className="min-h-[280px]">{range === "forecast" ? renderForecastChart() : renderHistoryChart()}</div>

        {range !== "forecast" && pastRows.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <Stat
                label="Total rain"
                value={fmt(period.totalRain, 1, " mm")}
                accent="text-sky-700"
              />
              <Stat label={`Rainy days (≥ ${RAINY_DAY_MM} mm)`} value={period.rainyDays == null ? "—" : String(period.rainyDays)} />
              <Stat label="Avg max / min" value={`${fmt(period.avgMax, 1, "°")} / ${fmt(period.avgMin, 1, "°")}`} />
              <Stat label="Peak / lowest" value={`${fmt(period.peakMax, 1, "°")} / ${fmt(period.lowMin, 1, "°")}`} />
              <Stat
                label="Rain − ET₀"
                value={period.waterBalance == null ? "—" : `${period.waterBalance > 0 ? "+" : ""}${fmt(period.waterBalance, 1, " mm")}`}
                accent={period.waterBalance != null && period.waterBalance < 0 ? "text-red-600" : "text-emerald-700"}
              />
              <Stat label="Accumulated GDD" value={fmt(period.totalGdd, 0, " °C·d")} accent="text-lime-700" />
            </div>
            <p className="text-[11px] text-slate-400">
              Last {range} complete days ({shortDate(pastRows[0].date)} – {shortDate(pastRows[pastRows.length - 1].date)}
              {period.daysWithData < period.days ? `, ${period.days - period.daysWithData} days without data` : ""}). Today
              is shown on the chart but not counted. Source: Open-Meteo daily weather. A negative Rain − ET₀ means the
              crop lost more water than rain supplied.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default OwnerAgroclimate;
