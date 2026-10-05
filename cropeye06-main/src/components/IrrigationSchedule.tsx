import React, { useEffect, useMemo, useState } from "react";
import "./Irrigation/Irrigation.css";
import { useAppContext } from "../context/AppContext";
import { useFarmerProfile } from "../hooks/useFarmerProfile";
import {
  formatTimeHrsMins,
  useIrrigationSchedule,
  type IrrigationPlotConfig,
} from "../hooks/useIrrigationSchedule";
import {
  fetchWaterRemainForPlot,
  filterPastDays,
  formatIrrigationDateRange,
  formatWaterRemainError,
  pastRange,
  todayIsoInTz,
  type WaterRemainDay,
} from "../utils/waterRemainApi";
import { plotKeyFromRecord } from "../utils/plotName";
import { fetchSoilMoistureForPlot } from "../utils/soilMoistureApi";
import { getEventsBaseUrl } from "../utils/serviceUrls";
import { CloudRain, Sun } from "lucide-react";

type ScheduleDay = {
  day: string;
  etoSumMm: number;
  etoLossLiters: number;
  oneMmLiters?: number;
  waterRemainLiters: number;
  waterRemainM3: number;
  waterVolumeLiters: number;
  rainfall: number;
};

type PlotCoords = { lat: number; lon: number };

type ScheduleRow = {
  date: string;
  isoDate: string;
  isToday: boolean;
  etDisplayed: number;
  etRange: "Low" | "Medium" | "High";
  etoLossLiters: number;
  etoLossKl: number;
  irrigationNeedKl: number;
  waterRemainLiters: number;
  waterRemainM3: number;
  rainfall: number;
  dataMissing: boolean;
  /** True when satellite irrigation event exists for this calendar day */
  irrigationGiven: boolean;
  /** Recommended/applied duration hours when given (from required water + plot config) */
  irrigationHours: number | null;
  irrigationStatusLabel: string;
  requiredTimeLabel?: string;
};

function parsePrecipMm(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  if (typeof raw === "string") {
    const n = Number(raw.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

/** Flutter: irrigation needed kL only when remain is deficit. */
function irrigationNeededKl(remainLiters: number): number {
  if (!(remainLiters < 0)) return 0;
  return Math.abs(remainLiters) / 1000;
}

/** Flutter: ETo loss volume in kL. */
function etoLossKl(etoLossLiters: number): number {
  return Math.max(0, Number(etoLossLiters) || 0) / 1000;
}

function parseHoursFromTimeLabel(time: string | undefined | null): number | null {
  if (!time || time === "N/A" || time === "0 hrs 0 mins" || time === "0m") return null;
  const hMatch = time.match(/(\d+(?:\.\d+)?)\s*h(?:rs?)?/i);
  const mMatch = time.match(/(\d+(?:\.\d+)?)\s*m(?:ins?)?/i);
  const hours = (hMatch ? Number(hMatch[1]) : 0) + (mMatch ? Number(mMatch[1]) / 60 : 0);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

/** Convert required liters → hours using the same drip/flood rules as the schedule hook. */
function hoursFromRequiredLiters(
  liters: number,
  cfg: IrrigationPlotConfig | null,
): number | null {
  if (!(liters > 0) || !cfg) return null;
  if (cfg.irrigationTypeCode === "drip") {
    const effectiveFlow = cfg.flowRateLph && cfg.flowRateLph > 0 ? cfg.flowRateLph : 4;
    const effectiveEmitters =
      cfg.emittersCount && cfg.emittersCount > 0 ? cfg.emittersCount : 1;
    const validSpacingA = cfg.spacingA && cfg.spacingA > 0 ? cfg.spacingA : 4;
    const validSpacingB = cfg.spacingB && cfg.spacingB > 0 ? cfg.spacingB : 2;
    const plantsPerAcre = 43560 / (validSpacingA * validSpacingB);
    const timeInMinutes =
      ((liters * 60) / plantsPerAcre) / (effectiveEmitters * effectiveFlow);
    const hours = timeInMinutes / 60;
    return Number.isFinite(hours) && hours > 0 ? hours : null;
  }
  const effectiveMotorHp = cfg.motorHp && cfg.motorHp > 0 ? cfg.motorHp : 5;
  const effectivePipeWidth =
    cfg.pipeWidthInches && cfg.pipeWidthInches > 0 ? cfg.pipeWidthInches : 2;
  const diameterMeters = effectivePipeWidth * 0.0254;
  const pipeAreaSqM = Math.PI * Math.pow(diameterMeters / 2, 2);
  const baseVelocity = Math.max(0.75, Math.min(2.5, effectiveMotorHp * 0.45));
  let frictionFactor = 1;
  if (cfg.distanceMotorToPlot && cfg.distanceMotorToPlot > 0) {
    frictionFactor = Math.max(0.5, 1 - (cfg.distanceMotorToPlot / 100) * 0.05);
  }
  const flowRateLitersPerHour =
    pipeAreaSqM * baseVelocity * frictionFactor * 3600 * 1000;
  if (!(flowRateLitersPerHour > 0)) return null;
  const hours = liters / flowRateLitersPerHour;
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function formatHoursShort(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function buildIrrigationStatusLabel(
  given: boolean,
  _hours?: number | null,
): string {
  if (!given) return "";
  return "Irrigation Given";
}

/** Detail under status — shows volume in KL */
function buildIrrigationNeedDetail(
  needKl: number,
  _hours?: number | null,
): string | null {
  const kl = Math.max(0, Number(needKl) || 0);
  if (!(kl > 0)) return null;
  return `${kl.toFixed(1)} KL`;
}

function extractIrrigationEventDates(payload: any): Set<string> {
  const dates = new Set<string>();
  const events = Array.isArray(payload?.events) ? payload.events : [];
  for (const ev of events) {
    const raw =
      ev?.date ??
      ev?.event_date ??
      ev?.day ??
      ev?.from_date ??
      ev?.start_date ??
      null;
    const key = String(raw ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) dates.add(key);
  }
  return dates;
}

/** Calendar day in Asia/Kolkata: today minus N days → YYYY-MM-DD. */
function istDayOffset(daysBack: number): string {
  const today = todayIsoInTz();
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - daysBack);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapWaterRemainToScheduleDays(
  days: WaterRemainDay[],
  rainByDate: Map<string, number>,
  todayStr: string,
  rainfallMm: number,
): ScheduleDay[] {
  return days.map((item) => {
    const fromMap = rainByDate.get(item.date);
    const rainfall =
      fromMap != null && Number.isFinite(fromMap)
        ? fromMap
        : item.date === todayStr
          ? rainfallMm
          : 0;
    return {
      day: item.date,
      etoSumMm: item.eto_sum_mm,
      etoLossLiters: item.eto_loss_liters,
      oneMmLiters: item.one_mm_liters,
      waterRemainLiters: item.water_remain_liters,
      waterRemainM3: item.water_remain_m3,
      waterVolumeLiters: item.water_volume_liters,
      rainfall,
    };
  });
}

/** Daily rainfall (mm) for last N days at plot lat/lon — Open-Meteo past_days. */
async function fetchPastDailyRainfall(
  lat: number,
  lon: number,
  daysBack = 7,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    past_days: String(daysBack),
    forecast_days: "1",
    daily: "precipitation_sum",
    timezone: "Asia/Kolkata",
  });
  const resp = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`);
  if (!resp.ok) throw new Error(`Rainfall API ${resp.status}`);
  const data = await resp.json();
  const times: string[] = data?.daily?.time ?? [];
  const precip: unknown[] = data?.daily?.precipitation_sum ?? [];
  times.forEach((iso, i) => {
    const key = String(iso).slice(0, 10);
    if (key) map.set(key, parsePrecipMm(precip[i]));
  });
  return map;
}

/** Merge CropEye forecast precip for overlapping dates (today + near future). */
async function fetchForecastRainfall(
  lat: number,
  lon: number,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const resp = await fetch(
      `https://weather-cropeye.up.railway.app/forecast?lat=${lat}&lon=${lon}`,
    );
    if (!resp.ok) return map;
    const data = await resp.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    for (const row of rows) {
      const key = String(row?.date ?? "").slice(0, 10);
      if (!key) continue;
      map.set(key, parsePrecipMm(row?.precipitation));
    }
  } catch {
    /* optional */
  }
  return map;
}

const IrrigationSchedule: React.FC = () => {
  const { appState, setAppState, selectedPlotName } = useAppContext();
  const { profile, loading: profileLoading } = useFarmerProfile();
  const legacySchedule = useIrrigationSchedule(true);
  const [plotName, setPlotName] = useState<string>("");
  const [plotCoords, setPlotCoords] = useState<PlotCoords | null>(null);
  const [cropName, setCropName] = useState<string>("grapes");
  const [etValue, setEtValue] = useState<number>(0.1);
  const [rainfallMm, setRainfallMm] = useState<number>(0);
  /** Past 7 days from water-remain + daily rainfall (Open-Meteo / forecast) */
  const [remainDays, setRemainDays] = useState<ScheduleDay[]>([]);
  const [rainByDate, setRainByDate] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [usingLegacyEt, setUsingLegacyEt] = useState(false);
  /** Dates (YYYY-MM-DD) where existing /plots/{id}/irrigation detected an event */
  const [irrigationEventDates, setIrrigationEventDates] = useState<Set<string>>(
    () => new Set(),
  );
  const [plotConfig, setPlotConfig] = useState<IrrigationPlotConfig | null>(
    null,
  );

  const getETRange = (etMm: number): "Low" | "Medium" | "High" => {
    if (etMm <= 3.0) return "Low";
    if (etMm <= 5.5) return "Medium";
    return "High";
  };

  const getETRangeColor = (range: "Low" | "Medium" | "High"): string => {
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
  };

  const fetchCurrentRainfall = async (lat: number, lon: number) => {
    try {
      const url = `https://weather-cropeye.up.railway.app/current-weather?lat=${lat}&lon=${lon}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Current weather ${resp.status}`);
      const data = await resp.json();
      setRainfallMm(Number(data?.precip_mm) || 0);
    } catch {
      setRainfallMm(0);
    }
  };

  useEffect(() => {
    if (!profile || profileLoading) return;

    let selectedPlot = null;
    if (selectedPlotName) {
      selectedPlot = profile.plots?.find(
        (p: any) =>
          p.fastapi_plot_id === selectedPlotName ||
          `${p.gat_number}_${p.plot_number}` === selectedPlotName,
      );
    }
    if (!selectedPlot && profile.plots?.length) {
      selectedPlot = profile.plots[0];
    }
    if (!selectedPlot) {
      setPlotName("");
      setPlotCoords(null);
      setPlotConfig(null);
      setIrrigationEventDates(new Set());
      return;
    }

    const plotId =
      plotKeyFromRecord(selectedPlot) ||
      selectedPlot.fastapi_plot_id ||
      `${selectedPlot.gat_number}_${selectedPlot.plot_number}`;
    setPlotName(plotId);

    const cropRaw =
      selectedPlot?.crop_variety ??
      selectedPlot?.crop_type?.crop_variety ??
      selectedPlot?.farms?.[0]?.crop_variety ??
      selectedPlot?.farms?.[0]?.crop_type?.crop_variety ??
      profile?.agricultural_summary?.crop_types?.[0] ??
      "grapes";
    setCropName(cropRaw ? String(cropRaw) : "grapes");

    const firstFarm = selectedPlot?.farms?.[0];
    const firstIrrigation = firstFarm?.irrigations?.[0];
    if (firstFarm) {
      setPlotConfig({
        irrigationTypeCode: firstIrrigation?.irrigation_type_code || "flood",
        irrigationType:
          firstIrrigation?.irrigation_type_code === "drip" ? "Drip" : "Flood",
        motorHp: firstIrrigation?.motor_horsepower ?? null,
        flowRateLph: firstIrrigation?.flow_rate_lph ?? null,
        emittersCount: firstIrrigation?.emitters_count ?? 0,
        spacingA: firstFarm?.spacing_a ?? 0,
        spacingB: firstFarm?.spacing_b ?? 0,
        pipeWidthInches: firstIrrigation?.pipe_width_inches ?? null,
        distanceMotorToPlot: firstIrrigation?.distance_motor_to_plot_m ?? null,
      });
    } else {
      setPlotConfig(null);
    }

    try {
      let latN: number | null = null;
      let lonN: number | null = null;
      const loc = selectedPlot?.coordinates?.location?.coordinates;
      if (Array.isArray(loc) && loc.length >= 2) {
        lonN = Number(loc[0]);
        latN = Number(loc[1]);
      } else {
        const plotAny = selectedPlot as {
          coordinates?: { boundary?: { coordinates?: number[][][] } };
          boundary?: { coordinates?: number[][][] };
        };
        const ring =
          plotAny.coordinates?.boundary?.coordinates?.[0] ||
          plotAny.boundary?.coordinates?.[0];
        if (Array.isArray(ring) && ring.length >= 3) {
          let sx = 0;
          let sy = 0;
          let n = 0;
          for (const pt of ring) {
            if (!Array.isArray(pt) || pt.length < 2) continue;
            sx += Number(pt[0]);
            sy += Number(pt[1]);
            n += 1;
          }
          if (n > 0) {
            lonN = sx / n;
            latN = sy / n;
          }
        }
      }
      if (
        latN != null &&
        lonN != null &&
        Number.isFinite(latN) &&
        Number.isFinite(lonN)
      ) {
        setPlotCoords({ lat: latN, lon: lonN });
        void fetchCurrentRainfall(latN, lonN);
      } else {
        setPlotCoords(null);
      }
    } catch {
      setPlotCoords(null);
    }
  }, [profile, profileLoading, selectedPlotName]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    try {
      if (!profile || !selectedPlotName) return;
      let selectedPlot = profile.plots?.find(
        (p: any) =>
          p.fastapi_plot_id === selectedPlotName ||
          `${p.gat_number}_${p.plot_number}` === selectedPlotName,
      );
      if (!selectedPlot && profile.plots?.length) selectedPlot = profile.plots[0];
      const coords = selectedPlot?.coordinates?.location?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const [lon, lat] = coords;
        interval = setInterval(() => {
          void fetchCurrentRainfall(lat, lon);
        }, 3600 * 1000);
      }
    } catch {
      /* ignore */
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [profile, selectedPlotName]);

  // Existing events API: GET /plots/{id}/irrigation → events[].date
  useEffect(() => {
    if (!plotName) {
      setIrrigationEventDates(new Set());
      return;
    }
    let cancelled = false;

    (async () => {
      const base = getEventsBaseUrl().replace(/\/+$/, "");
      const candidates = [
        plotName,
        plotName.includes("_") ? plotName.replace(/_/g, "/") : null,
        plotName.includes("/") ? plotName.replace(/\//g, "_") : null,
      ].filter(Boolean) as string[];

      for (const id of candidates) {
        try {
          const url =
            `${base}/plots/${encodeURIComponent(id)}/irrigation` +
            `?threshold_ndmi=0.05&threshold_ndwi=0.05&min_days_between_events=10`;
          const resp = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
          });
          if (!resp.ok) continue;
          const data = await resp.json();
          if (cancelled) return;
          setIrrigationEventDates(extractIrrigationEventDates(data));
          return;
        } catch (err) {
          console.warn(
            `IrrigationSchedule: irrigation events failed for "${id}"`,
            err,
          );
        }
      }
      if (!cancelled) setIrrigationEventDates(new Set());
    })();

    return () => {
      cancelled = true;
    };
  }, [plotName]);

  useEffect(() => {
    if (!plotName) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const rainPromise = plotCoords
          ? Promise.all([
            fetchPastDailyRainfall(plotCoords.lat, plotCoords.lon, 7).catch(
              () => new Map<string, number>(),
            ),
            fetchForecastRainfall(plotCoords.lat, plotCoords.lon),
          ]).then(([past, forecast]) => {
            const merged = new Map(past);
            for (const [k, v] of forecast) {
              // Prefer past/history when present; fill gaps from forecast.
              if (!merged.has(k) || (merged.get(k) === 0 && v > 0)) {
                merged.set(k, v);
              }
            }
            return merged;
          })
          : Promise.resolve(new Map<string, number>());

        // Flutter WaterBalanceApi: last 30 days (cumulative remain depends on start_date).
        const seriesRange = pastRange(30);
        const waterExtras = {
          cropName: cropName || "grapes",
          lat: plotCoords?.lat,
          lon: plotCoords?.lon,
        };
        const [apiResp, moistureResp, rainMap] = await Promise.all([
          fetchWaterRemainForPlot(
            plotName,
            profile?.plots,
            30,
            seriesRange,
            waterExtras,
          ),
          fetchSoilMoistureForPlot(plotName, profile?.plots).catch(() => null),
          rainPromise,
        ]);
        if (cancelled) return;

        // Soil-moisture may include rainfall on some plots (often missing).
        if (moistureResp?.stack?.length) {
          for (const row of moistureResp.stack) {
            const key = String(row.day).slice(0, 10);
            const rain = Number(row.rainfall_mm_yesterday);
            if (key && Number.isFinite(rain) && rain > 0) {
              rainMap.set(key, rain);
            }
          }
        }
        setRainByDate(new Map(rainMap));

        const todayStr = todayIsoInTz();
        const last7 = filterPastDays(apiResp.days, 7);
        const mapped = mapWaterRemainToScheduleDays(
          last7,
          rainMap,
          todayStr,
          rainfallMm,
        );

        setRemainDays(mapped);
        setUsingLegacyEt(false);
        setError(null);
        setAppState((prev: any) => {
          const existing = Array.isArray(prev.waterRemainSeries)
            ? prev.waterRemainSeries
            : [];
          const keepLonger =
            existing.length >= apiResp.days.length &&
            (!prev.waterRemainPlot ||
              String(prev.waterRemainPlot).toLowerCase() ===
              String(apiResp.plotName || plotName).toLowerCase());
          return {
            ...prev,
            waterRemainSeries: keepLonger ? existing : apiResp.days,
            waterRemainPlot: apiResp.plotName || plotName,
          };
        });
        if (last7.length) {
          const latestEt = last7[last7.length - 1].eto_sum_mm;
          if (latestEt > 0) setEtValue(latestEt);
        }
      } catch (e: any) {
        if (cancelled) return;
        // Grapes SEF has no water-remain yet — fall back to compute-et schedule UI.
        setUsingLegacyEt(true);
        setRemainDays([]);
        const msg = formatWaterRemainError(e, plotName);
        if (msg) {
          console.warn("IrrigationSchedule: water-remain unavailable,", msg);
        }
        setError(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    plotName,
    plotCoords,
    cropName,
    profile?.plots,
    rainfallMm,
    setAppState,
  ]);

  // When Soil Moisture finishes loading a longer series, refresh the 7-day table from it.
  useEffect(() => {
    const shared = Array.isArray(appState.waterRemainSeries)
      ? (appState.waterRemainSeries as WaterRemainDay[])
      : [];
    if (!plotName || shared.length < 7) return;
    const plotMatch =
      !appState.waterRemainPlot ||
      String(appState.waterRemainPlot).toLowerCase() ===
      String(plotName).toLowerCase();
    if (!plotMatch) return;

    const todayStr = todayIsoInTz();
    const last7 = filterPastDays(shared, 7);
    setRemainDays(
      mapWaterRemainToScheduleDays(last7, rainByDate, todayStr, rainfallMm),
    );
  }, [
    appState.waterRemainSeries,
    appState.waterRemainPlot,
    plotName,
    rainByDate,
    rainfallMm,
  ]);

  const decorateRowStatus = (
    row: Omit<
      ScheduleRow,
      | "irrigationGiven"
      | "irrigationHours"
      | "irrigationStatusLabel"
      | "requiredTimeLabel"
    > & { requiredTimeLabel?: string },
  ): ScheduleRow => {
    const given = irrigationEventDates.has(row.isoDate);
    const liters = Math.max(0, Number(row.irrigationNeedKl) || 0) * 1000;
    const hoursFromNeed = hoursFromRequiredLiters(liters, plotConfig);
    const hoursFromTime = parseHoursFromTimeLabel(row.requiredTimeLabel);
    // Keep hours for the KL · hrs detail even when irrigation was not given.
    const hours = hoursFromNeed ?? hoursFromTime;
    return {
      ...row,
      irrigationGiven: given,
      irrigationHours: hours,
      irrigationStatusLabel: buildIrrigationStatusLabel(
        given,
        given ? hours : null,
      ),
    };
  };

  const generateScheduleData = (): ScheduleRow[] => {
    const todayStr = todayIsoInTz();
    const legacyByDate = new Map(
      legacySchedule.schedule.map((row) => [String(row.isoDate).slice(0, 10), row]),
    );

    const scheduleData: ScheduleRow[] = [];
    const byDate = new Map(remainDays.map((d) => [d.day, d]));

    // Always show today + previous 6 days only (hide older / future).
    for (let idx = 6; idx >= 0; idx -= 1) {
      const key = istDayOffset(idx);
      const hist = byDate.get(key);
      const legacy = legacyByDate.get(key);
      const isToday = key === todayStr;
      const hasRemainSeries = Boolean(hist);

      let etMm = 0;
      let rainMm = 0;
      let irrigKl = 0;
      let lossKl = 0;
      let waterRemainLiters = 0;
      let waterRemainM3 = 0;
      let etoLossLiters = 0;
      let requiredTimeLabel: string | undefined;

      if (hasRemainSeries && hist) {
        etMm =
          hist.etoSumMm > 0 ? hist.etoSumMm : isToday ? etValue : 0;
        rainMm =
          hist.rainfall > 0
            ? hist.rainfall
            : isToday
              ? rainfallMm
              : hist.rainfall;
        irrigKl = irrigationNeededKl(hist.waterRemainLiters);
        lossKl = etoLossKl(hist.etoLossLiters);
        waterRemainLiters = hist.waterRemainLiters;
        waterRemainM3 = hist.waterRemainM3;
        etoLossLiters = hist.etoLossLiters;
      } else if (legacy) {
        etMm = Number(legacy.etDisplayed) || (isToday ? etValue : 0);
        rainMm = Number(legacy.rainfall) || (isToday ? rainfallMm : 0);
        irrigKl = Math.max(0, Number(legacy.waterRequired) || 0) / 1000;
        waterRemainLiters = irrigKl > 0 ? -(irrigKl * 1000) : 0;
        requiredTimeLabel = legacy.time;
      } else {
        etMm = isToday ? etValue : 0;
        rainMm = isToday ? rainfallMm : 0;
        irrigKl = 0;
      }

      const hours =
        hoursFromRequiredLiters(irrigKl * 1000, plotConfig) ??
        parseHoursFromTimeLabel(requiredTimeLabel);
      if (!requiredTimeLabel && hours != null) {
        requiredTimeLabel = formatTimeHrsMins(hours);
      }

      const date = new Date(key + "T12:00:00");
      scheduleData.push(
        decorateRowStatus({
          date: date.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          }),
          isoDate: key,
          isToday,
          etDisplayed: Number(Number(etMm).toFixed(1)),
          etRange: getETRange(etMm),
          etoLossLiters,
          etoLossKl: lossKl,
          irrigationNeedKl: irrigKl,
          waterRemainLiters,
          waterRemainM3,
          rainfall: rainMm,
          dataMissing: !hasRemainSeries && !legacy,
          requiredTimeLabel,
        }),
      );
    }

    return scheduleData;
  };

  const scheduleData = generateScheduleData();
  const tableLoading =
    loading ||
    (usingLegacyEt && legacySchedule.loading && scheduleData.length === 0);
  const dateRangeLabel =
    scheduleData.length >= 2
      ? formatIrrigationDateRange(
        scheduleData[0].isoDate,
        scheduleData[scheduleData.length - 1].isoDate,
      )
      : scheduleData.length === 1
        ? formatIrrigationDateRange(
          scheduleData[0].isoDate,
          scheduleData[0].isoDate,
        )
        : "";
  const totalIrrigationNeedKl = scheduleData.reduce(
    (sum, day) => sum + (Number(day.irrigationNeedKl) || 0),
    0,
  );

  /** Required irrigation still pending if any day needs water and has no detected event. */
  const waterRequirementFulfilled = useMemo(() => {
    if (scheduleData.length === 0) return true;
    return scheduleData.every((day) => {
      const need = Number(day.irrigationNeedKl) || 0;
      if (need <= 0) return true;
      return day.irrigationGiven === true;
    });
  }, [scheduleData]);

  const waterRequirementMessage = waterRequirementFulfilled
    ? totalIrrigationNeedKl <= 0
      ? "Water requirement fulfilled — no irrigation needed today."
      : "Water requirement fulfilled — irrigation has been provided as required."
    : "Water requirement pending — irrigation is still required.";

  useEffect(() => {
    const data = generateScheduleData();
    if (data.length > 0) {
      setAppState((prev: any) => ({
        ...prev,
        irrigationScheduleData: data,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    etValue,
    rainfallMm,
    remainDays,
    usingLegacyEt,
    legacySchedule.schedule,
    irrigationEventDates,
    plotConfig,
    setAppState,
  ]);

  return (
    <div className="irrigation-schedule-card bg-white rounded-lg overflow-hidden shadow h-full flex flex-col">
      {/* Slim title bar */}
      <div className="bg-green-600 text-white px-2 py-1.5 flex flex-col items-center justify-center shrink-0 gap-0.5">
        <h2 className="text-xs font-semibold text-center leading-tight">
          Past 7-Day Irrigation /Acre
        </h2>
        {dateRangeLabel && (
          <p className="text-[9px] text-green-100 leading-tight">{dateRangeLabel}</p>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-2 pt-1.5 pb-1.5 gap-0 overflow-hidden">
        {/* Header row — no border lines */}
        <div className="irrigation-schedule-grid irrigation-schedule-grid--head shrink-0 rounded-md bg-green-100 px-2 py-1 text-[9px] font-semibold text-gray-700">
          <span>Date</span>
          <span>ETO Loss (mm)</span>
          <span>Rain (mm)</span>
          <span>Irrigation needed (kL)</span>
          <span>Irrigation Status</span>
        </div>

        {/* 7 data rows — clean rows, no border lines */}
        <div className="irrigation-schedule-days flex-1 min-h-0 flex flex-col gap-0 mt-0.5">
          {scheduleData.length === 0 && error ? (
            <p className="flex-1 flex items-center justify-center text-[10px] text-red-600 px-2 text-center leading-snug">
              {error}
            </p>
          ) : (
            scheduleData.map((day, idx) => {
              const isLatestDate = day.isToday || idx === scheduleData.length - 1;
              const needDetail = buildIrrigationNeedDetail(
                day.irrigationNeedKl,
                day.irrigationHours,
              );
              return (
                <div
                  key={day.isoDate || idx}
                  className={[
                    "irrigation-schedule-grid irrigation-schedule-day-card flex-1 min-h-0 px-2 py-1 text-[9px]",
                    isLatestDate
                      ? "is-today is-latest-highlight bg-blue-50/90 ring-1 ring-blue-300 shadow-sm rounded-md"
                      : "is-blurred-day opacity-40 select-none",
                    !isLatestDate && (idx % 2 ? "bg-white" : "bg-gray-50/80"),
                  ].filter(Boolean).join(" ")}
                >
                  <div className="min-w-0 flex items-center gap-1">
                    <span
                      className={`font-semibold whitespace-nowrap ${isLatestDate ? "text-blue-800" : "text-gray-800"
                        }`}
                    >
                      {day.date}
                    </span>
                    <Sun className="h-2.5 w-2.5 shrink-0 text-orange-500" />
                    {isLatestDate && (
                      <span className="inline-block rounded bg-blue-100 px-0.5 text-[7px] font-semibold text-blue-800">
                        Today
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-start justify-center min-w-0 gap-0.5">
                    {tableLoading ? (
                      <span className="text-gray-400 font-semibold">—</span>
                    ) : (
                      <>
                        <span className="text-[11px] font-semibold text-gray-800 whitespace-nowrap">
                          {Number(day.etDisplayed || 0).toFixed(1)}
                        </span>
                        <span
                          className={`inline-block rounded px-1 py-0.5 text-[11px] font-medium leading-none ${getETRangeColor(day.etRange)}`}
                        >
                          {day.etRange}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 font-semibold text-sky-700 whitespace-nowrap">
                    <CloudRain className="h-2.5 w-2.5 shrink-0 text-sky-600" />
                    {Number(day.rainfall || 0).toFixed(1)}
                  </div>

                  <div
                    className={`font-semibold whitespace-nowrap ${(day.irrigationNeedKl ?? 0) > 0
                      ? "text-red-700"
                      : "text-emerald-800"
                      }`}
                  >
                    {(Number(day.irrigationNeedKl) || 0).toFixed(1)}
                  </div>

                  <div
                    className={`min-w-0 leading-snug ${isLatestDate
                      ? day.irrigationGiven
                        ? "text-emerald-800"
                        : "text-blue-900"
                      : day.irrigationGiven
                        ? "text-emerald-700"
                        : "text-amber-700"
                      }`}
                    title={
                      needDetail
                        ? `${day.irrigationGiven ? "Irrigation Given" : "Irrigation Not Given"} · ${needDetail}`
                        : day.irrigationGiven
                          ? "Irrigation Given"
                          : "Irrigation Not Given"
                    }
                  >
                    <div className="font-semibold truncate">
                      {day.irrigationGiven ? "Irrigation Given" : "Irrigation Not Given"}
                    </div>
                    {needDetail && (
                      <div className="text-[8px] font-medium text-slate-600 truncate">
                        {needDetail}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Last row — same as reference image: Total left + message right */}
        {scheduleData.length > 0 && (
          <div className="irrigation-schedule-footer shrink-0 rounded-md bg-blue-50 ring-1 ring-blue-200 px-2.5 py-2 mt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-blue-800 whitespace-nowrap">
                7-Day Total
              </span>
              <p
                className={`text-[9px] leading-snug font-medium text-right ${waterRequirementFulfilled ? "text-blue-700" : "text-amber-800"
                  }`}
              >
                {waterRequirementMessage}
              </p>
            </div>
          </div>
        )}
      </div>

      {error && scheduleData.length > 0 && (
        <div className="error-message-small px-2 pb-2">{error}</div>
      )}
    </div>
  );
};

export default IrrigationSchedule;
