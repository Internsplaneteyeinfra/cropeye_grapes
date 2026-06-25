/**
 * Centralized service base URLs — live Railway endpoints.
 * Env overrides (VITE_*) still win when set.
 */
const GRAPES_EVENTS_PROD =
  "https://cropeye-grapes-events-production.up.railway.app";

const GRAPES_MAIN_PROD =
  "https://cropeye-grapes-main-production.up.railway.app";

const GRAPES_ADMIN_PROD =
  "https://cropeye-grapes-admin-production.up.railway.app";

const GRAPES_SEF_PROD =
  "https://cropeye-grapes-sef-production.up.railway.app";

const BACKEND_API_PROD = "https://cropeye-backendd.up.railway.app/api";

const WEATHER_PROD = "https://weather-cropeye.up.railway.app";

const FORECAST_WEATHER_PROD =
  "https://currentforecast-production.up.railway.app";

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getEventsBaseUrl(): string {
  const prodOverride = (import.meta.env.VITE_GRAPES_EVENTS_BASE_URL as string | undefined)?.trim();
  if (prodOverride && prodOverride.length > 0) return stripTrailingSlashes(prodOverride);

  const devUrl = (import.meta.env.VITE_DEV_EVENTS_API_URL as string | undefined)?.trim();
  if (devUrl && devUrl.length > 0) return stripTrailingSlashes(devUrl);

  // Vite dev server proxies /api/events → grapes-events (avoids CORS + long direct hangs).
  if (import.meta.env.DEV) {
    return "/api/events";
  }

  return stripTrailingSlashes(GRAPES_EVENTS_PROD);
}

export function getGrapesMainBaseUrl(): string {
  const override = (import.meta.env.VITE_GRAPES_MAIN_BASE_URL as string | undefined)?.trim();
  if (override && override.length > 0) return stripTrailingSlashes(override);
  const dev = (import.meta.env.VITE_DEV_GRAPES_MAIN_URL as string | undefined)?.trim();
  if (dev && dev.length > 0) return stripTrailingSlashes(dev);
  if (import.meta.env.DEV) {
    return "/api/grapes-main";
  }
  return stripTrailingSlashes(GRAPES_MAIN_PROD);
}

export function getGrapesAdminBaseUrl(): string {
  const override = (import.meta.env.VITE_GRAPES_ADMIN_BASE_URL as string | undefined)?.trim();
  if (override && override.length > 0) return stripTrailingSlashes(override);
  const dev = (import.meta.env.VITE_DEV_GRAPES_ADMIN_URL as string | undefined)?.trim();
  if (dev && dev.length > 0) return stripTrailingSlashes(dev);
  return stripTrailingSlashes(GRAPES_ADMIN_PROD);
}

export function getGrapesSefBaseUrl(): string {
  const override = (import.meta.env.VITE_GRAPES_SEF_BASE_URL as string | undefined)?.trim();
  if (override && override.length > 0) return stripTrailingSlashes(override);
  const dev = (import.meta.env.VITE_DEV_GRAPES_SEF_URL as string | undefined)?.trim();
  if (dev && dev.length > 0) return stripTrailingSlashes(dev);
  return stripTrailingSlashes(GRAPES_SEF_PROD);
}

/** Backend REST API (`/api/...` on cropeye-backendd). */
export function getBackendApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (raw && raw.length > 0) {
    const withoutTrailing = stripTrailingSlashes(raw);
    return /\/api$/i.test(withoutTrailing) ? withoutTrailing : `${withoutTrailing}/api`;
  }
  return stripTrailingSlashes(BACKEND_API_PROD);
}

export function getNotificationsBaseUrl(): string {
  const override = (import.meta.env.VITE_NOTIFICATIONS_BASE_URL as string | undefined)?.trim();
  if (override && override.length > 0) return stripTrailingSlashes(override);
  return getBackendApiBaseUrl();
}

export function getWeatherBaseUrl(): string {
  const override = (import.meta.env.VITE_WEATHER_API_BASE_URL as string | undefined)?.trim();
  if (override && override.length > 0) return stripTrailingSlashes(override);
  return stripTrailingSlashes(WEATHER_PROD);
}

export function getForecastWeatherBaseUrl(): string {
  const override = (import.meta.env.VITE_FORECAST_WEATHER_API_BASE_URL as string | undefined)?.trim();
  if (override && override.length > 0) return stripTrailingSlashes(override);
  return stripTrailingSlashes(FORECAST_WEATHER_PROD);
}
