/** Reads owner totals from GET /users/total-count/ regardless of the exact response shape. */

export type OwnerBackendCounts = {
  managers: number | null;
  fieldOfficers: number | null;
  farmers: number | null;
  plots: number | null;
  areaAcres: number | null;
};

const KEYS: Record<keyof OwnerBackendCounts, string[]> = {
  managers: ["total_managers", "managers_count", "manager_count", "managers", "manager"],
  fieldOfficers: [
    "total_field_officers",
    "field_officers_count",
    "field_officer_count",
    "fieldofficers_count",
    "field_officers",
    "field_officer",
    "fieldofficers",
    "fieldofficer",
  ],
  farmers: ["total_farmers", "farmers_count", "farmer_count", "farmers", "farmer"],
  plots: ["total_plots", "plots_count", "plot_count", "plots", "plot"],
  areaAcres: ["total_area_acres", "total_field_area", "total_area", "area_acres"],
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s-]+/g, "_").replace(/fieldofficer/g, "field_officer");
}

function toCount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Flattens `{a: 1, counts: {b: 2}, by_role: [{role: "farmer", count: 3}]}` into key → number. */
function collectCounts(data: unknown, out: Map<string, number>, depth = 0): void {
  if (!data || typeof data !== "object" || depth > 3) return;

  if (Array.isArray(data)) {
    data.forEach((row) => {
      if (!row || typeof row !== "object") return;
      const r = row as Record<string, unknown>;
      const name = r.role ?? r.role_name ?? r.name ?? r.key ?? r.label;
      const count = toCount(r.count ?? r.total ?? r.value);
      if (typeof name === "string" && count != null) {
        const key = normalizeKey(name);
        if (!out.has(key)) out.set(key, count);
      }
    });
    return;
  }

  Object.entries(data as Record<string, unknown>).forEach(([k, v]) => {
    const count = toCount(v);
    const key = normalizeKey(k);
    if (count != null) {
      if (!out.has(key)) out.set(key, count);
    } else {
      collectCounts(v, out, depth + 1);
    }
  });
}

export function readOwnerCounts(data: unknown): OwnerBackendCounts {
  const flat = new Map<string, number>();
  collectCounts(data, flat);
  const pick = (field: keyof OwnerBackendCounts): number | null => {
    for (const key of KEYS[field]) {
      const v = flat.get(normalizeKey(key));
      if (v != null) return v;
    }
    return null;
  };
  return {
    managers: pick("managers"),
    fieldOfficers: pick("fieldOfficers"),
    farmers: pick("farmers"),
    plots: pick("plots"),
    areaAcres: pick("areaAcres"),
  };
}
