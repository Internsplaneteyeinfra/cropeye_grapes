/**
 * Grapes Events API (Railway) — dashboard metrics bundle.
 * Yield/ripening/brix come from POST grapes/* routes; soil pH and organic carbon
 * come from GET /plots/agroStats or analyze-npk `soil_statistics` (fallback).
 */

import { getGrapesMainBaseUrl, getGrapesSefBaseUrl } from "./serviceUrls";

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

/** POST with form body; plot_name is required in the body for these routes.
 *  Uses allSettled so one failing endpoint (e.g. yield-estimation 500)
 *  does not drop ripening / brix data.
 */
export async function fetchGrapesEventsBundle(
  baseUrl: string,
  plotName: string,
  fetchImpl: typeof fetch = fetch
): Promise<GrapesBundlePayload> {
  const paths = [
    "/grapes/yield-estimation",
    "/grapes/ripening-stage",
    "/grapes/brix-time-series",
  ] as const;

  const settled = await Promise.allSettled(
    paths.map((p) => postGrapesPlotEndpoint(baseUrl, p, plotName, fetchImpl))
  );

  const values = settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    console.warn(
      `⚠️ Grapes endpoint ${paths[i]} failed for "${plotName}":`,
      result.reason
    );
    return null;
  });

  // Only throw if every endpoint failed — partial data is still useful
  if (values.every((v) => v == null)) {
    const firstReason = settled.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw firstReason?.reason instanceof Error
      ? firstReason.reason
      : new Error(`All grapes endpoints failed for "${plotName}"`);
  }

  return buildGrapesBundle(values[0], values[1], values[2]);
}

export function collectPlotApiIds(profile: any, plotId: string): string[] {
  const ids = new Set<string>();
  if (plotId?.trim()) ids.add(plotId.trim());

  const plots = profile?.plots;
  if (!Array.isArray(plots)) return [...ids];

  for (const p of plots) {
    const gatPlot =
      p.gat_number && p.plot_number ? `${p.gat_number}_${p.plot_number}` : null;
    const farmFastapi = p.farms?.[0]?.fastapi_plot_id;
    const matches =
      p.fastapi_plot_id === plotId ||
      gatPlot === plotId ||
      p.plot_name === plotId ||
      String(p.id) === plotId ||
      String(p.plot_id ?? "") === plotId ||
      String(farmFastapi ?? "") === plotId ||
      String(p.farms?.[0]?.id ?? "") === plotId;
    if (!matches) continue;
    if (p.fastapi_plot_id) ids.add(String(p.fastapi_plot_id));
    if (gatPlot) ids.add(gatPlot);
    if (p.plot_name) ids.add(String(p.plot_name));
    if (p.id != null) ids.add(String(p.id));
    if (p.plot_id != null) ids.add(String(p.plot_id));
    if (farmFastapi) ids.add(String(farmFastapi));
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

  const plotHectares = parsePositiveNumber(
    plot.area_size_numeric ?? plot.area_size
  );
  if (plotHectares != null) return plotHectares * HECTARES_PER_ACRE;

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
      if (key === "daysToHarvest" && value === 0) continue;
      if (key === "brixDays" && value === 0) continue;
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
  const remaining = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  return remaining > 0 ? remaining : null;
}

function getRawBrixTimeSeries(payload: unknown): unknown[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (isGrapesBundlePayload(payload)) {
    const brix = (payload as GrapesBundlePayload).brix;
    if (Array.isArray(brix?.time_series)) return brix.time_series;
    if (Array.isArray(brix)) return brix;
  }
  if (Array.isArray(root.time_series)) return root.time_series;
  if (root.brix && typeof root.brix === "object") {
    const nested = (root.brix as Record<string, unknown>).time_series;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

/** Days on the Brix card — from brix API `Days` / plantation day count (e.g. 80). */
function deepFindDaysInPayload(obj: unknown, depth = 0): number | null {
  if (depth > 8 || obj == null) return null;
  if (typeof obj === "object" && !Array.isArray(obj)) {
    const rec = obj as Record<string, unknown>;
    for (const key of [
      "Days",
      "days_since_plantation",
      "days_since_planting",
      "days",
      "day_count",
    ]) {
      if (key in rec) {
        const n = typeof rec[key] === "number" ? rec[key] : Number(rec[key]);
        if (Number.isFinite(n) && n > 0 && n < 2000) return n;
      }
    }
    for (const v of Object.values(rec)) {
      const found = deepFindDaysInPayload(v, depth + 1);
      if (found != null) return found;
    }
  }
  if (Array.isArray(obj)) {
    for (let i = obj.length - 1; i >= 0; i--) {
      const found = deepFindDaysInPayload(obj[i], depth + 1);
      if (found != null) return found;
    }
  }
  return null;
}

export function daysSincePlantationFromProfile(
  profile: any,
  plotId: string
): number | null {
  const plot = findPlotInFarmerProfile(profile, plotId);
  const raw = plot?.farms?.[0]?.plantation_date;
  if (!raw) return null;
  const iso = String(raw).split("T")[0];
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const elapsed = Math.ceil((today.getTime() - d.getTime()) / 86400000);
  return elapsed > 0 ? elapsed : null;
}

export function pickBrixDaysFromApi(brixPayload: unknown): number | null {
  const deep = deepFindDaysInPayload(brixPayload);
  if (deep != null) return deep;

  if (brixPayload && typeof brixPayload === "object" && !Array.isArray(brixPayload)) {
    const root = brixPayload as Record<string, unknown>;
    const topLevel = pickNumber(
      root,
      "Days",
      "days",
      "days_since_planting",
      "days_since_plantation",
      "day_count"
    );
    if (topLevel != null && topLevel > 0) return topLevel;

    const summary = root.brix_summary ?? root.brixSummary;
    if (summary && typeof summary === "object") {
      const fromSummary = pickNumber(
        summary as Record<string, unknown>,
        "Days",
        "days",
        "days_after_ripening",
        "days_since_ripening",
        "days_since_plantation",
        "day_count"
      );
      if (fromSummary != null && fromSummary > 0) return fromSummary;
    }
  }

  const fromBrixSummary = pickNumber(
    extractBrixSummary(brixPayload),
    "Days",
    "days",
    "days_after_ripening",
    "days_since_ripening",
    "days_since_plantation",
    "day_count"
  );
  if (fromBrixSummary != null && fromBrixSummary > 0) return fromBrixSummary;

  const rawSeries = getRawBrixTimeSeries(brixPayload);
  for (let i = rawSeries.length - 1; i >= 0; i--) {
    const row = rawSeries[i];
    if (row && typeof row === "object") {
      const dayNum = pickNumber(
        row as Record<string, unknown>,
        "Days",
        "days",
        "day_number",
        "days_since_planting",
        "days_since_plantation"
      );
      if (dayNum != null && dayNum > 0) return dayNum;
    }
  }

  return null;
}

/** Resolve brix-card day count: brix API → analyze-npk → plantation date. */
export function resolveBrixDaysForDashboard(
  brixPayload: unknown,
  profile: any,
  plotId: string,
  soilAnalyzePayload?: unknown
): number | null {
  const fromBrix = pickBrixDaysFromApi(brixPayload);
  if (fromBrix != null && fromBrix > 0) return fromBrix;

  if (soilAnalyzePayload) {
    const fromSoil = deepFindDaysInPayload(soilAnalyzePayload);
    if (fromSoil != null && fromSoil > 0) return fromSoil;
  }

  return daysSincePlantationFromProfile(profile, plotId);
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
): Promise<{
  soilPH: number | null;
  organicCarbonDensity: number | null;
  soilPayload: unknown;
}> {
  const empty = {
    soilPH: null as number | null,
    organicCarbonDensity: null as number | null,
    soilPayload: null as unknown,
  };

  const soilCacheKey = `soilData_${plotId}`;
  const cachedAnalyze = cache.get(soilCacheKey);
  if (cachedAnalyze) {
    const fromCache = soilMetricsFromPayload(cachedAnalyze);
    if (fromCache.soilPH != null || fromCache.organicCarbonDensity != null) {
      return { ...fromCache, soilPayload: cachedAnalyze };
    }
  }

  const ctxSoil = getApiData?.("soilAnalysis", plotId);
  if (ctxSoil) {
    const fromCtx = soilMetricsFromPayload(ctxSoil);
    if (fromCtx.soilPH != null || fromCtx.organicCarbonDensity != null) {
      return { ...fromCtx, soilPayload: ctxSoil };
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
      return { ...soilMetricsFromPayload(data), soilPayload: data };
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
      if (m.soilPH != null || m.organicCarbonDensity != null) {
        return { ...m, soilPayload: row };
      }
    }
    return empty;
  };

  const [npk, agro] = await Promise.all([fromAnalyzeNpk(), fromAgroStats()]);
  if (npk.soilPH != null || npk.organicCarbonDensity != null) return npk;
  if (agro.soilPH != null || agro.organicCarbonDensity != null) {
    return agro;
  }
  return empty;
}

/** Resolve one plot row from agroStats payload (keys may be fastapi id or gat_plot). */
export function extractAgroStatsPlotRow(
  allPlotsData: any,
  plotId: string,
  profile: any
): any | null {
  if (!allPlotsData || !plotId) return null;
  const plot = findPlotInFarmerProfile(profile, plotId);
  const ids = new Set([plotId.trim()]);
  if (plot?.gat_number && plot?.plot_number) {
    ids.add(`${plot.gat_number}_${plot.plot_number}`);
  }
  if (plot?.plot_name) ids.add(String(plot.plot_name));
  if (plot?.fastapi_plot_id) ids.add(String(plot.fastapi_plot_id));

  const rowMatches = (row: any): boolean =>
    row != null &&
    [...ids].some((id) =>
      [row.plot_id, row.fastapi_plot_id, row.plot_name, row.id].some(
        (candidate) => candidate != null && String(candidate).trim() === id,
      ),
    );

  if (
    allPlotsData.type === "FeatureCollection" &&
    Array.isArray(allPlotsData.features)
  ) {
    const feature = allPlotsData.features.find((item: any) =>
      rowMatches(item?.properties),
    );
    if (feature?.properties) return feature.properties;
  }

  if (Array.isArray(allPlotsData)) {
    return allPlotsData.find(rowMatches) ?? null;
  }

  if (typeof allPlotsData !== "object") return null;

  const normalizedIds = new Set(
    [...ids].map((id) => id.replace(/\s/g, "").toLowerCase()),
  );
  for (const [key, value] of Object.entries(allPlotsData)) {
    const normalizedKey = key.replace(/[\"\s]/g, "").toLowerCase();
    if (
      normalizedIds.has(normalizedKey) &&
      value != null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return value;
    }
  }

  if (rowMatches(allPlotsData)) return allPlotsData;

  for (const key of ["data", "plots", "results"]) {
    const nested = allPlotsData[key];
    if (nested && nested !== allPlotsData) {
      const row = extractAgroStatsPlotRow(nested, plotId, profile);
      if (row) return row;
    }
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
  biomassMax: null as number | null,
  biomassMin: null as number | null,
  totalBiomass: null as number | null,
  daysToHarvest: null as number | null,
  brixDays: null as number | null,
  growthStage: null as string | null,
  soilPH: null as number | null,
  organicCarbonDensity: null as number | null,
  actualYield: null as number | null,
  stressCount: 0 as number | null,
  stressTotalDays: 0 as number | null,
  irrigationEvents: null as number | null,
  sugarYieldMean: null as number | null,
  cnRatio: null as number | null,
  sugarYieldMax: null as number | null,
  sugarYieldMin: null as number | null,
  fieldScore: null as number | null,
  cci: null as number | null,
  };
}

/** Sum stress event day spans; falls back to total_days / total_events. */
export function stressTotalDaysFromPayload(stressData: any): number {
  const explicit = Number(stressData?.total_days ?? stressData?.totalDays);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;

  const events = Array.isArray(stressData?.events) ? stressData.events : [];
  let days = 0;
  for (const event of events) {
    const start = new Date(event?.from_date ?? event?.fromDate ?? event?.start);
    const end = new Date(event?.to_date ?? event?.toDate ?? event?.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    days += Math.max(1, span);
  }
  if (days > 0) return days;

  const eventsCount = Number(stressData?.total_events ?? stressData?.totalEvents);
  return Number.isFinite(eventsCount) ? eventsCount : 0;
}

async function fetchFieldScoreForPlot(
  plotId: string,
  endDate: string,
  requestTimeoutMs: number
): Promise<number | null> {
  try {
    const baseUrl = getGrapesSefBaseUrl().replace(/\/+$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    const res = await fetch(
      `${baseUrl}/analyze?plot_name=${encodeURIComponent(plotId)}&end_date=${encodeURIComponent(endDate)}&days_back=7`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    let fieldData: any = null;
    if (Array.isArray(data)) {
      const match = data.find((item: any) => {
        const name = String(item?.plot_name || item?.plot || item?.name || "");
        return name === plotId;
      });
      fieldData = match ?? data[0] ?? null;
    } else if (data && typeof data === "object") {
      fieldData = data;
    }
    const score = Number(
      fieldData?.overall_health ?? fieldData?.health_score ?? fieldData?.field_score
    );
    return Number.isFinite(score) ? score : null;
  } catch {
    return null;
  }
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
  agroPlotRowForSoil?: any | null,
  soilAnalyzePayload?: unknown
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
      stressTotalDays: stressTotalDaysFromPayload(stressData),
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
      biomassMax: pickNumber(
        y,
        "underground_biomass_max_tons",
        "underground_biomass_max",
        "biomass_max",
        "max_biomass"
      ),
      biomassMin: pickNumber(
        y,
        "underground_biomass_min_tons",
        "underground_biomass_min",
        "biomass_min",
        "min_biomass"
      ),
      totalBiomass: pickNumber(y, "total_biomass_tons", "total_biomass"),
      daysToHarvest: daysUntilHarvestFromRipening(ra),
      brixDays: resolveBrixDaysForDashboard(
        bundle.brix,
        profile,
        plotId,
        soilAnalyzePayload
      ),
      growthStage: pickString(ra, "crop_status", "cropStatus"),
      soilPH: soil.soilPH ?? profileMetrics.soilPH ?? null,
      organicCarbonDensity:
        soil.organicCarbonDensity ?? profileMetrics.organicCarbonDensity ?? null,
      actualYield: pickNumber(y, "expected_yield_ton_per_ha", "expected_yield", "yield"),
      sugarYieldMean: pickNumber(y, "expected_yield_ton_per_ha", "expected_yield", "yield"),
    }
  );
}

export function soilMetricsToAgroRow(
  soil: { soilPH: number | null; organicCarbonDensity: number | null }
): { soil: { phh2o: number | null; organic_carbon_stock: number | null } } | null {
  if (soil.soilPH == null && soil.organicCarbonDensity == null) return null;
  return {
    soil: {
      phh2o: soil.soilPH,
      organic_carbon_stock: soil.organicCarbonDensity,
    },
  };
}

export type GrapesLineChartPoint = {
  date: string;
  growth: number;
  stress: number;
  water: number;
  moisture: number;
};

/** Fetches grapes bundle + indices + stress + irrigation + soil for dashboard cards. */
export async function fetchGrapesPlotDashboardData(
  plotId: string,
  profile: any | null,
  eventsBaseUrl: string,
  cache: DashboardSoilCache,
  getApiData?: (type: string, plotName: string) => unknown,
  requestTimeoutMs: number = GRAPES_API_TIMEOUT_MS
): Promise<{
  metrics: ReturnType<typeof metricsFromGrapesBundle>;
  lineChartData: GrapesLineChartPoint[];
  stressEvents: any[];
}> {
  const tzOffsetMs = new Date().getTimezoneOffset() * 60000;
  const endDate = new Date(Date.now() - tzOffsetMs).toISOString().slice(0, 10);
  const plotIds = collectPlotApiIds(profile, plotId);
  const grapesBundleCacheKey = `farmerDashGrapes_v2_${plotId}_${endDate}`;
  const indicesCacheKey = `indices_${plotId}`;
  const stressCacheKey = `stress_${plotId}_NDRE_0.15`;
  const irrigationCacheKey = `irrigation_${plotId}`;

  const fetchIndices = async (): Promise<GrapesLineChartPoint[]> => {
    const cached = cache.get(indicesCacheKey);
    if (Array.isArray(cached)) return cached as GrapesLineChartPoint[];
    for (const id of plotIds) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
        const res = await fetch(
          `${eventsBaseUrl.replace(/\/+$/, "")}/plots/${encodeURIComponent(id)}/indices`,
          { headers: { Accept: "application/json" }, signal: controller.signal }
        );
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        const mapped = data.map((item: any) => ({
          date: new Date(item.date).toISOString().split("T")[0],
          growth: item.NDVI,
          stress: item.NDMI,
          water: item.NDWI,
          moisture: item.NDRE,
        }));
        cache.set(indicesCacheKey, mapped);
        return mapped;
      } catch {
        /* try next plot id */
      }
    }
    return [];
  };

  const fetchStress = async (): Promise<any> => {
    const cached = cache.get(stressCacheKey);
    if (cached) return cached;
    for (const id of plotIds) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
        const res = await fetch(
          `${eventsBaseUrl.replace(/\/+$/, "")}/plots/${encodeURIComponent(id)}/stress?index_type=NDRE&threshold=0.15`,
          { headers: { Accept: "application/json" }, signal: controller.signal }
        );
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        cache.set(stressCacheKey, data);
        return data;
      } catch {
        /* try next plot id */
      }
    }
    return { total_events: 0, events: [] };
  };

  const fetchIrrigation = async (): Promise<any> => {
    const cached = cache.get(irrigationCacheKey);
    if (cached) return cached;
    for (const id of plotIds) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
        const res = await fetch(
          `${eventsBaseUrl.replace(/\/+$/, "")}/plots/${encodeURIComponent(id)}/irrigation?threshold_ndmi=0.05&threshold_ndwi=0.05&min_days_between_events=10`,
          { headers: { Accept: "application/json" }, signal: controller.signal }
        );
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        cache.set(irrigationCacheKey, data);
        return data;
      } catch {
        /* try next plot id */
      }
    }
    return { total_events: null };
  };

  const fetchGrapesBundle = async (): Promise<GrapesBundlePayload | null> => {
    const cached = cache.get(grapesBundleCacheKey);
    if (cached && isGrapesBundlePayload(cached)) return cached;
    try {
      const { bundle } = await fetchGrapesEventsBundleForPlot(eventsBaseUrl, plotIds);
      cache.set(grapesBundleCacheKey, bundle);
      return bundle;
    } catch (err) {
      console.error("fetchGrapesPlotDashboardData: grapes bundle failed", err);
      return null;
    }
  };

  const [rawIndices, stressData, irrigationData, grapesBundle, soilOnly, fieldScore] =
    await Promise.all([
      fetchIndices(),
      fetchStress(),
      fetchIrrigation(),
      fetchGrapesBundle(),
      fetchDashboardSoilMetrics(plotId, profile, endDate, eventsBaseUrl, cache, getApiData),
      fetchFieldScoreForPlot(plotId, endDate, requestTimeoutMs),
    ]);

  const lastIndex = rawIndices.length > 0 ? rawIndices[rawIndices.length - 1] : null;
  const cciFromNdvi =
    lastIndex && Number.isFinite(Number(lastIndex.growth))
      ? Number(Number(lastIndex.growth).toFixed(3))
      : null;
  // Field score fallback: NDVI scaled to 0–100 when SEF analyze is unavailable
  const fieldScoreResolved =
    fieldScore ??
    (cciFromNdvi != null
      ? Math.max(0, Math.min(100, Number((cciFromNdvi * 100).toFixed(1))))
      : null);

  const agroRow = soilMetricsToAgroRow(soilOnly);
  const metrics = grapesBundle
    ? mergeDashboardMetrics(
        metricsFromGrapesBundle(
          grapesBundle,
          profile,
          plotId,
          stressData,
          irrigationData,
          agroRow,
          soilOnly.soilPayload
        ),
        {
          fieldScore: fieldScoreResolved,
          cci: cciFromNdvi,
          stressTotalDays: stressTotalDaysFromPayload(stressData),
        }
      )
    : mergeDashboardMetrics(
        {
          ...emptyGrapesDashboardMetrics(),
          stressCount: stressData?.total_events ?? 0,
          stressTotalDays: stressTotalDaysFromPayload(stressData),
          irrigationEvents: irrigationData?.total_events ?? null,
          fieldScore: fieldScoreResolved,
          cci: cciFromNdvi,
        },
        metricsFromFarmerProfile(profile, plotId)
      );

  return {
    metrics,
    lineChartData: rawIndices,
    stressEvents: stressData?.events ?? [],
  };
}
