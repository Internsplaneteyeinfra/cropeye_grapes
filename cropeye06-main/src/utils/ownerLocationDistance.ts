/**
 * Court / storage location → plot distance for Owner Dashboard.
 * Storage pin is saved locally; plot coords come from portfolio boundaries.
 */

export type LatLngPoint = {
  lat: number;
  lng: number;
  label?: string;
};

export type OwnerStorageLocation = {
  storage: LatLngPoint | null;
  updatedAt: string;
};

export type RouteDistanceResult = {
  /** Road or straight-line distance in km */
  distanceKm: number;
  /** Drive duration in minutes when road routing succeeds */
  durationMin: number | null;
  mode: "road" | "straight";
  /** GeoJSON LineString coordinates [lng, lat][] when available */
  geometry: [number, number][] | null;
};

export const OWNER_STORAGE_LOCATION_KEY = "cropeye_owner_storage_location_v1";
/** Legacy key from earlier company↔storage draft — still read once for migration. */
const LEGACY_ROUTE_KEY = "cropeye_owner_route_locations_v1";

const EARTH_KM = 6371;

export function haversineKm(a: LatLngPoint, b: LatLngPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isPoint(v: unknown): v is LatLngPoint {
  if (!v || typeof v !== "object") return false;
  const p = v as LatLngPoint;
  return Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

export function loadOwnerStorageLocation(): OwnerStorageLocation {
  try {
    const raw = localStorage.getItem(OWNER_STORAGE_LOCATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OwnerStorageLocation;
      return {
        storage: isPoint(parsed?.storage) ? parsed.storage : null,
        updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : "",
      };
    }
    // Migrate from legacy company/storage shape if present
    const legacy = localStorage.getItem(LEGACY_ROUTE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { storage?: unknown; updatedAt?: string };
      if (isPoint(parsed?.storage)) {
        const migrated = saveOwnerStorageLocation(parsed.storage);
        return migrated;
      }
    }
  } catch {
    /* ignore */
  }
  return { storage: null, updatedAt: "" };
}

export function saveOwnerStorageLocation(
  storage: LatLngPoint | null,
): OwnerStorageLocation {
  const next: OwnerStorageLocation = {
    storage,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(OWNER_STORAGE_LOCATION_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

/**
 * Prefer OSRM driving route (court/storage → plot); fall back to Haversine.
 */
export async function fetchRouteDistance(
  from: LatLngPoint,
  to: LatLngPoint,
  signal?: AbortSignal,
): Promise<RouteDistanceResult> {
  const straight = haversineKm(from, to);
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    const route = data?.routes?.[0];
    const meters = Number(route?.distance);
    const seconds = Number(route?.duration);
    if (!Number.isFinite(meters) || meters < 0) throw new Error("No route");
    const coords = Array.isArray(route?.geometry?.coordinates)
      ? (route.geometry.coordinates as [number, number][])
      : null;
    return {
      distanceKm: meters / 1000,
      durationMin: Number.isFinite(seconds) ? seconds / 60 : null,
      mode: "road",
      geometry: coords,
    };
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return {
      distanceKm: straight,
      durationMin: null,
      mode: "straight",
      geometry: null,
    };
  }
}

export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 2 : 1)} km`;
}

export function formatDurationMin(min: number | null): string {
  if (min == null || !Number.isFinite(min)) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}
