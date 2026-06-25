/**
 * Grapes Events API (Railway) — dashboard metrics bundle.
 * Yield/ripening/brix come from POST grapes/* routes; soil pH and organic carbon
 * come from GET /plots/agroStats or analyze-npk `soil_statistics` (fallback).
 */

import { getGrapesMainBaseUrl } from "./serviceUrls";

export const GRAPES_BUNDLE_SOURCE = "grapes-bundle-v2" as const;

/** Per-request timeout for grapes-events dashboard calls (ms). */
export const GRAPES_API_TIMEOUT_MS = 30_000;

export type GrapesBundlePayload = {
  _source: typeof GRAPES_BUNDLE_SOURCE;
  yield: any;
  ripening: any;
  brix: any;
};

export function isGrapesBundlePayload(data: unknown): data is GrapesBundlePayload {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as GrapesBundlePayload)._source === GRAPES_BUNDLE_SOURCE
  );
}

export function buildGrapesBundle(yieldData: any, ripeningData: any, brixData: any): GrapesBundlePayload {
  return {
    _source: GRAPES_BUNDLE_SOURCE,
    yield: yieldData,
    ripening: ripeningData,
    brix: brixData,
  };
}

/** Local calendar date (YYYY-MM-DD) — matches FarmerDashboard bundle cache keys. */
export function getLocalDateIso(): string {
  const tzOffsetMs = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzOffsetMs).toISOString().slice(0, 10);
}

export function grapesBundleCacheKey(plotId: string, endDate?: string): string {
  return `farmerDashGrapes_v2_${plotId}_${endDate ?? getLocalDateIso()}`;
}

export type BrixTimeSeriesPoint = {
  date: string;
  ph: number;
  brix: number;
  ta: number;
};

function toSeriesNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize one API row (handles `pH` vs `ph`, etc.). */
export function normalizeBrixTimeSeriesPoint(raw: unknown): BrixTimeSeriesPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const date =
    (typeof row.date === "string" && row.date) ||
    (typeof row.day === "string" && row.day) ||
    (typeof row.timestamp === "string" && row.timestamp) ||
    null;
  if (!date) return null;
  const ph = row.ph ?? row.pH ?? row.PH;
  const brix = row.brix ?? row.Brix ?? row.brix_value;
  const ta = row.ta ?? row.TA ?? row.titratable_acidity;
  return {
    date,
    ph: toSeriesNumber(ph),
    brix: toSeriesNumber(brix),
    ta: toSeriesNumber(ta),
  };
}

/** Read `time_series` from a grapes bundle, standalone brix response, or raw array. */
export function extractBrixTimeSeriesFromPayload(payload: unknown): BrixTimeSeriesPoint[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload
      .map(normalizeBrixTimeSeriesPoint)
      .filter((p): p is BrixTimeSeriesPoint => p != null);
  }
  if (typeof payload !== "object") return [];

  const root = payload as Record<string, unknown>;
  let rawSeries: unknown[] | undefined;

  if (isGrapesBundlePayload(payload)) {
    const brix = (payload as GrapesBundlePayload).brix;
    if (Array.isArray(brix?.time_series)) rawSeries = brix.time_series;
    else if (Array.isArray(brix)) rawSeries = brix;
  } else if (Array.isArray(root.time_series)) {
    rawSeries = root.time_series;
  } else if (root.brix && typeof root.brix === "object") {
    const nested = (root.brix as Record<string, unknown>).time_series;
    if (Array.isArray(nested)) rawSeries = nested;
  }

  if (!rawSeries?.length) return [];
  return rawSeries
    .map(normalizeBrixTimeSeriesPoint)
    .filter((p): p is BrixTimeSeriesPoint => p != null);
}

/** FastAPI grapes routes expect `plot_name` as multipart form field, not query string. */
export function grapesPlotFormBody(plotName: string): FormData {
  const form = new FormData();
  form.append("plot_name", plotName.trim());
  return form;
}

/** POST one grapes plot endpoint with form body + timeout. */
export async function postGrapesPlotEndpoint(
  baseUrl: string,
  path: string,
  plotName: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = GRAPES_API_TIMEOUT_MS
): Promise<unknown> {
  const form = grapesPlotFormBody(plotName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${path} ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** POST with form body; plot_name is required in the body for these routes. */
export async function fetchGrapesEventsBundle(
  baseUrl: string,
  plotName: string,
  fetchImpl: typeof fetch = fetch
): Promise<GrapesBundlePayload> {
  const paths = ["/grapes/yield-estimation", "/grapes/ripening-stage", "/grapes/brix-time-series"] as const;
  const results = await Promise.all(
    paths.map((p) => postGrapesPlotEndpoint(baseUrl, p, plotName, fetchImpl))
  );
  return buildGrapesBundle(results[0], results[1], results[2]);
}

export function collectPlotApiIds(profile: any, plotId: string): string[] {
  const ids = new Set<string>();
  if (plotId?.trim()) ids.add(plotId.trim());

  const plots = profile?.plots;
  if (!Array.isArray(plots)) return [...ids];

  for (const p of plots) {
    const gatPlot =
      p.gat_number && p.plot_number ? `${p.gat_number}_${p.plot_number}` : null;
    const matches =
      p.fastapi_plot_id === plotId ||
      gatPlot === plotId ||
      p.plot_name === plotId ||
      String(p.id) === plotId;
    if (!matches) continue;
    if (p.fastapi_plot_id) ids.add(String(p.fastapi_plot_id));
    if (gatPlot) ids.add(gatPlot);
    if (p.plot_name) ids.add(String(p.plot_name));
  }

  return [...ids];
}

export function findPlotInFarmerProfile(profile: any, plotId: string): any | null {
  const plots = profile?.plots;
  if (!Array.isArray(plots) || !plotId?.trim()) return null;

  const target = plotId.trim();
  return (
    plots.find((p: any) => {
      const gatPlot =
        p.gat_number && p.plot_number ? `${p.gat_number}_${p.plot_number}` : null;
      return (
        p.fastapi_plot_id === target ||
        gatPlot === target ||
        p.plot_name === target ||
        String(p.id) === target
      );
    }) ?? null
  );
}

const HECTARES_PER_ACRE = 2.47105;

function parsePositiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getPlotAreaAcresFromProfile(profile: any, plotId: string): number | null {
  const plot = findPlotInFarmerProfile(profile, plotId);
  if (!plot) return null;

  const plotAcres = parsePositiveNumber(
    plot.area_acres ?? plot.area_in_acres ?? plot.area_size_acres
  );
  if (plotAcres != null) return plotAcres;

  const farm = plot.farms?.[0];
  if (!farm) return null;

  const farmAcres = parsePositiveNumber(
    farm.area_acres ?? farm.area_in_acres ?? farm.area_size_acres
  );
  if (farmAcres != null) return farmAcres;

  const ha = parsePositiveNumber(farm.area_size_numeric ?? farm.area_size);
  if (ha != null) return ha * HECTARES_PER_ACRE;

  return null;
}

/** Pull dashboard card values from `/farms/my-profile/` as soon as profile loads. */
export function metricsFromFarmerProfile(
  profile: any,
  plotId: string
): ProfileDashboardMetrics {
  const plot = findPlotInFarmerProfile(profile, plotId);
  const farm = plot?.farms?.[0];
  const crop = farm?.crop_type;

  const growthStage =
    crop?.plantation_type_display ||
    crop?.plantation_type ||
    crop?.crop_variety ||
    crop?.crop_type ||
    farm?.crop_status ||
    plot?.crop_status ||
    null;

  const soilPH = parsePositiveNumber(
    farm?.soil_ph ??
      farm?.soil?.phh2o ??
      plot?.soil_ph ??
      plot?.soil?.phh2o
  );

  const organicCarbonDensity = parsePositiveNumber(
    farm?.organic_carbon_stock ??
      farm?.soil?.organic_carbon_stock ??
      plot?.organic_carbon_stock ??
      plot?.soil?.organic_carbon_stock
  );

  return {
    area: getPlotAreaAcresFromProfile(profile, plotId),
    growthStage: typeof growthStage === "string" && growthStage.trim() ? growthStage : null,
    soilPH,
    organicCarbonDensity,
  };
}

export type ProfileDashboardMetrics = {
  area: number | null;
  growthStage: string | null;
  soilPH: number | null;
  organicCarbonDensity: number | null;
};

/** Keep API values; only fill gaps from profile (never overwrite good API data with null). */
export function mergeDashboardMetrics<T extends object>(
  base: T,
  ...partials: Array<Partial<T> | null | undefined>
): T {
  const next = { ...base };
  for (const partial of partials) {
    if (!partial) continue;
    for (const [key, value] of Object.entries(partial)) {
      if (value === null || value === undefined || value === "") continue;
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

function extractRipeningAnalysis(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const nested = root.ripening_analysis ?? root.ripeningAnalysis;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return root;
}

function extractBrixSummary(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const nested = root.brix_summary ?? root.brixSummary;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  const series = Array.isArray(root.time_series)
    ? root.time_series
    : Array.isArray(payload)
      ? payload
      : null;
  if (series?.length) {
    const brixValues = series
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const v = r.brix ?? r.Brix ?? r.brix_value;
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : null;
      })
      .filter((n): n is number => n != null);
    if (brixValues.length) {
      return {
        mean: brixValues.reduce((a, b) => a + b, 0) / brixValues.length,
        min: Math.min(...brixValues),
        max: Math.max(...brixValues),
      };
    }
  }

  return root;
}

export function ripeningMilestonesFromPayload(payload: unknown): {
  ripeningStartDate: string | null;
  harvestReadyStartDate: string | null;
  cropStatus: string | null;
} {
  const ra = extractRipeningAnalysis(payload);
  const str = (v: unknown) =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  return {
    ripeningStartDate: str(ra.ripening_start_date ?? ra.ripeningStartDate),
    harvestReadyStartDate: str(
      ra.harvest_ready_start_date ?? ra.harvestReadyStartDate
    ),
    cropStatus: str(ra.crop_status ?? ra.cropStatus),
  };
}

/** Try each plot id alias until grapes bundle succeeds. */
export async function fetchGrapesEventsBundleForPlot(
  baseUrl: string,
  plotIds: string[],
  fetchImpl: typeof fetch = fetch
): Promise<{ bundle: GrapesBundlePayload; plotId: string }> {
  let lastErr: Error | null = null;
  for (const id of plotIds) {
    try {
      const bundle = await fetchGrapesEventsBundle(baseUrl, id, fetchImpl);
      return { bundle, plotId: id };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`Grapes bundle failed for plot "${id}":`, e);
    }
  }
  throw lastErr ?? new Error("Grapes events bundle unavailable for this plot");
}

function daysUntilHarvestFromRipening(ra: any): number | null {
  if (!ra) return null;
  const end = ra.harvest_ready_end_date || ra.harvest_ready_start_date;
  if (!end) return null;
  const d = new Date(end);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((d.getTime() - today.getTime()) / 86400000));
}

function parseSoilMetricNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Extract pH + organic carbon from agroStats row, analyze-npk, or soil_statistics. */
export function soilMetricsFromPayload(plotRow: any | null | undefined): {
  soilPH: number | null;
  organicCarbonDensity: number | null;
} {
  if (!plotRow) {
    return { soilPH: null, organicCarbonDensity: null };
  }

  const stats = plotRow.soil_statistics;
  if (stats && typeof stats === "object") {
    const ph = parseSoilMetricNumber(stats.phh2o ?? stats.ph ?? stats.pH);
    const ocs = parseSoilMetricNumber(stats.organic_carbon_stock);
    if (ph != null || ocs != null) {
      return {
        soilPH: ph,
        organicCarbonDensity:
          ocs != null ? parseFloat(ocs.toFixed(4)) : null,
      };
    }
  }

  return soilMetricsFromAgroPlotRow(plotRow);
}

export type DashboardSoilCache = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
};

/**
 * Load soil pH + organic carbon for dashboard cards.
 * analyze-npk (grapes-main) is tried in parallel — agroStats often times out on Railway.
 */
export async function fetchDashboardSoilMetrics(
  plotId: string,
  profile: any,
  endDate: string,
  eventsBaseUrl: string,
  cache: DashboardSoilCache,
  getApiData?: (type: string, plotName: string) => unknown
): Promise<{ soilPH: number | null; organicCarbonDensity: number | null }> {
  const empty = { soilPH: null, organicCarbonDensity: null };

  const soilCacheKey = `soilData_${plotId}`;
  const cachedAnalyze = cache.get(soilCacheKey);
  if (cachedAnalyze) {
    const fromCache = soilMetricsFromPayload(cachedAnalyze);
    if (fromCache.soilPH != null || fromCache.organicCarbonDensity != null) {
      return fromCache;
    }
  }

  const ctxSoil = getApiData?.("soilAnalysis", plotId);
  if (ctxSoil) {
    const fromCtx = soilMetricsFromPayload(ctxSoil);
    if (fromCtx.soilPH != null || fromCtx.organicCarbonDensity != null) {
      return fromCtx;
    }
  }

  const plot = findPlotInFarmerProfile(profile, plotId);
  const farm = plot?.farms?.[0];
  const plantationDate =
    (farm?.plantation_date && String(farm.plantation_date).split("T")[0]) ||
    "2025-01-01";

  const fromAnalyzeNpk = async () => {
    try {
      const mainBase = getGrapesMainBaseUrl();
      const url = `${mainBase}/analyze-npk/${encodeURIComponent(plotId)}?plantation_date=${plantationDate}&date=${endDate}&fe_days_back=30`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return empty;
      const data = await res.json();
      cache.set(soilCacheKey, data);
      return soilMetricsFromPayload(data);
    } catch (e) {
      console.warn(`analyze-npk soil metrics failed for "${plotId}":`, e);
      return empty;
    }
  };

  const fromAgroStats = async () => {
    const globalKey = `agroStats_v3_${endDate}`;
    let allPlots: any = cache.get(globalKey);
    if (!allPlots) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        const res = await fetch(
          `${eventsBaseUrl.replace(/\/+$/, "")}/plots/agroStats?end_date=${encodeURIComponent(endDate)}`,
          { headers: { Accept: "application/json" }, signal: controller.signal }
        );
        clearTimeout(timer);
        if (!res.ok) return empty;
        allPlots = await res.json();
        cache.set(globalKey, allPlots);
      } catch (e) {
        console.warn("agroStats soil metrics failed:", e);
        return empty;
      }
    }
    const plotIds = collectPlotApiIds(profile, plotId);
    for (const id of plotIds) {
      const row = extractAgroStatsPlotRow(allPlots, id, profile);
      const m = soilMetricsFromPayload(row);
      if (m.soilPH != null || m.organicCarbonDensity != null) return m;
    }
    return empty;
  };

  const [npk, agro] = await Promise.all([fromAnalyzeNpk(), fromAgroStats()]);
  if (npk.soilPH != null || npk.organicCarbonDensity != null) return npk;
  if (agro.soilPH != null || agro.organicCarbonDensity != null) return agro;
  return empty;
}

/** Resolve one plot row from agroStats payload (keys may be fastapi id or gat_plot). */
function extractAgroStatsPlotRow(
  allPlotsData: any,
  plotId: string,
  profile: any
): any | null {
  if (!allPlotsData || !plotId) return null;

  if (
    allPlotsData.type === "FeatureCollection" &&
    Array.isArray(allPlotsData.features)
  ) {
    const feature = allPlotsData.features.find((f: any) => {
      const name = f?.properties?.plot_name ?? f?.properties?.fastapi_plot_id;
      return name === plotId;
    });
    if (feature?.properties) return feature.properties;
  }

  if (typeof allPlotsData === "object" && !Array.isArray(allPlotsData)) {
    const direct = allPlotsData[plotId] ?? allPlotsData[`"${plotId}"`];
    if (direct && typeof direct === "object") return direct;
  }

  const plot = findPlotInFarmerProfile(profile, plotId);
  if (plot?.gat_number && plot?.plot_number) {
    const gatPlot = `${plot.gat_number}_${plot.plot_number}`;
    const byGat = allPlotsData[gatPlot] ?? allPlotsData[`"${gatPlot}"`];
    if (byGat && typeof byGat === "object") return byGat;
  }

  return null;
}

/** One plot row from GET /plots/agroStats — same shape as legacy agroStats extract. */
export function soilMetricsFromAgroPlotRow(plotRow: any | null | undefined): {
  soilPH: number | null;
  organicCarbonDensity: number | null;
} {
  if (!plotRow) {
    return { soilPH: null, organicCarbonDensity: null };
  }
  // GeoJSON Feature-style payloads keep metrics under `properties`.
  const row =
    plotRow.soil != null || plotRow.brix_sugar != null
      ? plotRow
      : plotRow.properties && typeof plotRow.properties === "object"
        ? plotRow.properties
        : plotRow;
  const soil = row.soil;
  const ph = soil?.phh2o ?? row?.soil_ph ?? plotRow?.soil_ph;
  const ocs = soil?.organic_carbon_stock ?? row?.organic_carbon_stock ?? plotRow?.organic_carbon_stock;

  const soilPH =
    typeof ph === "number" && Number.isFinite(ph)
      ? ph
      : typeof ph === "string" && ph.trim() !== "" && Number.isFinite(Number(ph))
        ? Number(ph)
        : null;

  let organicCarbonDensity: number | null = null;
  if (typeof ocs === "number" && Number.isFinite(ocs)) {
    organicCarbonDensity = parseFloat(ocs.toFixed(4));
  } else if (typeof ocs === "string" && ocs.trim() !== "" && Number.isFinite(Number(ocs))) {
    organicCarbonDensity = parseFloat(Number(ocs).toFixed(4));
  }

  return { soilPH, organicCarbonDensity };
}

export function emptyGrapesDashboardMetrics() {
  return {
  brix: null as number | null,
  brixMin: null as number | null,
  brixMax: null as number | null,
  recovery: null as number | null,
  area: null as number | null,
  biomass: null as number | null,
  totalBiomass: null as number | null,
  daysToHarvest: null as number | null,
  growthStage: null as string | null,
  soilPH: null as number | null,
  organicCarbonDensity: null as number | null,
  actualYield: null as number | null,
  stressCount: 0 as number | null,
  irrigationEvents: null as number | null,
  sugarYieldMean: null as number | null,
  cnRatio: null as number | null,
  sugarYieldMax: null as number | null,
  sugarYieldMin: null as number | null,
  };
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Maps bundle + stress/irrigation to FarmerDashboard `Metrics` shape. */
export function metricsFromGrapesBundle(
  bundle: GrapesBundlePayload,
  profile: any,
  plotId: string,
  stressData: any,
  irrigationData: any,
  agroPlotRowForSoil?: any | null
) {
  const y = bundle.yield || {};
  const ra = extractRipeningAnalysis(bundle.ripening);
  const bs = extractBrixSummary(bundle.brix);
  const series = (bundle.brix as Record<string, unknown> | undefined)?.time_series;
  const lastTa =
    Array.isArray(series) && series.length > 0 ? series[series.length - 1]?.ta ?? null : null;

  const soil = soilMetricsFromAgroPlotRow(agroPlotRowForSoil);
  const profileMetrics = metricsFromFarmerProfile(profile, plotId);

  return mergeDashboardMetrics(
    {
      ...emptyGrapesDashboardMetrics(),
      stressCount: stressData?.total_events ?? 0,
      irrigationEvents: irrigationData?.total_events ?? null,
    },
    profileMetrics,
    {
      brix: pickNumber(bs, "mean", "brix_mean", "average", "brix"),
      brixMin: pickNumber(bs, "min", "brix_min"),
      brixMax: pickNumber(bs, "max", "brix_max"),
      recovery: lastTa ?? null,
      area: getPlotAreaAcresFromProfile(profile, plotId),
      biomass: pickNumber(y, "underground_biomass_tons", "underground_biomass"),
      totalBiomass: pickNumber(y, "total_biomass_tons", "total_biomass"),
      daysToHarvest: daysUntilHarvestFromRipening(ra),
      growthStage: pickString(ra, "crop_status", "cropStatus"),
      soilPH: soil.soilPH ?? profileMetrics.soilPH ?? null,
      organicCarbonDensity:
        soil.organicCarbonDensity ?? profileMetrics.organicCarbonDensity ?? null,
      actualYield: pickNumber(y, "expected_yield_ton_per_ha", "expected_yield", "yield"),
      sugarYieldMean: pickNumber(y, "expected_yield_ton_per_ha", "expected_yield", "yield"),
    }
  );
}
