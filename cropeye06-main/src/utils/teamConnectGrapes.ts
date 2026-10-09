/**
 * Helpers for GET /users/team-connect/grapes/
 * Used by Owner + Manager Harvest Planning dashboards.
 */

export type TeamConnectGrapesFilterOptions = {
  regions: string[];
  representatives: { id: number | string; label: string }[];
  plotAreas: { value: string; label: string }[];
  varieties: { value: string; label: string }[];
};

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function personLabel(person: any, fallback = "Field Officer"): string {
  const name = `${person?.first_name || ""} ${person?.last_name || ""}`.trim();
  return name || person?.username || fallback;
}

/**
 * Nest farmers under field officers and normalize plot/farm shape so existing
 * harvest extractFarmers / extractPlots / extractFarms helpers keep working.
 */
export function normalizeTeamConnectGrapesOfficers(data: unknown): {
  fieldOfficers: any[];
  filterOptions: TeamConnectGrapesFilterOptions;
  counts: { fieldOfficers: number; farmers: number };
} {
  const root = (data ?? {}) as Record<string, any>;
  const byRole = (root.users_by_role ?? {}) as Record<string, any>;
  const filterRaw = (root.filter_options ?? {}) as Record<string, any>;

  const fos = asArray(byRole.field_officers ?? root.field_officers);
  const farmers = asArray(byRole.farmers ?? root.farmers);

  const byFoId = new Map<string, any>();
  fos.forEach((fo: any) => {
    const id = fo?.id ?? fo?.user_id;
    if (id == null) return;
    byFoId.set(String(id), { ...fo, farmers: [] as any[] });
  });

  const orphans: any[] = [];

  farmers.forEach((farmer: any) => {
    const plotObj =
      farmer?.plot && typeof farmer.plot === "object" && !Array.isArray(farmer.plot)
        ? farmer.plot
        : null;
    const plotsArr = asArray(farmer?.plots);
    const plot = plotObj || plotsArr[0] || null;

    const farmRow = {
      id: farmer?.id,
      plantation_date: farmer?.plantation_date,
      variety: farmer?.variety_display || farmer?.variety || farmer?.crop_variety,
      grafted_variety: farmer?.variety_display || farmer?.variety,
      crop_variety: farmer?.crop_variety || farmer?.variety,
      plantation_type:
        farmer?.plantation_type_display ||
        farmer?.plantation_type ||
        farmer?.variety_subtype,
      area_acres: farmer?.plot_area,
      plot_area: farmer?.plot_area,
      plot_area_bucket: farmer?.plot_area_bucket,
      distance_km: farmer?.distance_km ?? plot?.distance_km,
      distance: farmer?.distance ?? plot?.distance,
      distance_motor_to_plot_m:
        farmer?.distance_motor_to_plot_m ?? plot?.distance_motor_to_plot_m,
      distance_From_Motor:
        farmer?.distance_From_Motor ?? plot?.distance_From_Motor,
      "Distance (km)": farmer?.["Distance (km)"] ?? plot?.["Distance (km)"],
      Distance: farmer?.Distance ?? plot?.Distance,
      irrigation_details:
        farmer?.irrigation_details ?? plot?.irrigation_details,
      irrigation: farmer?.irrigation ?? plot?.irrigation,
      irrigations: farmer?.irrigations ?? plot?.irrigations,
      farms: asArray(farmer?.farms ?? plot?.farms),
      harvest_status:
        farmer?.harvest_status ??
        farmer?.harvestStatus ??
        plot?.harvest_status ??
        plot?.harvestStatus,
      harvestStatus:
        farmer?.harvestStatus ??
        farmer?.harvest_status ??
        plot?.harvestStatus ??
        plot?.harvest_status,
      crop_status:
        farmer?.crop_status ??
        farmer?.cropStatus ??
        plot?.crop_status ??
        plot?.cropStatus,
      cropStatus:
        farmer?.cropStatus ??
        farmer?.crop_status ??
        plot?.cropStatus ??
        plot?.crop_status,
      status: farmer?.status ?? plot?.status,
      growth_stage:
        farmer?.growth_stage ||
        farmer?.stage ||
        plot?.growth_stage ||
        plot?.stage,
      stage:
        farmer?.stage ||
        farmer?.growth_stage ||
        plot?.stage ||
        plot?.growth_stage,
      Sugarcane_Status:
        farmer?.Sugarcane_Status ?? plot?.Sugarcane_Status,
      fastapi_plot_id:
        plot?.fastapi_plot_id || farmer?.fastapi_plot_id || plot?.id,
    };

    const enrichedPlot = plot
      ? {
          ...plot,
          taluka: plot.taluka || farmer.taluka || farmer.village,
          district: plot.district || farmer.district || farmer.region,
          region: farmer.region || plot.district || plot.taluka,
          plantation_date: plot.plantation_date || farmer.plantation_date,
          variety: plot.variety || farmRow.variety,
          farms: [farmRow],
        }
      : {
          id: farmer?.id,
          plot_number: farmer?.plot?.plot_number,
          taluka: farmer.taluka || farmer.village,
          district: farmer.district || farmer.region,
          region: farmer.region,
          plantation_date: farmer.plantation_date,
          variety: farmRow.variety,
          farms: [farmRow],
        };

    const normalizedFarmer = {
      ...farmer,
      plots: [enrichedPlot],
      plot: enrichedPlot,
    };

    const rid =
      farmer?.representative?.id ??
      farmer?.representative_id ??
      farmer?.field_officer_id;
    const bucket = rid != null ? byFoId.get(String(rid)) : null;
    if (bucket) {
      bucket.farmers.push(normalizedFarmer);
    } else if (farmer?.representative) {
      const synId = String(farmer.representative.id ?? `rep-${orphans.length}`);
      if (!byFoId.has(synId)) {
        byFoId.set(synId, {
          id: farmer.representative.id,
          first_name: farmer.representative.first_name,
          last_name: farmer.representative.last_name,
          phone_number: farmer.representative.phone_number,
          region: farmer.representative.region,
          farmers: [],
        });
      }
      byFoId.get(synId)!.farmers.push(normalizedFarmer);
    } else {
      orphans.push(normalizedFarmer);
    }
  });

  if (orphans.length > 0) {
    byFoId.set("unassigned", {
      id: "unassigned",
      first_name: "Unassigned",
      last_name: "",
      farmers: orphans,
    });
  }

  const fieldOfficers = Array.from(byFoId.values());

  const regions = asArray(filterRaw.regions)
    .map((r) => String(r).trim())
    .filter(Boolean);

  const representatives = asArray(filterRaw.representatives).map((r: any) => ({
    id: r?.id,
    label: personLabel(r, "Representative"),
  }));

  // If API omitted representatives list, derive from FOs
  if (representatives.length === 0) {
    fieldOfficers.forEach((fo: any) => {
      if (fo?.id === "unassigned") return;
      representatives.push({
        id: fo.id,
        label: personLabel(fo),
      });
    });
  }

  const plotAreas = asArray(filterRaw.plot_areas).map((p: any) => ({
    value: String(p?.value ?? p ?? ""),
    label: String(p?.label ?? p?.value ?? p ?? ""),
  })).filter((p) => p.value || p.label);

  const varieties = asArray(filterRaw.varieties).map((v: any) => ({
    value: String(v?.value ?? v ?? ""),
    label: String(v?.label ?? v?.value ?? v ?? ""),
  })).filter((v) => v.value || v.label);

  const countsRoot = (root.counts ?? {}) as Record<string, number>;

  return {
    fieldOfficers,
    filterOptions: {
      regions: regions.length
        ? regions
        : Array.from(
            new Set(
              farmers
                .map((f: any) => f.region || f.district)
                .filter(Boolean)
                .map(String),
            ),
          ).sort(),
      representatives,
      plotAreas,
      varieties,
    },
    counts: {
      fieldOfficers:
        countsRoot.field_officers_count ?? fieldOfficers.filter((f) => f.id !== "unassigned").length,
      farmers: countsRoot.farmers_count ?? farmers.length,
    },
  };
}
