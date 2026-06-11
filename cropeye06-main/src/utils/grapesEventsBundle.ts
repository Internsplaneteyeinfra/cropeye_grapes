/**
 * Grapes Events API (Railway) — dashboard metrics bundle.
 * Yield/ripening/brix come from POST grapes/* routes; soil pH and organic carbon
 * still come from GET /plots/agroStats (plot-level `soil.phh2o`, `soil.organic_carbon_stock`).
 */

export const GRAPES_BUNDLE_SOURCE = "grapes-bundle-v1" as const;

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
  return `farmerDashGrapes_v1_${plotId}_${endDate ?? getLocalDateIso()}`;
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

/** POST with empty body; plot_name is the only documented query param for these routes. */
export async function fetchGrapesEventsBundle(
  baseUrl: string,
  plotName: string,
  fetchImpl: typeof fetch = fetch
): Promise<GrapesBundlePayload> {
  const q = encodeURIComponent(plotName);
  const paths = ["/grapes/yield-estimation", "/grapes/ripening-stage", "/grapes/brix-time-series"] as const;
  const results = await Promise.all(
    paths.map(async (p) => {
      const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}${p}?plot_name=${q}`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${p} ${res.status}: ${text || res.statusText}`);
      }
      return res.json();
    })
  );
  return buildGrapesBundle(results[0], results[1], results[2]);
}

export function getPlotAreaAcresFromProfile(profile: any, plotId: string): number | null {
  const plot = profile?.plots?.find((p: any) => p.fastapi_plot_id === plotId);
  const farm = plot?.farms?.[0];
  if (!farm) return null;
  const ha = farm.area_size_numeric;
  if (typeof ha === "number" && Number.isFinite(ha)) {
    return ha * 2.47105;
  }
  return null;
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
  const ra = bundle.ripening?.ripening_analysis || {};
  const bs = bundle.brix?.brix_summary || {};
  const series = bundle.brix?.time_series;
  const lastTa =
    Array.isArray(series) && series.length > 0 ? series[series.length - 1]?.ta ?? null : null;

  const expectedYield = y.expected_yield_ton_per_ha ?? null;
  const soil = soilMetricsFromAgroPlotRow(agroPlotRowForSoil);

  return {
    brix: bs.mean ?? null,
    brixMin: bs.min ?? null,
    brixMax: bs.max ?? null,
    recovery: lastTa ?? null,
    area: getPlotAreaAcresFromProfile(profile, plotId),
    biomass: y.underground_biomass_tons ?? null,
    totalBiomass: y.total_biomass_tons ?? null,
    daysToHarvest: daysUntilHarvestFromRipening(ra),
    growthStage: ra.crop_status ?? null,
    soilPH: soil.soilPH,
    organicCarbonDensity: soil.organicCarbonDensity,
    actualYield: expectedYield,
    stressCount: stressData?.total_events ?? 0,
    irrigationEvents: irrigationData?.total_events ?? null,
    sugarYieldMean: expectedYield,
    cnRatio: null,
    sugarYieldMax: null,
    sugarYieldMin: null,
  };
}
