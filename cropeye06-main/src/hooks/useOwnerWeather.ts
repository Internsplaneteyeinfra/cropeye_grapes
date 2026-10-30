import { useEffect, useState } from "react";
import { useAppContext } from "../context/AppContext";
import {
  getOrFetchWeatherChartDays,
  type ForecastChartDay,
} from "../services/weatherForecastService";
import {
  fetchForecastCurrentWeather,
  type ForecastCurrentWeather,
} from "../services/weatherService";

export type OwnerWeather = {
  days: ForecastChartDay[];
  current: ForecastCurrentWeather | null;
  loading: boolean;
  error: string | null;
  hasLocation: boolean;
};

/** Current conditions + forecast days for one map location (plot centroid). */
export function useOwnerWeather(location: [number, number] | null): OwnerWeather {
  const { getCached, setCached } = useAppContext();
  const [days, setDays] = useState<ForecastChartDay[]>([]);
  const [current, setCurrent] = useState<ForecastCurrentWeather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lat = location ? Number(location[0].toFixed(3)) : null;
  const lon = location ? Number(location[1].toFixed(3)) : null;

  useEffect(() => {
    if (lat == null || lon == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      getOrFetchWeatherChartDays(lat, lon, getCached, setCached),
      fetchForecastCurrentWeather(lat, lon),
    ]).then(([forecast, now]) => {
      if (cancelled) return;
      setDays(forecast.status === "fulfilled" ? forecast.value.chartDays : []);
      setCurrent(now.status === "fulfilled" ? now.value : null);
      if (forecast.status === "rejected" && now.status === "rejected") {
        setError("Weather services are not responding for this location.");
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lon, getCached, setCached]);

  return { days, current, loading, error, hasLocation: lat != null && lon != null };
}
