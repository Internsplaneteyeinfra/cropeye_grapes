import { useEffect, useState } from "react";
import { getCache, removeCache, setCache } from "../utils/cache";
import { getGrapesAdminBaseUrl } from "../utils/serviceUrls";
import { toBackendPlotName } from "../utils/plotName";

export type GrapesStageItem = {
  stage_number: number;
  stage_name: string;
  duration_days: number;
  start_date: string;
  end_date: string;
  status: string;
  stage_day?: number;
  stage_days_label?: string;
  overdue?: boolean;
};

export type GrapesStagesResponse = {
  plot_name: string;
  fruit_pruning_date?: string | null;
  as_of_date?: string | null;
  season_day?: number | null;
  season_length_days?: number | null;
  season_days_label?: string | null;
  not_started?: boolean;
  current_stage?: GrapesStageItem | null;
  stages?: GrapesStageItem[];
  /** Foundation pruning date saved in /grapes-schedule; stages may use a default when it is missing. */
  saved_foundation_pruning_date?: string | null;
  /** Fruit pruning date saved in /grapes-schedule (null when none is saved). */
  saved_fruit_pruning_date?: string | null;
};

const CACHE_MS = 30 * 60 * 1000;
const cacheKey = (plot: string) =>
  `grapesStages_v4_${plot}_${new Date().toISOString().slice(0, 10)}`;

/** Call after pruning dates change so the stage is recomputed. */
export function clearGrapesStagesCache(plotId: string) {
  removeCache(cacheKey(toBackendPlotName(plotId)));
}

const inflight = new Map<string, Promise<GrapesStagesResponse>>();

/** Several cards read the same plot's stages at once; share one request between them. */
export function fetchGrapesStages(plotId: string): Promise<GrapesStagesResponse> {
  const plot = toBackendPlotName(plotId);
  const cached = getCache(cacheKey(plot), CACHE_MS) as GrapesStagesResponse | null;
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(plot);
  if (pending) return pending;
  const request = requestGrapesStages(plot).finally(() => inflight.delete(plot));
  inflight.set(plot, request);
  return request;
}

const STAGES_TIMEOUT_MS = 45_000;

async function requestGrapesStages(plot: string): Promise<GrapesStagesResponse> {
  const base = getGrapesAdminBaseUrl().replace(/\/+$/, "");
  const qs = new URLSearchParams({ plot_name: plot });
  let savedFoundation: string | null = null;
  let savedFruit: string | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STAGES_TIMEOUT_MS);
  try {
    // /grapes/stages can hold stale pruning dates; /grapes-schedule has the latest saved ones.
    try {
      const sRes = await fetch(`${base}/grapes-schedule/${encodeURIComponent(plot)}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (sRes.ok) {
        const s = await sRes.json();
        if (typeof s?.foundation_pruning_date === "string" && s.foundation_pruning_date) {
          const foundation = s.foundation_pruning_date.slice(0, 10);
          savedFoundation = foundation;
          qs.set("plantation_date", foundation);
        }
        if (typeof s?.fruit_pruning_date === "string" && s.fruit_pruning_date) {
          const fruit = s.fruit_pruning_date.slice(0, 10);
          savedFruit = fruit;
          qs.set("fruit_pruning_date", fruit);
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
      /* use the dates stored by /grapes/stages */
    }

    const res = await fetch(`${base}/grapes/stages?${qs}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`grapes/stages ${res.status}`);
    const data = (await res.json()) as GrapesStagesResponse;
    data.saved_foundation_pruning_date = savedFoundation;
    data.saved_fruit_pruning_date = savedFruit;
    setCache(cacheKey(plot), data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function daysAfterFruitPruningOf(data: GrapesStagesResponse | null): number | null {
  const fruitPruning = data?.fruit_pruning_date ? new Date(`${data.fruit_pruning_date.slice(0, 10)}T00:00:00`) : null;
  const asOf = data?.as_of_date ? new Date(`${data.as_of_date.slice(0, 10)}T00:00:00`) : new Date();
  return fruitPruning && Number.isFinite(fruitPruning.getTime()) && asOf >= fruitPruning
    ? Math.floor((asOf.getTime() - fruitPruning.getTime()) / 86_400_000)
    : null;
}

export type RipeningOutlook = {
  status: "before" | "ripening" | "after";
  veraisonStage: string;
  veraisonStart: string;
  veraisonEnd: string;
  /** Days after fruit pruning on which veraison (ripening onset) begins. */
  veraisonDay: number;
  daysToGo: number | null;
};

const isoDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();

/**
 * Ripening starts at veraison in the plot's own stage schedule. Returns null when the schedule has no
 * veraison stage or belongs to an older season (veraison before the saved fruit-pruning date).
 */
export function ripeningOutlookOf(data: GrapesStagesResponse | null): RipeningOutlook | null {
  const veraison = data?.stages?.find((s) => /veraison/i.test(s.stage_name));
  if (!veraison?.start_date || !veraison.end_date || !data?.fruit_pruning_date) return null;
  const start = isoDay(veraison.start_date);
  const end = isoDay(veraison.end_date);
  const pruning = isoDay(data.fruit_pruning_date);
  const asOf = data.as_of_date ? isoDay(data.as_of_date) : Date.now();
  if (![start, end, pruning, asOf].every(Number.isFinite) || start < pruning) return null;
  const status = asOf < start ? "before" : asOf <= end ? "ripening" : "after";
  return {
    status,
    veraisonStage: veraison.stage_name,
    veraisonStart: veraison.start_date.slice(0, 10),
    veraisonEnd: veraison.end_date.slice(0, 10),
    veraisonDay: Math.round((start - pruning) / 86_400_000),
    daysToGo: status === "before" ? Math.ceil((start - asOf) / 86_400_000) : null,
  };
}

/** True once the saved foundation pruning date has arrived; null when no date is saved. */
export function foundationPruningDoneOf(data: GrapesStagesResponse | null): boolean | null {
  const saved = data?.saved_foundation_pruning_date;
  if (!saved) return null;
  const asOf = data?.as_of_date ? isoDay(data.as_of_date) : Date.now();
  const t = isoDay(saved);
  return Number.isFinite(t) ? t <= asOf : null;
}

export function stageNameOf(data: GrapesStagesResponse | null): string | null {
  return data?.not_started ? "Not started" : data?.current_stage?.stage_name ?? null;
}

export type GrowthStageSummaryRow = { stage: string; count: number };

export type GrowthStageSummary = {
  current: string | null;
  rows: GrowthStageSummaryRow[];
  known: number;
  total: number;
};

/** Count current_stage names across plots for the all-farmers Crop Stage card. */
export function growthStageSummaryFromNames(
  names: Array<string | null | undefined>,
): GrowthStageSummary {
  const counts = new Map<string, number>();
  let known = 0;
  for (const name of names) {
    if (!name) continue;
    known += 1;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
  return {
    current: rows[0]?.stage ?? null,
    rows,
    known,
    total: names.length,
  };
}

/** Current grapes growth stage for a plot from GET /grapes/stages (grapes-admin). */
export function useGrapesStage(plotId: string | null | undefined) {
  const [data, setData] = useState<GrapesStagesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!plotId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchGrapesStages(plotId)
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
  }, [plotId]);

  const current = data?.current_stage ?? null;
  const seasonOver =
    !!current?.overdue ||
    (data?.season_day != null &&
      data?.season_length_days != null &&
      data.season_day > data.season_length_days);
  const nextStage = data?.stages?.find((s) => s.status === "upcoming") ?? null;
  return {
    daysAfterFruitPruning: daysAfterFruitPruningOf(data),
    loading,
    stageName: stageNameOf(data),
    stageDays: current?.stage_days_label ?? null,
    seasonDays: data?.season_days_label ?? null,
    nextStage,
    seasonOver,
    stages: data?.stages ?? [],
    currentStageNumber: current?.stage_number ?? null,
    seasonDay: data?.season_day ?? null,
    fruitPruningDate: data?.fruit_pruning_date ?? null,
    savedFoundationPruningDate: data?.saved_foundation_pruning_date ?? null,
    savedFruitPruningDate: data?.saved_fruit_pruning_date ?? null,
    ripening: ripeningOutlookOf(data),
  };
}
