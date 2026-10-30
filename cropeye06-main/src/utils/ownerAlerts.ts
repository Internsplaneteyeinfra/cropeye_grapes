import type { IndexPoint, OwnerRisk } from "../hooks/useOwnerPlotInsights";
import type { SoilMoistureParsed } from "./soilMoistureApi";
import type { OwnerPlotRecord } from "./ownerPortfolio";

export type AlertLevel = "critical" | "warning" | "info" | "good";
export type AlertCategory = "Canopy" | "Water" | "Pest & disease" | "Harvest" | "Yield" | "Soil" | "Data";

export type OwnerAlert = {
  id: string;
  level: AlertLevel;
  category: AlertCategory;
  title: string;
  detail: string;
  action?: string;
};

export const ALERT_LEVEL_ORDER: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2, good: 3 };

type MoistureBand = { minOptimal: number; maxOptimal: number; wiltingPoint: number; saturationPoint: number };

export type PlotAlertInput = {
  plot: OwnerPlotRecord;
  scopePlots: OwnerPlotRecord[];
  indices: IndexPoint[] | null;
  moisture: SoilMoistureParsed | null;
  band: MoistureBand;
  risk: OwnerRisk | null;
};

const DAY_MS = 86_400_000;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const daysBetween = (a: string, b: Date) => Math.floor((b.getTime() - new Date(a).getTime()) / DAY_MS);

function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/** Latest value of one index and the mean of the readings in the 45 days before it. */
function indexTrend(points: IndexPoint[], key: keyof Omit<IndexPoint, "date">) {
  const valid = points.filter((p) => p[key] != null) as (IndexPoint & Record<typeof key, number>)[];
  if (valid.length === 0) return null;
  const latest = valid[valid.length - 1];
  const latestTime = new Date(latest.date).getTime();
  const baseline = mean(
    valid
      .slice(0, -1)
      .filter((p) => latestTime - new Date(p.date).getTime() <= 45 * DAY_MS)
      .map((p) => p[key] as number),
  );
  return { latest: latest[key] as number, date: latest.date, baseline };
}

function canopyAlerts(indices: IndexPoint[] | null, now: Date): OwnerAlert[] {
  if (!indices || indices.length === 0) return [];
  const alerts: OwnerAlert[] = [];
  const ndvi = indexTrend(indices, "growth");
  const ndmi = indexTrend(indices, "stress");

  if (ndvi) {
    const age = daysBetween(ndvi.date, now);
    if (age > 15) {
      alerts.push({
        id: "sat-stale",
        level: "info",
        category: "Data",
        title: "No recent satellite pass",
        detail: `Last clear satellite reading was ${age} days ago (${ndvi.date}); cloud cover may be blocking newer images.`,
      });
    }
    if (ndvi.baseline != null && ndvi.baseline > 0.1) {
      const drop = (ndvi.baseline - ndvi.latest) / ndvi.baseline;
      if (drop >= 0.15) {
        alerts.push({
          id: "ndvi-drop",
          level: drop >= 0.25 ? "critical" : "warning",
          category: "Canopy",
          title: `Vegetation dropped ${pct(drop)}`,
          detail: `NDVI ${ndvi.latest.toFixed(2)} on ${ndvi.date} vs ${ndvi.baseline.toFixed(2)} average over the previous 45 days. Expected right after pruning; otherwise check for disease, pest damage or water stress.`,
          action: "Field officer to inspect the vineyard canopy.",
        });
      } else if (drop <= -0.15) {
        alerts.push({
          id: "ndvi-rise",
          level: "good",
          category: "Canopy",
          title: `Vegetation up ${pct(-drop)}`,
          detail: `NDVI ${ndvi.latest.toFixed(2)} vs ${ndvi.baseline.toFixed(2)} average over the previous 45 days — canopy is growing well.`,
        });
      }
    }
    if (ndvi.latest < 0.2) {
      alerts.push({
        id: "ndvi-low",
        level: "warning",
        category: "Canopy",
        title: "Weak canopy",
        detail: `NDVI is ${ndvi.latest.toFixed(2)} (below 0.20). Normal for a freshly pruned vineyard; otherwise the canopy is thin or stressed.`,
      });
    }
  }

  if (ndmi) {
    if (ndmi.latest < 0) {
      alerts.push({
        id: "ndmi-low",
        level: ndmi.latest < -0.1 ? "critical" : "warning",
        category: "Water",
        title: "Leaf water stress",
        detail: `NDMI (leaf moisture) is ${ndmi.latest.toFixed(2)} on ${ndmi.date}; values below 0 mean the leaves are short of water.`,
        action: "Check drip lines and irrigation schedule.",
      });
    } else if (ndmi.baseline != null && ndmi.baseline - ndmi.latest >= 0.1) {
      alerts.push({
        id: "ndmi-drop",
        level: "warning",
        category: "Water",
        title: "Leaf moisture falling",
        detail: `NDMI fell from ${ndmi.baseline.toFixed(2)} (45-day average) to ${ndmi.latest.toFixed(2)}.`,
      });
    }
  }
  return alerts;
}

function waterAlerts(moisture: SoilMoistureParsed | null, band: MoistureBand): OwnerAlert[] {
  if (!moisture || !Number.isFinite(moisture.currentMoisture)) return [];
  const m = moisture.currentMoisture;
  if (m <= band.wiltingPoint) {
    return [{
      id: "soil-wilting",
      level: "critical",
      category: "Water",
      title: "Soil at wilting point",
      detail: `Soil moisture ${m.toFixed(1)}% is at or below the ${band.wiltingPoint}% wilting point.`,
      action: "Irrigate immediately.",
    }];
  }
  if (m < band.minOptimal) {
    return [{
      id: "soil-dry",
      level: "warning",
      category: "Water",
      title: "Irrigation needed",
      detail: `Soil moisture ${m.toFixed(1)}% is below the ${band.minOptimal}–${band.maxOptimal}% optimal range for grapes.`,
      action: "Schedule irrigation in the next 1–2 days.",
    }];
  }
  if (m >= band.saturationPoint) {
    return [{
      id: "soil-saturated",
      level: "critical",
      category: "Water",
      title: "Waterlogged soil",
      detail: `Soil moisture ${m.toFixed(1)}% is at saturation (${band.saturationPoint}%). Root rot and downy mildew risk rises.`,
      action: "Stop irrigation and check drainage.",
    }];
  }
  if (m > band.maxOptimal) {
    return [{
      id: "soil-wet",
      level: "warning",
      category: "Water",
      title: "Soil wetter than needed",
      detail: `Soil moisture ${m.toFixed(1)}% is above the ${band.maxOptimal}% optimum.`,
      action: "Skip the next irrigation.",
    }];
  }
  return [{
    id: "soil-ok",
    level: "good",
    category: "Water",
    title: "Soil moisture optimal",
    detail: `Soil moisture ${m.toFixed(1)}% is inside the ${band.minOptimal}–${band.maxOptimal}% range.`,
  }];
}

function riskAlerts(risk: OwnerRisk | null, moisture: SoilMoistureParsed | null, band: MoistureBand): OwnerAlert[] {
  if (!risk) return [];
  const alerts: OwnerAlert[] = [];
  const groups: [string, { High: string[]; Moderate: string[] } | undefined][] = [
    ["Disease", risk.diseases],
    ["Pest", risk.pests],
  ];
  groups.forEach(([kind, bucket]) => {
    (bucket?.High ?? []).forEach((name) =>
      alerts.push({
        id: `risk-high-${kind}-${name}`,
        level: "critical",
        category: "Pest & disease",
        title: `High ${kind.toLowerCase()} risk: ${name}`,
        detail: `Current growth stage and weather favour ${name}.`,
        action: "Scout the plot and plan a preventive spray.",
      }),
    );
    const moderate = bucket?.Moderate ?? [];
    if (moderate.length) {
      alerts.push({
        id: `risk-mod-${kind}`,
        level: "warning",
        category: "Pest & disease",
        title: `${moderate.length} moderate ${kind.toLowerCase()} risk${moderate.length === 1 ? "" : "s"}`,
        detail: moderate.join(", "),
      });
    }
  });

  const wet = moisture != null && moisture.currentMoisture > band.maxOptimal;
  const fungal = [...(risk.diseases?.High ?? []), ...(risk.diseases?.Moderate ?? [])].filter((d) =>
    /mildew|anthracnose|rot|blight/i.test(d),
  );
  if (wet && fungal.length) {
    alerts.push({
      id: "risk-wet-fungal",
      level: "critical",
      category: "Pest & disease",
      title: "Wet soil + fungal risk",
      detail: `Soil is above optimum moisture while ${fungal.join(", ")} risk is active — conditions for an outbreak.`,
      action: "Reduce irrigation and apply a protective fungicide.",
    });
  }
  return alerts;
}

function harvestAlerts(plot: OwnerPlotRecord, scopePlots: OwnerPlotRecord[]): OwnerAlert[] {
  const agro = plot.agro;
  if (!agro) {
    return [{
      id: "agro-missing",
      level: "info",
      category: "Data",
      title: "No satellite yield statistics",
      detail: "agroStats has no yield, Brix or harvest estimate for this plot yet.",
    }];
  }
  const alerts: OwnerAlert[] = [];
  const days = agro.daysToHarvest;
  if (days != null && days >= 0 && days <= 30) {
    alerts.push({
      id: "harvest-window",
      level: days <= 15 ? "warning" : "info",
      category: "Harvest",
      title: `Harvest in ${Math.round(days)} days`,
      detail: agro.brix != null ? `Current Brix ${agro.brix.toFixed(1)}°.` : "Brix not reported yet.",
      action: days <= 15 ? "Book labour, crates and buyer." : undefined,
    });
  }
  if (agro.brix != null) {
    if (agro.brix >= 18) {
      alerts.push({
        id: "brix-ready",
        level: "good",
        category: "Harvest",
        title: "Sugar at harvest level",
        detail: `Brix ${agro.brix.toFixed(1)}° is at or above the 18° table-grape harvest level.`,
      });
    } else if (days != null && days <= 15 && agro.brix < 16) {
      alerts.push({
        id: "brix-low-near-harvest",
        level: "warning",
        category: "Harvest",
        title: "Low sugar close to harvest",
        detail: `Brix ${agro.brix.toFixed(1)}° with ${Math.round(days)} days left; berries may not reach 18°.`,
        action: "Consider delaying harvest and checking potash nutrition.",
      });
    }
  }

  const peerYields = scopePlots
    .filter((p) => p.key !== plot.key)
    .map((p) => p.agro?.yieldTPerAcre)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const peerAvg = mean(peerYields);
  if (agro.yieldTPerAcre != null && peerAvg != null && peerYields.length >= 2 && peerAvg > 0) {
    const gap = (agro.yieldTPerAcre - peerAvg) / peerAvg;
    if (gap <= -0.25) {
      alerts.push({
        id: "yield-below-peers",
        level: "warning",
        category: "Yield",
        title: `Yield ${pct(-gap)} below nearby plots`,
        detail: `${agro.yieldTPerAcre.toFixed(2)} T/acre vs ${peerAvg.toFixed(2)} T/acre average of ${peerYields.length} plots in this selection.`,
        action: "Compare canopy, irrigation and nutrition with top plots.",
      });
    } else if (gap >= 0.25) {
      alerts.push({
        id: "yield-above-peers",
        level: "good",
        category: "Yield",
        title: `Yield ${pct(gap)} above nearby plots`,
        detail: `${agro.yieldTPerAcre.toFixed(2)} T/acre vs ${peerAvg.toFixed(2)} T/acre selection average.`,
      });
    }
  }

  if (agro.soilPH != null && (agro.soilPH < 6 || agro.soilPH > 8)) {
    alerts.push({
      id: "soil-ph",
      level: "warning",
      category: "Soil",
      title: agro.soilPH < 6 ? "Acidic soil" : "Alkaline soil",
      detail: `Soil pH ${agro.soilPH.toFixed(1)} is outside the 6.0–8.0 range grapes tolerate.`,
      action: agro.soilPH < 6 ? "Apply lime as per soil test." : "Apply gypsum / sulphur as per soil test.",
    });
  }
  return alerts;
}

/** Rule-based detection on the selected plot's live satellite, soil, risk and agroStats values. */
export function buildPlotAlerts(input: PlotAlertInput, now = new Date()): OwnerAlert[] {
  return [
    ...riskAlerts(input.risk, input.moisture, input.band),
    ...waterAlerts(input.moisture, input.band),
    ...canopyAlerts(input.indices, now),
    ...harvestAlerts(input.plot, input.scopePlots),
  ].sort((a, b) => ALERT_LEVEL_ORDER[a.level] - ALERT_LEVEL_ORDER[b.level]);
}

/** Counts across every plot in scope, from agroStats only (no per-plot API calls). */
export function buildScopeAlerts(plots: OwnerPlotRecord[]): OwnerAlert[] {
  if (plots.length === 0) return [];
  const alerts: OwnerAlert[] = [];
  const harvestSoon = plots.filter((p) => p.agro?.daysToHarvest != null && p.agro.daysToHarvest >= 0 && p.agro.daysToHarvest <= 15);
  const noAgro = plots.filter((p) => !p.agro);
  const lowBrixNearHarvest = harvestSoon.filter((p) => p.agro?.brix != null && p.agro.brix < 16);
  const noFo = plots.filter((p) => !p.fieldOfficerName || /not linked|unassigned/i.test(p.fieldOfficerName));

  if (harvestSoon.length) {
    alerts.push({
      id: "scope-harvest",
      level: "warning",
      category: "Harvest",
      title: `${harvestSoon.length} plot${harvestSoon.length === 1 ? "" : "s"} to harvest within 15 days`,
      detail: harvestSoon.slice(0, 5).map((p) => p.plotLabel).join(", ") + (harvestSoon.length > 5 ? "…" : ""),
    });
  }
  if (lowBrixNearHarvest.length) {
    alerts.push({
      id: "scope-low-brix",
      level: "warning",
      category: "Harvest",
      title: `${lowBrixNearHarvest.length} near-harvest plot${lowBrixNearHarvest.length === 1 ? "" : "s"} below 16° Brix`,
      detail: lowBrixNearHarvest.slice(0, 5).map((p) => p.plotLabel).join(", "),
    });
  }
  if (noAgro.length) {
    alerts.push({
      id: "scope-no-agro",
      level: "info",
      category: "Data",
      title: `${noAgro.length} of ${plots.length} plots without satellite statistics`,
      detail: "These plots have no agroStats row (boundary missing or not yet processed).",
    });
  }
  if (noFo.length) {
    alerts.push({
      id: "scope-no-fo",
      level: "info",
      category: "Data",
      title: `${noFo.length} plot${noFo.length === 1 ? "" : "s"} without a field officer`,
      detail: "Assign a field officer so these plots get inspections.",
    });
  }
  return alerts;
}
