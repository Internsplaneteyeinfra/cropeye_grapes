import { soilMetricsFromAgroPlotRow } from "./grapesEventsBundle";
import { grapeVarietyLabel } from "./grapeVarieties";

export const HECTARES_TO_ACRES = 2.47105;

export function pickArray(...candidates: unknown[]): any[] {
  let fallback: any[] | null = null;
  for (const c of candidates) {
    if (Array.isArray(c)) {
      if (c.length > 0) return c;
      if (fallback == null) fallback = c;
      continue;
    }
    if (c && typeof c === "object") {
      const obj = c as Record<string, unknown>;
      for (const key of [
        "results",
        "data",
        "farmers",
        "farmer_list",
        "plots",
        "plot_list",
        "farms",
        "items",
      ]) {
        const nested = obj[key];
        if (Array.isArray(nested) && nested.length > 0) return nested;
        if (Array.isArray(nested) && fallback == null) fallback = nested;
      }
      if (obj.id != null || obj.farmer_id != null || obj.farmerId != null) {
        return [c];
      }
    }
  }
  return fallback ?? [];
}

export function extractFarmers(officer: any): any[] {
  return pickArray(
    officer?.farmers,
    officer?.farmer_list,
    officer?.farmer,
    officer?.assigned_farmers,
    officer?.farmer_details,
    officer?.farmer_profiles,
    officer?.my_farmers,
    officer?.all_farmers,
  );
}

export function extractPlots(farmer: any): any[] {
  const direct = pickArray(farmer?.plots, farmer?.plot_list, farmer?.plot);
  if (direct.length > 0) return direct;
  // Grapes: farmer.farms may be the plot rows (no nested plots[])
  const farms = pickArray(farmer?.farms, farmer?.farm_list);
  if (farms.length === 0) return [];
  const nestedPlots = farms.flatMap((f: any) => pickArray(f?.plots, f?.plot_list));
  return nestedPlots.length > 0 ? nestedPlots : farms;
}

/** Prefer plot.farms; if missing, treat the plot itself as one farm row. */
export function extractFarms(plot: any): any[] {
  const farms = pickArray(plot?.farms, plot?.farm_list, plot?.farm);
  if (farms.length > 0) return farms;
  return [plot];
}

export function resolveFarmAreaAcres(farm: any, plot?: any): number {
  const acres = parseFloat(
    String(
      farm?.area_acres ??
        farm?.area_in_acres ??
        farm?.plot_area ??
        plot?.area_acres ??
        plot?.area_in_acres ??
        plot?.plot_area ??
        "",
    ),
  );
  if (Number.isFinite(acres) && acres > 0) return acres;

  const size = parseFloat(
    String(
      farm?.area_size ??
        farm?.area_size_numeric ??
        plot?.area_size ??
        plot?.area_size_numeric ??
        "0",
    ),
  );
  if (!Number.isFinite(size) || size <= 0) return 0;
  return size * HECTARES_TO_ACRES;
}

export function normalizeGrapesStatus(status: unknown): string {
  if (typeof status !== "string") return "";
  const normalized = status
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.includes("harvested")) return "Harvested";
  if (normalized.includes("ready")) return "Ready to Harvest";
  if (normalized.includes("growing")) return "Growing";
  return normalized;
}

function agroRow(plotRow: any): any {
  if (!plotRow || typeof plotRow !== "object") return null;
  return plotRow.brix_sugar != null
    ? plotRow
    : plotRow.properties && typeof plotRow.properties === "object"
      ? plotRow.properties
      : plotRow;
}

export function readAgroYieldBrix(plotRow: any): {
  yieldTPerAcre: number | null;
  brix: number | null;
  recovery: number | null;
} {
  const row = agroRow(plotRow);
  if (!row) return { yieldTPerAcre: null, brix: null, recovery: null };
  const bs = row.brix_sugar ?? row.brixSugar ?? {};
  const sugarYield = bs.sugar_yield ?? bs.yield ?? bs.predicted_yield;
  const yieldTPerAcre =
    typeof sugarYield?.mean === "number"
      ? sugarYield.mean
      : typeof sugarYield?.min === "number"
        ? sugarYield.min
        : typeof sugarYield === "number"
          ? sugarYield
          : null;
  const brixRaw = bs.brix ?? bs.tss ?? bs.brix_mean ?? row.brix;
  const brix =
    typeof brixRaw?.mean === "number"
      ? brixRaw.mean
      : typeof brixRaw === "number"
        ? brixRaw
        : typeof brixRaw?.min === "number"
          ? brixRaw.min
          : null;
  const recoveryRaw = bs.recovery ?? bs.ta ?? row.recovery;
  const recovery =
    typeof recoveryRaw?.mean === "number"
      ? recoveryRaw.mean
      : typeof recoveryRaw === "number"
        ? recoveryRaw
        : null;
  return { yieldTPerAcre, brix, recovery };
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export type OwnerAgroMetrics = {
  yieldTPerAcre: number | null;
  brix: number | null;
  recovery: number | null;
  soilPH: number | null;
  organicCarbon: number | null;
  daysToHarvest: number | null;
  biomass: number | null;
  areaAcres: number | null;
  status: string;
  plantationDate: string | null;
  boundary: [number, number][] | null;
};

/** All per-plot values the owner dashboard reads from one /plots/agroStats row. */
export function readAgroMetrics(plotRow: any): OwnerAgroMetrics | null {
  const row = agroRow(plotRow);
  if (!row) return null;
  // The shared agroStats batch also holds sugarcane plots whose ids can collide with grapes ids.
  const cropType = String(row.crop_type ?? "").toLowerCase();
  if (cropType && !cropType.includes("grape")) return null;
  const { yieldTPerAcre, brix, recovery } = readAgroYieldBrix(plotRow);
  const { soilPH, organicCarbonDensity } = soilMetricsFromAgroPlotRow(plotRow);
  const days = toFiniteNumber(row.days_to_harvest);
  const biomass = toFiniteNumber(row.biomass?.mean ?? row.biomass);
  const geometry = plotRow.geometry ?? row.geometry;
  const ring = Array.isArray(geometry?.coordinates?.[0])
    ? (geometry.coordinates[0] as number[][])
    : null;
  return {
    yieldTPerAcre,
    brix,
    recovery,
    soilPH,
    organicCarbon: organicCarbonDensity,
    daysToHarvest: days != null && days >= 0 ? days : null,
    biomass,
    areaAcres: toFiniteNumber(row.area_acres ?? row.soil?.area_acres),
    status: normalizeGrapesStatus(
      row.harvest_status ??
        row.Sugarcane_Status ??
        row.growth_stage ??
        row.crop_status,
    ),
    plantationDate: typeof row.plantation_date === "string" && row.plantation_date.trim() ? row.plantation_date : null,
    boundary: ring
      ? ring
          .filter((c) => Array.isArray(c) && c.length >= 2)
          .map((c) => [Number(c[1]), Number(c[0])] as [number, number])
      : null,
  };
}

export type OwnerPlotRecord = {
  key: string;
  plotId: string;
  plotLabel: string;
  farmerName: string;
  fieldOfficerId: string;
  fieldOfficerName: string;
  managerId: string;
  managerName: string;
  district: string;
  taluka: string;
  village: string;
  state: string;
  areaAcres: number;
  cropType: string | null;
  variety: string | null;
  plantationDate: string | null;
  boundary: [number, number][] | null;
  center: [number, number] | null;
  hierarchyStatus: string;
  agro: OwnerAgroMetrics | null;
  /** Optional extras used by certification / registration forms */
  farmerId?: string;
  farmerPhone?: string;
  farmId?: number | null;
  gatNumber?: string;
  plotNumber?: string;
  pinCode?: string;
  irrigationType?: string | null;
  soilType?: string | null;
  pruningFoundationDate?: string | null;
  pruningFruitDate?: string | null;
};

export const UNKNOWN_DISTRICT = "District not set";
export const UNASSIGNED_MANAGER = "Unassigned manager";
export const UNLINKED_FARMER = "Farmer not linked";
/** Synthetic manager / field officer id for industry plots with no FO link. */
export const UNASSIGNED_TEAM_ID = "industry-unassigned";

/** Owner-facing display name — keep the card, soften the "Grapes Manager" label. */
export function displayOwnerManagerName(name: unknown): string {
  const raw = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "grapes manager" || lower === "grapesmanager") {
    return "Grapes";
  }
  // first_name "Grapes" + last_name "Manager" (or trailing Manager role word)
  if (/\bmanager\b$/i.test(raw) && /^grapes\b/i.test(raw)) {
    return "Grapes";
  }
  return raw;
}

/** @deprecated use displayOwnerManagerName — card is kept, only the label is renamed. */
export function isExcludedOwnerManagerName(_name: unknown): boolean {
  return false;
}

/** True for real backend FO users — excludes Unassigned / industry-fo-* placeholders. */
export function isRealFieldOfficerId(id: unknown): boolean {
  if (id == null || id === "") return false;
  const key = String(id);
  if (key === String(UNASSIGNED_TEAM_ID)) return false;
  if (key.startsWith("industry-fo-")) return false;
  if (key.startsWith("industry-unassigned")) return false;
  return true;
}

function personName(person: any, fallback: string): string {
  const name = `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim();
  return name || person?.username || fallback;
}

function text(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Registration often stores places in ALL CAPS ("NASHIK"); show them as "Nashik". */
export function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(^|[\s\-/(.])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

function placeName(...values: unknown[]): string {
  return toTitleCase(text(...values));
}

function boundaryFromPlot(plot: any): [number, number][] | null {
  const ring = plot?.boundary?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const points = ring
    .filter((c: unknown) => Array.isArray(c) && c.length >= 2)
    .map((c: number[]) => [Number(c[1]), Number(c[0])] as [number, number])
    .filter(([lat, lng]: [number, number]) => Number.isFinite(lat) && Number.isFinite(lng));
  return points.length >= 3 ? points : null;
}

function centerFromPlot(plot: any, boundary: [number, number][] | null): [number, number] | null {
  const geo = plot?.location?.coordinates;
  if (Array.isArray(geo) && geo.length >= 2) {
    const lat = Number(geo[1]);
    const lng = Number(geo[0]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      return [lat, lng];
    }
  }
  const loc = plot?.coordinates?.location;
  if (loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))) {
    return [Number(loc.latitude), Number(loc.longitude)];
  }
  return boundaryCenter(boundary);
}

export function boundaryCenter(boundary: [number, number][] | null): [number, number] | null {
  if (!boundary || boundary.length === 0) return null;
  let lat = 0;
  let lng = 0;
  boundary.forEach(([a, b]) => {
    lat += a;
    lng += b;
  });
  return [lat / boundary.length, lng / boundary.length];
}

export function ownerPlotApiId(plot: any, farm?: any): string {
  const id =
    plot?.fastapi_plot_id ??
    farm?.fastapi_plot_id ??
    plot?.plot_id ??
    plot?.plot_name ??
    (plot?.gat_number && plot?.plot_number
      ? `${plot.gat_number}_${plot.plot_number}`
      : null) ??
    plot?.id ??
    farm?.id;
  return id != null ? String(id).trim() : "";
}

/** Flatten owner hierarchy (managers → field officers → farmers → plots) into one row per plot. */
export function buildOwnerPlotRecords(fieldOfficers: any[], managers: any[]): OwnerPlotRecord[] {
  const managerNames = new Map<string, string>();
  managers.forEach((m: any) => {
    const id = m?.id ?? m?.user_id;
    if (id != null) {
      managerNames.set(
        String(id),
        displayOwnerManagerName(personName(m, `Manager ${id}`)),
      );
    }
  });

  const records = new Map<string, OwnerPlotRecord>();

  fieldOfficers.forEach((officer: any) => {
    const rawManagerId = String(officer?.manager_id ?? officer?.manager?.id ?? "");
    const managerId = rawManagerId === UNASSIGNED_TEAM_ID ? "" : rawManagerId;
    const managerName = displayOwnerManagerName(
      (managerId && managerNames.get(managerId)) ||
        (officer?.manager ? personName(officer.manager, "") : "") ||
        text(officer?.manager_name) ||
        UNASSIGNED_MANAGER,
    );
    const fieldOfficerId = String(officer?.id ?? officer?.user_id ?? "");
    const fieldOfficerName = personName(officer, "Field officer");

    extractFarmers(officer).forEach((farmer: any) => {
      extractPlots(farmer).forEach((plot: any) => {
        const record = plotRecord(plot, farmer, {
          fieldOfficerId,
          fieldOfficerName,
          managerId: managerId || managerName,
          managerName,
          officerDistrict: text(officer?.district),
          fallbackKey: `${fieldOfficerId}-${farmer?.id ?? ""}-${plot?.id ?? records.size}`,
        });
        if (!records.has(record.key)) records.set(record.key, record);
      });
    });
  });

  return Array.from(records.values());
}

/** One registered farmer from the hierarchy, including farmers with no plots yet. */
export type OwnerFarmerRecord = {
  key: string;
  name: string;
  phone: string;
  village: string;
  taluka: string;
  district: string;
  fieldOfficerId: string;
  fieldOfficerName: string;
  managerId: string;
};

export function buildOwnerFarmerRecords(fieldOfficers: any[], managers: any[]): OwnerFarmerRecord[] {
  const managerNames = new Map<string, string>();
  managers.forEach((m: any) => {
    const id = m?.id ?? m?.user_id;
    if (id != null) {
      managerNames.set(
        String(id),
        displayOwnerManagerName(personName(m, `Manager ${id}`)),
      );
    }
  });

  const records = new Map<string, OwnerFarmerRecord>();
  fieldOfficers.forEach((officer: any) => {
    const rawManagerId = String(officer?.manager_id ?? officer?.manager?.id ?? "");
    const managerId = rawManagerId === UNASSIGNED_TEAM_ID ? "" : rawManagerId;
    const managerName = displayOwnerManagerName(
      (managerId && managerNames.get(managerId)) ||
        (officer?.manager ? personName(officer.manager, "") : "") ||
        text(officer?.manager_name) ||
        UNASSIGNED_MANAGER,
    );
    const fieldOfficerId = String(officer?.id ?? officer?.user_id ?? "");
    const fieldOfficerName = personName(officer, "Field officer");

    extractFarmers(officer).forEach((farmer: any) => {
      if (String(farmer?.id) === `${UNASSIGNED_TEAM_ID}-farmer`) return;
      const name = personName(farmer, "Farmer");
      const firstPlot = extractPlots(farmer)[0];
      const record: OwnerFarmerRecord = {
        key: `${fieldOfficerId}:${name}`,
        name,
        phone: text(farmer?.phone_number, farmer?.phone),
        village: placeName(farmer?.village, firstPlot?.village),
        taluka: placeName(farmer?.taluka, firstPlot?.taluka),
        district: placeName(farmer?.district, firstPlot?.district, officer?.district) || UNKNOWN_DISTRICT,
        fieldOfficerId,
        fieldOfficerName,
        managerId: managerId || managerName,
      };
      if (!records.has(record.key)) records.set(record.key, record);
    });
  });
  return Array.from(records.values());
}

type PlotContext = {
  fieldOfficerId: string;
  fieldOfficerName: string;
  managerId: string;
  managerName: string;
  officerDistrict: string;
  fallbackKey: string;
};

function farmNumericId(farm: any, plot?: any): number | null {
  const raw =
    farm?.farm_id ??
    farm?.id ??
    plot?.farm_id ??
    (Array.isArray(plot?.farms) ? plot.farms[0]?.id : null);
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function plotRecord(plot: any, farmer: any, ctx: PlotContext): OwnerPlotRecord {
  const farms = extractFarms(plot);
  const plotId = ownerPlotApiId(plot, farms[0]);
  const boundary = boundaryFromPlot(plot);
  const address = plot?.address && typeof plot.address === "object" ? plot.address : {};
  const firstFarm = farms[0] ?? {};
  const plantation = firstFarm?.plantation && typeof firstFarm.plantation === "object"
    ? firstFarm.plantation
    : {};
  const irrigation =
    firstFarm?.irrigation && typeof firstFarm.irrigation === "object"
      ? firstFarm.irrigation
      : plot?.irrigation && typeof plot.irrigation === "object"
        ? plot.irrigation
        : {};

  return {
    key: plotId || ctx.fallbackKey,
    plotId,
    plotLabel:
      text(plot?.plot_name) ||
      (plot?.gat_number && plot?.plot_number ? `${plot.gat_number}/${plot.plot_number}` : "") ||
      plotId ||
      "Plot",
    farmerName: farmer ? personName(farmer, "Farmer") : UNLINKED_FARMER,
    farmerId: farmer?.id != null ? String(farmer.id) : farmer?.user_id != null ? String(farmer.user_id) : undefined,
    farmerPhone: text(farmer?.phone_number, farmer?.phone, plot?.phone_number) || undefined,
    farmId: farmNumericId(firstFarm, plot),
    fieldOfficerId: ctx.fieldOfficerId,
    fieldOfficerName: ctx.fieldOfficerName,
    managerId: ctx.managerId,
    managerName: ctx.managerName,
    district:
      placeName(plot?.district, address.district, farmer?.district, ctx.officerDistrict) ||
      UNKNOWN_DISTRICT,
    taluka: placeName(plot?.taluka, address.taluka, farmer?.taluka),
    village: placeName(plot?.village, address.village, farmer?.village),
    state: text(plot?.state, address.state, farmer?.state),
    areaAcres: farms.reduce((sum, farm) => sum + resolveFarmAreaAcres(farm, plot), 0),
    cropType: text(
      firstFarm?.crop_type?.crop_type,
      firstFarm?.crop_type?.name,
      firstFarm?.crop_type_display,
      firstFarm?.crop_name,
      plot?.crop_type?.crop_type,
      plot?.crop_type?.name,
      plot?.crop_type_display,
      plot?.crop_name,
    ) || null,
    variety: (() => {
      // Registration saves the variety on farm.crop_type.crop_variety (same field the farmer profile shows).
      const raw = text(
        ...farms.map((f: any) => f?.crop_type?.crop_variety),
        firstFarm?.plantation?.grafted_variety,
        firstFarm?.grafted_variety,
        firstFarm?.variety_display,
        firstFarm?.variety,
        firstFarm?.crop_variety,
        firstFarm?.crop_type?.variety,
        plot?.variety,
        plot?.crop_variety,
        plot?.grafted_variety,
        farmer?.variety_display,
        farmer?.variety,
        farmer?.crop_variety,
        farmer?.grafted_variety,
      );
      return raw ? grapeVarietyLabel(raw) : null;
    })(),
    plantationDate:
      text(
        firstFarm?.plantation_date,
        plantation?.plantation_date,
        plot?.plantation_date,
      ) || null,
    gatNumber: text(plot?.gat_number, plot?.Group_Gat_No, firstFarm?.gat_number) || undefined,
    plotNumber: text(plot?.plot_number, plot?.Gat_No_Id, firstFarm?.plot_number) || undefined,
    pinCode: text(plot?.pin_code, address.pin_code, address.pincode, farmer?.pin_code) || undefined,
    irrigationType:
      text(
        irrigation?.irrigation_type_name,
        irrigation?.irrigation_type,
        irrigation?.type,
        plot?.irrigation_type,
        plantation?.irrigation_type,
      ) || null,
    soilType:
      text(
        firstFarm?.soil_type_name,
        firstFarm?.soil_type,
        plantation?.soil_type,
        plot?.soil_type,
      ) || null,
    pruningFoundationDate:
      text(
        firstFarm?.foundation_pruning_date,
        plantation?.foundation_pruning_date,
        plot?.foundation_pruning_date,
      ) || null,
    pruningFruitDate:
      text(
        firstFarm?.fruit_pruning_date,
        plantation?.fruit_pruning_date,
        plot?.fruit_pruning_date,
      ) || null,
    boundary,
    center: centerFromPlot(plot, boundary),
    hierarchyStatus: normalizeGrapesStatus(
      firstFarm?.harvest_status ??
        firstFarm?.crop_status ??
        firstFarm?.growth_stage ??
        plot?.harvest_status ??
        plot?.crop_status ??
        plot?.growth_stage,
    ),
    agro: null,
  };
}

export function plotStatus(plot: OwnerPlotRecord): string {
  return plot.agro?.status || plot.hierarchyStatus || "Not reported";
}

export function plotArea(plot: OwnerPlotRecord): number {
  if (plot.areaAcres > 0) return plot.areaAcres;
  return plot.agro?.areaAcres ?? 0;
}

export function plotBoundary(plot: OwnerPlotRecord): [number, number][] | null {
  return plot.boundary ?? plot.agro?.boundary ?? null;
}

/** Boundary centre first: the hierarchy `location` is often the farmer's village, not the vineyard. */
export function plotCenter(plot: OwnerPlotRecord): [number, number] | null {
  return boundaryCenter(plotBoundary(plot)) ?? plot.center;
}

export type PortfolioSummary = {
  plots: number;
  farmers: number;
  fieldOfficers: number;
  managers: number;
  areaAcres: number;
  plotsWithAgro: number;
  avgYield: number | null;
  estProductionT: number | null;
  avgBrix: number | null;
  avgSoilPH: number | null;
  avgOrganicCarbon: number | null;
  readyToHarvest: number;
  harvested: number;
  statusCounts: Record<string, number>;
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizePlots(plots: OwnerPlotRecord[]): PortfolioSummary {
  const farmers = new Set<string>();
  const officers = new Set<string>();
  const managers = new Set<string>();
  const statusCounts: Record<string, number> = {};
  let areaAcres = 0;
  let weightedYield = 0;
  let yieldArea = 0;
  let production = 0;
  let hasProduction = false;
  const yields: number[] = [];
  const brix: number[] = [];
  const ph: number[] = [];
  const oc: number[] = [];

  plots.forEach((p) => {
    if (p.farmerName !== UNLINKED_FARMER) farmers.add(`${p.fieldOfficerId}:${p.farmerName}`);
    if (isRealFieldOfficerId(p.fieldOfficerId)) officers.add(p.fieldOfficerId);
    if (p.managerId !== UNASSIGNED_MANAGER) managers.add(p.managerId);
    const area = plotArea(p);
    areaAcres += area;
    const status = plotStatus(p);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    const a = p.agro;
    if (!a) return;
    if (a.yieldTPerAcre != null) {
      yields.push(a.yieldTPerAcre);
      if (area > 0) {
        weightedYield += a.yieldTPerAcre * area;
        yieldArea += area;
        production += a.yieldTPerAcre * area;
        hasProduction = true;
      }
    }
    if (a.brix != null) brix.push(a.brix);
    if (a.soilPH != null) ph.push(a.soilPH);
    if (a.organicCarbon != null) oc.push(a.organicCarbon);
  });

  return {
    plots: plots.length,
    farmers: farmers.size,
    fieldOfficers: officers.size,
    managers: managers.size,
    areaAcres,
    plotsWithAgro: plots.filter((p) => p.agro != null).length,
    avgYield: yieldArea > 0 ? weightedYield / yieldArea : mean(yields),
    estProductionT: hasProduction ? production : null,
    avgBrix: mean(brix),
    avgSoilPH: mean(ph),
    avgOrganicCarbon: mean(oc),
    readyToHarvest: statusCounts["Ready to Harvest"] ?? 0,
    harvested: statusCounts["Harvested"] ?? 0,
    statusCounts,
  };
}

export type PortfolioGroup = {
  key: string;
  label: string;
  plots: OwnerPlotRecord[];
  summary: PortfolioSummary;
};

export function groupPlots(
  plots: OwnerPlotRecord[],
  keyOf: (p: OwnerPlotRecord) => string,
  labelOf: (p: OwnerPlotRecord) => string = keyOf,
): PortfolioGroup[] {
  const groups = new Map<string, { label: string; plots: OwnerPlotRecord[] }>();
  plots.forEach((p) => {
    const key = keyOf(p);
    const g = groups.get(key) ?? { label: labelOf(p), plots: [] };
    g.plots.push(p);
    groups.set(key, g);
  });
  return Array.from(groups.entries()).map(([key, g]) => ({
    key,
    label: g.label,
    plots: g.plots,
    summary: summarizePlots(g.plots),
  }));
}

/** Most common non-empty state across plots (e.g. "Maharashtra"). */
export function dominantState(plots: OwnerPlotRecord[]): string | null {
  const counts = new Map<string, number>();
  plots.forEach((p) => {
    if (p.state) counts.set(p.state, (counts.get(p.state) ?? 0) + 1);
  });
  let best: string | null = null;
  let bestCount = 0;
  counts.forEach((count, state) => {
    if (count > bestCount) {
      best = state;
      bestCount = count;
    }
  });
  return best;
}
