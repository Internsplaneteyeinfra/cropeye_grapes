import { getGrapesAdminBaseUrl } from "./serviceUrls";

export interface GrapesScheduleRow {
  isoDate: string;
  date: string;
  days: string;
  stage: string;
  scheduleType: string;
  issue: string;
  nutrient: string;
  recommendation: string;
  organic: string;
}

const SCHEDULE_ARRAY_KEYS = [
  "next_7_days",
  "next7_days",
  "next7Days",
  "next_seven_days",
  "schedule",
  "full_schedule",
  "schedule_days",
  "all_days",
  "days",
  "fertilizer_schedule",
  "upcoming_days",
  "daily_schedule",
] as const;

function looksLikeScheduleRow(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const o = item as Record<string, unknown>;
  return (
    "date" in o ||
    "schedule_date" in o ||
    "day" in o ||
    "issue" in o ||
    "nutrient" in o ||
    "recommendation" in o
  );
}

function scheduleItemKey(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);
  const o = item as Record<string, unknown>;
  const date = o.date ?? o.schedule_date;
  const day = o.day ?? o.days ?? o.day_number;
  return `${date ?? ""}_${day ?? ""}`;
}

function collectScheduleArraysFromObject(o: Record<string, unknown>): unknown[][] {
  const arrays: unknown[][] = [];
  const seenKeys = new Set<string>();

  for (const k of SCHEDULE_ARRAY_KEYS) {
    const v = o[k];
    if (Array.isArray(v) && v.length > 0) {
      arrays.push(v);
      seenKeys.add(k);
    }
  }

  for (const [k, v] of Object.entries(o)) {
    if (seenKeys.has(k) || !Array.isArray(v) || v.length === 0) continue;
    if (looksLikeScheduleRow(v[0])) arrays.push(v);
  }

  return arrays;
}

function mergeScheduleDayArrays(arrays: unknown[][]): unknown[] {
  const seen = new Set<string>();
  const merged: unknown[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      const key = scheduleItemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  merged.sort((a, b) => {
    const da = String((a as Record<string, unknown>)?.date ?? "");
    const db = String((b as Record<string, unknown>)?.date ?? "");
    return da.localeCompare(db);
  });
  return merged;
}

export function extractScheduleDaysArray(raw: unknown): unknown[] | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "object") return undefined;

  const o = raw as Record<string, unknown>;
  const arrays = collectScheduleArraysFromObject(o);

  if (o.data && typeof o.data === "object" && !Array.isArray(o.data)) {
    arrays.push(...collectScheduleArraysFromObject(o.data as Record<string, unknown>));
  }

  if (o.today && typeof o.today === "object" && !Array.isArray(o.today)) {
    if (looksLikeScheduleRow(o.today)) arrays.push([o.today]);
  }

  if (arrays.length > 0) return mergeScheduleDayArrays(arrays);

  for (const k of SCHEDULE_ARRAY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(o, k) && o[k] === null) return [];
  }

  return undefined;
}

export function formatScheduleDateDisplay(dateStr: string): string {
  const raw = dateStr?.trim();
  if (!raw) return "";

  const iso = raw.split("T")[0];
  const isoMatch = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    );
    if (!Number.isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = d.toLocaleDateString("en-GB", { month: "short" });
      return `${day}-${month}`;
    }
  }

  return raw;
}

function capitalizeLabel(v: string): string {
  const t = v.trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function mapGrapesScheduleApiRow(item: Record<string, unknown>): GrapesScheduleRow {
  const str = (v: unknown) => (v == null ? "" : String(v).trim());
  const rawDate = str(item.date ?? item.schedule_date);
  const isoDate = rawDate.split("T")[0];
  const dayVal = item.day ?? item.day_number;

  return {
    isoDate,
    date: formatScheduleDateDisplay(isoDate || rawDate),
    days: dayVal != null && dayVal !== "" ? String(dayVal) : "",
    stage: str(item.stage),
    scheduleType: capitalizeLabel(str(item.type)),
    issue: str(item.issue),
    nutrient: str(item.nutrient),
    recommendation: str(item.recommendation),
    organic: str(item.organic),
  };
}

export function isGrapesScheduleV2Rows(parsed: unknown, next: unknown[]): boolean {
  if (parsed && typeof parsed === "object" && "today" in (parsed as object)) {
    return true;
  }
  const first = next[0];
  if (first && typeof first === "object") {
    const o = first as Record<string, unknown>;
    if (typeof o.type === "string" && ("day" in o || "nutrient" in o)) {
      return true;
    }
  }
  return false;
}

export function mapScheduleItemsToRows(items: unknown[], useV2: boolean): GrapesScheduleRow[] {
  if (!Array.isArray(items)) return [];
  if (!useV2) {
    return items.map((raw) => {
      const item = raw as Record<string, unknown>;
      const str = (v: unknown) => (v == null ? "" : String(v).trim());
      const rawDate = str(item.date ?? item.schedule_date);
      const isoDate = rawDate.split("T")[0];
      const dayNum = item.days ?? item.day_number ?? item.days_since_planting ?? item.day;
      return {
        isoDate,
        date: formatScheduleDateDisplay(isoDate || rawDate),
        days: dayNum != null && dayNum !== "" ? String(dayNum) : "",
        stage: str(item.stage ?? item.crop_stage ?? item.stage_name),
        scheduleType: "",
        issue: "",
        nutrient: "",
        recommendation: "",
        organic: Array.isArray(item.organic_inputs)
          ? (item.organic_inputs as unknown[]).map(String).join(", ")
          : str(item.organic),
      };
    });
  }
  return items.map((raw) => mapGrapesScheduleApiRow(raw as Record<string, unknown>));
}

function findPlotInProfile(profile: any, plotToUse: string) {
  if (!profile?.plots?.length) return null;

  let selectedPlot = profile.plots.find(
    (p: any) => p.fastapi_plot_id === plotToUse
  );

  if (!selectedPlot) {
    selectedPlot = profile.plots.find((p: any) => {
      const plotId = p.fastapi_plot_id || `${p.gat_number}_${p.plot_number}`;
      return plotId === plotToUse;
    });
  }

  return selectedPlot ?? null;
}

export function collectSchedulePlotIds(profile: any, plotToUse: string): string[] {
  const ids = new Set<string>();
  if (plotToUse?.trim()) ids.add(plotToUse.trim());

  const plot = findPlotInProfile(profile, plotToUse);
  if (plot) {
    if (plot.fastapi_plot_id) ids.add(String(plot.fastapi_plot_id));
    if (plot.gat_number && plot.plot_number) {
      ids.add(`${plot.gat_number}_${plot.plot_number}`);
    }
    if (typeof plot.plot_name === "string" && plot.plot_name.trim()) {
      ids.add(plot.plot_name.trim());
    }
  }

  return [...ids];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchGrapesScheduleRows(
  profile: any,
  plotToUse: string,
  getCached: (key: string) => unknown,
  setCached: (key: string, value: unknown) => void,
  isCancelled?: () => boolean
): Promise<GrapesScheduleRow[]> {
  const scheduleCacheKey = `grapesSchedule_${String(plotToUse)}`;
  const cachedSchedule = getCached(scheduleCacheKey);
  if (cachedSchedule != null) {
    const next = extractScheduleDaysArray(cachedSchedule);
    if (next !== undefined) {
      const v2 = isGrapesScheduleV2Rows(cachedSchedule, next);
      return mapScheduleItemsToRows(next, v2);
    }
  }

  const base = getGrapesAdminBaseUrl().replace(/\/+$/, "");
  const schedulePlotIds = collectSchedulePlotIds(profile, String(plotToUse));
  const scheduleTimeoutMs = 120000;

  const tryFetch = async (): Promise<GrapesScheduleRow[] | null> => {
    for (const schedulePlotId of schedulePlotIds) {
      if (isCancelled?.()) return null;

      const url = `${base}/grapes-schedule/${encodeURIComponent(schedulePlotId)}`;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), scheduleTimeoutMs);

      let res: Response;
      try {
        res = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
      } catch {
        continue;
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (isCancelled?.()) return null;
      if (!res.ok) continue;

      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch {
        continue;
      }

      const next = extractScheduleDaysArray(parsed);
      if (next === undefined) continue;

      setCached(`grapesSchedule_${schedulePlotId}`, parsed);
      setCached(scheduleCacheKey, parsed);

      const v2 = isGrapesScheduleV2Rows(parsed, next);
      return mapScheduleItemsToRows(next, v2);
    }
    return null;
  };

  let rows = await tryFetch();
  if (!rows && !isCancelled?.()) {
    await sleep(2000);
    rows = await tryFetch();
  }

  return rows ?? [];
}
