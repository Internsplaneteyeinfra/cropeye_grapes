import type { OwnerPlotRecord } from "./ownerPortfolio";
import { daysSince, SATELLITE_STALE_DAYS } from "./dataAvailability";

export type ActiveFarmerStats = {
  totalFarmers: number;
  /** Farmers with at least one plot that has a satellite reading in the last SATELLITE_STALE_DAYS days. */
  activeFarmers: number;
  /** Active farmers with a saved foundation pruning date that has arrived on at least one plot. */
  foundationDone: number;
  /** foundationDone as a share of activeFarmers; null when there are no active farmers. */
  foundationPct: number | null;
  /** Farmers whose plots are still being checked (satellite or schedule not loaded yet). */
  pendingFarmers: number;
};

export function activeFarmerStats(
  plots: OwnerPlotRecord[],
  farmerKeyOf: (p: OwnerPlotRecord) => string,
  satelliteDates: Map<string, string | null>,
  foundationDone: Map<string, boolean | null>,
  now = new Date(),
): ActiveFarmerStats {
  const byFarmer = new Map<string, OwnerPlotRecord[]>();
  plots.forEach((p) => {
    const k = farmerKeyOf(p);
    byFarmer.set(k, [...(byFarmer.get(k) ?? []), p]);
  });

  let active = 0;
  let done = 0;
  let pending = 0;
  byFarmer.forEach((farmerPlots) => {
    const isActive = farmerPlots.some((p) => {
      const age = daysSince(satelliteDates.get(p.plotId) ?? null, now);
      return age != null && age <= SATELLITE_STALE_DAYS;
    });
    const unchecked = farmerPlots.some(
      (p) => p.plotId && (!satelliteDates.has(p.plotId) || !foundationDone.has(p.plotId)),
    );
    if (unchecked) pending += 1;
    if (!isActive) return;
    active += 1;
    if (farmerPlots.some((p) => foundationDone.get(p.plotId) === true)) done += 1;
  });

  return {
    totalFarmers: byFarmer.size,
    activeFarmers: active,
    foundationDone: done,
    foundationPct: active > 0 ? (done / active) * 100 : null,
    pendingFarmers: pending,
  };
}
