/**
 * Grapes-only owner hierarchy API helpers.
 * Isolated from sugarcane /users/owner-hierarchy/ flow — do not import that client here.
 */

import api from "../api";

export type GrapesOwnerIndustry = {
  id?: number;
  name?: string;
  crop_type?: string;
};

export type GrapesOwnerManager = {
  id: number;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  address?: string;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  role?: { id?: number; name?: string; display_name?: string } | string;
  created_by?: unknown;
  created_at?: string;
  updated_at?: string;
  field_officers_count?: number;
  field_officers?: GrapesOwnerFieldOfficer[];
  crop_type?: string;
  industry?: GrapesOwnerIndustry;
};

export type GrapesOwnerFieldOfficer = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  role?: string;
};

export type GrapesOwnerFarmersResponse = {
  field_officer?: GrapesOwnerFieldOfficer;
  summary?: { farmers_count?: number };
  farmers: GrapesOwnerFarmer[];
};

export type GrapesOwnerFarmerPlot = {
  id?: number;
  fastapi_plot_id?: string;
  gat_number?: string;
  plot_number?: string;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  location?: {
    type?: string;
    coordinates?: [number, number];
  } | null;
  boundary?: {
    type?: string;
    coordinates?: unknown;
  } | null;
  created_at?: string;
  farms?: Array<{
    id?: number;
    farm_uid?: string;
    area_size?: string | number;
    crop_type?: unknown;
    plantation_type?: string;
    plantation_type_display?: string;
    plantation_date?: string;
  }>;
};

export type GrapesOwnerFarmer = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  village?: string;
  district?: string;
  role?: string;
  plots?: GrapesOwnerFarmerPlot[];
};

export type GrapesOwnerManagersResponse = {
  managers: GrapesOwnerManager[];
  crop_type?: string;
  industry?: GrapesOwnerIndustry;
};

export function displayPersonName(person: {
  first_name?: string;
  last_name?: string;
  username?: string;
}): string {
  const full = `${person.first_name || ""} ${person.last_name || ""}`.trim();
  return full || person.username || "—";
}

/** Step 1: list managers (no field_officers nested). */
export async function fetchGrapesOwnerManagers(): Promise<GrapesOwnerManagersResponse> {
  const res = await api.get("/users/owner-hierarchy/grapes/", { timeout: 60_000 });
  const data = res.data || {};
  return {
    managers: Array.isArray(data.managers) ? data.managers : [],
    crop_type: data.crop_type,
    industry: data.industry,
  };
}

/** Step 2: managers[0].field_officers for one manager. */
export async function fetchGrapesOwnerFieldOfficers(
  managerId: number,
): Promise<GrapesOwnerManagersResponse> {
  const res = await api.get("/users/owner-hierarchy/grapes/", {
    params: { manager_id: managerId },
    timeout: 60_000,
  });
  const data = res.data || {};
  return {
    managers: Array.isArray(data.managers) ? data.managers : [],
    crop_type: data.crop_type,
    industry: data.industry,
  };
}

/**
 * Step 3: farmers for a field officer.
 * Prefer query form from grapes cascade spec; fall back to path form if needed.
 * Never calls /users/owner-hierarchy/.
 */
export async function fetchGrapesOwnerFarmersByFieldOfficer(
  fieldOfficerId: number,
): Promise<GrapesOwnerFarmersResponse> {
  try {
    const res = await api.get("/users/farmers-by-field-officer/", {
      params: { field_officer_id: fieldOfficerId },
      timeout: 60_000,
    });
    return normalizeFarmersResponse(res.data);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 405) {
      const res = await api.get(
        `/users/farmers-by-field-officer/${encodeURIComponent(String(fieldOfficerId))}/`,
        { timeout: 60_000 },
      );
      return normalizeFarmersResponse(res.data);
    }
    throw err;
  }
}

function normalizeFarmersResponse(data: any): GrapesOwnerFarmersResponse {
  const payload = data && typeof data === "object" ? data : {};
  let nested: any = payload;
  let farmers: any[] = [];
  for (let depth = 0; depth < 4; depth += 1) {
    if (Array.isArray(nested)) {
      farmers = nested;
      break;
    }
    if (!nested || typeof nested !== "object") break;
    const collection =
      nested.farmers ?? nested.farmer_list ?? nested.items;
    if (Array.isArray(collection)) {
      farmers = collection;
      break;
    }
    nested = nested.data ?? nested.results ?? nested;
  }
  return {
    field_officer: payload.field_officer ?? nested?.field_officer,
    summary: payload.summary ?? nested?.summary,
    farmers,
  };
}

export function grapesOwnerHierarchyErrorMessage(err: unknown): string {
  const ax = err as {
    response?: { status?: number; data?: { detail?: string; message?: string } };
    message?: string;
  };
  const status = ax.response?.status;
  const detail =
    (typeof ax.response?.data?.detail === "string" && ax.response.data.detail) ||
    (typeof ax.response?.data?.message === "string" && ax.response.data.message) ||
    "";

  if (status === 401) {
    return detail || "Please log in again to view the grapes owner hierarchy.";
  }
  if (status === 403) {
    return (
      detail ||
      "This grapes hierarchy is only for grapes owners. Sugarcane owners should use the existing owner hierarchy."
    );
  }
  if (status === 404) {
    return detail || "Not found for your grapes industry.";
  }
  if (status === 400) {
    return detail || "Invalid request for grapes owner hierarchy.";
  }
  return detail || ax.message || "Failed to load grapes owner hierarchy.";
}
