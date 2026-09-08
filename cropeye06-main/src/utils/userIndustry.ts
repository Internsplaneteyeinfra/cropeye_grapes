/** Logged-in user's industry (grapes id=3, etc.) from login / users/me. */

export const USER_INDUSTRY_KEY = "user_industry";
export const USER_INDUSTRY_ID_KEY = "user_industry_id";

export type UserIndustry = {
  id: number | null;
  crop_type: string | null;
};

export function parseUserIndustry(user: unknown): UserIndustry {
  if (!user || typeof user !== "object") {
    return { id: null, crop_type: null };
  }
  const u = user as Record<string, unknown>;
  const industry = u.industry;
  if (industry && typeof industry === "object") {
    const ind = industry as Record<string, unknown>;
    return {
      id:
        ind.id != null && ind.id !== ""
          ? Number(ind.id)
          : u.industry_id != null
            ? Number(u.industry_id)
            : null,
      crop_type:
        (ind.crop_type as string | undefined) ??
        (ind.name as string | undefined) ??
        (ind.cropType as string | undefined) ??
        null,
    };
  }
  const id = u.industry_id ?? u.industryId;
  return {
    id: id != null && id !== "" ? Number(id) : null,
    crop_type:
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("industry_type")
        : null) ?? null,
  };
}

export function saveUserIndustryFromProfile(user: unknown): UserIndustry {
  const industry = parseUserIndustry(user);
  if (typeof localStorage === "undefined") return industry;

  localStorage.setItem(USER_INDUSTRY_KEY, JSON.stringify(industry));
  if (industry.id != null) {
    localStorage.setItem(USER_INDUSTRY_ID_KEY, String(industry.id));
  }
  if (industry.crop_type) {
    localStorage.setItem("industry_type", industry.crop_type);
  }
  return industry;
}

export function getStoredUserIndustry(): UserIndustry {
  if (typeof localStorage === "undefined") {
    return { id: null, crop_type: null };
  }
  try {
    const raw = localStorage.getItem(USER_INDUSTRY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserIndustry;
      return {
        id: parsed?.id != null ? Number(parsed.id) : null,
        crop_type: parsed?.crop_type ?? null,
      };
    }
  } catch {
    // ignore
  }
  const idRaw = localStorage.getItem(USER_INDUSTRY_ID_KEY);
  return {
    id: idRaw ? Number(idRaw) : null,
    crop_type: localStorage.getItem("industry_type"),
  };
}

export function isGrapesIndustry(industry?: UserIndustry | null): boolean {
  const crop = String(industry?.crop_type || "").toLowerCase();
  if (crop.includes("grape") || crop.includes("graps")) return true;
  // Grapes industry id on Railway backend
  return industry?.id === 3;
}

/** Filter hierarchy rows when API returns mixed industries. */
export function filterRowsByIndustry<T extends Record<string, unknown>>(
  rows: T[],
  industryId: number | null,
): T[] {
  if (industryId == null || rows.length === 0) return rows;
  const filtered = rows.filter((row) => {
    const rowIndustry = row.industry as Record<string, unknown> | undefined;
    const rid =
      rowIndustry?.id ??
      row.industry_id ??
      row.industryId;
    return rid == null || Number(rid) === industryId;
  });
  return filtered.length > 0 ? filtered : rows;
}
