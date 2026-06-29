/**
 * Centralized service base URLs.
 *
 * Production (Render/nginx): same-origin `/api/*` proxy paths.
 * Local dev (default): direct Railway production URLs (visible in Network tab).
 * Set VITE_USE_API_PROXY=true in `.env` to use localhost:3001 `/api/*` proxy instead.
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

/** Same-origin paths proxied by Vite (dev) and nginx (Render). */
const PROXY = {
  events: "/api/events",
  grapesMain: "/api/grapes-main",
  grapesAdmin: "/api/dev-plot",
  grapesSef: "/api/field-analysis",
  backend: "/api/backend",
  weather: "/api/weather",
  forecastWeather: "/api/forecast-weather",
} as const;

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

function useDevApiProxy(): boolean {
  return (
    import.meta.env.DEV &&
    (import.meta.env.VITE_USE_API_PROXY as string | undefined)?.trim() === "true"
  );
}

/** Dev default: direct Railway URL. Opt-in proxy via VITE_USE_API_PROXY=true. */
function devServiceUrl(proxyPath: string, directUrl: string): string {
  return useDevApiProxy() ? proxyPath : directUrl;
}

/** Never use localhost or dev-only env URLs in production builds. */
function resolveDevOnlyUrl(
  envValue: string | undefined,
  fallback: string
): string {
  const trimmed = envValue?.trim();
  if (!trimmed) return fallback;
  if (!import.meta.env.DEV && isLocalhostUrl(trimmed)) return fallback;
  return stripTrailingSlashes(trimmed);
}

export function getEventsBaseUrl(): string {
  const override = (
    import.meta.env.VITE_GRAPES_EVENTS_BASE_URL as string | undefined
  )?.trim();
  if (override && override.length > 0) {
    if (!import.meta.env.DEV && isLocalhostUrl(override)) return PROXY.events;
    return stripTrailingSlashes(override);
  }

  if (import.meta.env.DEV) {
    return resolveDevOnlyUrl(
      import.meta.env.VITE_DEV_EVENTS_API_URL as string | undefined,
      devServiceUrl(PROXY.events, GRAPES_EVENTS_PROD)
    );
  }

  return PROXY.events;
}

export function getGrapesMainBaseUrl(): string {
  const override = (
    import.meta.env.VITE_GRAPES_MAIN_BASE_URL as string | undefined
  )?.trim();
  if (override && override.length > 0) {
    if (!import.meta.env.DEV && isLocalhostUrl(override)) return PROXY.grapesMain;
    return stripTrailingSlashes(override);
  }

  if (import.meta.env.DEV) {
    return resolveDevOnlyUrl(
      import.meta.env.VITE_DEV_GRAPES_MAIN_URL as string | undefined,
      devServiceUrl(PROXY.grapesMain, GRAPES_MAIN_PROD)
    );
  }

  return PROXY.grapesMain;
}

export function getGrapesAdminBaseUrl(): string {
  const override = (
    import.meta.env.VITE_GRAPES_ADMIN_BASE_URL as string | undefined
  )?.trim();
  if (override && override.length > 0) {
    if (!import.meta.env.DEV && isLocalhostUrl(override)) return PROXY.grapesAdmin;
    return stripTrailingSlashes(override);
  }

  if (import.meta.env.DEV) {
    return resolveDevOnlyUrl(
      import.meta.env.VITE_DEV_GRAPES_ADMIN_URL as string | undefined,
      devServiceUrl(PROXY.grapesAdmin, GRAPES_ADMIN_PROD)
    );
  }

  return PROXY.grapesAdmin;
}

export function getGrapesSefBaseUrl(): string {
  const override = (
    import.meta.env.VITE_GRAPES_SEF_BASE_URL as string | undefined
  )?.trim();
  if (override && override.length > 0) {
    if (!import.meta.env.DEV && isLocalhostUrl(override)) return PROXY.grapesSef;
    return stripTrailingSlashes(override);
  }

  if (import.meta.env.DEV) {
    return resolveDevOnlyUrl(
      import.meta.env.VITE_DEV_GRAPES_SEF_URL as string | undefined,
      devServiceUrl(PROXY.grapesSef, GRAPES_SEF_PROD)
    );
  }

  return PROXY.grapesSef;
}

/** Backend REST API (`/api/...` on cropeye-backendd). */
export function getBackendApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (raw && raw.length > 0) {
    if (!import.meta.env.DEV && isLocalhostUrl(raw)) return PROXY.backend;
    const withoutTrailing = stripTrailingSlashes(raw);
    return /\/api$/i.test(withoutTrailing)
      ? withoutTrailing
      : `${withoutTrailing}/api`;
  }

  if (import.meta.env.DEV) {
    return devServiceUrl(PROXY.backend, BACKEND_API_PROD);
  }

  return PROXY.backend;
}

export function getNotificationsBaseUrl(): string {
  const override = (
    import.meta.env.VITE_NOTIFICATIONS_BASE_URL as string | undefined
  )?.trim();
  if (override && override.length > 0) {
    if (!import.meta.env.DEV && isLocalhostUrl(override)) {
      return getBackendApiBaseUrl();
    }
    return stripTrailingSlashes(override);
  }
  return getBackendApiBaseUrl();
}

export function getWeatherBaseUrl(): string {
  const override = (
    import.meta.env.VITE_WEATHER_API_BASE_URL as string | undefined
  )?.trim();
  if (override && override.length > 0) {
    if (!import.meta.env.DEV && isLocalhostUrl(override)) {
      return stripTrailingSlashes(WEATHER_PROD);
    }
    return stripTrailingSlashes(override);
  }
  if (import.meta.env.DEV) {
    return devServiceUrl(PROXY.weather, WEATHER_PROD);
  }
  return PROXY.weather;
}

export function getForecastWeatherBaseUrl(): string {
  const override = (
    import.meta.env.VITE_FORECAST_WEATHER_API_BASE_URL as string | undefined
  )?.trim();
  if (override && override.length > 0) {
    if (!import.meta.env.DEV && isLocalhostUrl(override)) {
      return stripTrailingSlashes(FORECAST_WEATHER_PROD);
    }
    return stripTrailingSlashes(override);
  }
  if (import.meta.env.DEV) {
    return devServiceUrl(PROXY.forecastWeather, FORECAST_WEATHER_PROD);
  }
  return PROXY.forecastWeather;
}

/** Direct Railway URLs — only when explicitly needed (e.g. server-side scripts). */
export const directServiceUrls = {
  events: GRAPES_EVENTS_PROD,
  grapesMain: GRAPES_MAIN_PROD,
  grapesAdmin: GRAPES_ADMIN_PROD,
  grapesSef: GRAPES_SEF_PROD,
  backendApi: BACKEND_API_PROD,
  weather: WEATHER_PROD,
  forecastWeather: FORECAST_WEATHER_PROD,
} as const;
