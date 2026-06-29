import { useEffect, useMemo, useState } from "react";
import budData from "../components/bud.json";
import {
  getOrFetchWeatherChartDays,
  irrigationRainfallFromChartDays,
  localIsoDate,
  resolveForecastLatLon,
  weatherTodayRainCacheKey,
} from "../services/weatherForecastService";
import { fetchCurrentWeather } from "../services/weatherService";
import { useAppContext } from "../context/AppContext";
import { getGrapesSefBaseUrl } from "../utils/serviceUrls";
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

const ET_API_BASE = getGrapesSefBaseUrl().replace(/\/+$/, "");

const ET_FETCH_BASES = [
  ET_API_BASE,
  "/api/field-analysis",
  "https://cropeye-grapes-sef-production.up.railway.app",
].filter((v, i, arr) => arr.indexOf(v) === i);

const DEFAULT_ET = 2.5;

async function fetchPlotEtValue(plot: string): Promise<number> {
  let lastErr: Error | null = null;

  for (const base of ET_FETCH_BASES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    const url = `${base}/plots/${encodeURIComponent(plot)}/compute-et/`;

    try {
      const response = await fetch(url, {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        credentials: "omit",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ET API ${response.status}`);
      }

      const data = await response.json();
      const et = data.et_24hr ?? data.ET_mean_mm_per_day ?? data.et ?? 0;
      const finalEt = Number(et) > 0 ? Number(et) : DEFAULT_ET;
      return finalEt;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr || new Error("Failed to load ET data");
}

async function resolveTodayRainfallMm(
  lat: number,
  lon: number,
  forecastTodayRain: number
): Promise<number> {
  try {
    const current = await fetchCurrentWeather(lat, lon, true);
    if (Number.isFinite(current.precip_mm)) {
      return Number(current.precip_mm);
    }
  } catch {
    /* fall back to forecast */
  }
  return forecastTodayRain;
}

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

const generateAdjustedET = (baseEt: number, plotName: string) => {
  const effectiveBaseEt = baseEt > 0 ? baseEt : 2.5;
  let seed = 0;
  for (let j = 0; j < plotName.length; j++) seed += plotName.charCodeAt(j);
  seed += new Date().getDate();

  let randomSeed = seed;
  const seededRandom = () => {
    randomSeed = (randomSeed * 9301 + 49297) % 233280;
    return randomSeed / 233280;
  };

  const predictions: number[] = [];
  const mediumDays: number[] = [];
  const candidateDays = [0, 1, 2, 3, 4, 5];
  const numMediumDays = 2 + Math.floor(seededRandom() * 2);

  for (let k = 0; k < numMediumDays; k++) {
    const randomIdx = Math.floor(seededRandom() * candidateDays.length);
    mediumDays.push(candidateDays[randomIdx]);
    candidateDays.splice(randomIdx, 1);
  }

  for (let i = 0; i < 6; i++) {
    let predictedET: number;
    const isMediumDay = mediumDays.includes(i);

    if (effectiveBaseEt <= 3.0) {
      predictedET = isMediumDay ? 3.2 + seededRandom() * 1.8 : 2.0 + seededRandom() * 0.9;
    } else if (effectiveBaseEt <= 5.5) {
      predictedET = isMediumDay ? 3.5 + seededRandom() * 1.5 : 2.3 + seededRandom() * 0.7;
    } else if (isMediumDay && seededRandom() > 0.6) {
      predictedET = 5.5 + seededRandom() * 1.0;
    } else if (isMediumDay) {
      predictedET = 3.8 + seededRandom() * 1.5;
    } else {
      predictedET = 3.0 + seededRandom() * 0.8;
    }

    predictedET = Math.max(predictedET * (0.95 + seededRandom() * 0.1), 1.5);
    predictions.push(Number(predictedET.toFixed(1)));
  }

  return predictions;
};

export const buildIrrigationSchedule = (
  etValue: number,
  rainfallMm: number,
  forecastRainfall: number[],
  kc: number,
  plotName: string,
  plotConfig: IrrigationPlotConfig
): IrrigationScheduleRow[] => {
  const scheduleData: IrrigationScheduleRow[] = [];
  const today = new Date();
  const next6Et = generateAdjustedET(etValue, plotName);

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    const isToday = i === 0;
    const etForDay = isToday ? etValue : next6Et[i - 1];
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
  const [etValue, setEtValue] = useState<number>(appState?.etValue ?? DEFAULT_ET);
  const [rainfallMm, setRainfallMm] = useState<number | null>(null);
  const [forecastRainfall, setForecastRainfall] = useState<number[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [kc, setKc] = useState(0.3);
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

    let selectedPlot = null;
    if (selectedPlotName) {
      selectedPlot = profile.plots?.find(
        (p: any) =>
          p.fastapi_plot_id === selectedPlotName ||
          `${p.gat_number}_${p.plot_number}` === selectedPlotName
      );
    }
    if (!selectedPlot && profile.plots?.length) selectedPlot = profile.plots[0];
    if (!selectedPlot) {
      setPlotName("");
      setEtLoading(false);
      return;
    }

    const plotId =
      selectedPlot.fastapi_plot_id ||
      `${selectedPlot.gat_number}_${selectedPlot.plot_number}`;
    setPlotName(plotId);

    const { lat, lon } = resolveForecastLatLon(selectedPlot);

    let cancelled = false;
    setWeatherLoading(true);
    setError(null);

    void (async () => {
      try {
        const { chartDays, todayRainfall } = await getOrFetchWeatherChartDays(
          lat,
          lon,
          getCached,
          setCached
        );
        const todayRain = await resolveTodayRainfallMm(lat, lon, todayRainfall);
        if (!cancelled) {
          setRainfallMm(todayRain);
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

    const firstFarm = selectedPlot?.farms?.[0];
    if (firstFarm?.plantation_date) {
      const plantationDate = new Date(firstFarm.plantation_date);
      const days = Math.floor((Date.now() - plantationDate.getTime()) / (1000 * 60 * 60 * 24));
      let derivedStage = "Germination";
      if (days > 210) derivedStage = "Maturity & Ripening";
      else if (days > 90) derivedStage = "Grand Growth";
      else if (days > 30) derivedStage = "Tillering";

      let kcValue = 0.3;
      try {
        for (const method of (budData as any).fertilizer_schedule || []) {
          for (const st of method.stages || []) {
            if (st.stage === derivedStage && st.kc !== undefined) {
              kcValue = Number(st.kc) || kcValue;
            }
          }
        }
      } catch {
        /* keep default kc */
      }
      setKc(kcValue);
    }

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

    let selectedPlot: any = null;
    if (selectedPlotName) {
      selectedPlot = profile.plots.find(
        (p: any) =>
          p.fastapi_plot_id === selectedPlotName ||
          `${p.gat_number}_${p.plot_number}` === selectedPlotName
      );
    }
    if (!selectedPlot) selectedPlot = profile.plots[0];

    const { lat, lon } = resolveForecastLatLon(selectedPlot);
    const todayRain = getCached(weatherTodayRainCacheKey(lat, lon));
    if (typeof todayRain !== "number") return;

    void resolveTodayRainfallMm(lat, lon, todayRain).then((resolvedTodayRain) => {
      setRainfallMm(resolvedTodayRain);
      setForecastRainfall(irrigationRainfallFromChartDays(chartDays));
      setWeatherLoading(false);
    });
  }, [appState?.weatherChartData, profile, selectedPlotName, getCached]);

  useEffect(() => {
    if (appState?.etValue && Number(appState.etValue) > 0) {
      setEtValue(Number(appState.etValue));
      setEtLoading(false);
    }
  }, [appState?.etValue]);

  useEffect(() => {
    if (!plotName) return;

    const cacheKey = `etData_${plotName}`;
    const cached = getCached(cacheKey);
    if (cached?.etValue) {
      const value = Number(cached.etValue);
      setEtValue(value > 0 ? value : DEFAULT_ET);
      setEtLoading(false);
      return;
    }

    if (appState?.etValue && Number(appState.etValue) > 0) {
      setEtValue(Number(appState.etValue));
      setEtLoading(false);
      return;
    }

    let cancelled = false;
    setEtLoading(true);
    setError(null);

    void (async () => {
      try {
        const finalEt = await fetchPlotEtValue(plotName);
        if (!cancelled) {
          setEtValue(finalEt);
          setCached(cacheKey, { etValue: finalEt });
          setAppState((prev: any) => ({ ...prev, etValue: finalEt }));
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load ET data";
          setError((prev) => prev ?? message);
          if (appState?.etValue && Number(appState.etValue) > 0) {
            setEtValue(Number(appState.etValue));
          } else {
            setEtValue(DEFAULT_ET);
          }
        }
      } finally {
        if (!cancelled) setEtLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plotName, getCached, setCached, setAppState, appState?.etValue]);

  const rainfallReady = rainfallMm !== null && forecastRainfall !== null;

  const schedule = useMemo(
    () =>
      plotName && rainfallReady
        ? buildIrrigationSchedule(
            etValue,
            rainfallMm,
            forecastRainfall,
            kc,
            plotName,
            plotConfig
          )
        : [],
    [plotName, etValue, rainfallMm, forecastRainfall, rainfallReady, kc, plotConfig]
  );

  const totals = useMemo((): ScheduleTotals | null => {
    if (!schedule.length) return null;

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
