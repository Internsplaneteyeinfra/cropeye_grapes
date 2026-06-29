import axios from "axios";
import { extractAgroStatsPlotRow } from "./grapesEventsBundle";
import { fetchRipeningStageMilestones } from "./ripeningMilestones";
import { getEventsBaseUrl } from "./serviceUrls";

export type PlotHarvestInfo = {
  harvestStatus: string | null;
  harvestDate: string | null;
  isHarvested: boolean;
};

function readString(obj: unknown, ...keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Parse harvest fields from agroStats row, legacy grapes-harvest, or ripening payload. */
export function harvestInfoFromPayload(data: unknown): PlotHarvestInfo {
  if (!data || typeof data !== "object") {
    return { harvestStatus: null, harvestDate: null, isHarvested: false };
  }

  const root = data as Record<string, unknown>;
  const nested =
    (root.features as { properties?: unknown }[] | undefined)?.[0]?.properties ??
    root.harvest_summary ??
    root.ripening_analysis ??
    root;

  const harvestStatus =
    readString(nested, "harvest_status", "Sugarcane_Status", "growth_stage", "crop_status", "status") ??
    readString(root, "harvest_status", "crop_status");

  const harvestDate =
    readString(nested, "harvest_date") ?? readString(root, "harvest_date");

  const hasHarvest =
    (nested as Record<string, unknown>)?.has_harvest === true ||
    root.has_harvest === true;

  const isHarvested =
    hasHarvest ||
    harvestStatus?.toLowerCase() === "harvested" ||
    (harvestStatus?.toLowerCase().includes("harvested") === true &&
      !harvestStatus?.toLowerCase().includes("partially"));

  return { harvestStatus, harvestDate, isHarvested };
}

/**
 * Harvest status via live APIs. `/grapes-harvest` is not deployed (404);
 * uses GET /plots/agroStats then POST /grapes/ripening-stage.
 */
export async function fetchPlotHarvestInfo(
  plotName: string,
  endDate: string,
  profile?: unknown
): Promise<PlotHarvestInfo> {
  const base = getEventsBaseUrl().replace(/\/+$/, "");

  try {
    const res = await axios.get(`${base}/plots/agroStats`, {
      params: { end_date: endDate },
      timeout: 30_000,
      headers: { Accept: "application/json" },
    });
    const row = extractAgroStatsPlotRow(res.data, plotName, profile);
    const fromAgro = harvestInfoFromPayload(row);
    if (fromAgro.harvestStatus) return fromAgro;
  } catch {
    // fall through to ripening-stage
  }

  try {
    const ripening = await fetchRipeningStageMilestones(base, plotName);
    return harvestInfoFromPayload(ripening);
  } catch {
    return { harvestStatus: null, harvestDate: null, isHarvested: false };
  }
}

/** Batch harvest statuses from one agroStats response (HarvestDashboard). */
export function harvestInfoFromAgroStatsBatch(
  allPlotsData: unknown,
  plotIds: string[],
  profile?: unknown
): Map<string, PlotHarvestInfo> {
  const map = new Map<string, PlotHarvestInfo>();
  for (const plotId of plotIds) {
    const row = extractAgroStatsPlotRow(allPlotsData, plotId, profile);
    const info = harvestInfoFromPayload(row);
    if (info.harvestStatus) map.set(plotId, info);
  }
  return map;
}
