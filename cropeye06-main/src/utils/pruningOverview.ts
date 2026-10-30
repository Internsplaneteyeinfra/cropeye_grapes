import type { OwnerPlotRecord } from "./ownerPortfolio";

export type PlotPruningDates = { foundation: string | null; fruit: string | null };

export type PruningMonth = {
  /** YYYY-MM */
  month: string;
  label: string;
  /** Unique farmers with a foundation pruning date in this month. */
  foundation: number;
  /** Unique farmers with a fruit pruning date in this month. */
  fruit: number;
};

export type PruningOverview = {
  months: PruningMonth[];
  totalFarmers: number;
  /** Farmers with at least one saved date of each kind. */
  farmersWithFoundation: number;
  farmersWithFruit: number;
  /** Farmers whose plots all loaded but none has a saved date of that kind. */
  missingFoundation: number;
  missingFruit: number;
  /** Plots whose schedule has not loaded yet. */
  pendingPlots: number;
  /** Plots whose schedule could not be loaded. */
  failedPlots: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthOf(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${m[1]}-${m[2]}` : null;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Month-wise unique farmer counts from saved pruning dates. A farmer with several plots pruned in the
 * same month counts once for that month. Every month from the first to the last saved date is listed;
 * months without pruning are real zeros.
 */
export function pruningOverview(
  plots: OwnerPlotRecord[],
  farmerKeyOf: (p: OwnerPlotRecord) => string,
  dates: Map<string, PlotPruningDates>,
  failed: Set<string>,
): PruningOverview {
  const foundationByMonth = new Map<string, Set<string>>();
  const fruitByMonth = new Map<string, Set<string>>();
  const farmers = new Map<string, { foundation: boolean; fruit: boolean; unloaded: boolean }>();
  let pendingPlots = 0;
  let failedPlots = 0;

  const add = (target: Map<string, Set<string>>, month: string, farmer: string) => {
    const set = target.get(month) ?? new Set<string>();
    set.add(farmer);
    target.set(month, set);
  };

  plots.forEach((p) => {
    const farmer = farmerKeyOf(p);
    const entry = farmers.get(farmer) ?? { foundation: false, fruit: false, unloaded: false };
    farmers.set(farmer, entry);
    const d = dates.get(p.plotId);
    if (!d) {
      entry.unloaded = true;
      if (failed.has(p.plotId)) failedPlots += 1;
      else pendingPlots += 1;
      return;
    }
    const fm = monthOf(d.foundation);
    const rm = monthOf(d.fruit);
    if (fm) {
      add(foundationByMonth, fm, farmer);
      entry.foundation = true;
    }
    if (rm) {
      add(fruitByMonth, rm, farmer);
      entry.fruit = true;
    }
  });

  const keys = [...foundationByMonth.keys(), ...fruitByMonth.keys()].sort();
  const months: PruningMonth[] = [];
  if (keys.length > 0) {
    const last = keys[keys.length - 1];
    for (let m = keys[0]; m <= last; m = nextMonth(m)) {
      months.push({
        month: m,
        label: monthLabel(m),
        foundation: foundationByMonth.get(m)?.size ?? 0,
        fruit: fruitByMonth.get(m)?.size ?? 0,
      });
    }
  }

  let withFoundation = 0;
  let withFruit = 0;
  let missingFoundation = 0;
  let missingFruit = 0;
  farmers.forEach((f) => {
    if (f.foundation) withFoundation += 1;
    else if (!f.unloaded) missingFoundation += 1;
    if (f.fruit) withFruit += 1;
    else if (!f.unloaded) missingFruit += 1;
  });

  return {
    months,
    totalFarmers: farmers.size,
    farmersWithFoundation: withFoundation,
    farmersWithFruit: withFruit,
    missingFoundation,
    missingFruit,
    pendingPlots,
    failedPlots,
  };
}
