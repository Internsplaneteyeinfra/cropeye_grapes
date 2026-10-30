import { useEffect, useState } from "react";
import { getCache, setCache } from "../utils/cache";

/** One day of Open-Meteo daily weather (reanalysis for past days, observed + forecast for today). */
export type AgroDay = {
  date: string;
  tMax: number | null;
  tMin: number | null;
  rain: number | null;
  humidity: number | null;
  et0: number | null;
  windMax: number | null;
  /** Growing degree days, base 10 °C (grapevine); null when max or min temperature is missing. */
  gdd: number | null;
};

export const HISTORY_MAX_DAYS = 90;
/** Grapevine base temperature for growing degree days. */
export const GDD_BASE_C = 10;
/** IMD threshold for a rainy day. */
export const RAINY_DAY_MM = 2.5;

const CACHE_MS = 60 * 60 * 1000;
const DAILY_FIELDS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "relative_humidity_2m_mean",
  "et0_fao_evapotranspiration",
  "wind_speed_10m_max",
];

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : v == null ? Number.NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Today's date in India (the API is queried in Asia/Kolkata). */
export function todayIST(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function parseOpenMeteoDaily(body: any): AgroDay[] {
  const d = body?.daily;
  const time: unknown[] = Array.isArray(d?.time) ? d.time : [];
  return time
    .map((t, i) => {
      const tMax = num(d.temperature_2m_max?.[i]);
      const tMin = num(d.temperature_2m_min?.[i]);
      return {
        date: String(t).slice(0, 10),
        tMax,
        tMin,
        rain: num(d.precipitation_sum?.[i]),
        humidity: num(d.relative_humidity_2m_mean?.[i]),
        et0: num(d.et0_fao_evapotranspiration?.[i]),
        windMax: num(d.wind_speed_10m_max?.[i]),
        gdd: tMax != null && tMin != null ? Math.max(0, (tMax + tMin) / 2 - GDD_BASE_C) : null,
      };
    })
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

export type PeriodSummary = {
  days: number;
  daysWithData: number;
  totalRain: number | null;
  rainyDays: number | null;
  avgMax: number | null;
  avgMin: number | null;
  peakMax: number | null;
  lowMin: number | null;
  avgHumidity: number | null;
  totalEt0: number | null;
  /** Rain minus reference ET; negative = crop water deficit. */
  waterBalance: number | null;
  totalGdd: number | null;
};

const values = (rows: AgroDay[], k: keyof AgroDay) =>
  rows.map((r) => r[k]).filter((v): v is number => typeof v === "number");
const sum = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) : null);
const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

export function summarizePeriod(rows: AgroDay[]): PeriodSummary {
  const rain = values(rows, "rain");
  const et0 = values(rows, "et0");
  const tMax = values(rows, "tMax");
  const tMin = values(rows, "tMin");
  const totalRain = sum(rain);
  const totalEt0 = sum(et0);
  return {
    days: rows.length,
    daysWithData: rows.filter((r) => r.tMax != null || r.rain != null).length,
    totalRain,
    rainyDays: rain.length ? rain.filter((v) => v >= RAINY_DAY_MM).length : null,
    avgMax: avg(tMax),
    avgMin: avg(tMin),
    peakMax: tMax.length ? Math.max(...tMax) : null,
    lowMin: tMin.length ? Math.min(...tMin) : null,
    avgHumidity: avg(values(rows, "humidity")),
    totalEt0,
    // Only when both series cover the same days, otherwise the balance would be skewed.
    waterBalance: totalRain != null && totalEt0 != null && rain.length === et0.length ? totalRain - totalEt0 : null,
    totalGdd: sum(values(rows, "gdd")),
  };
}

const inflight = new Map<string, Promise<AgroDay[]>>();

function fetchHistory(lat: number, lon: number): Promise<AgroDay[]> {
  const key = `agroHistory_v1_${lat}_${lon}_${todayIST()}`;
  const cached = getCache(key, CACHE_MS) as AgroDay[] | null;
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;
  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    past_days: String(HISTORY_MAX_DAYS),
    forecast_days: "1",
    timezone: "Asia/Kolkata",
    daily: DAILY_FIELDS.join(","),
  });
  const request = fetch(`https://api.open-meteo.com/v1/forecast?${qs}`)
    .then(async (resp) => {
      if (!resp.ok) throw new Error(`Weather history ${resp.status}`);
      const rows = parseOpenMeteoDaily(await resp.json());
      setCache(key, rows);
      return rows;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/** Daily agroclimate for the last HISTORY_MAX_DAYS days plus today, at one location. */
export function useAgroclimateHistory(location: [number, number] | null) {
  const lat = location ? Number(location[0].toFixed(3)) : null;
  const lon = location ? Number(location[1].toFixed(3)) : null;
  const [rows, setRows] = useState<AgroDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat == null || lon == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHistory(lat, lon)
      .then((r) => !cancelled && setRows(r))
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setError("Historical weather is not available for this location right now.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return { rows, loading, error };
}
