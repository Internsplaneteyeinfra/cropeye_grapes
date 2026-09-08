import { useState, useEffect } from 'react';
import { getFarmerProfile, getFarmerMyProfile } from '../api';
import { getAuthToken, isValidToken, getUserRole } from '../utils/auth';
import { useAppContext } from '../context/AppContext';
import { getBackendApiBaseUrl } from '../utils/serviceUrls';

interface FarmerProfile {
  success?: boolean;
  farmer_profile?: {
    id?: number;
    username?: string;
    email?: string;
    personal_info?: {
      first_name?: string;
      last_name?: string;
      full_name?: string;
      phone_number?: string;
      profile_picture?: string | null;
    };
    address_info?: {
      address?: string;
      village?: string;
      district?: string;
      state?: string;
      taluka?: string;
      full_address?: string;
    };
    account_info?: {
      date_joined?: string;
      last_login?: string | null;
      is_active?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    role?: {
      id?: number;
      name?: string;
      display_name?: string;
    };
  };
  agricultural_summary?: {
    total_plots?: number;
    total_farms?: number;
    total_irrigations?: number;
    crop_types?: string[];
    plantation_types?: string[];
    irrigation_types?: string[];
    total_farm_area?: number;
  };
  plots?: Array<{
    id?: number;
    fastapi_plot_id?: string;
    plot_id?: string | number;
    gat_number?: string;
    plot_number?: string;
    address?: {
      village?: string;
      taluka?: string;
      district?: string;
      state?: string;
      country?: string;
      pin_code?: string;
      full_address?: string;
    };
    coordinates?: {
      location?: {
        type?: string;
        coordinates?: [number, number];
        latitude?: number;
        longitude?: number;
      };
      boundary?: {
        type?: string;
        coordinates?: number[][][];
        has_boundary?: boolean;
      };
    };
    timestamps?: {
      created_at?: string;
      updated_at?: string;
    };
    ownership?: {
      farmer?: {
        id?: number;
        username?: string;
        full_name?: string;
        email?: string;
        phone_number?: string;
      };
      created_by?: {
        id?: number;
        username?: string;
        full_name?: string;
        email?: string;
        phone_number?: string;
        role?: string;
      };
    };
    farms?: Array<{
      id?: number;
      farm_uid?: string;
      fastapi_plot_id?: string;
      farm_owner?: {
        id?: number;
        username?: string;
        full_name?: string;
        email?: string;
        phone_number?: string;
      };
      address?: string;
      area_size?: string;
      area_size_numeric?: number;
      plantation_date?: string;
      spacing_a?: number;
      spacing_b?: number;
      plants_in_field?: number;
      soil_type?: {
        id?: number;
        name?: string;
      };
      crop_type?: {
        id?: number;
        crop_type?: string;
        crop_variety?: string;
        plantation_type?: string;
        plantation_type_display?: string;
        planting_method?: string;
        planting_method_display?: string;
      };
      farm_document?: string | null;
      created_at?: string;
      updated_at?: string;
      created_by?: {
        id?: number;
        username?: string;
        full_name?: string;
        email?: string;
        phone_number?: string;
      };
      irrigations?: Array<{
        id?: number;
        irrigation_type?: string;
        irrigation_type_code?: string;
        location?: {
          type?: string;
          coordinates?: [number, number];
        };
        status?: boolean;
        status_display?: string;
        motor_horsepower?: number | null;
        pipe_width_inches?: number | null;
        distance_motor_to_plot_m?: number | null;
        plants_per_acre?: number;
        flow_rate_lph?: number;
        emitters_count?: number;
      }>;
      irrigations_count?: number;
    }>;
    farms_count?: number;
  }>;
  farms?: Array<any>;
  fastapi_integration?: {
    plot_ids_format?: string;
    compatible_services?: string[];
    note?: string;
  };
}

/** Resolve plot id from deployed API shapes (fastapi_plot_id may be missing). */
export function resolveFarmerPlotId(plot: any): string {
  if (!plot || typeof plot !== "object") return "";
  const candidates = [
    plot.fastapi_plot_id,
    plot.plot_id,
    plot.plotId,
    plot.plot_name,
    plot.id,
    plot.farms?.[0]?.fastapi_plot_id,
    plot.farms?.[0]?.plot_id,
    plot.gat_number && plot.plot_number
      ? `${plot.gat_number}_${plot.plot_number}`
      : null,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== "") return String(c);
  }
  return "";
}

function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["results", "data", "plots", "plot_list", "farms", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as any[];
    }
  }
  return [];
}

/** Normalize /farms/my-profile/ so Map and cards always get usable plots[].fastapi_plot_id */
export function normalizeFarmerProfile(raw: any): FarmerProfile {
  if (!raw || typeof raw !== "object") return raw;

  let plots = asArray(
    raw.plots ?? raw.plot_list ?? raw.plot ?? raw.data?.plots,
  );

  // Deployed APIs sometimes nest plots only under farms
  if (plots.length === 0) {
    const farms = asArray(raw.farms ?? raw.farm_list ?? raw.data?.farms);
    plots = farms
      .map((farm: any) => {
        const nested = asArray(farm?.plots ?? farm?.plot_list);
        if (nested.length > 0) {
          return nested.map((p: any) => ({
            ...p,
            farms: p.farms ?? [farm],
            fastapi_plot_id:
              resolveFarmerPlotId(p) ||
              resolveFarmerPlotId(farm) ||
              farm?.farm_uid,
          }));
        }
        // Treat farm row as a plot when no nested plots exist
        return {
          id: farm?.id,
          fastapi_plot_id:
            resolveFarmerPlotId(farm) || farm?.farm_uid || String(farm?.id ?? ""),
          gat_number: farm?.gat_number,
          plot_number: farm?.plot_number,
          address: farm?.address,
          coordinates:
            farm?.coordinates ??
            (farm?.boundary
              ? {
                  boundary: farm.boundary,
                  location: farm.location,
                }
              : undefined),
          farms: [farm],
        };
      })
      .flat()
      .filter((p: any) => resolveFarmerPlotId(p));
  }

  const normalizedPlots = plots
    .map((plot: any) => {
      const plotId = resolveFarmerPlotId(plot);
      if (!plotId) return null;
      return {
        ...plot,
        fastapi_plot_id: plotId,
        id: plot.id ?? plot.plot_id ?? plotId,
        coordinates: plot.coordinates ?? (
          plot.boundary
            ? { boundary: plot.boundary, location: plot.location }
            : undefined
        ),
      };
    })
    .filter(Boolean);

  const totalPlots =
    raw.agricultural_summary?.total_plots ??
    normalizedPlots.length ??
    0;

  return {
    ...raw,
    plots: normalizedPlots,
    agricultural_summary: {
      ...(raw.agricultural_summary || {}),
      total_plots: Number(totalPlots) || normalizedPlots.length,
    },
  };
}

const PROFILE_CACHE_KEY = 'farmer_my_profile_v3';
const PROFILE_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const INFLIGHT_KEY = '__cropeye_inflight_my_profile__';

/** Shared across every useFarmerProfile() caller (Map, Header, SoilAnalysis, …). */
type SharedProfileState = {
  profile: FarmerProfile | null;
  loading: boolean;
  error: string | null;
  started: boolean;
};

const shared: SharedProfileState = {
  profile: null,
  loading: true,
  error: null,
  started: false,
};

const sharedListeners = new Set<() => void>();

function notifySharedProfile() {
  sharedListeners.forEach((fn) => fn());
}

function setSharedProfileState(partial: Partial<SharedProfileState>) {
  Object.assign(shared, partial);
  notifySharedProfile();
}

/** Call after logout / before a fresh login so Map refetches profile. */
export function resetFarmerProfileStore() {
  shared.profile = null;
  shared.loading = true;
  shared.error = null;
  shared.started = false;
  (globalThis as any).__cropeye_inflight_my_profile__ = null;
  notifySharedProfile();
}

async function loadFarmerMyProfile(
  getCached: (key: string, maxAge?: number) => any,
  setCached: (key: string, value: any) => void,
): Promise<void> {
  setSharedProfileState({ loading: true, error: null });

  try {
    const cached = getCached(PROFILE_CACHE_KEY, PROFILE_CACHE_MAX_AGE_MS);
    if (cached) {
      const normalizedCached = normalizeFarmerProfile(cached);
      if ((normalizedCached?.plots?.length || 0) > 0) {
        setSharedProfileState({
          profile: normalizedCached,
          loading: false,
          error: null,
        });
        return;
      }
    }

    const g = globalThis as any;
    if (!g[INFLIGHT_KEY]) {
      console.log('API CALLED: /farms/my-profile/ →', getBackendApiBaseUrl());
      g[INFLIGHT_KEY] = (async () => {
        try {
          const response = await getFarmerMyProfile();
          let normalized = normalizeFarmerProfile(response.data);

          if ((normalized?.plots?.length || 0) === 0) {
            console.warn(
              '⚠️ /farms/my-profile/ returned no plots — falling back to getFarmerProfile()',
            );
            try {
              const fallback = await getFarmerProfile();
              const normalizedFallback = normalizeFarmerProfile(fallback);
              if ((normalizedFallback?.plots?.length || 0) > 0) {
                normalized = normalizedFallback;
              }
            } catch (fallbackErr) {
              console.warn('⚠️ getFarmerProfile fallback failed', fallbackErr);
            }
          }
          return normalized;
        } finally {
          g[INFLIGHT_KEY] = null;
        }
      })();
    }

    const data = await g[INFLIGHT_KEY];
    if ((data?.plots?.length || 0) > 0) {
      setCached(PROFILE_CACHE_KEY, data);
    }

    setSharedProfileState({
      profile: data,
      loading: false,
      error:
        (data?.plots?.length || 0) > 0
          ? null
          : 'Farmer profile loaded but no plots linked. Add a plot or check /farms/my-profile/.',
    });
  } catch (err: any) {
    try {
      const fallback = await getFarmerProfile();
      const normalizedFallback = normalizeFarmerProfile(fallback);
      if ((normalizedFallback?.plots?.length || 0) > 0) {
        setCached(PROFILE_CACHE_KEY, normalizedFallback);
        setSharedProfileState({
          profile: normalizedFallback,
          loading: false,
          error: null,
        });
        return;
      }
    } catch {
      // ignore
    }

    const userRole = String(getUserRole() || '').toLowerCase();
    if (err.response?.status === 401 || err.response?.status === 403 || err.code === 'NO_AUTH_TOKEN') {
      setSharedProfileState({
        profile: null,
        loading: false,
        error:
          err.message ||
          (userRole === 'farmer'
            ? 'Session expired or missing token. Log in again at http://localhost:5174'
            : 'Log in again via gateway'),
      });
      return;
    }

    const isNetwork =
      !err.response ||
      err.code === 'ERR_NETWORK' ||
      String(err.message || '').toLowerCase().includes('network') ||
      String(err.message || '').toLowerCase().includes('timeout');

    setSharedProfileState({
      profile: null,
      loading: false,
      error: isNetwork
        ? `Cannot reach ${getBackendApiBaseUrl()} (profile). Weather APIs can still work. Re-login via gateway with Network Preserve log.`
        : err.message || 'Failed to fetch farmer profile',
    });
  }
}

export const useFarmerProfile = () => {
  const { getCached, setCached } = useAppContext();
  const [, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    sharedListeners.add(listener);
    return () => {
      sharedListeners.delete(listener);
    };
  }, []);

  const fetchProfile = async () => {
    setSharedProfileState({ loading: true, error: null });
    try {
      const data = await getFarmerProfile();
      setSharedProfileState({
        profile: normalizeFarmerProfile(data),
        loading: false,
        error: null,
      });
    } catch (err: any) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setSharedProfileState({
          profile: null,
          loading: false,
          error: 'Authentication required',
        });
      } else {
        setSharedProfileState({
          profile: null,
          loading: false,
          error: err.message || 'Failed to fetch farmer profile',
        });
      }
    }
  };

  const fetchMyProfile = async () => {
    shared.started = true;
    await loadFarmerMyProfile(getCached, setCached);
  };

  useEffect(() => {
    const tryLoad = () => {
      const token = getAuthToken();
      const userRole = String(getUserRole() || '').toLowerCase();
      if (token && isValidToken(token) && userRole === 'farmer') {
        if (!shared.started || !shared.profile) {
          shared.started = true;
          void loadFarmerMyProfile(getCached, setCached);
        }
        return true;
      }
      return false;
    };

    if (tryLoad()) return;

    // Role/token often arrive a tick after gateway redirect bootstrap
    setSharedProfileState({ loading: false, error: null, profile: null });
    const t1 = window.setTimeout(() => {
      if (!tryLoad() && !shared.profile) {
        const token = getAuthToken();
        if (token && isValidToken(token)) {
          // Farmer dashboard can mount before role key is written — still try
          shared.started = true;
          void loadFarmerMyProfile(getCached, setCached);
        }
      }
    }, 500);
    const t2 = window.setTimeout(() => tryLoad(), 1500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [getCached, setCached]);

  const profile = shared.profile;
  const loading = shared.loading;
  const error = shared.error;

  const getFarmerName = () => {
    if (!profile?.farmer_profile?.personal_info) return 'Farmer';
    const { first_name, last_name } = profile.farmer_profile.personal_info;
    return `${first_name} ${last_name}`.trim() || 'Farmer';
  };

  const getFarmerFullName = () => {
    if (!profile?.farmer_profile?.personal_info) return 'Farmer';
    return profile.farmer_profile.personal_info.full_name || getFarmerName();
  };

  const getPlotNames = () => {
    if (!profile?.plots?.length) {
      if (profile?.farms) {
        return profile.farms
          .map((farm: any) => resolveFarmerPlotId(farm) || farm.farm_uid || farm.id?.toString())
          .filter(Boolean);
      }
      return [];
    }
    return profile.plots.map((plot) => resolveFarmerPlotId(plot)).filter(Boolean);
  };

  const getPlotById = (plotId: string) => {
    if (!profile?.plots) return null;
    return profile.plots.find(
      (plot) => resolveFarmerPlotId(plot) === String(plotId),
    );
  };

  const getFarmerEmail = () => {
    return profile?.farmer_profile?.email || '';
  };

  const getFarmerPhone = () => {
    return profile?.farmer_profile?.personal_info?.phone_number || '';
  };

  const getTotalPlots = () => {
    return (
      profile?.agricultural_summary?.total_plots ||
      profile?.plots?.length ||
      0
    );
  };

  const getTotalFarms = () => {
    return profile?.agricultural_summary?.total_farms || 0;
  };

  const getTotalFarmArea = () => {
    return profile?.agricultural_summary?.total_farm_area || 0;
  };

  return {
    profile,
    loading,
    error,
    refreshProfile: fetchProfile,
    refreshMyProfile: fetchMyProfile,
    getFarmerName,
    getFarmerFullName,
    getPlotNames,
    getPlotById,
    getFarmerEmail,
    getFarmerPhone,
    getTotalPlots,
    getTotalFarms,
    getTotalFarmArea,
  };
};
