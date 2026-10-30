import { useEffect, useMemo, useState } from "react";
import {
  getOrFetchWeatherChartDays,
  irrigationRainfallFromChartDays,
  localIsoDate,
  resolveForecastLatLon,
  weatherTodayRainCacheKey,
} from "../services/weatherForecastService";
import { useAppContext } from "../context/AppContext";
import { getGrapesAdminBaseUrl, getGrapesSefBaseUrl } from "../utils/serviceUrls";
import { findPlotRef, toBackendPlotName } from "../utils/plotName";
import { budKcFromDates, type GrapesKcInfo } from "../utils/grapesCropCoefficient";
import { useFarmerProfile } from "./useFarmerProfile";

export type ETRange = "Low" | "Medium" | "High";

export interface IrrigationScheduleRow {
  isoDate: string;
  date: string;
  isToday: boolean;
  etDisplayed: number;
  etRange: ETRange;
  netEt: number;
  rainfall: number;
  waterRequired: number;
  time: string;
  needsIrrigation: boolean;
}

export interface ScheduleTotals {
  totalWater: number;
  totalDripMinutes: number;
  totalDripFormatted: string;
  kc: number;
  plantsPerAcre: number;
  effectiveFlow: number;
  effectiveEmitters: number;
  irrigationType: string;
}

const ET_API_BASE = getGrapesSefBaseUrl();

export interface IrrigationPlotConfig {
  irrigationTypeCode: string;
  irrigationType: string;
  motorHp: number | null;
  flowRateLph: number | null;
  emittersCount: number;
  spacingA: number;
  spacingB: number;
  pipeWidthInches: number | null;
  distanceMotorToPlot: number | null;
}

const toIsoDate = localIsoDate;

export const getETRange = (etValue: number): ETRange => {
  if (etValue <= 3.0) return "Low";
  if (etValue <= 5.5) return "Medium";
  return "High";
};

const calculateNetET = (et: number, rainfall: number) => {
  const net = Number(et) - Number(rainfall);
  return net > 0 ? net : 0;
};

const waterFromNetET = (netEt: number, kcVal: number) => {
  if (!Number.isFinite(netEt) || !Number.isFinite(kcVal) || netEt <= 0) return 0;
  return Math.round(netEt * kcVal * 0.94 * 4046.86);
};

export const formatTimeHrsMins = (hoursTotal: number) => {
  if (!Number.isFinite(hoursTotal) || hoursTotal <= 0) return "0 hrs 0 mins";
  const h = Math.floor(hoursTotal);
  const m = Math.round((hoursTotal - h) * 60);
  return `${h} hrs ${m} mins`;
};

const parseTimeToMinutes = (time: string) => {
  if (time === "N/A" || time === "0 hrs 0 mins") return 0;
  const hMatch = time.match(/(\d+)\s*hrs/);
  const mMatch = time.match(/(\d+)\s*mins/);
  return (hMatch ? parseInt(hMatch[1], 10) : 0) * 60 + (mMatch ? parseInt(mMatch[1], 10) : 0);
};

const needsIrrigation = (waterRequired: number, time: string) =>
  waterRequired > 0 && time !== "0 hrs 0 mins" && time !== "N/A";

const calcIrrigationTime = (waterRequired: number, cfg: IrrigationPlotConfig) => {
  if (waterRequired <= 0) return "0 hrs 0 mins";

  if (cfg.irrigationTypeCode === "drip") {
    const effectiveFlow = cfg.flowRateLph && cfg.flowRateLph > 0 ? cfg.flowRateLph : 4;
    const effectiveEmitters = cfg.emittersCount && cfg.emittersCount > 0 ? cfg.emittersCount : 1;
    const validSpacingA = cfg.spacingA && cfg.spacingA > 0 ? cfg.spacingA : 4;
    const validSpacingB = cfg.spacingB && cfg.spacingB > 0 ? cfg.spacingB : 2;
    const plantsPerAcre = 43560 / (validSpacingA * validSpacingB);
    const timeInMinutes =
      ((waterRequired * 60) / plantsPerAcre) / (effectiveEmitters * effectiveFlow);
    return formatTimeHrsMins(timeInMinutes / 60);
  }

  const effectiveMotorHp = cfg.motorHp && cfg.motorHp > 0 ? cfg.motorHp : 5;
  const effectivePipeWidth = cfg.pipeWidthInches && cfg.pipeWidthInches > 0 ? cfg.pipeWidthInches : 2;
  const diameterMeters = effectivePipeWidth * 0.0254;
  const pipeAreaSqM = Math.PI * Math.pow(diameterMeters / 2, 2);
  const baseVelocity = Math.max(0.75, Math.min(2.5, effectiveMotorHp * 0.45));

  let frictionFactor = 1;
  if (cfg.distanceMotorToPlot && cfg.distanceMotorToPlot > 0) {
    const reduction = (cfg.distanceMotorToPlot / 100) * 0.05;
    frictionFactor = Math.max(0.5, 1 - reduction);
  }

  const flowRateLitersPerHour = pipeAreaSqM * baseVelocity * frictionFactor * 3600 * 1000;
  if (!Number.isFinite(flowRateLitersPerHour) || flowRateLitersPerHour <= 0) return "N/A";

  return formatTimeHrsMins(waterRequired / flowRateLitersPerHour);
};

/** Pruning dates from grapes-admin `/grapes-schedule/{plot}` (same source as the Fertilizer schedule). */
async function fetchSchedulePruningDates(
  plotId: string,
): Promise<{ foundation: string | null; fruit: string | null } | null> {
  const res = await fetch(
    `${getGrapesAdminBaseUrl().replace(/\/+$/, "")}/grapes-schedule/${encodeURIComponent(toBackendPlotName(plotId))}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const body = await res.json();
  return {
    foundation: typeof body?.foundation_pruning_date === "string" ? body.foundation_pruning_date : null,
    fruit: typeof body?.fruit_pruning_date === "string" ? body.fruit_pruning_date : null,
  };
}

/** Open-Meteo daily FAO-56 reference ET forecast for the next 6 days (index 0 = tomorrow). */
async function fetchForecastEt0(lat: number, lon: number): Promise<(number | null)[]> {
  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    forecast_days: "7",
    daily: "et0_fao_evapotranspiration",
    timezone: "Asia/Kolkata",
  });
  const resp = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`);
  if (!resp.ok) throw new Error(`ET forecast ${resp.status}`);
  const data = await resp.json();
  const values: unknown[] = data?.daily?.et0_fao_evapotranspiration ?? [];
  return values.slice(1, 7).map((v) => {
    const n = Number(v);
    return v != null && Number.isFinite(n) ? n : null;
  });
}

export const buildIrrigationSchedule = (
  etValue: number | null,
  rainfallMm: number,
  forecastRainfall: number[],
  forecastEt: (number | null)[],
  kc: number,
  plotConfig: IrrigationPlotConfig
): IrrigationScheduleRow[] => {
  const scheduleData: IrrigationScheduleRow[] = [];
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    const isToday = i === 0;
    const etForDay = isToday ? etValue : forecastEt[i - 1] ?? null;
    if (etForDay == null || !Number.isFinite(etForDay)) continue;
    const rainfall = isToday ? rainfallMm : (forecastRainfall[i - 1] ?? 0);
    const netEt = calculateNetET(etForDay, rainfall);
    const waterRequired = waterFromNetET(netEt, kc);
    const timeStr = calcIrrigationTime(waterRequired, plotConfig);

    scheduleData.push({
      isoDate: toIsoDate(date),
      date: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      isToday,
      etDisplayed: etForDay,
      etRange: getETRange(etForDay),
      netEt,
      rainfall,
      waterRequired,
      time: timeStr,
      needsIrrigation: needsIrrigation(waterRequired, timeStr),
    });
  }

  return scheduleData;
};

export function useIrrigationSchedule(syncToAppState = false) {
  const { getCached, setCached, setAppState, selectedPlotName, appState } = useAppContext();
  const { profile, loading: profileLoading } = useFarmerProfile();

  const [plotName, setPlotName] = useState("");
  const [etValue, setEtValue] = useState<number | null>(
    Number(appState?.etValue) > 0 ? Number(appState.etValue) : null,
  );
  const [forecastEt, setForecastEt] = useState<(number | null)[]>([]);
  const [rainfallMm, setRainfallMm] = useState<number | null>(null);
  const [forecastRainfall, setForecastRainfall] = useState<number[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [kc, setKc] = useState<number | null>(null);
  const [pruningKc, setPruningKc] = useState<GrapesKcInfo | null>(null);
  const [plotConfig, setPlotConfig] = useState<IrrigationPlotConfig>({
    irrigationTypeCode: "flood",
    irrigationType: "Flood",
    motorHp: null,
    flowRateLph: null,
    emittersCount: 0,
    spacingA: 0,
    spacingB: 0,
    pipeWidthInches: null,
    distanceMotorToPlot: null,
  });
  const [etLoading, setEtLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || profileLoading) return;

    const selectedPlot =
      (selectedPlotName
        ? findPlotRef(profile.plots, selectedPlotName)
        : null) ??
      (!selectedPlotName ? profile.plots?.[0] : null) ??
      null;
    if (!selectedPlot) {
      setPlotName("");
      setError(
        selectedPlotName
          ? `Selected plot "${selectedPlotName}" was not found in your profile.`
          : null,
      );
      setWeatherLoading(false);
      setEtLoading(false);
      return;
    }
    setError(null);

    const plotId =
      selectedPlot.fastapi_plot_id ||
      `${selectedPlot.gat_number}_${selectedPlot.plot_number}`;
    setPlotName(plotId);

    const { lat, lon } = resolveForecastLatLon(selectedPlot);

    let cancelled = false;
    setWeatherLoading(true);
    setError(null);

    const et0Key = `et0Forecast_${lat}_${lon}_${localIsoDate(new Date())}`;
    const cachedEt0 = getCached(et0Key);
    if (Array.isArray(cachedEt0)) {
      setForecastEt(cachedEt0);
    } else {
      setForecastEt([]);
      fetchForecastEt0(lat, lon)
        .then((values) => {
          if (cancelled) return;
          setForecastEt(values);
          setCached(et0Key, values);
        })
        .catch(() => {
          if (!cancelled) setForecastEt([]);
        });
    }

    void (async () => {
      try {
        const { chartDays, todayRainfall } = await getOrFetchWeatherChartDays(
          lat,
          lon,
          getCached,
          setCached
        );
        if (!cancelled) {
          setRainfallMm(todayRainfall);
          setForecastRainfall(irrigationRainfallFromChartDays(chartDays));
          setAppState((prev: any) => ({
            ...prev,
            weatherChartData: chartDays,
            weatherSelectedDay: prev?.weatherSelectedDay ?? chartDays[0],
          }));
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load rainfall forecast";
          setError(message);
          setRainfallMm(null);
          setForecastRainfall(null);
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    })();

    const firstFarm = selectedPlot?.farms?.[0] as Record<string, any> | undefined;
    const applyPruning = (foundation: unknown, fruit: unknown) => {
      const info = budKcFromDates(foundation, fruit, firstFarm?.plantation_date);
      if (cancelled) return;
      setPruningKc(info);
      setKc(info?.kc ?? null);
    };
    // Farm record first for an instant value; grapes-schedule is authoritative after a Fertilizer-page edit.
    applyPruning(firstFarm?.foundation_pruning_date, firstFarm?.fruit_pruning_date);
    fetchSchedulePruningDates(plotId)
      .then((dates) => {
        if (dates && (dates.foundation || dates.fruit)) applyPruning(dates.foundation, dates.fruit);
      })
      .catch(() => undefined);

    if (firstFarm) {
      const firstIrrigation = firstFarm.irrigations?.[0];
      setPlotConfig({
        irrigationTypeCode: firstIrrigation?.irrigation_type_code || "flood",
        irrigationType: firstIrrigation?.irrigation_type_code === "drip" ? "Drip" : "Flood",
        motorHp: firstIrrigation?.motor_horsepower ?? null,
        flowRateLph: firstIrrigation?.flow_rate_lph ?? null,
        emittersCount: firstIrrigation?.emitters_count ?? 0,
        spacingA: firstFarm?.spacing_a ?? 0,
        spacingB: firstFarm?.spacing_b ?? 0,
        pipeWidthInches: firstIrrigation?.pipe_width_inches ?? null,
        distanceMotorToPlot: firstIrrigation?.distance_motor_to_plot_m ?? null,
      });
    }

    return () => {
      cancelled = true;
    };
  }, [profile, profileLoading, selectedPlotName, getCached, setCached, setAppState]);

  // Keep irrigation rain in sync when the forecast card loads the shared cache first
  useEffect(() => {
    const chartDays = appState?.weatherChartData;
    if (!Array.isArray(chartDays) || chartDays.length === 0 || !profile?.plots?.length) return;

    const selectedPlot =
      (selectedPlotName
        ? findPlotRef(profile.plots, selectedPlotName)
        : null) ??
      (!selectedPlotName ? profile.plots[0] : null) ??
      null;
    if (!selectedPlot) return;

    const { lat, lon } = resolveForecastLatLon(selectedPlot);
    const todayRain = getCached(weatherTodayRainCacheKey(lat, lon));
    if (typeof todayRain !== "number") return;

    setRainfallMm(todayRain);
    setForecastRainfall(irrigationRainfallFromChartDays(chartDays));
    setWeatherLoading(false);
  }, [appState?.weatherChartData, profile, selectedPlotName, getCached]);

  useEffect(() => {
    if (!plotName) return;

    const cacheKey = `etData_${plotName}`;
    const cached = getCached(cacheKey);
    if (Number(cached?.etValue) > 0) {
      setEtValue(Number(cached.etValue));
      setEtLoading(false);
      return;
    }

    if (appState?.etValue && Number(appState.etValue) > 0) {
      setEtValue(Number(appState.etValue));
      setEtLoading(false);
    }

    let cancelled = false;
    setEtLoading(true);
    setError(null);

    void (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      try {
        const apiUrl = `${ET_API_BASE}/plots/${encodeURIComponent(toBackendPlotName(plotName))}/compute-et/`;
        const response = await fetch(apiUrl, {
          method: "POST",
          mode: "cors",
          cache: "no-cache",
          credentials: "omit",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`ET API ${response.status}`);
        const data = await response.json();
        const et = Number(data.et_24hr ?? data.ET_mean_mm_per_day ?? data.et);
        if (!(et > 0)) throw new Error("ET API returned no ET value for this plot");
        if (!cancelled) {
          setEtValue(et);
          setCached(cacheKey, { etValue: et });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load ET data";
          setError((prev) => prev ?? message);
          if (appState?.etValue && Number(appState.etValue) > 0) {
            setEtValue(Number(appState.etValue));
          }
        }
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setEtLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plotName, getCached, setCached, appState?.etValue]);

  const rainfallReady = rainfallMm !== null && forecastRainfall !== null;

  const schedule = useMemo(
    () =>
      plotName && rainfallReady && kc != null
        ? buildIrrigationSchedule(
            etValue,
            rainfallMm,
            forecastRainfall,
            forecastEt,
            kc,
            plotConfig
          )
        : [],
    [plotName, etValue, rainfallMm, forecastRainfall, forecastEt, rainfallReady, kc, plotConfig]
  );

  const totals = useMemo((): ScheduleTotals | null => {
    if (!schedule.length || kc == null) return null;

    const effectiveFlow =
      plotConfig.flowRateLph && plotConfig.flowRateLph > 0 ? plotConfig.flowRateLph : 4;
    const effectiveEmitters =
      plotConfig.emittersCount && plotConfig.emittersCount > 0 ? plotConfig.emittersCount : 1;
    const validSpacingA = plotConfig.spacingA && plotConfig.spacingA > 0 ? plotConfig.spacingA : 4;
    const validSpacingB = plotConfig.spacingB && plotConfig.spacingB > 0 ? plotConfig.spacingB : 2;
    const plantsPerAcre = Math.round(43560 / (validSpacingA * validSpacingB));

    return {
      totalWater: schedule.reduce((sum, day) => sum + day.waterRequired, 0),
      totalDripMinutes: schedule.reduce((sum, day) => sum + parseTimeToMinutes(day.time), 0),
      totalDripFormatted: formatTimeHrsMins(
        schedule.reduce((sum, day) => sum + parseTimeToMinutes(day.time), 0) / 60
      ),
      kc,
      plantsPerAcre,
      effectiveFlow,
      effectiveEmitters,
      irrigationType: plotConfig.irrigationType,
    };
  }, [schedule, kc, plotConfig]);

  useEffect(() => {
    if (!syncToAppState || schedule.length === 0) return;
    setAppState((prev: any) => ({ ...prev, irrigationScheduleData: schedule }));
  }, [schedule, setAppState, syncToAppState]);

  return {
    schedule,
    totals,
    etLoading,
    weatherLoading,
    loading: etLoading || weatherLoading,
    error,
    plotName,
    kc,
    pruningKc,
    plotConfig,
    irrigationType: plotConfig.irrigationType,
    getETRangeColor: (range: ETRange) => {
      switch (range) {
        case "Low":
          return "text-green-600 bg-green-50";
        case "Medium":
          return "text-orange-600 bg-orange-50";
        case "High":
          return "text-red-600 bg-red-50";
        default:
          return "text-gray-600 bg-gray-50";
      }
    },
  };
}
