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
  return `farmerDashGrapes_v3_${plotId}_${endDate ?? getLocalDateIso()}`;
}

/** A missing reading stays null so charts show a gap instead of a false zero. */
export type BrixTimeSeriesPoint = {
  date: string;
  ph: number | null;
  brix: number | null;
  ta: number | null;
};

function toSeriesNumber(v: unknown): number | null {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
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
  const ph = toSeriesNumber(row.ph ?? row.pH ?? row.PH);
  const brix = toSeriesNumber(row.brix ?? row.Brix ?? row.brix_value);
  const ta = toSeriesNumber(row.ta ?? row.TA ?? row.titratable_acidity);
  if (ph == null && brix == null && ta == null) return null;
  return { date, ph, brix, ta };
}

/** Raw `time_series` rows, or null when the payload carries no series at all. */
function findRawBrixSeries(payload: unknown): unknown[] | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object") return null;

  const root = payload as Record<string, unknown>;
  if (isGrapesBundlePayload(payload)) {
    const brix = (payload as GrapesBundlePayload).brix;
    if (Array.isArray(brix?.time_series)) return brix.time_series;
    if (Array.isArray(brix)) return brix;
    return null;
  }
  if (Array.isArray(root.time_series)) return root.time_series;
  if (root.brix && typeof root.brix === "object") {
    const nested = (root.brix as Record<string, unknown>).time_series;
    if (Array.isArray(nested)) return nested;
  }
  return null;
}

/** Read `time_series` from a grapes bundle, standalone brix response, or raw array. */
export function extractBrixTimeSeriesFromPayload(payload: unknown): BrixTimeSeriesPoint[] {
  return (findRawBrixSeries(payload) ?? [])
    .map(normalizeBrixTimeSeriesPoint)
    .filter((p): p is BrixTimeSeriesPoint => p != null);
}

/**
 * - ok: at least one usable reading
 * - empty: the endpoint answered with a series that has no usable readings
 * - missing: no response, or a response without any time_series
 */
export type BrixSeriesStatus = "ok" | "empty" | "missing";

export function describeBrixTimeSeriesPayload(payload: unknown): {
  status: BrixSeriesStatus;
  series: BrixTimeSeriesPoint[];
} {
  const raw = findRawBrixSeries(payload);
  if (raw == null) return { status: "missing", series: [] };
  const series = extractBrixTimeSeriesFromPayload(raw);
  return { status: series.length > 0 ? "ok" : "empty", series };
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
      const farmFastapi = p.farms?.[0]?.fastapi_plot_id;
      return (
        p.fastapi_plot_id === target ||
        farmFastapi === target ||
        String(farmFastapi ?? "") === target ||
        gatPlot === target ||
        p.plot_name === target ||
        String(p.id) === target ||
        String(p.plot_id ?? "") === target
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
    plot.area_acres ??
      plot.area_in_acres ??
      plot.area_size_acres ??
      plot.plot_area ??
      plot.total_area_acres
  );
  if (plotAcres != null) return plotAcres;

  const plotHectares = parsePositiveNumber(
    plot.area_hectares ?? plot.area_size_numeric ?? plot.area_size
  );
  if (plotHectares != null) return plotHectares * HECTARES_PER_ACRE;

  const farm = plot.farms?.[0];
  if (!farm) return null;

  const farmAcres = parsePositiveNumber(
    farm.area_acres ??
      farm.area_in_acres ??
      farm.area_size_acres ??
      farm.plot_area ??
      farm.total_area_acres
  );
  if (farmAcres != null) return farmAcres;

  const ha = parsePositiveNumber(
    farm.area_hectares ?? farm.area_size_numeric ?? farm.area_size
  );
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
  // With no readings the API still sends brix_summary {mean:0,min:0,max:0}; those zeros are placeholders.
  if (
    Array.isArray(root.time_series) &&
    !extractBrixTimeSeriesFromPayload(root.time_series).some((p) => p.brix != null)
  ) {
    return {};
  }
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
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
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

export function agroStatsCacheKey(endDate: string): string {
  return `agroStats_v3_${endDate}`;
}

/** GET /plots/agroStats — field area, biomass mean, sugar-yield fallback. */
export async function fetchAgroStatsPayload(
  eventsBaseUrl: string,
  endDate: string,
  cache: DashboardSoilCache,
  timeoutMs: number = 20_000,
): Promise<unknown | null> {
  const globalKey = agroStatsCacheKey(endDate);
  const cached = cache.get(globalKey);
  if (cached) return cached;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `${eventsBaseUrl.replace(/\/+$/, "")}/plots/agroStats?end_date=${encodeURIComponent(endDate)}`,
      { headers: { Accept: "application/json" }, signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const allPlots = await res.json();
    cache.set(globalKey, allPlots);
    return allPlots;
  } catch (e) {
    console.warn("agroStats failed:", e);
    return null;
  }
}

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
    const allPlots = await fetchAgroStatsPayload(eventsBaseUrl, endDate, cache);
    if (!allPlots) return empty;
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

  // analyze-npk can hang until its timeout; take whichever source answers with soil values first.
  const hasSoil = (m: typeof empty) => m.soilPH != null || m.organicCarbonDensity != null;
  return new Promise((resolve) => {
    let remaining = 2;
    const settle = (m: typeof empty) => {
      if (hasSoil(m)) {
        resolve(m);
        return;
      }
      remaining -= 1;
      if (remaining === 0) resolve(empty);
    };
    fromAnalyzeNpk().then(settle, () => settle(empty));
    fromAgroStats().then(settle, () => settle(empty));
  });
}

/** Resolve one plot row from agroStats payload (keys may be fastapi id or gat_plot). */
export function extractAgroStatsPlotRow(
  allPlotsData: any,
  plotId: string,
  profile: any
): any | null {
  if (!allPlotsData || !plotId) return null;
  const ids = new Set(collectPlotApiIds(profile, plotId));

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

/** Read Field Score from SEF GET /analyze (`field_score` or `overall_health`). */
export function fieldScoreFromAnalyzePayload(data: unknown, plotId?: string): number | null {
  if (data == null) return null;
  let fieldData: any = null;
  if (Array.isArray(data)) {
    const match = plotId
      ? data.find((item: any) => {
          const name = String(item?.plot_name || item?.plot || item?.name || "");
          return name === plotId;
        })
      : null;
    fieldData = match ?? data[0] ?? null;
  } else if (typeof data === "object") {
    fieldData = data;
  }
  if (!fieldData || typeof fieldData !== "object") return null;
  const stats = (fieldData as { statistics?: Record<string, unknown> }).statistics ?? {};
  const score = Number(
    fieldData.field_score ??
      fieldData.overall_health ??
      fieldData.health_score ??
      stats.field_score ??
      stats.mean,
  );
  return Number.isFinite(score) ? score : null;
}

export async function fetchFieldScoreForPlot(
  plotId: string,
  endDate: string,
  requestTimeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const baseUrl = getGrapesSefBaseUrl().replace(/\/+$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    const res = await fetchImpl(
      `${baseUrl}/analyze?plot_name=${encodeURIComponent(plotId)}&end_date=${encodeURIComponent(endDate)}&days_back=7`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    return fieldScoreFromAnalyzePayload(await res.json(), plotId);
  } catch {
    return null;
  }
}

/** Average SEF /analyze field_score across FO / all-farmer plots. */
export async function fetchFieldScoreAveragesForPlots(
  plotIds: string[],
  requestTimeoutMs: number = 20_000,
  fetchImpl: typeof fetch = fetch,
  limit: number = 15,
): Promise<Partial<ReturnType<typeof emptyGrapesDashboardMetrics>>> {
  const ids = [...new Set(plotIds.map((id) => String(id || "").trim()).filter(Boolean))].slice(
    0,
    limit,
  );
  if (!ids.length) return {};
  const endDate = getLocalDateIso();
  const scores = await Promise.all(
    ids.map((id) => fetchFieldScoreForPlot(id, endDate, requestTimeoutMs, fetchImpl)),
  );
  const avg = meanNumber(scores);
  return { fieldScore: avg != null ? Number(avg.toFixed(1)) : null };
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

function unwrapAgroPlotRow(plotRow: unknown): Record<string, unknown> | null {
  if (!plotRow || typeof plotRow !== "object") return null;
  const row = plotRow as Record<string, unknown>;
  if (row.soil != null || row.brix_sugar != null || row.area_acres != null || row.biomass != null) {
    return row;
  }
  if (row.properties && typeof row.properties === "object") {
    return row.properties as Record<string, unknown>;
  }
  return row;
}

function nestedStats(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Map GET /plots/agroStats plot row onto dashboard cards (area, biomass avg, yield fallback). */
export function metricsFromAgroStatsRow(
  plotRow: unknown,
): Partial<ReturnType<typeof emptyGrapesDashboardMetrics>> {
  const row = unwrapAgroPlotRow(plotRow);
  if (!row) return {};
  const biomass = nestedStats(row.biomass);
  const sugar = nestedStats(nestedStats(row.brix_sugar).sugar_yield);
  const sugarMean = pickNumber(sugar, "mean");
  const sugarMin = pickNumber(sugar, "min");
  const sugarMax = pickNumber(sugar, "max");
  const acres =
    parsePositiveNumber(row.area_acres) ??
    parsePositiveNumber(nestedStats(row.soil).area_acres);
  const hectares = parsePositiveNumber(row.area_hectares);
  return {
    area: acres ?? (hectares != null ? hectares * HECTARES_PER_ACRE : null),
    // Mean only — agroStats min/max are a different scale than yield-estimation T/acre.
    biomass: pickNumber(biomass, "mean"),
    totalBiomass: pickNumber(biomass, "total"),
    sugarYieldMean: sugarMean != null && sugarMean > 0 ? sugarMean : null,
    sugarYieldMin: sugarMin != null && sugarMin > 0 ? sugarMin : null,
    sugarYieldMax: sugarMax != null && sugarMax > 0 ? sugarMax : null,
    growthStage: pickString(row, "current_growth_stage", "growth_stage"),
    daysToHarvest: pickNumber(row, "days_to_harvest"),
  };
}

function finiteNumbers(values: Array<number | null | undefined>): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

export function meanNumber(values: Array<number | null | undefined>): number | null {
  const valid = finiteNumbers(values);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function sumNumber(values: Array<number | null | undefined>): number | null {
  const valid = finiteNumbers(values);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0);
}

function mostCommonString(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Average /plots/agroStats across a FO or farmer plot list.
 * Field area is a total (sum); yield, biomass, and days are means.
 */
export function averageAgroStatsForPlots(
  agroPayload: unknown,
  plotIds: string[],
): ReturnType<typeof emptyGrapesDashboardMetrics> {
  const ids = [...new Set(plotIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const mapped = ids.map((id) =>
    metricsFromAgroStatsRow(extractAgroStatsPlotRow(agroPayload, id, null)),
  );
  const yieldMean = meanNumber(mapped.map((row) => row.sugarYieldMean ?? null));
  const area = sumNumber(mapped.map((row) => row.area ?? null));
  const biomassMean = meanNumber(mapped.map((row) => row.biomass ?? null));
  return {
    ...emptyGrapesDashboardMetrics(),
    area: area != null ? Number(area.toFixed(2)) : null,
    biomass: biomassMean != null ? Number(biomassMean.toFixed(2)) : null,
    totalBiomass: sumNumber(mapped.map((row) => row.totalBiomass ?? null)),
    sugarYieldMean: yieldMean != null ? Number(yieldMean.toFixed(2)) : null,
    actualYield: yieldMean != null ? Number(yieldMean.toFixed(2)) : null,
    sugarYieldMin: meanNumber(mapped.map((row) => row.sugarYieldMin ?? null)),
    sugarYieldMax: meanNumber(mapped.map((row) => row.sugarYieldMax ?? null)),
    daysToHarvest: meanNumber(mapped.map((row) => row.daysToHarvest ?? null)),
    growthStage: mostCommonString(mapped.map((row) => row.growthStage ?? null)),
    stressCount: null,
    stressTotalDays: null,
  };
}

function yieldPayloadToPartial(
  payload: unknown,
): Partial<ReturnType<typeof emptyGrapesDashboardMetrics>> {
  if (!payload || typeof payload !== "object") return {};
  const y = payload as Record<string, unknown>;
  const yieldValue = pickNumber(
    y,
    "expected_yield_ton_per_acre",
    "expected_yield_ton_per_ha",
    "expected_yield",
    "yield",
  );
  return {
    sugarYieldMean: yieldValue,
    actualYield: yieldValue,
    biomass: pickNumber(y, "underground_biomass_tons", "underground_biomass"),
    totalBiomass: pickNumber(y, "total_biomass_tons", "total_biomass"),
  };
}

/** Average POST /grapes/yield-estimation across plots (skips failures). */
export async function fetchYieldAveragesForPlots(
  baseUrl: string,
  plotIds: string[],
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = 20_000,
  limit: number = 15,
): Promise<Partial<ReturnType<typeof emptyGrapesDashboardMetrics>>> {
  const ids = [...new Set(plotIds.map((id) => String(id || "").trim()).filter(Boolean))].slice(
    0,
    limit,
  );
  if (!ids.length) return {};
  const settled = await Promise.allSettled(
    ids.map((id) =>
      postGrapesPlotEndpoint(baseUrl, "/grapes/yield-estimation", id, fetchImpl, timeoutMs),
    ),
  );
  const parts = settled
    .filter((result): result is PromiseFulfilledResult<unknown> => result.status === "fulfilled")
    .map((result) => yieldPayloadToPartial(result.value));
  const yieldMean = meanNumber(parts.map((row) => row.sugarYieldMean ?? null));
  const biomassMean = meanNumber(parts.map((row) => row.biomass ?? null));
  return {
    sugarYieldMean: yieldMean != null ? Number(yieldMean.toFixed(2)) : null,
    actualYield: yieldMean != null ? Number(yieldMean.toFixed(2)) : null,
    biomass: biomassMean != null ? Number(biomassMean.toFixed(2)) : null,
    totalBiomass: sumNumber(parts.map((row) => row.totalBiomass ?? null)),
  };
}

/**
 * FO / all-farmers card metrics: agroStats + averaged yield-estimation +
 * averaged SEF /analyze field_score.
 */
export async function fetchGrapesScopeDashboardData(
  plotIds: string[],
  eventsBaseUrl: string,
  cache: DashboardSoilCache,
  fetchImpl: typeof fetch = fetch,
): Promise<{ metrics: ReturnType<typeof emptyGrapesDashboardMetrics> }> {
  const ids = [...new Set(plotIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const endDate = getLocalDateIso();
  const [agroPayload, yieldAvg, fieldScoreAvg] = await Promise.all([
    fetchAgroStatsPayload(eventsBaseUrl, endDate, cache),
    fetchYieldAveragesForPlots(eventsBaseUrl, ids, fetchImpl),
    fetchFieldScoreAveragesForPlots(ids, 20_000, fetchImpl),
  ]);
  return {
    metrics: mergeDashboardMetrics(
      averageAgroStatsForPlots(agroPayload, ids),
      yieldAvg,
      fieldScoreAvg,
    ),
  };
}

/**
 * Map GET/POST /grapes/summary when the route exists.
 * Missing keys stay unset so other sources can fill them.
 */
export function metricsFromGrapesSummary(
  payload: unknown,
): Partial<ReturnType<typeof emptyGrapesDashboardMetrics>> {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const nested =
    root.summary && typeof root.summary === "object" && !Array.isArray(root.summary)
      ? (root.summary as Record<string, unknown>)
      : root;
  const biomass = nestedStats(nested.biomass);
  const acres =
    parsePositiveNumber(nested.total_field_area) ??
    parsePositiveNumber(nested.field_area) ??
    parsePositiveNumber(nested.area_acres) ??
    parsePositiveNumber(nested.area);
  const hectares = parsePositiveNumber(nested.area_hectares);
  const yieldValue =
    pickNumber(
      nested,
      "expected_yield_ton_per_acre",
      "expected_yield_ton_per_ha",
      "expected_yield",
      "avg_expected_yield",
      "yield",
    ) ?? pickNumber(nestedStats(nested.expected_yield), "mean", "value");
  const cci =
    pickNumber(nested, "cci", "crop_condition_index", "cropConditionIndex", "ndvi") ??
    pickNumber(nestedStats(nested.cci), "mean", "value");
  const stressDays =
    pickNumber(nested, "stress_total_days", "total_days", "stress_days") ??
    pickNumber(nestedStats(nested.stress), "total_days", "days");
  const stressCount =
    pickNumber(nested, "stress_events", "stress_count", "total_events") ??
    pickNumber(nestedStats(nested.stress), "total_events", "count");
  return {
    area: acres ?? (hectares != null ? hectares * HECTARES_PER_ACRE : null),
    biomass:
      pickNumber(nested, "avg_biomass", "average_biomass", "underground_biomass_tons") ??
      pickNumber(biomass, "mean", "average"),
    biomassMin: pickNumber(nested, "biomass_min") ?? pickNumber(biomass, "min"),
    biomassMax: pickNumber(nested, "biomass_max") ?? pickNumber(biomass, "max"),
    totalBiomass:
      pickNumber(nested, "total_biomass_tons", "total_biomass") ??
      pickNumber(biomass, "total"),
    sugarYieldMean: yieldValue,
    actualYield: yieldValue,
    fieldScore: pickNumber(nested, "field_score", "overall_health", "health_score"),
    cci,
    stressTotalDays: stressDays,
    stressCount,
    growthStage: pickString(
      nested,
      "average_crop_stage",
      "avg_crop_stage",
      "crop_stage",
      "current_growth_stage",
      "crop_status",
    ),
  };
}

/** Prefer /grapes/summary; 404 means the route is not deployed yet. */
export async function fetchGrapesSummary(
  baseUrl: string,
  plotName: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = 8_000,
): Promise<unknown | null> {
  const base = baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const getRes = await fetchImpl(
      `${base}/grapes/summary?plot_name=${encodeURIComponent(plotName)}`,
      { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal },
    );
    if (getRes.ok) return getRes.json();
    // Route is not deployed (404). Do not POST the same missing path.
    if (getRes.status === 404) return null;
    if (getRes.status !== 405) return null;
  } catch {
    /* try POST */
  } finally {
    clearTimeout(timer);
  }

  try {
    return await postGrapesPlotEndpoint(baseUrl, "/grapes/summary", plotName, fetchImpl, timeoutMs);
  } catch {
    return null;
  }
}

/**
 * Manager dashboard card merge order:
 * agroStats (area / yield fallback) → yield-estimation bundle → SEF/NDVI/stress → /grapes/summary.
 * Later sources win when they actually have a value. `/grapes/summary` is optional (often 404).
 */
export function mergeManagerDashboardCardMetrics(args: {
  agroRow?: unknown;
  grapesBundle?: GrapesBundlePayload | null;
  profile?: any;
  plotId: string;
  stressData?: any;
  irrigationData?: any;
  grapesSummary?: unknown;
  fieldScore?: number | null;
  cci?: number | null;
  soilPayload?: unknown;
}): ReturnType<typeof emptyGrapesDashboardMetrics> {
  const {
    agroRow,
    grapesBundle,
    profile,
    plotId,
    stressData,
    irrigationData,
    grapesSummary,
    fieldScore,
    cci,
    soilPayload,
  } = args;
  const agroCardMetrics = metricsFromAgroStatsRow(agroRow);
  const summaryMetrics = metricsFromGrapesSummary(grapesSummary);
  const overlay = {
    fieldScore: fieldScore ?? null,
    cci: cci ?? null,
    stressTotalDays: stressData ? stressTotalDaysFromPayload(stressData) : null,
  };

  if (grapesBundle) {
    return mergeDashboardMetrics(
      emptyGrapesDashboardMetrics(),
      agroCardMetrics,
      metricsFromGrapesBundle(
        grapesBundle,
        profile,
        plotId,
        stressData,
        irrigationData,
        agroRow,
        soilPayload,
      ),
      overlay,
      summaryMetrics,
    );
  }

  return mergeDashboardMetrics(
    {
      ...emptyGrapesDashboardMetrics(),
      stressCount: stressData ? stressData.total_events ?? null : null,
      stressTotalDays: stressData ? stressTotalDaysFromPayload(stressData) : null,
      irrigationEvents: irrigationData?.total_events ?? null,
      fieldScore: fieldScore ?? null,
      cci: cci ?? null,
    },
    metricsFromFarmerProfile(profile, plotId),
    agroCardMetrics,
    overlay,
    summaryMetrics,
  );
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
      stressCount: stressData ? stressData.total_events ?? null : null,
      stressTotalDays: stressData ? stressTotalDaysFromPayload(stressData) : null,
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
      actualYield: pickNumber(
        y,
        "expected_yield_ton_per_acre",
        "expected_yield_ton_per_ha",
        "expected_yield",
        "yield",
      ),
      sugarYieldMean: pickNumber(
        y,
        "expected_yield_ton_per_acre",
        "expected_yield_ton_per_ha",
        "expected_yield",
        "yield",
      ),
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
  brixSeries: ReturnType<typeof describeBrixTimeSeriesPayload>;
}> {
  const tzOffsetMs = new Date().getTimezoneOffset() * 60000;
  const endDate = new Date(Date.now() - tzOffsetMs).toISOString().slice(0, 10);
  const plotIds = collectPlotApiIds(profile, plotId);
  const grapesBundleCacheKeyName = grapesBundleCacheKey(plotId, endDate);
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
    return null;
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
    const cached = cache.get(grapesBundleCacheKeyName);
    if (cached && isGrapesBundlePayload(cached)) return cached;
    try {
      const { bundle } = await fetchGrapesEventsBundleForPlot(eventsBaseUrl, plotIds);
      cache.set(grapesBundleCacheKeyName, bundle);
      return bundle;
    } catch (err) {
      console.error("fetchGrapesPlotDashboardData: grapes bundle failed", err);
      return null;
    }
  };

  const fetchSummary = async (): Promise<unknown | null> => {
    for (const id of plotIds) {
      const summary = await fetchGrapesSummary(eventsBaseUrl, id, fetch, 8_000);
      if (summary) return summary;
    }
    return null;
  };

  const [rawIndices, stressData, irrigationData, grapesBundle, soilOnly, fieldScore, grapesSummary, agroStatsPayload] =
    await Promise.all([
      fetchIndices(),
      fetchStress(),
      fetchIrrigation(),
      fetchGrapesBundle(),
      fetchDashboardSoilMetrics(plotId, profile, endDate, eventsBaseUrl, cache, getApiData),
      fetchFieldScoreForPlot(plotId, endDate, requestTimeoutMs),
      fetchSummary(),
      fetchAgroStatsPayload(eventsBaseUrl, endDate, cache),
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

  const agroStatsRow = extractAgroStatsPlotRow(agroStatsPayload, plotId, profile);
  const metrics = mergeManagerDashboardCardMetrics({
    agroRow: agroStatsRow,
    grapesBundle,
    profile,
    plotId,
    stressData,
    irrigationData,
    grapesSummary,
    fieldScore: fieldScoreResolved,
    cci: cciFromNdvi,
    soilPayload: soilOnly.soilPayload,
  });

  return {
    metrics,
    lineChartData: rawIndices,
    stressEvents: stressData?.events ?? [],
    brixSeries: describeBrixTimeSeriesPayload(grapesBundle),
  };
}
