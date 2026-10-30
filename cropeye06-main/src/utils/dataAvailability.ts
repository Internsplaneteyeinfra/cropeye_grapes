import type { OwnerPlotRecord } from "./ownerPortfolio";
import { plotArea } from "./ownerPortfolio";

/**
 * Why a dashboard value is empty:
 * - not_available: the source has no record for this plot, so it can never show (fix the data).
 * - not_measured: the source is fine but the crop has not reached the stage where it is measured.
 * - overdue: the value should exist by now (stage passed or reading too old) but is missing.
 */
export type MissingKind = "not_available" | "not_measured" | "overdue";

export type FieldState =
  | { kind: "value"; text: string; note?: string }
  | { kind: MissingKind; text: string; why: string };

/** Brix starts accumulating at veraison, about 80 days after fruit pruning. */
export const BRIX_FROM_DAY = 80;
/** A yield estimate needs set berries, about 60 days after fruit pruning. */
export const YIELD_FROM_DAY = 60;
/** Sentinel-2 revisits every ~5 days; older than this is too old for irrigation / harvest decisions. */
export const SATELLITE_STALE_DAYS = 15;

export const MISSING_LABEL: Record<MissingKind, string> = {
  not_available: "Not available",
  not_measured: "Not yet measured",
  overdue: "Overdue",
};

const positive = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / 86_400_000) : null;
}

export function satelliteState(satelliteDate: string | null | undefined): FieldState {
  const age = daysSince(satelliteDate);
  if (age == null) {
    return { kind: "not_available", text: "Not available", why: "No satellite reading for this plot (boundary missing or not processed)." };
  }
  const date = new Date(satelliteDate!).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (age > SATELLITE_STALE_DAYS) {
    return { kind: "overdue", text: date, why: `${age} days old — older than ${SATELLITE_STALE_DAYS} days is too old for irrigation or harvest decisions.` };
  }
  return { kind: "value", text: date };
}

/** daysAfterFruitPruning comes from GET /grapes/stages; null when the fruit pruning date is not set. */
export function plotFieldStates(plot: OwnerPlotRecord, daysAfterFruitPruning: number | null) {
  const agro = plot.agro;
  const noAgro = "No satellite statistics for this plot yet (boundary missing or not processed).";
  const noPruning = "Fruit pruning date is not set (or is in the future), so the expected measurement date is unknown.";

  const area: FieldState = positive(plotArea(plot))
    ? { kind: "value", text: `${plotArea(plot).toFixed(2)} ac` }
    : { kind: "not_available", text: "Not available", why: "Area was not entered at registration and the plot has no mapped boundary." };

  const status: FieldState =
    plot.agro?.status && plot.agro.status !== "Not reported"
      ? { kind: "value", text: plot.agro.status }
      : plot.hierarchyStatus && plot.hierarchyStatus !== "Not reported"
        ? { kind: "value", text: plot.hierarchyStatus }
        : !agro
          ? { kind: "not_available", text: "Not available", why: noAgro }
          : { kind: "not_measured", text: "Not yet measured", why: "Satellite statistics exist but no crop status is reported yet." };

  const staged = (
    value: number | null | undefined,
    format: (v: number) => string,
    fromDay: number,
    what: string,
  ): FieldState => {
    if (positive(value)) return { kind: "value", text: format(value) };
    if (!agro) return { kind: "not_available", text: "Not available", why: noAgro };
    const seasonDay = daysAfterFruitPruning;
    if (seasonDay == null) return { kind: "not_available", text: "Not available", why: noPruning };
    if (seasonDay < fromDay) {
      return {
        kind: "not_measured",
        text: "Not yet measured",
        why: `${what} is measured from day ${fromDay} after fruit pruning; the crop is on day ${seasonDay} (${fromDay - seasonDay} days to go).`,
      };
    }
    return {
      kind: "overdue",
      text: "Overdue",
      why: `${what} was expected from day ${fromDay} after fruit pruning; the crop is on day ${seasonDay}.`,
    };
  };

  return {
    area,
    status,
    brix: staged(agro?.brix, (v) => `${v.toFixed(1)}°`, BRIX_FROM_DAY, "Brix"),
    yield: staged(agro?.yieldTPerAcre, (v) => `${v.toFixed(2)} T/ac`, YIELD_FROM_DAY, "Expected yield"),
  };
}
