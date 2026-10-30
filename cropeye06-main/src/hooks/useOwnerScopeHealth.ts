import { useEffect, useMemo, useState } from "react";
import { getCache, setCache } from "../utils/cache";
import { fetchSoilMoistureForPlot, moistureBandForCrop, type SoilMoistureParsed } from "../utils/soilMoistureApi";
import { buildPlotAlerts, type OwnerAlert } from "../utils/ownerAlerts";
import type { OwnerPlotRecord } from "../utils/ownerPortfolio";
import { loadIndices, type IndexPoint, type OwnerRisk } from "./useOwnerPlotInsights";

export type HealthStatus = "Immediate action" | "Stressed" | "Under observation" | "Healthy";

export const HEALTH_ORDER: HealthStatus[] = ["Immediate action", "Stressed", "Under observation", "Healthy"];

export type PlotHealth = {
  status: HealthStatus;
  /** Most serious finding, shown as the reason for the status. */
  reason: string;
  action: string | null;
  /** Date of the latest satellite reading used, if any. */
  satelliteDate: string | null;
  checkedAt: string;
};

type Readings = { indices: IndexPoint[] | null; moisture: SoilMoistureParsed | null; checkedAt?: string };

const READINGS_TTL_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 4;
const band = moistureBandForCrop("grapes");

/** Critical → Immediate action, warning → Stressed, only info / no data → Under observation, else Healthy. */
export function classifyPlotHealth(alerts: OwnerAlert[], readings: Readings): Omit<PlotHealth, "checkedAt"> {
  const latestIndex = readings.indices?.length ? readings.indices[readings.indices.length - 1] : null;
  const satelliteDate = latestIndex?.date ?? null;
  const top = (level: OwnerAlert["level"]) => alerts.find((a) => a.level === level);

  const critical = top("critical");
  if (critical) return { status: "Immediate action", reason: critical.title, action: critical.action ?? null, satelliteDate };
  const warning = top("warning");
  if (warning) return { status: "Stressed", reason: warning.title, action: warning.action ?? null, satelliteDate };

  const hasLiveData = !!latestIndex || !!readings.moisture;
  const info = top("info");
  if (!hasLiveData) {
    return {
      status: "Under observation",
      reason: "No satellite or soil-moisture reading yet",
      action: "Check the plot boundary is mapped.",
      satelliteDate,
    };
  }
  if (info) return { status: "Under observation", reason: info.title, action: info.action ?? null, satelliteDate };
  const good = top("good");
  return { status: "Healthy", reason: good?.title ?? "No issues detected", action: null, satelliteDate };
}

async function loadReadings(plotId: string): Promise<Readings> {
  const key = `ownerHealthReadings_${plotId}`;
  const cached = getCache(key, READINGS_TTL_MS) as Readings | null;
  if (cached) return cached;
  const [indices, moisture] = await Promise.allSettled([loadIndices(plotId), fetchSoilMoistureForPlot(plotId)]);
  const readings: Readings = {
    indices: indices.status === "fulfilled" ? indices.value : null,
    moisture: moisture.status === "fulfilled" ? moisture.value : null,
    checkedAt: new Date().toISOString(),
  };
  setCache(key, readings);
  return readings;
}

/**
 * Live health status for every plot in scope: loads each plot's satellite indices and soil
 * moisture (4 at a time, cached 6 h) and applies the same alert rules as the alerts panel.
 * `loadFor` (a superset of `plots`) also loads readings for plots outside the current filter.
 */
export function useOwnerScopeHealth(
  plots: OwnerPlotRecord[],
  selected: { key: string | null; risk: OwnerRisk | null },
  loadFor: OwnerPlotRecord[] = plots,
) {
  const [readings, setReadings] = useState<Record<string, Readings>>({});
  const [pending, setPending] = useState(0);

  const ids = loadFor.map((p) => p.plotId).filter(Boolean).join("|");

  useEffect(() => {
    const queue = loadFor.filter((p) => p.plotId && !readings[p.plotId]);
    if (queue.length === 0) {
      setPending(0);
      return;
    }
    let cancelled = false;
    let remaining = queue.length;
    setPending(remaining);

    const worker = async () => {
      while (!cancelled && queue.length) {
        const plot = queue.shift()!;
        const r = await loadReadings(plot.plotId).catch((): Readings => ({
          indices: null,
          moisture: null,
          checkedAt: new Date().toISOString(),
        }));
        if (cancelled) return;
        setReadings((prev) => (prev[plot.plotId] ? prev : { ...prev, [plot.plotId]: r }));
        remaining -= 1;
        setPending(Math.max(0, remaining));
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    return () => {
      cancelled = true;
      setPending(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const health = useMemo(() => {
    const map = new Map<string, PlotHealth>();
    plots.forEach((plot) => {
      const r = readings[plot.plotId];
      if (!r) return;
      const alerts = buildPlotAlerts({
        plot,
        scopePlots: plots,
        indices: r.indices,
        moisture: r.moisture,
        band,
        risk: plot.key === selected.key ? selected.risk : null,
      });
      map.set(plot.key, { ...classifyPlotHealth(alerts, r), checkedAt: r.checkedAt ?? new Date().toISOString() });
    });
    return map;
  }, [plots, readings, selected.key, selected.risk]);

  /** Latest satellite reading date per plotId, for every plot loaded so far. */
  const satelliteDates = useMemo(() => {
    const map = new Map<string, string | null>();
    Object.entries(readings).forEach(([plotId, r]) => {
      map.set(plotId, r.indices?.length ? r.indices[r.indices.length - 1].date : null);
    });
    return map;
  }, [readings]);

  return { health, satelliteDates, loading: pending > 0, pending };
}
