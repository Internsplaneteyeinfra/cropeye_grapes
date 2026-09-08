import axios from "axios";
import {
  getAccessToken,
  setAuthToken as setAuthTokenUtil,
  isValidToken,
  getRefreshToken,
  setRefreshToken,
  clearAuthData,
} from "./utils/auth";
import { checkAndRefreshToken, isTokenExpired, decodeToken } from "./utils/tokenManager";
import { navigateToLogin } from "./utils/navigation";
import { getBackendApiBaseUrl } from "./utils/serviceUrls";
import { USE_MOCK_AUTH } from "./config/authConfig";
import { filterRowsByIndustry, getStoredUserIndustry } from "./utils/userIndustry";
import { isFrontendRolePreview } from "./utils/frontendRolePreview";

// Backend API — Railway via Vite proxy in DEV (`/api/backend` → cropeye-backendd.up.railway.app)
const RAILWAY_API = "https://cropeye-backendd.up.railway.app/api/";
const getBaseURL = () => {
  const fromEnv = getBackendApiBaseUrl();
  // Relative proxy path (dev) or absolute Railway URL
  if (fromEnv.startsWith("/")) {
    return fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`;
  }
  if (/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|localhost|127\.0\.0\.1)/i.test(fromEnv)) {
    return RAILWAY_API;
  }
  return fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`;
};

const API_BASE_URL = getBaseURL();
const BASE_URLS = [API_BASE_URL];
let BASE_INDEX = 0;

// KML/GeoJSON host
const KML_API_URL = API_BASE_URL.startsWith("/")
  ? "https://cropeye-backendd.up.railway.app"
  : API_BASE_URL.replace(/\/api\/?$/i, "").replace(/\/+$/, "");

// Create axios instance with increased timeout to prevent session timeouts
// 5 minutes (300000ms) timeout for slow APIs
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// Create axios instance for public endpoints (no auth required)
const publicApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token if available and refresh if needed
api.interceptors.request.use(
  async (config) => {
    // Check and refresh token if needed before making request
    const token = getAccessToken();
    if (token) {
  // Demo mode: never refresh — mock / preview token is not a real JWT for the backend
      if (!USE_MOCK_AUTH && !isFrontendRolePreview() && isTokenExpired(token, 300)) {
        await checkAndRefreshToken(300);
      }

      // Get the (possibly refreshed) token
      const currentToken = getAccessToken();
      if (currentToken) {
        config.headers.Authorization = `Bearer ${currentToken}`;
      }
    }

    // If data is FormData, remove Content-Type header so browser can set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Token refresh flag to prevent infinite loops
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

// Add response interceptor to handle authentication errors and token refresh
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Suppress console errors for silent errors
    if (error.isSilent) {
      return Promise.reject(error);
    }

    const isNetworkError =
      !error.response &&
      (String(error.code).toUpperCase() === "ERR_NETWORK" ||
        String(error.message || "").toLowerCase().includes("network error") ||
        String(error.message || "").toLowerCase().includes("timed out"));
    if (isNetworkError) {
      if (!originalRequest._baseTriedCount) originalRequest._baseTriedCount = 0;
      if (originalRequest._baseTriedCount < BASE_URLS.length - 1) {
        originalRequest._baseTriedCount += 1;
        BASE_INDEX = originalRequest._baseTriedCount;
        const nextBase = BASE_URLS[BASE_INDEX];
        api.defaults.baseURL = nextBase;
        publicApi.defaults.baseURL = nextBase;
        return api(originalRequest);
      }
    }

    // Handle token refresh for 401 errors
    const refreshPath = "/token/refresh/";
    const isRefreshCall =
      typeof originalRequest?.url === "string" &&
      originalRequest.url.includes(refreshPath);

    // Demo/mock login or frontend role preview: never clear session or redirect on 401
    if (
      (USE_MOCK_AUTH || isFrontendRolePreview()) &&
      error.response?.status === 401
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshCall) {
      // Check if it's a token validation error
      const errorData = error.response?.data;
      const detail =
        typeof errorData?.detail === "string"
          ? errorData.detail
          : JSON.stringify(errorData?.detail || "");
      const isTokenError =
        errorData?.code === "token_not_valid" ||
        detail.toLowerCase().includes("token") ||
        detail.toLowerCase().includes("credentials") ||
        detail.toLowerCase().includes("authentication") ||
        !!errorData?.messages ||
        // Backend sometimes returns empty/unknown 401 bodies
        !errorData;

      if (isTokenError) {
        if (isRefreshing) {
          // If already refreshing, queue this request
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return api(originalRequest);
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshToken = getRefreshToken();

        if (refreshToken) {
          try {
            const refreshUrl = `${api.defaults.baseURL}${refreshPath.replace(/^\//, "")}`;

            let response;
            try {
              response = await axios.post(refreshUrl, { refresh_token: refreshToken });
            } catch (e: any) {
              response = await axios.post(refreshUrl, { refresh: refreshToken });
            }

            const data = response.data || {};
            const access = data.access_token || data.access;
            const newRefreshToken = data.refresh_token || data.refresh;

            if (access) {
              setAuthTokenUtil(access);

              // Update refresh token if a new one is provided
              if (newRefreshToken) {
                setRefreshToken(newRefreshToken);
              }

              originalRequest.headers.Authorization = `Bearer ${access}`;

              // Process queued requests
              processQueue(null, access);
              isRefreshing = false;

              return api(originalRequest);
            }
          } catch (refreshError: any) {
            // Refresh failed - clear auth and redirect to login
            processQueue(refreshError, null);
            isRefreshing = false;
            clearAuthData();
            navigateToLogin();

            return Promise.reject(refreshError);
          }
        } else {
          // No refresh token - clear auth and redirect
          processQueue(error, null);
          isRefreshing = false;
          clearAuthData();
          navigateToLogin();
        }
      }
    }

    return Promise.reject(error);
  },
);

// ==================== AUTHENTICATION API ====================
// Note: Using password-based authentication instead of OTP

// OTP-based authentication (commented out - using password-based auth instead)
//export const sendOtp = (email: string) => {
// return api.post('/otp/', { email });
//};

//export const verifyOtp = (email: string, otp: string) => {
//return api.post('/verify-otp/', { email, otp });
//};

//Login function - Railway via /api/backend/login/ (visible in grapes Network tab)
export const login = (phone_number: string, password: string) => {
  const url = `${String(publicApi.defaults.baseURL || "").replace(/\/+$/, "")}/login/`;
  console.info("[grapes] POST login →", url);
  return publicApi.post("/login/", {
    phone_number,
    password,
  });
};

// Token refresh function
export const refreshToken = (refresh: string) => {
  // Try both common payload shapes for compatibility
  return publicApi.post("/token/refresh/", { refresh_token: refresh }).catch(() =>
    publicApi.post("/token/refresh/", { refresh }),
  );
};

export const createNewPlantation = (data: {
  plantation_date: string;
  grafted_variety: string;
  soil_type: string;
  foundation_pruning_date: string;
  fruit_pruning_date: string;
  rootstock: string;
  grafting_date: string;
}) => {
  return api.post("/new-plantation/", data);
};

export const addUser = (data: {
  username?: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
  password?: string;
  role_id: string; // Must be string: "fieldofficer" or "farmer"
}) => {
  return api.post("/users/", data);
};

export const addTask = (data: {
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_to_id: number;
  due_date: string;
}) => {
  return api.post("/tasks/", data);
};

export const getTasks = () => {
  return api.get("/tasks/");
};

export const getTaskById = (id: number) => {
  return api.get(`/tasks/${id}/`);
};

export const updateTask = (id: number, data: any) => {
  return api.put(`/tasks/${id}/`, data);
};

export const getTasksForUser = (userId: number) => {
  return api.get(`/tasks/?assigned_to_id=${userId}`);
};

export const getFarmersByFieldOfficer = () => {
  return api.get(`/farms/my-farmers/`); // Aligned with official ref: no ID needed, uses logged in FO
};

/** Owner/Manager: farmers under a specific field officer (same as sugarcane). */
export const getFarmersByFieldOfficerId = (
  fieldOfficerId: number | string
) => {
  const id = encodeURIComponent(String(fieldOfficerId));
  return api.get(`/users/farmers-by-field-officer/${id}/`, { timeout: 60_000 });
};

/** Prefer non-empty arrays; unwrap common API envelope keys. */
export function pickApiArray(...candidates: unknown[]): any[] {
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
        "field_officers",
        "fieldOfficers",
        "items",
        "users",
      ]) {
        const nested = obj[key];
        if (Array.isArray(nested) && nested.length > 0) return nested;
        if (Array.isArray(nested) && fallback == null) fallback = nested;
      }
    }
  }
  return fallback ?? [];
}

/**
 * Manager / Owner (grapes): field officers scoped to logged-in user's industry.
 * GET /users/my-field-officers/
 */
export const getMyFieldOfficers = () => {
  return api.get("/users/my-field-officers/", { timeout: 60_000 });
};

function normalizeFarmerRowForOfficer(farmer: any): any {
  if (!farmer || typeof farmer !== "object") return farmer;
  const user = farmer.user && typeof farmer.user === "object" ? farmer.user : null;
  return {
    ...user,
    ...farmer,
    id:
      farmer.id ??
      farmer.farmer_id ??
      farmer.farmerId ??
      farmer.user_id ??
      user?.id,
    first_name: farmer.first_name ?? user?.first_name ?? farmer.name,
    last_name: farmer.last_name ?? user?.last_name ?? "",
    plots: pickApiArray(
      farmer.plots,
      farmer.plot_list,
      farmer.plot,
      farmer.farms,
      user?.plots,
    ),
  };
}

/** Read nested farmers from a field-officer row. */
export function extractFarmersFromOfficer(officer: any): any[] {
  return pickApiArray(
    officer?.farmers,
    officer?.farmer_list,
    officer?.farmer,
    officer?.assigned_farmers,
    officer?.farmer_details,
    officer?.farmer_profiles,
    officer?.my_farmers,
    officer?.all_farmers,
  ).map(normalizeFarmerRowForOfficer);
}

/** Normalize GET /users/my-field-officers/ for dashboard dropdowns. */
export function normalizeFieldOfficersFromResponse(data: unknown): any[] {
  const root = (data ?? {}) as Record<string, unknown>;
  return pickApiArray(
    root.field_officers,
    root.fieldOfficers,
    root.results,
    (root.data as Record<string, unknown> | undefined)?.field_officers,
    Array.isArray(data) ? data : null,
  ).map((fo: any) => ({
    ...fo,
    id: fo?.id ?? fo?.user_id ?? fo?.userId ?? fo?.user?.id,
    first_name: fo?.first_name ?? fo?.user?.first_name,
    last_name: fo?.last_name ?? fo?.user?.last_name,
    farmers: extractFarmersFromOfficer(fo),
  }));
}

function dedupeFieldOfficers(list: any[]): any[] {
  const map = new Map<string, any>();
  list.forEach((fo) => {
    const id = fo?.id ?? fo?.user_id ?? fo?.userId;
    if (id == null) return;
    map.set(String(id), fo);
  });
  return Array.from(map.values());
}

function parseTeamConnectFieldOfficers(data: unknown): any[] {
  const root = (data ?? {}) as Record<string, unknown>;
  let fieldOfficers = pickApiArray(
    (root.users_by_role as Record<string, unknown> | undefined)?.field_officers,
    root.field_officers,
    root.fieldOfficers,
  );
  const managers = pickApiArray(
    (root.users_by_role as Record<string, unknown> | undefined)?.managers,
    root.managers,
  );
  if (fieldOfficers.length === 0 && managers.length > 0) {
    fieldOfficers = managers.flatMap((manager: any) => {
      const mid = manager?.id ?? manager?.user_id ?? null;
      return pickApiArray(manager?.field_officers, manager?.fieldOfficers).map(
        (fo: any) => ({
          ...fo,
          manager_id:
            fo?.manager_id ?? fo?.manager?.id ?? fo?.managerId ?? mid,
        }),
      );
    });
  }
  return normalizeFieldOfficersFromResponse({ field_officers: fieldOfficers });
}

/** Owner grapes: load field officers with industry-aware fallbacks. */
export async function loadOwnerFieldOfficers(options?: {
  industryId?: number | null;
}): Promise<{
  fieldOfficers: any[];
  managers: any[];
  source: string;
}> {
  const stored = getStoredUserIndustry();
  const industryId = options?.industryId ?? stored.id;

  const loadManagersFromOwnerHierarchy = async (): Promise<{
    managers: any[];
    fieldOfficers: any[];
  }> => {
    const res = await api.get("/users/owner-hierarchy/", { timeout: 60_000 });
    const data = res.data ?? {};
    let managers = pickApiArray(
      data.managers,
      data.manager,
      data.results,
      data.data?.managers,
    );
    if (industryId != null) {
      managers = filterRowsByIndustry(managers, industryId);
    }

    let fieldOfficers = normalizeFieldOfficersFromResponse({
      field_officers: pickApiArray(
        data.field_officers,
        data.fieldOfficers,
        data.data?.field_officers,
        ...managers.flatMap((m: any) =>
          pickApiArray(m?.field_officers, m?.fieldOfficers).map((fo: any) => ({
            ...fo,
            manager_id: fo?.manager_id ?? fo?.manager?.id ?? m?.id,
          })),
        ),
      ),
    });

    if (fieldOfficers.length === 0 && managers.length > 0) {
      const detailed: any[] = [];
      await Promise.all(
        managers.map(async (manager: any) => {
          const mid = manager?.id ?? manager?.user_id ?? manager?.userId;
          if (mid == null) return;
          try {
            const detail = await getFieldOfficersByManager(mid);
            detailed.push(
              ...normalizeFieldOfficersFromResponse(detail.data).map(
                (fo: any) => ({
                  ...fo,
                  manager_id: fo?.manager_id ?? fo?.manager?.id ?? mid,
                }),
              ),
            );
          } catch (err) {
            console.warn(
              `loadOwnerFieldOfficers: owner-hierarchy?manager_id=${mid} failed`,
              err,
            );
          }
        }),
      );
      fieldOfficers = dedupeFieldOfficers(detailed);
    }

    return {
      managers,
      fieldOfficers: dedupeFieldOfficers(fieldOfficers),
    };
  };

  // A) GET /users/my-field-officers/ (works for manager; sometimes empty for owner)
  try {
    const res = await getMyFieldOfficers();
    const fieldOfficers = normalizeFieldOfficersFromResponse(res.data);
    if (fieldOfficers.length > 0) {
      // Owners still need managers for Manager → FO cascade (like sugarcane)
      try {
        const hier = await loadManagersFromOwnerHierarchy();
        if (hier.managers.length > 0) {
          return {
            fieldOfficers:
              hier.fieldOfficers.length > 0
                ? hier.fieldOfficers
                : fieldOfficers,
            managers: hier.managers,
            source: "my-field-officers+owner-hierarchy",
          };
        }
      } catch (err) {
        console.warn(
          "loadOwnerFieldOfficers: owner-hierarchy managers enrich failed",
          err,
        );
      }
      return { fieldOfficers, managers: [], source: "my-field-officers" };
    }
  } catch (err) {
    console.warn("loadOwnerFieldOfficers: my-field-officers failed", err);
  }

  if (industryId != null) {
    // B) GET /users/owner-team-connect/?industry_id=
    try {
      const res = await getOwnerTeamConnect(industryId);
      const fieldOfficers = parseTeamConnectFieldOfficers(res.data);
      if (fieldOfficers.length > 0) {
        try {
          const hier = await loadManagersFromOwnerHierarchy();
          if (hier.managers.length > 0) {
            return {
              fieldOfficers:
                hier.fieldOfficers.length > 0
                  ? hier.fieldOfficers
                  : fieldOfficers,
              managers: hier.managers,
              source: "owner-team-connect+owner-hierarchy",
            };
          }
        } catch {
          // keep FO-only
        }
        return { fieldOfficers, managers: [], source: "owner-team-connect" };
      }
    } catch (err) {
      console.warn("loadOwnerFieldOfficers: owner-team-connect failed", err);
    }

    // B2) GET /users/team-connect/?industry_id=
    try {
      const res = await getTeamConnect(industryId);
      const fieldOfficers = parseTeamConnectFieldOfficers(res.data);
      if (fieldOfficers.length > 0) {
        try {
          const hier = await loadManagersFromOwnerHierarchy();
          if (hier.managers.length > 0) {
            return {
              fieldOfficers:
                hier.fieldOfficers.length > 0
                  ? hier.fieldOfficers
                  : fieldOfficers,
              managers: hier.managers,
              source: "team-connect+owner-hierarchy",
            };
          }
        } catch {
          // keep FO-only
        }
        return { fieldOfficers, managers: [], source: "team-connect" };
      }
    } catch (err) {
      console.warn("loadOwnerFieldOfficers: team-connect failed", err);
    }
  }

  // C) GET /users/owner-hierarchy/ filtered by grapes industry
  try {
    const { managers, fieldOfficers } = await loadManagersFromOwnerHierarchy();
    if (fieldOfficers.length > 0 || managers.length > 0) {
      return { fieldOfficers, managers, source: "owner-hierarchy" };
    }
  } catch (err) {
    console.warn("loadOwnerFieldOfficers: owner-hierarchy failed", err);
  }

  return { fieldOfficers: [], managers: [], source: "none" };
}

/**
 * Owner: field officers for one manager.
 * GET /users/owner-hierarchy/?manager_id=…
 * Deep-reads nested field_officers + farmers from whatever shape the backend returns.
 */
export const getFieldOfficersByManager = async (
  managerId: number | string
): Promise<{ data: any }> => {
  const id = String(managerId);
  const enc = encodeURIComponent(id);

  const asArray = (value: unknown): any[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    const obj = value as Record<string, unknown>;
    for (const key of [
      "results",
      "data",
      "farmers",
      "farmer_list",
      "field_officers",
      "fieldOfficers",
      "items",
      "users",
    ]) {
      if (Array.isArray(obj[key]) && (obj[key] as any[]).length > 0) {
        return obj[key] as any[];
      }
    }
    return [];
  };

  const pickList = (...candidates: unknown[]): any[] => {
    let fallback: any[] = [];
    for (const c of candidates) {
      const arr = asArray(c);
      if (arr.length > 0) return arr;
      if (Array.isArray(c) && fallback.length === 0) fallback = c;
    }
    return fallback;
  };

  const entityId = (row: any): string | null => {
    const v = row?.id ?? row?.user_id ?? row?.userId ?? row?.farmer_id ?? row?.farmerId;
    return v == null || v === "" ? null : String(v);
  };

  const normalizeFarmerRow = (row: any): any => {
    if (!row || typeof row !== "object") return row;
    const user = row.user && typeof row.user === "object" ? row.user : null;
    return {
      ...user,
      ...row,
      id:
        row.id ??
        row.farmer_id ??
        row.farmerId ??
        row.user_id ??
        user?.id ??
        null,
      first_name: row.first_name ?? user?.first_name ?? row.name,
      last_name: row.last_name ?? user?.last_name ?? "",
      plots: Array.isArray(row.plots)
        ? row.plots
        : Array.isArray(row.plot_list)
          ? row.plot_list
          : Array.isArray(row.farms)
            ? row.farms
            : Array.isArray(user?.plots)
              ? user.plots
              : [],
    };
  };

  /** Trust arrays under farmer keys — do not drop rows missing first_name/plots. */
  const looksLikeFarmer = (row: any): boolean => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    // Explicit farmer markers
    if (
      row.farmer_id != null ||
      row.farmerId != null ||
      Array.isArray(row.plots) ||
      Array.isArray(row.plot_list) ||
      Array.isArray(row.farms)
    ) {
      return true;
    }
    const role = String(
      row.role?.name ?? row.role_name ?? row.role ?? row.user_type ?? "",
    ).toLowerCase();
    if (role.includes("farmer")) return true;
    // Any identifiable user-like row (name/phone/username/id)
    return (
      entityId(row) != null ||
      entityId(row?.user) != null ||
      row.first_name != null ||
      row.last_name != null ||
      row.username != null ||
      row.name != null ||
      row.phone_number != null ||
      row.phone != null
    );
  };

  const extractFarmersFromNode = (node: any): any[] => {
    const direct = pickList(
      node?.farmers,
      node?.farmer_list,
      node?.farmer,
      node?.assigned_farmers,
      node?.farmer_details,
      node?.farmer_profiles,
      node?.my_farmers,
      node?.farmer_set,
      node?.farmers_data,
      node?.all_farmers,
    );
    if (direct.length > 0) {
      // Named farmer arrays: keep every object row (backend already scoped them)
      return direct
        .filter((row) => row && typeof row === "object" && !Array.isArray(row))
        .map(normalizeFarmerRow);
    }
    if (Array.isArray(node?.users)) {
      return node.users.filter(looksLikeFarmer).map(normalizeFarmerRow);
    }
    return [];
  };

  const farmerLinkIds = (farmer: any): string[] => {
    const links = [
      farmer?.field_officer_id,
      farmer?.field_officer?.id,
      farmer?.fieldOfficerId,
      farmer?.fo_id,
      farmer?.foId,
      farmer?.parent_id,
      farmer?.created_by?.id,
      typeof farmer?.created_by === "number" || typeof farmer?.created_by === "string"
        ? farmer.created_by
        : null,
      farmer?.created_by_id,
    ];
    return links
      .filter((v) => v != null && v !== "")
      .map((v) => String(v));
  };

  /** Walk payload and collect FO-like + farmer-like nodes. */
  const deepCollect = (root: any) => {
    const officers: any[] = [];
    const farmers: any[] = [];
    const seenFo = new Set<string>();
    const seenFarmer = new Set<string>();

    const visit = (node: any, depth: number) => {
      if (!node || typeof node !== "object" || depth > 8) return;

      if (Array.isArray(node)) {
        node.forEach((item) => visit(item, depth + 1));
        return;
      }

      // FO arrays by known keys
      for (const key of [
        "field_officers",
        "fieldOfficers",
        "fo_list",
        "field_officer_list",
        "officers",
      ]) {
        const arr = asArray(node[key]);
        arr.forEach((fo) => {
          const foId = entityId(fo) ?? entityId(fo?.user);
          if (foId && !seenFo.has(foId)) {
            seenFo.add(foId);
            officers.push(fo?.user && !fo?.id ? { ...fo.user, ...fo } : fo);
          }
          extractFarmersFromNode(fo).forEach((farmer) => {
            const fid = entityId(farmer);
            if (fid && !seenFarmer.has(fid)) {
              seenFarmer.add(fid);
              farmers.push(farmer);
            }
          });
          visit(fo, depth + 1);
        });
      }

      // Farmer arrays by known keys
      for (const key of [
        "farmers",
        "farmer_list",
        "assigned_farmers",
        "farmer_details",
        "my_farmers",
        "farmer_set",
        "farmers_data",
        "all_farmers",
      ]) {
        const arr = asArray(node[key]);
        arr.forEach((farmer) => {
          if (!farmer || typeof farmer !== "object" || Array.isArray(farmer)) {
            return;
          }
          const normalized = normalizeFarmerRow(farmer);
          const fid = entityId(normalized);
          if (fid && !seenFarmer.has(fid)) {
            seenFarmer.add(fid);
            farmers.push(normalized);
          } else if (!fid && looksLikeFarmer(normalized)) {
            farmers.push(normalized);
          }
        });
      }

      // Recurse object values (skip huge primitives)
      Object.keys(node).forEach((key) => {
        if (
          [
            "field_officers",
            "fieldOfficers",
            "farmers",
            "farmer_list",
            "assigned_farmers",
          ].includes(key)
        ) {
          return;
        }
        const val = node[key];
        if (val && typeof val === "object") visit(val, depth + 1);
      });
    };

    visit(root, 0);
    return { officers, farmers };
  };

  const res = await api.get(`/users/owner-hierarchy/?manager_id=${enc}`, {
    timeout: 60_000,
  });
  const data = res.data ?? {};

  const managers = pickList(
    data?.managers,
    data?.manager,
    data?.results,
    data?.data?.managers,
    Array.isArray(data) ? data : null,
  );

  const match =
    managers.find((m: any) => String(m?.id ?? m?.user_id ?? "") === id) ??
    managers[0];

  const selfIsManager =
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (String(data?.id ?? data?.user_id ?? "") === id ||
      pickList(data?.field_officers, data?.fieldOfficers).length > 0);

  const source = match ?? (selfIsManager ? data : data);

  // Prefer manager-scoped FO list, then deep collect from whole payload
  let list = pickList(
    source?.field_officers,
    source?.fieldOfficers,
    source?.fo_list,
    source?.field_officer_list,
    data?.field_officers,
    data?.fieldOfficers,
    data?.data?.field_officers,
  );

  const collected = deepCollect(data);
  if (list.length === 0 && collected.officers.length > 0) {
    list = collected.officers;
  }

  // Keep FOs for this manager when link fields exist; otherwise keep all found
  const filtered = list.filter((fo: any) => {
    const mid =
      fo?.manager_id ??
      fo?.manager?.id ??
      fo?.managerId ??
      fo?.created_by?.id ??
      (typeof fo?.created_by === "number" || typeof fo?.created_by === "string"
        ? fo.created_by
        : null) ??
      fo?.created_by_id;
    return mid == null || String(mid) === id;
  });
  if (filtered.length > 0) list = filtered;

  const flatFarmers = [
    ...pickList(
      source?.farmers,
      source?.farmer_list,
      data?.farmers,
      data?.farmer_list,
      data?.data?.farmers,
    ),
    ...collected.farmers,
  ];

  // Dedupe farmers
  const farmerMap = new Map<string, any>();
  const farmersWithoutId: any[] = [];
  flatFarmers.forEach((farmer) => {
    const normalized = normalizeFarmerRow(farmer);
    const fid = entityId(normalized);
    if (fid) farmerMap.set(fid, normalized);
    else farmersWithoutId.push(normalized);
  });
  const allFarmers = [...Array.from(farmerMap.values()), ...farmersWithoutId];

  // Precompute linked farmers per FO so we only fall back when linking failed
  const linkedByFo = new Map<string, any[]>();
  list.forEach((fo: any) => {
    const foId = entityId(fo) ?? entityId(fo?.user) ?? "";
    if (!foId) return;
    linkedByFo.set(
      foId,
      allFarmers.filter((farmer) => farmerLinkIds(farmer).includes(foId)),
    );
  });
  const anyLinked = Array.from(linkedByFo.values()).some((arr) => arr.length > 0);
  const unlinkedFarmers = allFarmers.filter(
    (farmer) => farmerLinkIds(farmer).length === 0,
  );

  list = list.map((fo: any) => {
    const foId = entityId(fo) ?? entityId(fo?.user) ?? "";
    const nested = extractFarmersFromNode(fo);
    const linked = linkedByFo.get(foId) ?? [];
    let farmers =
      nested.length > 0 ? nested : linked.length > 0 ? linked : [];

    // Payload has farmers but this FO row is empty
    if (farmers.length === 0 && allFarmers.length > 0) {
      if (list.length === 1) {
        farmers = allFarmers;
      } else if (!anyLinked && unlinkedFarmers.length > 0) {
        // No FO links at all → share unlinked list so UI can show response data
        farmers = unlinkedFarmers;
      } else if (!anyLinked) {
        farmers = allFarmers;
      } else if (unlinkedFarmers.length > 0) {
        farmers = unlinkedFarmers;
      }
    }

    return {
      ...fo,
      id: fo?.id ?? fo?.user_id ?? fo?.userId ?? fo?.user?.id,
      first_name: fo?.first_name ?? fo?.user?.first_name,
      last_name: fo?.last_name ?? fo?.user?.last_name,
      manager_id:
        fo?.manager_id ?? fo?.manager?.id ?? fo?.managerId ?? id,
      farmers: farmers.map(normalizeFarmerRow),
    };
  });

  return {
    data: {
      field_officers: list,
      managers: managers.length > 0 ? managers : source ? [source] : [],
      farmers: allFarmers.map(normalizeFarmerRow),
      _raw: data,
    },
  };
};

export const getMyFarmers = () => {
  return api.get("/farms/my-farmers/");
};

export const getRecentFarmers = () => {
  return api.get("/farms/recent-farmers/");
};

export const updateTaskStatus = (taskId: number, status: string) => {
  return api.patch(`/tasks/${taskId}/`, { status });
};

export const addVendor = (data: {
  vendor_name: string;
  email: string;
  phone?: string;
  mobile?: string;
  contact_person?: string;
  gstin?: string;
  gstin_number?: string;
  state?: string;
  city?: string;
  address: string;
  rating?: number;
}) => {
  return api.post("/vendors/", data);
};

export const getVendors = () => {
  return api.get("/vendors/");
};

// Update vendor using PATCH method (partial update)
export const patchVendor = (id: string | number, data: any) => {
  return api.patch(`/vendors/${id}/`, data);
};

// Delete vendor
export const deleteVendor = (id: string | number) => {
  return api.delete(`/vendors/${id}/`);
};

export const addOrder = (data: {
  vendor: number; // Vendor ID
  invoice_date: string;
  invoice_number: string;
  state: string;
  items: {
    item_name: string;
    year_of_make: string;
    estimate_cost: string;
    remark: string;
  }[];
}) => {
  return api.post("/orders/", data);
};

export const getorders = () => {
  return api.get("/orders/");
};

// Update order using PATCH method (partial update)
export const patchOrder = (id: string | number, data: any) => {
  console.log("patchOrder API call:", {
    endpoint: `/orders/${id}/`,
    baseURL: API_BASE_URL,
    fullURL: `${API_BASE_URL}/orders/${id}/`,
    method: "PATCH",
    data: data,
  });
  return api.patch(`/orders/${id}/`, data);
};

// Update order using PUT method (full update)
export const putOrder = (id: string | number, data: any) => {
  return api.put(`/orders/${id}/`, data);
};

// Delete order
export const deleteOrder = (id: string | number) => {
  return api.delete(`/orders/${id}/`);
};
/**
 * POST Create Stock
 * POST /api/stock/
 * @param data - Stock item data
 * @example
 * {
 *   item_name: "Tractor",
 *   item_type: "equipment", // Valid: "logistic", "transport", "equipment", "office_purpose", "storage", "processing"
 *   make: "John Deere",
 *   year_of_make: "2020",
 *   estimate_cost: "500000",
 *   status: "working", // Valid: "working", "not_working", "under_repair"
 *   remark: "In good condition"
 * }
 */
export const addStock = (data: {
  item_name: string;
  item_type: string; // Backend expects: "logistic", "transport", "equipment", "office_purpose", "storage", "processing"
  make: string;
  year_of_make: string;
  estimate_cost: string;
  status: string; // Backend expects: "working", "not_working", "under_repair"
  remark: string;
}) => {
  return api.post("/stock/", data);
};
export const getstock = () => {
  return api.get("/stock/");
};

// Update stock using PATCH method (partial update)
export const patchStock = (id: string | number, data: any) => {
  return api.patch(`/stock/${id}/`, data);
};

// Delete stock
export const deleteStock = (id: string | number) => {
  return api.delete(`/stock/${id}/`);
};
export const addBooking = (data: {
  item_name: string;
  user_role: string;
  start_date: string;
  end_date: string;
  status: string;
}) => {
  console.log("addBooking API call:", {
    endpoint: "/bookings/",
    baseURL: API_BASE_URL,
    fullURL: `${API_BASE_URL}/bookings/`,
    data: data,
  });
  return api.post("/bookings/", data);
};
export const getbookings = () => {
  return api.get("/bookings/");
};
export const patchBooking = (id: string | number, data: any) => {
  return api.patch(`/bookings/${id}/`, data);
};

// Delete booking
export const deleteBooking = (id: string | number) => {
  return api.delete(`/bookings/${id}/`);
};

// ==================== FARM MANAGEMENT API ====================

// Farm Management
export const getFarms = () => {
  return api.get("/farms/");
};

// Get farms with farmer details
export const getFarmsWithFarmerDetails = () => {
  return api.get("/farms/?include_farmer=true");
};


export const getFarmById = (id: string) => {
  return api.get(`/farms/${id}/`);
};

// Get farms by farmer ID
export const getFarmsByFarmerId = (farmerId: string) => {
  return api.get(`/farms/?farmer_id=${farmerId}`);
};

export const createFarm = async (data: {
  first_name: string;
  last_name: string;
  username: string;
  password: string;
  confirm_password: string;
  email: string;
  phone_number: string;
  address: string;
  village: string;
  taluka: string;
  state: string;
  pin_code: string;
  district: string;
  gat_No: string;
  area: string;
  crop_type: string;
  plantation_Type: string;
  plantation_Date: string;
  irrigation_Type: string;
  // plants_Per_Acre: string;
  spacing_A: string;
  spacing_B: string;
  flow_Rate: string;
  emitters: string;
  motor_Horsepower: string;
  pipe_Width: string;
  distance_From_Motor: string;
  geometry: string;
  location: { lat: string; lng: string };
  documents: FileList | null;
}) => {
  // Create FormData for file upload
  const formData = new FormData();

  // Add all text fields
  Object.keys(data).forEach((key) => {
    if (key !== "documents") {
      formData.append(key, data[key as keyof typeof data] as string);
    }
  });

  // Add files if they exist
  if (data.documents) {
    for (let i = 0; i < data.documents.length; i++) {
      formData.append("documents", data.documents[i]);
    }
  }

  // Use multipart/form-data for file upload
  return api.post("/farms/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};

export const updateFarm = (id: string, data: any) => {
  return api.put(`/farms/${id}/`, data);
};

// Update farm using PATCH method (partial update)
export const patchFarm = (id: string, data: any) => {
  return api.patch(`/farms/${id}/`, data);
};

// Update plot using PATCH method (partial update)
export const patchPlot = (id: string, data: any) => {
  return api.patch(`/plots/${id}/`, data);
};

// Update irrigation using PATCH method (partial update)
export const patchIrrigation = (id: string, data: any) => {
  return api.patch(`/irrigations/${id}/`, data);
};

// Update farm registration
export const updateFarmRegistration = (
  id: string,
  data: {
    farmer_id?: string;
    plots?: Array<any>;
    totalArea?: {
      sqm: number;
      ha: number;
      acres: number;
    };
    location?: {
      lat: string;
      lng: string;
    };
    documents?: FileList | null;
  },
) => {
  return api.put(`/farms/${id}/`, data);
};

export const deleteFarm = (id: string) => {
  return api.delete(`/farms/${id}/`);
};

export const getFarmsGeoJSON = () => {
  return api.get("/farms/geojson/");
};

// Farm Plots Management
export const getFarmPlots = () => {
  return api.get("/farm-plots/");
};

export const createFarmPlot = (data: {
  farm_id: string;
  boundary: string; // GeoJSON geometry
  area: number;
  plot_name: string;
}) => {
  return api.post("/farm-plots/", data);
};

export const getFarmPlotsGeoJSON = () => {
  return api.get("/farm-plots/geojson/");
};

// Soil and Crop Types
export const getSoilTypes = () => {
  return api.get("/soil-types/");
};

export const getCropTypes = () => {
  return api.get("/crop-types/");
};

// Get crop types with Bearer token
export const getCropTypesWithAuth = (token: string) => {
  return axios.get(`${API_BASE_URL}/crop-types/`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
};

export const registerUser = (data: {
  username: string;
  password: string;
  password2: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  phone_number: string;
  address: string;
}) => {
  return axios.post(`${API_BASE_URL}/users/`, data, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
  });
};

// OTP-based authentication (commented out - using password-based auth instead)
// export const getTokenWithOtp = (email: string, otp: string) => {
//   return api.post('/token/', { email, otp });
// };

export const getCurrentUser = () => {
  return api.get("/users/me/");
};

export const getUsers = () => {
  return api.get("/users/");
};

// Update user using PATCH method (partial update)
export const updateUser = (id: string, data: any) => {
  return api.patch(`/users/${id}/`, data);
};

export const getContactDetails = () => {
  return api.get("/users/contact-details/");
};

// Get total counts for dashboard
export const getTotalCounts = () => {
  return api.get("/users/total-count/");
};

// Get team connect data (owners, field officers, farmers)
export const getTeamConnect = (industryId?: number | string) => {
  const url = industryId
    ? `/users/team-connect/?industry_id=${encodeURIComponent(String(industryId))}`
    : `/users/team-connect/`;
  return api.get(url, { timeout: 60_000 });
};

/** Owner-scoped team connect for one industry (grapes id=3). */
export const getOwnerTeamConnect = (industryId: number | string) => {
  const id = encodeURIComponent(String(industryId));
  return api.get(`/users/owner-team-connect/?industry_id=${id}`, {
    timeout: 60_000,
  });
};

// Messaging API functions
export const sendMessage = (data: {
  recipient_id: number[];
  content: string;
}) => {
  return api.post("/messages/", data);
};

export const getConversationWithUser = (userId: number) => {
  return api.get(`/conversations/with-user/${userId}/`);
};

export const getConversations = () => {
  return api.get("/conversations/");
};

export const getMessages = (conversationId: number) => {
  return api.get(`/conversations/${conversationId}/messages/`);
};

// Farmer Registration API (role_id = 1 for Farmer) - No authentication required
export const registerFarmer = (data: {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role_id: number; // Always 1 for Farmer
  phone_number: string;
  address: string;
  village: string;
  taluka: string;
  district: string;
  state: string;
}) => {
  // Create axios instance without auth token for registration
  return axios.post(`${API_BASE_URL}/users/`, data, {
    headers: {
      "Content-Type": "application/json",
    },
  });
};

// OTP-based registration (commented out - using password-based auth instead)
// export const sendOTPForRegistration = async (email: string): Promise<void> => {
//   try {
//     console.log('Sending OTP to:', email);
//     await axios.post(`${API_BASE_URL}/otp/`, {
//       email: email
//     }, {
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     });
//
//     console.log('✅ OTP sent successfully to:', email);
//   } catch (error: any) {
//     console.error('Failed to send OTP:', error);
//     throw new Error(`Failed to send OTP: ${error.response?.data?.detail || error.message}`);
//   }
// };

// OTP verification (commented out - using password-based auth instead)
// export const verifyOTPAndGetToken = async (email: string, otp: string): Promise<string> => {
//   try {
//     console.log('Verifying OTP for:', email);
//     const verifyResponse = await axios.post(`${API_BASE_URL}/verify-otp/`, {
//       email: email,
//       otp: otp
//     }, {
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     });
//
//     if (verifyResponse.data && (verifyResponse.data.access || verifyResponse.data.token)) {
//       const token = verifyResponse.data.access || verifyResponse.data.token;
//       console.log('✅ OTP verification successful, token received');
//       return token;
//     } else {
//       throw new Error('Invalid OTP response format');
//     }
//   } catch (error: any) {
//     console.error('OTP verification failed:', error);
//     throw new Error(`OTP verification failed: ${error.response?.data?.detail || error.message}`);
//   }
// };

// Set authentication token for API calls
export const setAuthToken = (token: string) => {
  // Set the token in the axios instance
  api.defaults.headers.Authorization = `Bearer ${token}`;
  // Also store it in localStorage using the utility
  setAuthTokenUtil(token);
};

// Plot Creation API - Requires Bearer token
export const createPlot = (
  data: {
    gat_number: string;
    plot_number: string;
    village: string;
    taluka: string;
    district: string;
    state: string;
    country: string;
    pin_code: string;
    location: {
      type: "Point";
      coordinates: [number, number]; // longitude, latitude
    };
    boundary: {
      type: "Polygon";
      coordinates: [[[number, number]]]; // GeoJSON Polygon
    };
  },
  token?: string,
) => {
  const headers: any = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return axios.post(`${API_BASE_URL}/plots/`, data, { headers });
};

// Farm Creation API - Requires Bearer token
export const createFarmWithPlot = (
  data: {
    plot_id: number;
    address: string;
    area_size: number;
    soil_type_id: string;
    crop_type_id: string;
    farm_document: File | null;
  },
  token?: string,
) => {
  const formData = new FormData();
  formData.append("plot_id", data.plot_id.toString());
  formData.append("address", data.address);
  formData.append("area_size", data.area_size.toString());
  formData.append("soil_type_id", data.soil_type_id);
  formData.append("crop_type_id", data.crop_type_id);

  if (data.farm_document) {
    formData.append("farm_document", data.farm_document);
  }

  const headers: any = {
    "Content-Type": "multipart/form-data",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return axios.post(`${API_BASE_URL}/farms/`, formData, { headers });
};

// Farm Registration API - Main endpoint
export const createFarmRegistration = (data: {
  farmer_id: string;
  plots: Array<{
    id: string;
    geometry: any;
    area: {
      sqm: number;
      ha: number;
      acres: number;
    };
    GroupGatNo: string;
    GatNoId: string;
    village: string;
    pin_code: string;
    crop_type: string;
    plantation_Type: string;
    plantation_Method: string;
    plantation_Date: string;
    irrigation_Type: string;
    plants_Per_Acre: string;
    spacing_A: string;
    spacing_B: string;
    flow_Rate: string;
    emitters: string;
    motor_Horsepower: string;
    pipe_Width: string;
    distance_From_Motor: string;
  }>;
  totalArea: {
    sqm: number;
    ha: number;
    acres: number;
  };
  location: {
    lat: string;
    lng: string;
  };
  irrigation: {
    irrigation_type_name: string;
    status: boolean;
    location: {
      type: "Point";
      coordinates: [number, number];
    };
    // Optional fields based on irrigation type
    // plants_per_acre?: number;
    flow_rate_lph?: number;
    emitters_count?: number;
    motor_horsepower?: number;
    pipe_width_inches?: number;
    distance_motor_to_plot_m?: number;
  };
  documents?: FileList | null;
}) => {
  return api.post("/farms/", data);
};

// Utility function to calculate area from GeoJSON polygon coordinates (in hectares)
export const calculatePolygonArea = (
  coordinates: [number, number][],
): number => {
  if (coordinates.length < 3) return 0;

  // Use a simple planar approximation for small agricultural plots
  // This is more suitable for small areas and avoids the large number issue
  let area = 0;

  for (let i = 0; i < coordinates.length; i++) {
    const j = (i + 1) % coordinates.length;
    const [lng1, lat1] = coordinates[i];
    const [lng2, lat2] = coordinates[j];

    // Use the shoelace formula with a simple planar approximation
    // For small agricultural plots, this is sufficiently accurate
    area += ((lng2 - lng1) * (lat2 + lat1)) / 2;
  }

  // Convert to square meters using a simplified conversion
  // For small areas, we can use a local approximation
  const lat = coordinates[0][1]; // Use first coordinate's latitude
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegreeLat = 111320; // meters per degree latitude
  const metersPerDegreeLng = 111320 * Math.cos(latRad); // meters per degree longitude

  const areaSqm = Math.abs(area) * metersPerDegreeLat * metersPerDegreeLng;

  // Convert from square meters to hectares
  const areaHectares = areaSqm / 10000;

  // Round to exactly 2 decimal places as required by the API
  return Math.round(areaHectares * 100) / 100;
};

// Get farmer profile using the dedicated my-profile endpoint
export const getFarmerMyProfile = () => {
  const token = getAccessToken();
  if (!token || !isValidToken(token)) {
    const error = new Error(
      "No access_token after login. Open gateway http://localhost:5174 , enable Network Preserve log, login, then confirm POST .../api/login/",
    );
    (error as any).response = {
      status: 403,
      data: { detail: "Authentication credentials were not provided." },
    };
    (error as any).isSilent = false;
    (error as any).code = "NO_AUTH_TOKEN";
    return Promise.reject(error);
  }
  console.info(
    "[grapes] GET /farms/my-profile/ →",
    `${String(api.defaults.baseURL || "").replace(/\/+$/, "")}/farms/my-profile/`,
  );
  return api.get("/farms/my-profile/");
};

// Farmer profile API function - uses existing endpoints
export const getFarmerProfile = async () => {
  try {
    // First, get the current user data
    const userResponse = await api.get("/users/me/");
    const userData = userResponse.data;

    // Then, get farms for this user using the new API structure
    let farmsData = [];
    let plotsData = [];
    let agriculturalSummary = {
      total_plots: 0,
      total_farms: 0,
      total_irrigations: 0,
      crop_types: [] as string[],
      plantation_types: [] as string[],
      irrigation_types: [] as string[],
      total_farm_area: 0,
    };

    try {
      // Try to get farms by farmer ID using the new API
      const farmsResponse = await api.get("/farms/?include_farmer=true");
      const allFarms = farmsResponse.data.results || farmsResponse.data || [];

      // Filter farms for the current user
      farmsData = allFarms.filter((farm: any) => {
        // Check different possible field names for farmer ID
        const farmFarmerId =
          farm.farmer_id || farm.farmer?.id || farm.user_id || farm.user?.id;
        const matches = farmFarmerId == userData.id;
        return matches;
      });

      // Calculate agricultural summary
      agriculturalSummary.total_farms = farmsData.length;
      agriculturalSummary.total_plots = farmsData.length; // Each farm has one plot

      // Extract unique crop types, plantation types, and irrigation types
      const cropTypes = new Set();
      const plantationTypes = new Set();
      const irrigationTypes = new Set();
      let totalArea = 0;

      farmsData.forEach((farm: any) => {
        if (farm.crop_type_name) cropTypes.add(farm.crop_type_name);
        if (farm.plantation_type) plantationTypes.add(farm.plantation_type);
        if (farm.irrigation_type_name)
          irrigationTypes.add(farm.irrigation_type_name);
        if (farm.area_size_numeric) totalArea += farm.area_size_numeric;
      });

      agriculturalSummary.crop_types = Array.from(cropTypes) as string[];
      agriculturalSummary.plantation_types = Array.from(
        plantationTypes,
      ) as string[];
      agriculturalSummary.irrigation_types = Array.from(
        irrigationTypes,
      ) as string[];
      agriculturalSummary.total_farm_area = totalArea;

      // Transform farms data to plots format
      plotsData = farmsData.map((farm: any, index: number) => ({
        id: farm.id || index + 1,
        fastapi_plot_id: farm.farm_uid || `plot_${index + 1}`,
        gat_number: farm.gat_number || "",
        plot_number: farm.plot_number || "",
        address: {
          village: farm.village || userData.village || "",
          taluka: farm.taluka || userData.taluka || "",
          district: farm.district || userData.district || "",
          state: farm.state || userData.state || "",
          country: farm.country || "India",
          pin_code: farm.pin_code || userData.pin_code || "",
          full_address: `${farm.village || userData.village || ""}, ${farm.taluka || userData.taluka || ""
            }, ${farm.district || userData.district || ""}, ${farm.state || userData.state || ""
            }`
            .replace(/,\s*,/g, ",")
            .replace(/^,\s*|,\s*$/g, ""),
        },
        coordinates: {
          location: {
            type: "Point",
            coordinates: farm.location?.coordinates || [0, 0],
            latitude: farm.location?.coordinates?.[1] || 0,
            longitude: farm.location?.coordinates?.[0] || 0,
          },
          boundary: {
            type: "Polygon",
            coordinates: farm.boundary?.coordinates || [],
            has_boundary: !!(
              farm.boundary?.coordinates && farm.boundary.coordinates.length > 0
            ),
          },
        },
        farms: [
          {
            id: farm.id,
            farm_uid: farm.farm_uid,
            area_size: farm.area_size,
            area_size_numeric: farm.area_size_numeric,
            soil_type: {
              id: farm.soil_type?.id || 1,
              name: farm.soil_type?.name || "Loamy",
            },
            crop_type: {
              id: farm.crop_type?.id || 1,
              crop_type: farm.crop_type_name || "Grapes",
              crop_variety:
                farm.crop_type?.crop_variety || farm.crop_variety || "",
              plantation_type: farm.plantation_type || "adsali",
              plantation_type_display: farm.plantation_type || "Adsali",
              planting_method: farm.planting_method || "3_bud",
              planting_method_display: farm.planting_method || "3 Bud",
            },
          },
        ],
      }));
    } catch (farmsError: any) {
      // Continue with empty farms data
    }

    // Transform the data to match the expected farmer profile structure
    const transformedData = {
      success: true,
      farmer_profile: {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        personal_info: {
          first_name: userData.first_name || "",
          last_name: userData.last_name || "",
          full_name: `${userData.first_name || ""} ${userData.last_name || ""
            }`.trim(),
          phone_number: userData.phone_number || "",
          profile_picture: null,
        },
        address_info: {
          address: userData.address || "",
          village: userData.village || "",
          district: userData.district || "",
          state: userData.state || "",
          taluka: userData.taluka || "",
          full_address: `${userData.address || ""}, ${userData.village || ""
            }, ${userData.taluka || ""}, ${userData.district || ""}, ${userData.state || ""
            }`
            .replace(/,\s*,/g, ",")
            .replace(/^,\s*|,\s*$/g, ""),
        },
        role: {
          id: userData.role_id || userData.role || 1,
          name: userData.role || "farmer",
          display_name: userData.role || "Farmer",
        },
      },
      agricultural_summary: agriculturalSummary,
      plots: plotsData,
    };

    return transformedData;
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error("Authentication failed. Please login again.");
    } else if (error.response?.status === 403) {
      throw new Error(
        "Access denied. You may not have permission to access farmer profile.",
      );
    } else if (error.response?.status >= 500) {
      throw new Error("Server error. Please try again later.");
    } else {
      throw new Error(
        `Failed to fetch farmer profile: ${error.response?.data?.detail || error.message
        }`,
      );
    }
  }
};

export const registerFarmerAllInOne = async (data: {
  farmer: {
    username: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    address: string;
    village: string;
    district: string;
    state: string;
    taluka: string;
  };
  plot: {
    gat_number: string;
    plot_number: string;
    village: string;
    taluka: string;
    district: string;
    state: string;
    country: string;
    pin_code: string;
    location: {
      type: "Point";
      coordinates: [number, number]; // [longitude, latitude]
    };
    boundary: {
      type: "Polygon";
      coordinates: [[[number, number]]]; // GeoJSON Polygon coordinates
    };
  };
  farm: {
    address: string;
    area_size: string;
    soil_type_name: string;
    crop_type_name: string;
    crop_variety?: string;
    plantation_type: string;
    planting_method: string;
  };
  irrigation: {
    irrigation_type_name: string;
    status: boolean;
    location: {
      type: "Point";
      coordinates: [number, number];
    };
    // Optional fields based on irrigation type
    // plants_per_acre?: number;
    flow_rate_lph?: number;
    emitters_count?: number;
    motor_horsepower?: number;
    pipe_width_inches?: number;
    distance_motor_to_plot_m?: number;
  };
  soil_report?: {
    nitrogen: number;
    phosphorus: number;
    potassium: number;
    soil_ph: number;
    cec: number;
    organic_carbon: number;
    bulk_density: number;
    fe: number;
    soil_organic_carbon: number;
  };
  plantation?: {
    plantation_date: string;
    foundation_pruning_date: string;
    fruit_pruning_date: string;
    last_harvesting_date: string;
    irrigation_type: string;
    intercropping: string;
    grafted_variety: string;
    soil_type: string;
  };
}) => {
  try {
    // Check if user is authenticated - registration endpoint REQUIRES authentication
    const token = getAccessToken();

    // Registration endpoint requires authentication (Field Officers/Admins register farmers)
    if (!token || !isValidToken(token)) {
      const errorMsg =
        "Authentication required. Please login as a Field Officer or Admin to register farmers.";
      const error = new Error(errorMsg);
      (error as any).response = {
        status: 401,
        data: { detail: errorMsg },
      };
      (error as any).requiresAuth = true;
      throw error;
    }

    // Use authenticated API for registration
    // MUST hit: /api/farms/register-farmer/grapes/ on https://cropeye-backendd.up.railway.app
    const response = await api.post("/farms/register-farmer/grapes/", data);
    return response;
  } catch (error: any) {
    // Provide better error messages
    if (
      error.response?.status === 401 ||
      error.response?.status === 403 ||
      error.requiresAuth
    ) {
      const errorMsg =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        "Authentication credentials were not provided. Please login as a Field Officer or Admin to register farmers.";
      const authError = new Error(errorMsg);
      (authError as any).response = error.response || {
        status: 401,
        data: { detail: errorMsg },
      };
      (authError as any).requiresAuth = true;
      throw authError;
    }
    throw error;
  }
};

// Upload Grapes Report (Photos/Residue)
// POST https://cropeye-backendd.up.railway.app
// api/grapse-reports/
// Returns: { id, plot, file_type, file (URL), uploaded_by, field_officer, notes, uploaded_at }
export const uploadGrapesReport = async (
  plotId: number,
  fileType: "variety" | "residue",
  file: File,
): Promise<{
  id: number;
  plot: number;
  file_type: "variety" | "residue";
  file: string; // URL to the uploaded file
  uploaded_by: number;
  field_officer: number | null;
  notes: string | null;
  uploaded_at: string;
}> => {
  // CRITICAL VALIDATION: Ensure file is a real File object from input
  if (!file) {
    throw new Error("Please select a file to upload");
  }

  if (!(file instanceof File)) {
    throw new Error(`Invalid file object. Expected File, got ${typeof file}`);
  }

  if (file.size === 0) {
    throw new Error("Selected file is empty. Please select a valid file.");
  }

  // Get user ID from token for uploaded_by field
  const token = getAccessToken();
  if (!token) {
    throw new Error("Authentication required. Please login to upload files.");
  }

  const decoded = decodeToken(token);
  if (!decoded) {
    throw new Error("Invalid authentication token. Please login again.");
  }

  const userId = (decoded as any).user_id || (decoded as any).id;
  if (!userId) {
    throw new Error("User ID not found in token. Please login again.");
  }

  // Create FormData with exact field names as required by backend
  const formData = new FormData();
  formData.append("plot", String(plotId)); // plot_id (number, but FormData converts to string)
  formData.append("file_type", fileType); // "variety" or "residue"
  formData.append("uploaded_by", String(userId)); // User ID who is uploading
  formData.append("file", file, file.name); // Actual File object with filename

  console.log(`📋 Uploading Grapse Report:`, {
    plot: plotId,
    file_type: fileType,
    uploaded_by: userId,
    file_name: file.name,
    file_size: file.size,
    file_type_mime: file.type
  });

  // Verify FormData contents (for debugging)
  console.log(`🔍 FormData verification:`, {
    hasFile: formData.has("file"),
    hasPlot: formData.has("plot"),
    hasFileType: formData.has("file_type"),
    hasUploadedBy: formData.has("uploaded_by"),
  });

  try {
    // POST request to /grapse-reports/
    // Content-Type header is automatically removed by interceptor for FormData
    // Authorization: Bearer <token> is added automatically by api instance interceptors
    const response = await api.post("/grapse-reports/", formData);

    // Success response (201): { id, plot, file_type, file (URL), uploaded_by, field_officer, notes, uploaded_at }
    const responseData = response.data;
    console.log(`✅ Grapse Report uploaded successfully:`, {
      id: responseData.id,
      plot: responseData.plot,
      file_type: responseData.file_type,
      file_url: responseData.file, // Use this as image URL for preview
      uploaded_at: responseData.uploaded_at
    });

    return responseData;
  } catch (error: any) {
    console.error(`❌ Error uploading Grapse Report:`, error);
    const errorMessage = error?.response?.data?.detail ||
      error?.response?.data?.message ||
      error?.message ||
      "File upload failed";
    throw new Error(`Failed to upload ${fileType} file: ${errorMessage}`);
  }
};

// Soil Report functions
export const addSoilReport = (data: any) => {
  return api.post("/soil-reports/", data);
};

export const getSoilReports = (farmId: number) => {
  return api.get(`/soil-reports/?farm=${farmId}`);
};

export const updateSoilReport = (id: number, data: any) => {
  return api.patch(`/soil-reports/${id}/`, data);
};

// Simplified farmer registration - uses ONLY all-in-one API for ALL users
// Now handles MULTIPLE plots - tries bulk endpoint first, falls back to individual submissions
export const registerFarmerAllInOneOnly = async (
  formData: any,
  plots: any[],
) => {
  try {
    // Check if user is authenticated - registration endpoint REQUIRES authentication
    const token = getAccessToken();

    if (!token || !isValidToken(token)) {
      const errorMsg =
        "Authentication required. Please login as a Field Officer or Admin to register farmers.";
      const error = new Error(errorMsg);
      (error as any).response = {
        status: 401,
        data: { detail: errorMsg },
      };
      (error as any).requiresAuth = true;
      throw error;
    }

    // Convert form data and plots to all-in-one format (returns array of payloads)
    const allInOneDataArray = convertToAllInOneFormat(formData, plots);

    // Submit each plot separately using the all-in-one registration endpoint
    const results = [];
    for (let i = 0; i < allInOneDataArray.length; i++) {
      const plotData = allInOneDataArray[i];
      const result = await registerFarmerAllInOne(plotData);
      results.push(result);

      // Small delay between submissions to avoid overwhelming the server
      if (i < allInOneDataArray.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    return results;
  } catch (error: any) {
    // Only log non-authentication errors to console
    // Authentication errors are expected and handled by the UI
    if (
      !error.requiresAuth &&
      error.response?.status !== 401 &&
      error.response?.status !== 403
    ) {
      console.error("Error in registerFarmerAllInOneOnly:", error);
    }
    throw error;
  }
};

// Helper function to convert a single plot to all-in-one API format
const convertSinglePlotToAllInOneFormat = (formData: any, plot: any) => {
  // Calculate center coordinates for location
  const coordinates = plot.geometry?.coordinates?.[0];

  if (!coordinates || coordinates.length === 0) {
    throw new Error(
      "Plot is missing boundary coordinates. Please redraw the plot.",
    );
  }

  const centerLng =
    coordinates.reduce((sum: number, coord: number[]) => sum + coord[0], 0) /
    coordinates.length;
  const centerLat =
    coordinates.reduce((sum: number, coord: number[]) => sum + coord[1], 0) /
    coordinates.length;

  const mapPlantAge = (age: string | undefined) => {
    const a = (age || "").toLowerCase();
    if (a.includes("0") && a.includes("3")) return "0_3";
    if (a.includes("3") && a.includes("13")) return "2_13";
    return "2_13";
  };

  const payload: any = {
    farmer: {
      username: formData.username,
      email: formData.email,
      password: formData.password,
      first_name: formData.first_name,
      last_name: formData.last_name,
      phone_number: formData.phone_number,
      address: formData.address,
      village: plot.village || formData.district,
      district: formData.district,
      state: formData.state,
      taluka: formData.taluka,
    },
    plot: {
      gat_number: plot.Group_Gat_No || plot.GroupGatNo || "",
      plot_number: plot.Gat_No_Id || plot.GatNoId || "",
      village: plot.village || formData.district,
      taluka: formData.taluka,
      district: formData.district,
      state: formData.state,
      country: "India",
      pin_code: plot.pin_code || "422605",
      location: {
        type: "Point" as const,
        coordinates: [centerLng, centerLat] as [number, number],
      },
      boundary: {
        type: "Polygon" as const,
        coordinates: [
          coordinates.map((coord: number[]) => [coord[0], coord[1]]),
        ] as [[[number, number]]],
      },
    },
    farm: {
      address: `${plot.village || formData.district}, ${formData.taluka}, ${formData.district}`,
      area_size: (() => {
        const ha =
          typeof plot.area?.ha === "number"
            ? plot.area.ha
            : parseFloat(String(plot.area?.ha || "3.50"));
        return Number.isFinite(ha) ? ha.toFixed(4) : "0.0000";
      })(),
      soil_type_name: formData.soil_type || "Sandy Loam",
      crop_type: "Grapes",
      crop_variety: String(
        formData.variety || formData.grafted_variety || plot.crop_variety || "Thompson Seedless",
      ).trim(),
      plant_age: mapPlantAge(plot.PlantAge),
      plantation_date: formData.plantation_date || plot.plantation_Date || "2024-01-15",
      foundation_pruning_date:
        formData.foundation_pruning_date || plot.plantation_Date || "2024-01-15",
      fruit_pruning_date:
        formData.fruit_pruning_date || plot.plantation_Date || "2024-01-15",
      last_harvesting_date:
        formData.last_harvesting_date || plot.plantation_Date || "2024-01-15",
      weight: formData.weight || "",
      price: formData.price || "",
      harvest_weight: formData.weight || "",
      market_price: formData.price || "",
      row_spacing: formData.row_spacing || plot.spacing_A || "3.50",
      plant_spacing: formData.plant_spacing || plot.spacing_B || "3.20",
      variety_type: "seasonal",
      variety_subtype: (plot.grapes_type || "").toLowerCase().includes("wine") ? "Wine" : "Table Grapes",
      variety_timing: (plot.grapes_season || "").toLowerCase().includes("early") ? "early" : "late",
      resting_period_days: "60",
    },
    irrigation: {
      irrigation_type_name: plot.irrigation_Type || "drip",
      status: true,
      location: {
        type: "Point" as const,
        coordinates: [centerLng, centerLat] as [number, number],
      },
      // Drip/flood dynamic fields
      ...(plot.irrigation_Type === "drip"
        ? {
          plants_per_acre:
            parseFloat(plot.spacing_A) && parseFloat(plot.spacing_B)
              ? Math.floor(
                43560 /
                (parseFloat(plot.spacing_A) * parseFloat(plot.spacing_B)),
              )
              : 2000,
          flow_rate_lph: parseFloat(plot.flow_Rate) || 2.5,
          emitters_count: parseInt(plot.emitters) || 150,
        }
        : plot.irrigation_Type === "flood"
          ? {
            motor_horsepower: parseFloat(plot.motor_Horsepower) || 7.5,
            pipe_width_inches: parseFloat(plot.pipe_Width) || 6.0,
            distance_motor_to_plot_m:
              parseFloat(plot.distance_From_Motor) || 75.0,
          }
          : {}),
      // Always include motor fields if present to satisfy backend
      ...(plot.motor_Horsepower
        ? { motor_horsepower: parseFloat(plot.motor_Horsepower) }
        : {}),
      ...(plot.pipe_Width ? { pipe_width_inches: parseFloat(plot.pipe_Width) } : {}),
      ...(plot.distance_From_Motor
        ? { distance_motor_to_plot_m: parseFloat(plot.distance_From_Motor) }
        : {}),
    },
    plantation: {
      plantation_date: formData.plantation_date || plot.plantation_Date || "2024-01-15",
      foundation_pruning_date:
        formData.foundation_pruning_date || plot.plantation_Date || "2024-01-15",
      fruit_pruning_date:
        formData.fruit_pruning_date || plot.plantation_Date || "2024-01-15",
      last_harvesting_date:
        formData.last_harvesting_date || plot.plantation_Date || "2024-01-15",
      weight: formData.weight || "",
      price: formData.price || "",
      harvest_weight: formData.weight || "",
      market_price: formData.price || "",
      irrigation_type: plot.irrigation_Type || "drip",
      intercropping: formData.intercropping || "no",
      intercropping_crop_name: formData.intercropping === "yes" ? formData.intercropping_crop_name : undefined,
      rootstock: formData.dogridge_rootstock_type || "dogridge",
      grafting_date: formData.grafting_date || "",
      // Registration page (3–13y) uses `variety`; new plantation uses `grafted_variety` — same as farm.crop_variety
      grafted_variety: String(
        formData.variety ||
        formData.grafted_variety ||
        plot.crop_variety ||
        "",
      ).trim(),
      soil_type: (formData.soil_type && String(formData.soil_type).trim()) || "sandy_loam",
    },
  };

  if (formData.soil_report && formData.soil_details) {
    const details = formData.soil_details || {};
    const parseNumber = (value: any) => {
      if (value === null || value === undefined || value === "") return 0;
      const num = parseFloat(String(value));
      return Number.isFinite(num) ? num : 0;
    };

    payload.soil_report = {
      nitrogen: parseNumber(details.nitrogen),
      phosphorus: parseNumber(details.phosphorus),
      potassium: parseNumber(details.potassium),
      soil_ph: parseNumber(details.soil_ph),
      cec: parseNumber(details.cec),
      organic_carbon: parseNumber(details.organic_carbon),
      bulk_density: parseNumber(details.bulk_density),
      fe: parseNumber(details.fe),
      soil_organic_carbon: parseNumber(details.soil_organic_carbon),
    };
  }

  // Validate that GAT and plot numbers are provided
  if (!payload.plot.gat_number || payload.plot.gat_number.trim() === "") {
    throw new Error(
      "GAT Number is required. Please fill in the GAT Number field in the form.",
    );
  }
  if (!payload.plot.plot_number || payload.plot.plot_number.trim() === "") {
    throw new Error(
      "Plot Number is required. Please fill in the Plot Number field in the form.",
    );
  }

  // Validate the payload before returning
  validateAllInOnePayload(payload);

  return payload;
};

// Helper function to convert form data to all-in-one API format for ALL plots
const convertToAllInOneFormat = (formData: any, plots: any[]) => {
  if (!plots || plots.length === 0) {
    throw new Error("At least one plot is required for registration");
  }

  // Return array of payloads - one for each plot
  return plots.map((plot) =>
    convertSinglePlotToAllInOneFormat(formData, plot),
  );
};

// ==================== SYSTEM/UTILITY API ====================

/**
 * Refreshes various microservice endpoints after a new farm/plot registration.
 * This ensures that other services are aware of the newly created data.
 *
 * It calls multiple endpoints in parallel and returns the results.
 */
export const refreshApiEndpoints = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    console.warn("No refresh token available for endpoint refresh");
    return [];
  }

  // Use correct token refresh endpoint: POST /api/token/refresh/
  const refreshEndpoint = "/token/refresh/";

  try {
    // Use publicApi since token refresh doesn't require authentication
    const response = await publicApi.post(refreshEndpoint, {
      refresh: refreshToken,
    });
    return [{ endpoint: refreshEndpoint, status: "success", ok: true, response }];
  } catch (error: any) {
    return [{
      endpoint: refreshEndpoint,
      status: "failed",
      ok: false,
      error: error.response?.data || error.message,
    }];
  }
};

// Debug function to validate data format before sending
export const validateAllInOnePayload = (payload: any) => {
  const errors: string[] = [];

  // Validate farmer object
  if (!payload.farmer) {
    errors.push("Missing 'farmer' object");
  } else {
    const requiredFarmerFields = [
      "username",
      "email",
      "password",
      "first_name",
      "last_name",
      "phone_number",
    ];
    requiredFarmerFields.forEach((field) => {
      if (!payload.farmer[field]) {
        errors.push(`Missing farmer.${field}`);
      }
    });
  }

  // Validate plot object
  if (!payload.plot) {
    errors.push("Missing 'plot' object");
  } else {
    const requiredPlotFields = [
      "gat_number",
      "plot_number",
      "village",
      "location",
      "boundary",
    ];
    requiredPlotFields.forEach((field) => {
      if (!payload.plot[field]) {
        errors.push(`Missing plot.${field}`);
      }
    });

    // Validate location format
    if (payload.plot.location) {
      if (payload.plot.location.type !== "Point") {
        errors.push("plot.location.type must be 'Point'");
      }
      if (
        !Array.isArray(payload.plot.location.coordinates) ||
        payload.plot.location.coordinates.length !== 2
      ) {
        errors.push("plot.location.coordinates must be [longitude, latitude]");
      }
    }

    // Validate boundary format
    if (payload.plot.boundary) {
      if (payload.plot.boundary.type !== "Polygon") {
        errors.push("plot.boundary.type must be 'Polygon'");
      }
      if (!Array.isArray(payload.plot.boundary.coordinates)) {
        errors.push("plot.boundary.coordinates must be an array");
      }
    }
  }

  // Validate farm object
  if (!payload.farm) {
    errors.push("Missing 'farm' object");
  } else {
    const requiredFarmFields = ["address", "area_size"];
    requiredFarmFields.forEach((field) => {
      if (!payload.farm[field]) {
        errors.push(`Missing farm.${field}`);
      }
    });
  }

  // Validate irrigation object
  if (!payload.irrigation) {
    errors.push("Missing 'irrigation' object");
  }

  if (errors.length > 0) {
    return false;
  }

  return true;
};

// KML/GeoJSON API functions
export const getKMLData = async () => {
  try {
    const response = await axios.get(KML_API_URL);
    return response.data;
  } catch (error: any) {
    throw new Error(
      `Failed to fetch KML data: ${error.response?.data?.detail || error.message
      }`,
    );
  }
};

// Get KML data with authentication (if needed)
export const getKMLDataWithAuth = async (token?: string) => {
  const headers: any = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await axios.get(KML_API_URL, { headers });
    return response.data;
  } catch (error: any) {
    throw new Error(
      `Failed to fetch KML data: ${error.response?.data?.detail || error.message
      }`,
    );
  }
};

export default api;
