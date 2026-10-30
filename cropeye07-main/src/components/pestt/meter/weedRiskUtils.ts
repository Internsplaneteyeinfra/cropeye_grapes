import { weedsData } from './Weeds';

type WeedType = (typeof weedsData)[number];

export type WeedRiskLevel = 'High' | 'Moderate' | 'Low';

export interface WeedRiskBuckets {
  high: WeedType[];
  moderate: WeedType[];
  low: WeedType[];
}

const normalizeMonth = (month?: string): string =>
  typeof month === 'string' ? month.trim().toLowerCase() : '';

export const getCurrentMonthLower = (): string =>
  new Date().toLocaleString('en-US', { month: 'long' }).toLowerCase();

const matchesCurrentMonth = (weed: WeedType, currentMonthLower: string): boolean => {
  if (!Array.isArray(weed.months) || weed.months.length === 0) {
    return false;
  }
  return weed.months.some((month: string) => normalizeMonth(month) === currentMonthLower);
};

export const categorizeWeedsBySeason = (
  weeds: WeedType[] = weedsData,
  currentMonthLower: string = getCurrentMonthLower()
): WeedRiskBuckets => {
  const seasonalWeeds = weeds.filter((weed) => matchesCurrentMonth(weed, currentMonthLower));

  if (seasonalWeeds.length > 0) {
    const remaining = weeds.filter((weed) => !seasonalWeeds.includes(weed));
    const moderate = remaining.slice(0, Math.min(1, remaining.length));
    const low = remaining.slice(moderate.length);
    return {
      high: seasonalWeeds,
      moderate,
      low,
    };
  }

  return {
    high: weeds.slice(0, Math.min(2, weeds.length)),
    moderate: weeds.slice(2, Math.min(3, weeds.length)),
    low: weeds.slice(3),
  };
};

export const buildWeedRiskLevelMap = (buckets: WeedRiskBuckets): Map<string, WeedRiskLevel> => {
  const map = new Map<string, WeedRiskLevel>();
  buckets.high.forEach((weed) => map.set(weed.name, 'High'));
  buckets.moderate.forEach((weed) => map.set(weed.name, 'Moderate'));
  buckets.low.forEach((weed) => map.set(weed.name, 'Low'));
  return map;
};
