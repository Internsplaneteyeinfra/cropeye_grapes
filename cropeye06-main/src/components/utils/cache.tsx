const CACHE_STORE_KEY = "__cropeyeSessionCache__";

function getCacheStore() {
  const globalScope = globalThis as typeof globalThis & {
    [CACHE_STORE_KEY]?: Record<string, { data: any; timestamp: number }>;
  };

  if (!globalScope[CACHE_STORE_KEY]) {
    globalScope[CACHE_STORE_KEY] = {};
  }

  return globalScope[CACHE_STORE_KEY]!;
}

export function setCache(key, data) {
  const store = getCacheStore();
  store[key] = {
    data,
    timestamp: Date.now(),
  };
}

export function getCache(key, maxAgeMs = 10 * 60 * 1000) {
  const store = getCacheStore();
  const payload = store[key];
  if (!payload) return null;

  if (Date.now() - payload.timestamp > maxAgeMs) {
    delete store[key];
    return null;
  }

  return payload.data;
}

export function removeCache(key) {
  const store = getCacheStore();
  delete store[key];
}

export function clearAllCache() {
  const globalScope = globalThis as typeof globalThis & {
    [CACHE_STORE_KEY]?: Record<string, { data: any; timestamp: number }>;
  };
  globalScope[CACHE_STORE_KEY] = {};
}

/** Map layer cache: no TTL in dev (see API updates immediately), 30 min in production. */
export function mapLayerCacheMaxAgeMs(): number {
  return import.meta.env.DEV ? 0 : 30 * 60 * 1000;
}

export function shouldBypassMapLayerCache(): boolean {
  return import.meta.env.DEV;
}

const MAP_LAYER_KEY_PREFIXES = [
  "growth_",
  "wateruptake_",
  "soilmoisture_",
  "pest_",
  "canopy_vigour_",
  "brix_",
  "brixQuality_",
  "harvest_",
] as const;

/** Drop cached map tiles for one plot (all layers/dates) or entire session store. */
export function clearMapLayerCache(plotName?: string) {
  const store = getCacheStore();
  if (!plotName) {
    clearAllCache();
    return;
  }
  const needle = String(plotName);
  for (const key of Object.keys(store)) {
    if (MAP_LAYER_KEY_PREFIXES.some((p) => key.startsWith(p)) && key.includes(needle)) {
      delete store[key];
    }
  }
}
