export function getCache(key: string, maxAgeMs?: number): any;
export function setCache(key: string, value: any): void;
export function removeCache(key: string): void;
export function clearAllCache(): void;
export function mapLayerCacheMaxAgeMs(): number;
export function shouldBypassMapLayerCache(): boolean;
export function clearMapLayerCache(plotName?: string): void;
