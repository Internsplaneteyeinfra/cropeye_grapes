import { getGrapesAdminBaseUrl } from "../utils/serviceUrls";

export interface TimelineBucket {
  growth_dates?: string[];
  water_uptake_dates?: string[];
  soil_moisture_dates?: string[];
  pest_detection_dates?: string[];
}

export interface AnalysisTimelineResponse {
  plot_name?: string;
  timeline: TimelineBucket[];
}

export type MapAnalysisLayer = "Growth" | "Water Uptake" | "Soil Moisture" | "PEST" | "Brix";

const TIMELINE_PATH = "/analysis_timeline";
const IMAGE_DATES_PATH = "/image-dates";
const LAYER_TO_KEY: Record<MapAnalysisLayer, keyof TimelineBucket> = {
  Growth: "growth_dates",
  "Water Uptake": "water_uptake_dates",
  "Soil Moisture": "soil_moisture_dates",
  PEST: "pest_detection_dates",
  Brix: "growth_dates",
};

function getAnalysisTimelineBaseUrl(): string {
  const configuredUrl = (import.meta.env.VITE_ANALYSIS_TIMELINE_BASE_URL as string | undefined)?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");
  if (import.meta.env.DEV) return "/api/analysis-timeline";
  return "https://cropeye-database-production.up.railway.app";
}

export async function fetchAnalysisTimeline(
  plotName: string,
  signal?: AbortSignal,
): Promise<AnalysisTimelineResponse> {
  const trimmedPlotName = plotName.trim();
  if (!trimmedPlotName) throw new Error("A plot must be selected before loading dates.");

  const query = `?plot_name=${encodeURIComponent(trimmedPlotName)}`;
  const errors: string[] = [];
  const sources = [
    {
      name: "image-dates",
      url: `${getGrapesAdminBaseUrl().replace(/\/+$/, "")}${IMAGE_DATES_PATH}${query}`,
      parse: normalizeImageDatesPayload,
    },
    {
      name: "analysis timeline",
      url: `${getAnalysisTimelineBaseUrl()}${TIMELINE_PATH}${query}`,
      parse: normalizeTimelinePayload,
    },
  ];

  for (const source of sources) {
    try {
      const response = await fetch(source.url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error("response was not JSON");
      }

      const data: unknown = await response.json();
      const timeline = source.parse(data);
      if (timeline && hasTimelineDates(timeline)) {
        return timeline;
      }
      errors.push(`${source.name} returned no dates`);
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push(
        `${source.name}: ${error instanceof Error ? error.message : "request failed"}`,
      );
    }
  }

  throw new Error(errors.join("; "));
}

function normalizeTimelinePayload(data: unknown): AnalysisTimelineResponse | null {
  if (!data || typeof data !== "object") return null;
  const timeline = (data as { timeline?: unknown }).timeline;
  return Array.isArray(timeline)
    ? { timeline: timeline as TimelineBucket[] }
    : null;
}

function normalizeImageDatesPayload(data: unknown): AnalysisTimelineResponse | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  const dateList = (layer: unknown): string[] => {
    if (Array.isArray(layer)) return layer.filter((date): date is string => typeof date === "string");
    if (!layer || typeof layer !== "object") return [];
    const dates = (layer as { dates?: unknown }).dates;
    return Array.isArray(dates)
      ? dates.filter((date): date is string => typeof date === "string")
      : [];
  };

  return {
    plot_name: typeof payload.plot_name === "string" ? payload.plot_name : undefined,
    timeline: [
      {
        growth_dates: dateList(payload.growth ?? payload.growth_dates),
        water_uptake_dates: dateList(payload.water_uptake ?? payload.water_uptake_dates),
        soil_moisture_dates: dateList(payload.soil_moisture ?? payload.soil_moisture_dates),
        pest_detection_dates: dateList(payload.pest_detection ?? payload.pest_detection_dates),
      },
    ],
  };
}

function hasTimelineDates(timeline: AnalysisTimelineResponse): boolean {
  return timeline.timeline.some((bucket) =>
    Object.values(bucket).some((dates) => Array.isArray(dates) && dates.length > 0),
  );
}

function collectDates(
  timeline: TimelineBucket[] | undefined,
  layer: MapAnalysisLayer,
): Set<string> {
  const dates = new Set<string>();
  const key = LAYER_TO_KEY[layer];
  for (const bucket of timeline ?? []) {
    const layerDates = bucket[key];
    if (!Array.isArray(layerDates)) continue;
    for (const rawDate of layerDates) {
      if (typeof rawDate !== "string") continue;
      const date = rawDate.split("T", 1)[0].trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date);
    }
  }
  return dates;
}

export function sortedRebinDatesForLayer(
  timeline: TimelineBucket[] | undefined,
  layer: MapAnalysisLayer,
): string[] {
  return [...collectDates(timeline, layer)].sort();
}
