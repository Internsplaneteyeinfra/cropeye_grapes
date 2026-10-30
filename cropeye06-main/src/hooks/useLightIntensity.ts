import { useEffect, useState } from "react";
import { getCache, setCache } from "../utils/cache";

export type LightIntensity = {
  /** Current global horizontal irradiance, W/m². */
  irradiance: number | null;
  /** Today's total solar energy, MJ/m². */
  dailyMj: number | null;
  /** Today's sunshine duration, hours. */
  sunshineHours: number | null;
};

const CACHE_MS = 15 * 60 * 1000;

async function fetchLightIntensity(lat: number, lon: number): Promise<LightIntensity> {
  const key = `lightIntensity_${lat}_${lon}`;
  const cached = getCache(key, CACHE_MS) as LightIntensity | null;
  if (cached) return cached;

  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "shortwave_radiation",
    daily: "shortwave_radiation_sum,sunshine_duration",
    timezone: "auto",
    forecast_days: "1",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const j = await res.json();
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const sunshineSec = num(j?.daily?.sunshine_duration?.[0]);
  const data: LightIntensity = {
    irradiance: num(j?.current?.shortwave_radiation),
    dailyMj: num(j?.daily?.shortwave_radiation_sum?.[0]),
    sunshineHours: sunshineSec != null ? sunshineSec / 3600 : null,
  };
  setCache(key, data);
  return data;
}

/** Current sunlight at a plot location (Open-Meteo solar radiation). */
export function useLightIntensity(location: [number, number] | null) {
  const [data, setData] = useState<LightIntensity | null>(null);
  const [loading, setLoading] = useState(false);

  const lat = location ? Number(location[0].toFixed(3)) : null;
  const lon = location ? Number(location[1].toFixed(3)) : null;

  useEffect(() => {
    if (lat == null || lon == null) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchLightIntensity(lat, lon)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return { loading, ...(data ?? { irradiance: null, dailyMj: null, sunshineHours: null }) };
}
