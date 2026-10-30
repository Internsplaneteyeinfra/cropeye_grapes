import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { getCache, setCache } from "../utils/cache";
import { getEventsBaseUrl, getGrapesAdminBaseUrl } from "../utils/serviceUrls";
import { fetchCurrentWeather } from "../services/weatherService";
import { categorizeWeedsBySeason } from "../components/pestt/meter/weedRiskUtils";
import {
  fetchSoilMoistureForPlot,
  type SoilMoistureParsed,
} from "../utils/soilMoistureApi";
import {
  fetchPestDetectionForPlotName,
  fetchRiskAssessmentFromApi,
  generateRiskAssessment,
  type RiskAssessmentResult,
} from "../components/pestt/meter/riskAssessmentService";

export type IndexPoint = {
  date: string;
  growth: number | null;
  stress: number | null;
  water: number | null;
  moisture: number | null;
};

type Slot<T> = { data: T | null; loading: boolean; error: string | null };

const emptySlot = <T,>(): Slot<T> => ({ data: null, loading: false, error: null });

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function loadIndices(plotId: string): Promise<IndexPoint[]> {
  const cacheKey = `indices_${plotId}`;
  const cached = getCache(cacheKey);
  if (Array.isArray(cached)) {
    return [...(cached as IndexPoint[])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  const res = await axios.get(
    `${getEventsBaseUrl().replace(/\/+$/, "")}/plots/${encodeURIComponent(plotId)}/indices`,
    { timeout: 30_000 },
  );
  const rows = Array.isArray(res.data) ? res.data : [];
  const mapped: IndexPoint[] = rows
    .filter((item: any) => item?.date)
    .map((item: any) => ({
      date: new Date(item.date).toISOString().split("T")[0],
      growth: num(item.NDVI),
      stress: num(item.NDMI),
      water: num(item.NDWI),
      moisture: num(item.NDRE),
    }))
    .sort((a: IndexPoint, b: IndexPoint) => a.date.localeCompare(b.date));
  setCache(cacheKey, mapped);
  return mapped;
}

export type OwnerRisk = RiskAssessmentResult & {
  source: "api" | "calculated";
  satelliteDetection?: boolean;
  weatherAvailable?: boolean;
};

export type PlotInsightContext = {
  plantationDate?: string | null;
  center?: [number, number] | null;
};

async function fetchScheduledPruningDate(plotId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${getGrapesAdminBaseUrl().replace(/\/+$/, "")}/grapes-schedule/${encodeURIComponent(plotId)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const body = await res.json();
    const date = body?.fruit_pruning_date ?? body?.plantation_date;
    return typeof date === "string" && date.trim() ? date.split("T", 1)[0].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Same order as the Pest & Disease page: grapes-admin /risk-assessment first; when it has
 * no assessment, calculate from the pruning date, live weather and satellite pest detection.
 */
async function loadRisk(plotId: string, ctx: PlotInsightContext): Promise<OwnerRisk | null> {
  const cacheKey = `ownerRisk_v3_${plotId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached as OwnerRisk;

  const api = await fetchRiskAssessmentFromApi(plotId);
  if (api?.assessment) {
    const result: OwnerRisk = { ...api.assessment, source: "api" };
    setCache(cacheKey, result);
    return result;
  }

  const startDate =
    (await fetchScheduledPruningDate(plotId)) ?? (ctx.plantationDate ? ctx.plantationDate.split("T", 1)[0] : null);
  if (!startDate) return null;

  const today = new Date().toISOString().split("T")[0];
  const month = new Date().toLocaleString("en-US", { month: "long" });
  let weather = { temperature: Number.NaN, humidity: Number.NaN, month };
  let weatherAvailable = false;
  if (ctx.center) {
    try {
      const live = await fetchCurrentWeather(ctx.center[0], ctx.center[1], false);
      if (Number.isFinite(live.temperature_c) && Number.isFinite(live.humidity)) {
        weather = { temperature: live.temperature_c, humidity: live.humidity, month };
        weatherAvailable = true;
      }
    } catch {
      /* risk rules only need stage, month and pest pixels */
    }
  }

  const detected = await fetchPestDetectionForPlotName(plotId, today, today);
  // No satellite answer means no High-level evidence; Moderate/Low still come from stage + month rules.
  const pestData = detected ?? {
    fungi_affected_pixel_percentage: 0,
    chewing_affected_pixel_percentage: 0,
    sucking_affected_pixel_percentage: 0,
    SoilBorn_affected_pixel_percentage: 0,
  };
  const assessment = await generateRiskAssessment(startDate, weather, plotId, today, pestData);
  const weeds = categorizeWeedsBySeason();
  const result: OwnerRisk = {
    ...assessment,
    current_conditions: {
      ...assessment.current_conditions,
      temperature: weatherAvailable ? assessment.current_conditions.temperature : "—",
      humidity: weatherAvailable ? assessment.current_conditions.humidity : "—",
    },
    weeds: {
      High: weeds.high.map((w) => w.name),
      Moderate: weeds.moderate.map((w) => w.name),
      Low: weeds.low.map((w) => w.name),
    },
    source: "calculated",
    satelliteDetection: detected != null,
    weatherAvailable,
  };
  setCache(cacheKey, result);
  return result;
}

/** Per-plot drill-down data, loaded only for the plot the owner selects. */
export function useOwnerPlotInsights(plotId: string | null, ctx: PlotInsightContext = {}) {
  const [indices, setIndices] = useState<Slot<IndexPoint[]>>(emptySlot);
  const [moisture, setMoisture] = useState<Slot<SoilMoistureParsed>>(emptySlot);
  const [risk, setRisk] = useState<Slot<OwnerRisk>>(emptySlot);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    if (!plotId) {
      setIndices(emptySlot());
      setMoisture(emptySlot());
      setRisk(emptySlot());
      return;
    }
    let cancelled = false;
    setIndices({ data: null, loading: true, error: null });
    setMoisture({ data: null, loading: true, error: null });
    setRisk({ data: null, loading: true, error: null });

    loadIndices(plotId)
      .then((data) => !cancelled && setIndices({ data, loading: false, error: null }))
      .catch(() =>
        !cancelled &&
        setIndices({ data: null, loading: false, error: "Vegetation indices unavailable for this plot." }),
      );

    fetchSoilMoistureForPlot(plotId)
      .then((data) => !cancelled && setMoisture({ data, loading: false, error: null }))
      .catch(() =>
        !cancelled &&
        setMoisture({ data: null, loading: false, error: "Soil moisture unavailable for this plot." }),
      );

    const riskTimeout = new Promise<null>((_, reject) => {
      window.setTimeout(() => reject(new Error("risk timeout")), 45_000);
    });
    Promise.race([loadRisk(plotId, ctxRef.current), riskTimeout])
      .then((data) =>
        !cancelled &&
        setRisk({
          data,
          loading: false,
          error: data ? null : "The risk engine has no pest & disease assessment for this plot yet.",
        }),
      )
      .catch(() =>
        !cancelled &&
        setRisk({ data: null, loading: false, error: "The risk engine has no pest & disease assessment for this plot yet." }),
      );

    return () => {
      cancelled = true;
    };
  }, [plotId]);

  return { indices, moisture, risk };
}
