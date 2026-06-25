import React, { useState, useEffect, useRef } from "react";
import { AlertCircle, Beaker, Check, Leaf, Pencil, Sprout, X } from "lucide-react";
import { useFarmerProfile } from "../hooks/useFarmerProfile";
import { useAppContext } from "../context/AppContext";
import { patchFarm } from "../api";
import { getGrapesAdminBaseUrl } from "../utils/serviceUrls";
import { normalizeScheduleText } from "../utils/grapesSchedule";
import budData from "./bud.json";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface FertilizerEntry {
  date: string;
  stage: string;
  days: string;
  N_kg_acre: string;
  P_kg_acre: string;
  K_kg_acre: string;
  fertilizers?: {
    Urea_N_kg_per_acre: number;
    SuperPhosphate_P_kg_per_acre: number;
    Potash_K_kg_per_acre: number;
  };
  organic_inputs?: string[];
  /** Grapes admin JSON schedule (issue / nutrient / recommendation / organic / type) */
  issue?: string;
  recommendation?: string;
  organicDetail?: string;
  nutrient?: string;
  scheduleType?: string;
}

type GrapesScheduleMeta = {
  plot?: string;
  foundation_pruning_date?: string;
  fruit_pruning_date?: string;
  today?: Record<string, unknown>;
};

function isGrapesScheduleV2Rows(parsed: unknown, next: unknown[]): boolean {
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

function extractGrapesScheduleMeta(parsed: unknown): GrapesScheduleMeta | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  const today =
    p.today && typeof p.today === "object" && !Array.isArray(p.today)
      ? (p.today as Record<string, unknown>)
      : undefined;
  const hasMeta =
    str(p.plot) ||
    str(p.foundation_pruning_date) ||
    str(p.fruit_pruning_date) ||
    today;
  if (!hasMeta) return null;
  return {
    plot: str(p.plot),
    foundation_pruning_date: str(p.foundation_pruning_date),
    fruit_pruning_date: str(p.fruit_pruning_date),
    today,
  };
}

/** Collect every schedule row array from admin API JSON (not only next_7_days). */
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

function scheduleItemKey(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);
  const o = item as Record<string, unknown>;
  const date = o.date ?? o.schedule_date;
  const day = o.day ?? o.days ?? o.day_number;
  return `${date ?? ""}_${day ?? ""}`;
}

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

function extractScheduleDaysArray(raw: unknown): unknown[] | undefined {
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

  if (arrays.length > 0) {
    return mergeScheduleDayArrays(arrays);
  }

  for (const k of SCHEDULE_ARRAY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(o, k) && o[k] === null) return [];
  }

  return undefined;
}

function scheduleCellText(v: string | undefined | null): string {
  const t = normalizeScheduleText(v?.trim() ?? "");
  return t ? t : "—";
}

/** Excel-style date: 11-Jun */
function formatScheduleDateDisplay(dateStr: string): string {
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

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const d = new Date(
      Number(slashMatch[3]),
      Number(slashMatch[2]) - 1,
      Number(slashMatch[1])
    );
    if (!Number.isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = d.toLocaleDateString("en-GB", { month: "short" });
      return `${day}-${month}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, "0");
    const month = parsed.toLocaleDateString("en-GB", { month: "short" });
    return `${day}-${month}`;
  }

  return raw;
}

function capitalizeLabel(v: string): string {
  const t = v.trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Map grapes-schedule API row → table columns (1:1 with API fields) */
function mapGrapesScheduleApiRow(item: Record<string, unknown>): FertilizerEntry {
  const str = (v: unknown) => (v == null ? "" : String(v).trim());
  const dayVal = item.day ?? item.day_number;
  return {
    date: formatScheduleDateDisplay(str(item.date)),
    days: dayVal != null && dayVal !== "" ? String(dayVal) : "",
    stage: str(item.stage),
    scheduleType: capitalizeLabel(str(item.type)),
    issue: normalizeScheduleText(str(item.issue)),
    nutrient: normalizeScheduleText(str(item.nutrient)),
    recommendation: normalizeScheduleText(str(item.recommendation)),
    organicDetail: normalizeScheduleText(str(item.organic)),
    N_kg_acre: "",
    P_kg_acre: "",
    K_kg_acre: "",
  };
}

function ScheduleTableCell({
  value,
  clampLines = 2,
}: {
  value: string | undefined | null;
  clampLines?: number;
}) {
  const text = scheduleCellText(value);
  const [open, setOpen] = useState(false);
  const isLong = text !== "—" && text.length > 60;

  if (text === "—") {
    return <span className="text-gray-400 text-sm">—</span>;
  }

  return (
    <div className="min-w-0">
      <p
        className={`text-sm text-gray-800 leading-relaxed break-words ${
          open ? "" : clampLines === 2 ? "line-clamp-2" : "line-clamp-3"
        }`}
        title={!open ? text : undefined}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          className="mt-0.5 text-green-700 font-medium text-xs hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function hasScheduleApplication(row: FertilizerEntry): boolean {
  const parts = [row.issue, row.nutrient, row.recommendation, row.organicDetail].filter(
    (v) => v?.trim()
  );
  if (parts.length === 0) return false;
  const joined = parts.join(" ").toLowerCase();
  return !joined.includes("no application");
}

function ScheduleDetailBlock({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined | null;
  tone?: "default" | "organic";
}) {
  const text = scheduleCellText(value);
  if (text === "—") return null;

  return (
    <div
      className={`fertilizer-detail-block rounded-lg p-3 ${
        tone === "organic" ? "bg-emerald-50/80 border border-emerald-100" : "bg-gray-50 border border-gray-100"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-green-700">{icon}</span>
        <span className="text-xs font-semibold text-green-800 tracking-wide uppercase">
          {label}
        </span>
      </div>
      <ScheduleTableCell value={value} clampLines={4} />
    </div>
  );
}

function ScheduleDayTab({
  row,
  active,
  onSelect,
}: {
  row: FertilizerEntry;
  active: boolean;
  onSelect: () => void;
}) {
  const hasApplication = hasScheduleApplication(row);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={active}
      onClick={() => {
        if (!active) onSelect();
      }}
      className={`fertilizer-day-tab flex-1 min-w-0 py-2 px-1.5 rounded-lg border text-center ${
        active
          ? "fertilizer-day-tab-active border-green-600 bg-green-600 text-white"
          : hasApplication
            ? "border-green-200 bg-green-50 text-green-900 hover:border-green-400 hover:bg-green-100/80"
            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <span
        className={`block text-sm font-bold leading-tight truncate ${
          active ? "text-white" : ""
        }`}
      >
        {scheduleCellText(row.date)}
      </span>
    </button>
  );
}

function ScheduleDayDetailCard({ row }: { row: FertilizerEntry }) {
  const hasApplication = hasScheduleApplication(row);
  const headerParts = [
    row.days ? `Day ${row.days}` : null,
    row.scheduleType || null,
  ].filter(Boolean);

  return (
    <article className="fertilizer-day-detail rounded-xl border border-green-200 bg-white shadow-sm overflow-hidden mt-3">
      <div className="flex items-stretch min-h-[120px]">
        <div
          className={`w-1 shrink-0 ${hasApplication ? "bg-green-500" : "bg-gray-300"}`}
          aria-hidden
        />
        <div className="flex-1 min-w-0 p-3 sm:p-4">
          {headerParts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3 pb-2 border-b border-gray-100">
              <p className="text-base font-semibold text-gray-800">{headerParts.join(" · ")}</p>
              {row.stage && row.stage.toUpperCase() !== `DAY ${row.days}`.toUpperCase() && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                  {row.stage}
                </span>
              )}
            </div>
          )}

          {!hasApplication ? (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-gray-50 px-3 py-8 text-sm text-gray-500">
              <Sprout className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              No fertilizer scheduled
            </div>
          ) : (
            <div className="space-y-2.5">
              <ScheduleDetailBlock
                icon={<AlertCircle className="h-4 w-4" />}
                label="Issue"
                value={row.issue}
              />
              <ScheduleDetailBlock
                icon={<Beaker className="h-4 w-4" />}
                label="Nutrient"
                value={row.nutrient}
              />
              <ScheduleDetailBlock
                icon={<Sprout className="h-4 w-4" />}
                label="Recommendation"
                value={row.recommendation}
              />
              <ScheduleDetailBlock
                icon={<Leaf className="h-4 w-4" />}
                label="Organic"
                value={row.organicDetail}
                tone="organic"
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ScheduleV2CardList({ data }: { data: FertilizerEntry[] }) {
  const [activeIdx, setActiveIdx] = useState<number>(() => {
    const withApp = data.findIndex((row) => hasScheduleApplication(row));
    return withApp >= 0 ? withApp : 0;
  });

  const safeIdx = activeIdx >= 0 && activeIdx < data.length ? activeIdx : 0;
  const activeRow = data[safeIdx];

  return (
    <div className="fertilizer-schedule-panel w-full min-w-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Select a date
      </p>
      <div className="fertilizer-day-tabs flex gap-1 w-full min-w-0" role="tablist">
        {data.map((row, idx) => (
          <ScheduleDayTab
            key={`${row.date}-${idx}`}
            row={row}
            active={safeIdx === idx}
            onSelect={() => setActiveIdx(idx)}
          />
        ))}
      </div>

      {activeRow && <ScheduleDayDetailCard row={activeRow} />}
    </div>
  );
}

function ScheduleLegacyCompactTable({
  data,
  fillHeight = false,
}: {
  data: FertilizerEntry[];
  fillHeight?: boolean;
}) {
  return (
    <div
      className={`fertilizer-schedule-table-wrap w-full min-w-0 overflow-hidden rounded-md border border-gray-200 bg-white ${
        fillHeight ? "fertilizer-schedule-fill" : ""
      }`}
      style={fillHeight ? ({ ["--schedule-rows" as string]: data.length } as React.CSSProperties) : undefined}
    >
      <table className="w-full table-fixed text-[10px] leading-tight text-left">
        <thead className="bg-green-100 text-gray-800">
          <tr>
            <th className="px-1 py-1 font-semibold border-b w-[14%]">Date</th>
            <th className="px-1 py-1 font-semibold border-b w-[14%]">Stage</th>
            <th className="px-1 py-1 font-semibold border-b w-[18%]">Nutrients</th>
            <th className="px-1 py-1 font-semibold border-b w-[27%]">Chemical</th>
            <th className="px-1 py-1 font-semibold border-b w-[27%]">Organic</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={`${row.date}-${idx}`} className="border-t border-gray-100 align-top odd:bg-white even:bg-gray-50/50">
              <td className="px-1 py-1 whitespace-nowrap font-medium">{scheduleCellText(row.date)}</td>
              <td className="px-1 py-1">{scheduleCellText(row.stage)}</td>
              <td className="px-1 py-1">
                N: {scheduleCellText(row.N_kg_acre)}
                <br />
                P: {scheduleCellText(row.P_kg_acre)}
                <br />
                K: {scheduleCellText(row.K_kg_acre)}
              </td>
              <td className="px-1 py-1">
                {row.fertilizers ? (
                  <ScheduleTableCell
                    value={`Urea ${row.fertilizers.Urea_N_kg_per_acre} kg, SP ${row.fertilizers.SuperPhosphate_P_kg_per_acre} kg, Potash ${row.fertilizers.Potash_K_kg_per_acre} kg`}
                  />
                ) : (
                  "—"
                )}
              </td>
              <td className="px-1 py-1">
                <ScheduleTableCell
                  value={
                    row.organic_inputs?.length ? row.organic_inputs.join(", ") : undefined
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function mapGrapesScheduleNext7ToEntries(
  items: unknown[],
  useV2: boolean
): FertilizerEntry[] {
  if (!Array.isArray(items)) return [];
  if (useV2) {
    return items.map((raw) => mapGrapesScheduleApiRow(raw as Record<string, unknown>));
  }
  return items.map((raw) => {
    const item = raw as Record<string, unknown>;
    const fertilizersRaw = item.fertilizers ?? item.fertilizer;
    const organicRaw = item.organic_inputs ?? item.organicInputs ?? item.organic;
    let fertilizers: FertilizerEntry["fertilizers"];
    if (
      fertilizersRaw &&
      typeof fertilizersRaw === "object" &&
      !Array.isArray(fertilizersRaw)
    ) {
      const f = fertilizersRaw as Record<string, unknown>;
      fertilizers = {
        Urea_N_kg_per_acre: Number(f.Urea_N_kg_per_acre ?? f.urea_n_kg_per_acre ?? 0),
        SuperPhosphate_P_kg_per_acre: Number(
          f.SuperPhosphate_P_kg_per_acre ?? f.superphosphate_p_kg_per_acre ?? 0
        ),
        Potash_K_kg_per_acre: Number(
          f.Potash_K_kg_per_acre ?? f.potash_k_kg_per_acre ?? 0
        ),
      };
    }
    let organic_inputs: string[] | undefined;
    if (Array.isArray(organicRaw)) {
      organic_inputs = organicRaw.map((x) => String(x));
    } else if (organicRaw != null && organicRaw !== "") {
      organic_inputs = [String(organicRaw)];
    }
    const str = (v: unknown) => (v == null ? "" : String(v));
    const rawDate = str(item.date ?? item.schedule_date);
    const dayNum = item.days ?? item.day_number ?? item.days_since_planting ?? item.day;
    const dayLabel = dayNum != null && dayNum !== "" ? String(dayNum) : "";
    return {
      date: formatScheduleDateDisplay(rawDate),
      stage: str(item.stage ?? item.crop_stage ?? item.stage_name),
      days: dayLabel,
      N_kg_acre: str(item.N_kg_acre ?? item.n_kg_acre ?? item.N ?? item.n),
      P_kg_acre: str(item.P_kg_acre ?? item.p_kg_acre ?? item.P ?? item.p),
      K_kg_acre: str(item.K_kg_acre ?? item.k_kg_acre ?? item.K ?? item.k),
      fertilizers,
      organic_inputs,
    };
  });
}

// Plantation type to months mapping
const PLANTATION_TYPE_MONTHS: Record<string, number> = {
  Suru: 10,
  Adsali: 14,
  Preseasonal: 12,
  Ratoon: 9,
};

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

  if (!selectedPlot) {
    const [gatNum, plotNum] = plotToUse.split("_");
    selectedPlot = profile.plots.find(
      (p: any) => p.gat_number === gatNum && p.plot_number === plotNum
    );
  }

  return selectedPlot ?? null;
}

/** Try alternate plot ids for grapes-schedule (fastapi id, gat_plot, plot_name). */
function collectSchedulePlotIds(profile: any, plotToUse: string): string[] {
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

function canApplyScheduleResponse(parsed: unknown): boolean {
  return extractScheduleDaysArray(parsed) !== undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const FertilizerTable: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [data, setData] = useState<FertilizerEntry[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [plantationType, setPlantationType] = useState<string | null>(null);
  const [monthsCompleted, setMonthsCompleted] = useState<number | null>(null);
  const [noFertilizerRequired, setNoFertilizerRequired] =
    useState<boolean>(false);
  /** Admin API returned 200 with empty/null next_7_days — show success, not planting-method error. */
  const [apiScheduleCompleted, setApiScheduleCompleted] =
    useState<boolean>(false);
  const [scheduleFetchLoading, setScheduleFetchLoading] =
    useState<boolean>(false);
  const [grapesScheduleMeta, setGrapesScheduleMeta] =
    useState<GrapesScheduleMeta | null>(null);
  const [grapesScheduleV2, setGrapesScheduleV2] = useState(false);
  const [editingPruningDates, setEditingPruningDates] = useState(false);
  const [foundationDateDraft, setFoundationDateDraft] = useState("");
  const [fruitDateDraft, setFruitDateDraft] = useState("");
  const [savingPruningDates, setSavingPruningDates] = useState(false);
  const [pruningDateError, setPruningDateError] = useState<string | null>(null);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);
  const scheduleFetchGenRef = useRef(0);
  const skipScheduleCacheRef = useRef(false);
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    refreshProfile,
  } = useFarmerProfile();
  const { getCached, selectedPlotName, setCached } = useAppContext();

  // Helper function to calculate months since plantation
  const calculateMonthsSincePlantation = (plantationDate: string): number => {
    let plantation: Date;

    plantation = new Date(plantationDate);

    if (isNaN(plantation.getTime())) {
      const parts = plantationDate.split("-");
      if (parts.length === 3) {
        plantation = new Date(
          parseInt(parts[0]),
          parseInt(parts[1]) - 1,
          parseInt(parts[2])
        );
      } else {
        const parts2 = plantationDate.split("/");
        if (parts2.length === 3) {
          plantation = new Date(
            parseInt(parts2[2]),
            parseInt(parts2[1]) - 1,
            parseInt(parts2[0])
          );
        }
      }
    }

    if (isNaN(plantation.getTime())) {
      console.error("Invalid plantation date:", plantationDate);
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    plantation.setHours(0, 0, 0, 0);

    const yearsDiff = today.getFullYear() - plantation.getFullYear();
    const monthsDiff = today.getMonth() - plantation.getMonth();
    const daysDiff = today.getDate() - plantation.getDate();

    let totalMonths = yearsDiff * 12 + monthsDiff;

    if (daysDiff < 0) {
      totalMonths = totalMonths - 1;
    }

    return Math.max(0, totalMonths);
  };

  // Helper function to calculate days since plantation
  const calculateDaysSincePlantation = (plantationDate: string): number => {
    // Try different date parsing methods
    let plantation: Date;

    // Method 1: Direct parsing
    plantation = new Date(plantationDate);

    // Method 2: Handle different date formats
    if (isNaN(plantation.getTime())) {
      // Try parsing as YYYY-MM-DD format
      const parts = plantationDate.split("-");
      if (parts.length === 3) {
        plantation = new Date(
          parseInt(parts[0]),
          parseInt(parts[1]) - 1,
          parseInt(parts[2])
        );
      } else {
        // Try parsing as DD/MM/YYYY format
        const parts2 = plantationDate.split("/");
        if (parts2.length === 3) {
          plantation = new Date(
            parseInt(parts2[2]),
            parseInt(parts2[1]) - 1,
            parseInt(parts2[0])
          );
        }
      }
    }

    const today = new Date();
    const diffTime = today.getTime() - plantation.getTime();
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return days;
  };

  // Helper function to get current stage based on days
  const getCurrentStage = (days: number, stages: any[]): any => {
    for (const stage of stages) {
      // Handle both en-dash (–) and regular hyphen (-) in the days range
      const daysRange = stage.days.replace(/[–-]/g, "-"); // Normalize to regular hyphen
      const [minDays, maxDays] = daysRange
        .split("-")
        .map((d: string) => parseInt(d.trim()));

      if (days >= minDays && days <= maxDays) {
        return stage;
      }
    }

    // Return the last stage if no match found
    return stages[stages.length - 1];
  };

  // Helper function to generate 7 days of data
  const generateSevenDaysData = (
    plantationDate: string,
    plantingMethod: string
  ): FertilizerEntry[] => {
    // Normalize the planting method to match bud.json format
    // Handle various formats: "2-bud", "2_bud", "2 bud", "2bud", "3-bud", etc.
    const normalizedMethod = plantingMethod
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/_/g, "-") // Replace underscores with hyphens
      .replace(/[^a-z0-9-]/g, "") // Remove special characters
      .replace(/-+/g, "-") // Replace multiple hyphens with single
      .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens

    console.log("FertilizerTable: Normalizing planting method", {
      original: plantingMethod,
      normalized: normalizedMethod,
      availableMethods: budData.fertilizer_schedule.map((s) => s.method),
    });

    // Find the fertilizer schedule for this planting method
    const fertilizerSchedule = budData.fertilizer_schedule.find((schedule) => {
      const scheduleMethod = schedule.method
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/_/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      return scheduleMethod === normalizedMethod;
    });

    if (!fertilizerSchedule) {
      console.error("FertilizerTable: No matching schedule found", {
        normalizedMethod,
        originalMethod: plantingMethod,
        availableMethods: budData.fertilizer_schedule.map((s) => s.method),
      });

      // Throw error instead of using fallback schedule
      throw new Error(
        `No fertilizer schedule found for planting method "${plantingMethod}" (normalized: "${normalizedMethod}"). Available methods: ${budData.fertilizer_schedule
          .map((s) => s.method)
          .join(", ")}`
      );
    }

    console.log(
      "FertilizerTable: Found matching schedule",
      fertilizerSchedule.method
    );
    return generateSevenDaysDataWithSchedule(
      plantationDate,
      fertilizerSchedule
    );
  };

  // Helper function to generate data with a specific schedule
  const generateSevenDaysDataWithSchedule = (
    plantationDate: string,
    fertilizerSchedule: any
  ): FertilizerEntry[] => {
    const daysSincePlantation = calculateDaysSincePlantation(plantationDate);

    const sevenDaysData: FertilizerEntry[] = [];
    const currentDate = new Date();

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(currentDate);
      targetDate.setDate(currentDate.getDate() + i);

      // Calculate days from plantation for this specific day
      const targetDays = daysSincePlantation + i;

      const currentStage = getCurrentStage(
        targetDays,
        fertilizerSchedule.stages
      );

      sevenDaysData.push({
        date: formatScheduleDateDisplay(targetDate.toISOString().split("T")[0]),
        stage: currentStage.stage,
        days: `DAY ${targetDays}`,
        N_kg_acre: currentStage.N_kg_acre,
        P_kg_acre: currentStage.P_kg_acre,
        K_kg_acre: currentStage.K_kg_acre,
        fertilizers: currentStage.fertilizers,
        organic_inputs: currentStage.organic_inputs,
      });
    }

    return sevenDaysData;
  };

  // Legacy bud.json helpers kept for reference; schedule is API-only (no local fallback).
  void [calculateMonthsSincePlantation, generateSevenDaysData];

  const applyScheduleResponse = (parsed: unknown): boolean => {
    const next = extractScheduleDaysArray(parsed);
    if (next === undefined) {
      return false;
    }

    if (next.length === 0) {
      setApiScheduleCompleted(true);
      setData([]);
      setGrapesScheduleMeta(null);
      setGrapesScheduleV2(false);
      setLocalError(null);
      setNoFertilizerRequired(false);
      setPlantationType(null);
      setMonthsCompleted(null);
      return true;
    }

    const v2 = isGrapesScheduleV2Rows(parsed, next);
    setGrapesScheduleV2(v2);
    setGrapesScheduleMeta(v2 ? extractGrapesScheduleMeta(parsed) : null);
    setApiScheduleCompleted(false);
    setData(mapGrapesScheduleNext7ToEntries(next, v2));
    setLocalError(null);
    setNoFertilizerRequired(false);
    return true;
  };

  useEffect(() => {
    const runId = ++scheduleFetchGenRef.current;

    const isStale = () =>
      runId !== scheduleFetchGenRef.current;

    // Wait for farmer profile before calling grapes-schedule (need plot id aliases)
    if (profileLoading) {
      setScheduleFetchLoading(true);
      return;
    }

    if (!profile?.plots?.length) {
      setScheduleFetchLoading(false);
      return;
    }

    // Determine which plot to use: selectedPlotName > first plot from profile
    let plotToUse = selectedPlotName;
    
    // Fallback to first plot if no selection
    if (!plotToUse && profile?.plots && profile.plots.length > 0) {
      const firstPlot = profile.plots[0];
      plotToUse = firstPlot.fastapi_plot_id || 
                  `${firstPlot.gat_number}_${firstPlot.plot_number}`;
      console.log('FertilizerTable: No plot selected, using first plot:', plotToUse);
    }

    // Wait for plot selection (either from context or fallback)
    if (!plotToUse) {
      setData([]);
      setLocalError(null);
      setPlantationType(null);
      setMonthsCompleted(null);
      setNoFertilizerRequired(false);
      setApiScheduleCompleted(false);
      setScheduleFetchLoading(false);
      setGrapesScheduleMeta(null);
      setGrapesScheduleV2(false);
      return;
    }

    const run = async () => {
      setScheduleFetchLoading(true);
      setApiScheduleCompleted(false);
      setLocalError(null);
      setNoFertilizerRequired(false);

      const scheduleCacheKey = `grapesSchedule_${String(plotToUse)}`;
      const skipCache = skipScheduleCacheRef.current;
      skipScheduleCacheRef.current = false;
      const cachedSchedule = skipCache ? null : getCached(scheduleCacheKey);
      if (
        cachedSchedule != null &&
        canApplyScheduleResponse(cachedSchedule) &&
        applyScheduleResponse(cachedSchedule)
      ) {
        if (!isStale()) {
          setScheduleFetchLoading(false);
        }
        return;
      }

      const base = getGrapesAdminBaseUrl().replace(/\/+$/, "");
      const schedulePlotIds = collectSchedulePlotIds(profile, String(plotToUse));
      const scheduleTimeoutMs = 120000;

      const tryFetchSchedule = async (): Promise<boolean> => {
        for (const schedulePlotId of schedulePlotIds) {
          if (isStale()) return false;

          const url = `${base}/grapes-schedule/${encodeURIComponent(schedulePlotId)}`;
          const controller = new AbortController();
          const timeoutId = window.setTimeout(
            () => controller.abort(),
            scheduleTimeoutMs
          );
          let res: Response;
          try {
            res = await fetch(url, {
              method: "GET",
              headers: { Accept: "application/json" },
              signal: controller.signal,
            });
          } catch (fetchErr) {
            console.warn(
              "FertilizerTable: grapes-schedule request failed for plot",
              schedulePlotId,
              fetchErr
            );
            continue;
          } finally {
            window.clearTimeout(timeoutId);
          }

          if (isStale()) return false;

          if (!res.ok) {
            console.warn(
              "FertilizerTable: grapes-schedule HTTP",
              res.status,
              res.statusText,
              "for plot",
              schedulePlotId,
              "— trying next plot id"
            );
            continue;
          }

          let parsed: unknown;
          try {
            parsed = await res.json();
          } catch {
            console.warn(
              "FertilizerTable: grapes-schedule returned non-JSON body for plot",
              schedulePlotId
            );
            continue;
          }

          if (!canApplyScheduleResponse(parsed)) {
            console.warn(
              "FertilizerTable: grapes-schedule 200 but no schedule array for plot",
              schedulePlotId,
              "keys:",
              parsed && typeof parsed === "object"
                ? Object.keys(parsed as object)
                : typeof parsed
            );
            continue;
          }

          if (isStale()) return false;

          if (applyScheduleResponse(parsed)) {
            setCached(`grapesSchedule_${schedulePlotId}`, parsed);
            setCached(scheduleCacheKey, parsed);
            return true;
          }
        }
        return false;
      };

      try {
        let loaded = await tryFetchSchedule();

        // One retry for slow/flaky API or profile timing (common cause of intermittent errors)
        if (!loaded && !isStale()) {
          await sleep(2000);
          if (!isStale()) {
            loaded = await tryFetchSchedule();
          }
        }

        if (isStale()) return;

        if (loaded) {
          setScheduleFetchLoading(false);
          return;
        }
      } catch (e) {
        console.warn("FertilizerTable: grapes-schedule request failed", e);
        if (isStale()) return;
      }

      setLocalError(
        `Unable to load fertilizer schedule for plot "${plotToUse}". The grapes-schedule API did not return data. Please ensure plantation date and planting method are set for this farm in the backend.`
      );
      setData([]);
      setGrapesScheduleMeta(null);
      setGrapesScheduleV2(false);
      setPlantationType(null);
      setMonthsCompleted(null);
      setNoFertilizerRequired(false);
      setScheduleFetchLoading(false);
    };

    void run();
    return () => {
      scheduleFetchGenRef.current += 1;
    };
  }, [profile, profileLoading, selectedPlotName, getCached, setCached, scheduleRefreshKey]);

  const startEditingPruningDates = () => {
    setFoundationDateDraft(grapesScheduleMeta?.foundation_pruning_date ?? "");
    setFruitDateDraft(grapesScheduleMeta?.fruit_pruning_date ?? "");
    setPruningDateError(null);
    setEditingPruningDates(true);
  };

  const cancelEditingPruningDates = () => {
    setEditingPruningDates(false);
    setPruningDateError(null);
  };

  const handleSavePruningDates = async () => {
    const foundation = foundationDateDraft.trim();
    const fruit = fruitDateDraft.trim();
    if (!foundation || !fruit) {
      setPruningDateError("Both Foundation and Fruit dates are required.");
      return;
    }
    if (new Date(fruit) <= new Date(foundation)) {
      setPruningDateError("Fruit date must be after Foundation date.");
      return;
    }

    let plotToUse = selectedPlotName;
    if (!plotToUse && profile?.plots?.length) {
      const firstPlot = profile.plots[0];
      plotToUse =
        firstPlot.fastapi_plot_id ||
        `${firstPlot.gat_number}_${firstPlot.plot_number}`;
    }
    const plot = plotToUse ? findPlotInProfile(profile, plotToUse) : null;
    const farmId = plot?.farms?.[0]?.id;
    if (!farmId) {
      setPruningDateError("Could not find farm for this plot.");
      return;
    }

    setSavingPruningDates(true);
    setPruningDateError(null);
    try {
      await patchFarm(String(farmId), {
        foundation_pruning_date: foundation,
        fruit_pruning_date: fruit,
      });
      setGrapesScheduleMeta((prev) =>
        prev
          ? {
              ...prev,
              foundation_pruning_date: foundation,
              fruit_pruning_date: fruit,
            }
          : prev
      );
      setEditingPruningDates(false);
      skipScheduleCacheRef.current = true;
      setScheduleRefreshKey((k) => k + 1);
      void refreshProfile();
    } catch {
      setPruningDateError("Failed to save pruning dates. Please try again.");
    } finally {
      setSavingPruningDates(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (tableRef.current) {
      const canvas = await html2canvas(tableRef.current);
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("l", "mm", "a4"); // landscape
      const width = pdf.internal.pageSize.getWidth();
      const height = (canvas.height * width) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 10, width, height);
      pdf.save("fertilizer_table.pdf");
    }
  };

  return (
    <div
      className={
        embedded
          ? "w-full min-w-0 flex flex-col flex-1"
          : "bg-white rounded-lg shadow-md p-3 sm:p-4 overflow-hidden"
      }
    >
      <div className={`flex justify-between items-center shrink-0 ${embedded ? "mb-1.5" : "mb-3"}`}>
        <h2
          className={
            embedded
              ? "text-base font-semibold text-gray-800"
              : "text-lg sm:text-xl font-bold text-gray-800"
          }
        >
          Fertilizer Schedule
        </h2>
        <button
          onClick={handleDownloadPDF}
          className={
            embedded
              ? "bg-blue-500 hover:bg-blue-600 text-white p-1.5 rounded-md shrink-0"
              : "bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          }
          title="Download PDF"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </button>
      </div>

      {/* {farmData && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Farm Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-600">Farm ID:</span>
              <span className="ml-2 text-gray-800">{farmData.farm_uid}</span>
            </div>
            <div>
              <span className="font-medium text-gray-600">Plantation Date:</span>
              <span className="ml-2 text-gray-800">{new Date(farmData.created_at).toLocaleDateString()}</span>
            </div>
            <div>
              <span className="font-medium text-gray-600">Planting Method:</span>
              <span className="ml-2 text-gray-800">{farmData.planting_method}</span>
            </div>
            <div>
              <span className="font-medium text-gray-600">Plantation Type:</span>
              <span className="ml-2 text-gray-800">{farmData.plantation_type}</span>
            </div>
            <div>
              <span className="font-medium text-gray-600">Crop Type:</span>
              <span className="ml-2 text-gray-800">{farmData.crop_type_name}</span>
            </div>
            <div>
              <span className="font-medium text-gray-600">Area Size:</span>
              <span className="ml-2 text-gray-800">{farmData.area_size} acres</span>
            </div>
          </div>
        </div>
      )} */}

      {/* No Fertilizer Required Message */}
      {(() => {
        // Re-check the conditions in render to ensure message shows
        if (!plantationType || monthsCompleted === null) {
          return null;
        }

        const normalizedPlantationType = plantationType
          .trim()
          .toLowerCase()
          .replace(/-/g, "")
          .replace(/\s+/g, "");

        const matchingKey = Object.keys(PLANTATION_TYPE_MONTHS).find(
          (key) =>
            key.toLowerCase().replace(/-/g, "").replace(/\s+/g, "") ===
            normalizedPlantationType
        );
        const requiredMonths = matchingKey
          ? PLANTATION_TYPE_MONTHS[matchingKey]
          : null;

        // Check if months completed >= required months (direct check in render)
        const shouldShowMessage =
          noFertilizerRequired ||
          (requiredMonths !== null && monthsCompleted >= requiredMonths);

        if (shouldShowMessage) {
          return (
            <div className="mb-4 p-6 bg-green-50 border border-green-200 rounded-lg text-center">
              <svg
                className="w-12 h-12 text-green-600 mx-auto mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-lg font-bold text-green-800 mb-2">
                Fertilizer schedule completed
              </p>
              <p className="text-lg font-bold text-green-800 mb-2">
                No Fertilizer required
              </p>
              <p className="text-sm text-green-700">
                {/* The <strong>{plantationType}</strong> plantation has completed <strong>{monthsCompleted}</strong> months  */}
                {/* {requiredMonths !== null && ` (required: ${requiredMonths} months)`}.  */}
                {/* No fertilizer application is needed at this time. */}
              </p>
            </div>
          );
        }

        return null;
      })()}

      {apiScheduleCompleted && (
        <div className="mb-4 p-6 bg-green-50 border border-green-200 rounded-lg text-center">
          <svg
            className="w-12 h-12 text-green-600 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-lg font-bold text-green-800 mb-2">
            Fertilizer Schedule Completed
          </p>
          <p className="text-sm text-green-700">
            No upcoming fertilizer applications in the next 7 days for this plot.
          </p>
        </div>
      )}

      {(localError || profileError) && !noFertilizerRequired && !apiScheduleCompleted && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <svg
              className="w-5 h-5 text-yellow-600 mt-0.5 mr-2"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-yellow-800">
                {localError || profileError}
              </p>
            </div>
          </div>
        </div>
      )}

      {profileLoading || scheduleFetchLoading ? (
        <div className="flex items-center justify-center py-8">
          {/* <Satellite className="w-8 h-8 animate-spin text-blue-500" /> */}
          <span className="ml-2 text-gray-600">Loading fertilizer data...</span>
        </div>
      ) : (
        <div className={embedded ? "flex flex-col flex-1 min-h-0 h-full" : undefined}>
        {(() => {
          // Re-check if fertilizer should be hidden (safety check in render)
          if (plantationType && monthsCompleted !== null) {
            const normalizedPlantationType = plantationType
              .trim()
              .toLowerCase()
              .replace(/-/g, "")
              .replace(/\s+/g, "");

            const matchingKey = Object.keys(PLANTATION_TYPE_MONTHS).find(
              (key) =>
                key.toLowerCase().replace(/-/g, "").replace(/\s+/g, "") ===
                normalizedPlantationType
            );
            const requiredMonths = matchingKey
              ? PLANTATION_TYPE_MONTHS[matchingKey]
              : null;

            if (requiredMonths !== null && monthsCompleted >= requiredMonths) {
              // No fertilizer required - message already shown above, table is completely hidden
              return null;
            }
          }

          // Show error or table only if fertilizer is still required
          if (noFertilizerRequired) {
            return null;
          }

          if (apiScheduleCompleted) {
            return null;
          }

          // Show loading state if profile is still loading
          if (profileLoading || scheduleFetchLoading) {
            return (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-sm text-gray-600">
                    Loading fertilizer data...
                  </p>
                </div>
              </div>
            );
          }

          // Show error or empty state (not when API says schedule is complete)
          if (
            (localError || profileError || data.length === 0) &&
            !apiScheduleCompleted
          ) {
            // Provide more helpful error messages
            let errorMessage =
              localError ||
              profileError ||
              "No fertilizer data available.";

            // Generic empty state: schedule API + legacy path left no rows (see console: FertilizerTable)
            if (!localError && !profileError) {
              errorMessage +=
                " Check Network for grapes-schedule, and that the farm has plantation_date and planting method set in the backend.";
            }

            // Add helpful suggestions based on the error
            if (errorMessage.includes("Planting method")) {
              errorMessage +=
                ". Please check if the planting method is set correctly in farm data.";
            } else if (errorMessage.includes("Plantation date")) {
              errorMessage +=
                ". Please ensure the plantation date is set for this farm.";
            } else if (errorMessage.includes("not found")) {
              errorMessage += ". Please select a valid plot from the dropdown.";
            } else if (!selectedPlotName && (!profile?.plots || profile.plots.length === 0)) {
              errorMessage =
                "Please select a plot to view fertilizer schedule.";
            }

            return (
              <div className="flex items-center justify-center py-12">
                <div className="text-center max-w-md">
                  <svg
                    className="w-16 h-16 text-yellow-500 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <p className="text-lg font-semibold text-gray-800 mb-2">
                    Unable to Load Fertilizer Schedule
                  </p>
                  <p className="text-sm text-gray-600 mb-4">{errorMessage}</p>
                  {!selectedPlotName && (!profile?.plots || profile.plots.length === 0) && (
                    <p className="text-xs text-gray-500 mt-2">
                      Tip: Make sure you have selected a plot from the dropdown
                      above.
                    </p>
                  )}
                </div>
              </div>
            );
          }

          return grapesScheduleV2 ? (
            <div ref={tableRef} className="w-full min-w-0 flex flex-col flex-1 min-h-0">
              {grapesScheduleMeta && (
                <div className="fertilizer-meta-strip flex flex-wrap items-center gap-2 mb-3 shrink-0">
                  {grapesScheduleMeta.plot && (
                    <span className="fertilizer-meta-pill">
                      <span className="fertilizer-meta-label">Plot</span>
                      {grapesScheduleMeta.plot}
                    </span>
                  )}
                  {editingPruningDates ? (
                    <>
                      <label className="fertilizer-meta-pill fertilizer-meta-pill--edit">
                        <span className="fertilizer-meta-label">Foundation</span>
                        <input
                          type="date"
                          className="fertilizer-meta-date-input"
                          value={foundationDateDraft}
                          onChange={(e) => setFoundationDateDraft(e.target.value)}
                        />
                      </label>
                      <label className="fertilizer-meta-pill fertilizer-meta-pill--edit">
                        <span className="fertilizer-meta-label">Fruit</span>
                        <input
                          type="date"
                          className="fertilizer-meta-date-input"
                          value={fruitDateDraft}
                          onChange={(e) => setFruitDateDraft(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="fertilizer-meta-action fertilizer-meta-action--save"
                        onClick={() => void handleSavePruningDates()}
                        disabled={savingPruningDates}
                        title="Save dates"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {savingPruningDates ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="fertilizer-meta-action fertilizer-meta-action--cancel"
                        onClick={cancelEditingPruningDates}
                        disabled={savingPruningDates}
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {grapesScheduleMeta.foundation_pruning_date && (
                        <span className="fertilizer-meta-pill">
                          <span className="fertilizer-meta-label">Foundation</span>
                          {grapesScheduleMeta.foundation_pruning_date}
                        </span>
                      )}
                      {grapesScheduleMeta.fruit_pruning_date && (
                        <span className="fertilizer-meta-pill">
                          <span className="fertilizer-meta-label">Fruit</span>
                          {grapesScheduleMeta.fruit_pruning_date}
                        </span>
                      )}
                      <button
                        type="button"
                        className="fertilizer-meta-action fertilizer-meta-action--edit"
                        onClick={startEditingPruningDates}
                        title="Edit pruning dates"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    </>
                  )}
                  {pruningDateError && (
                    <span className="text-xs text-red-600 font-medium w-full">
                      {pruningDateError}
                    </span>
                  )}
                </div>
              )}

              <div className="flex-1 min-h-0 flex flex-col">
                <ScheduleV2CardList data={data} />
              </div>
            </div>
          ) : (
            <div ref={tableRef} className="w-full min-w-0 flex flex-col flex-1 min-h-0">
              <h3 className="text-[11px] font-semibold text-gray-600 mb-1 shrink-0">
                Schedule · {data.length} {data.length === 1 ? "day" : "days"}
              </h3>
              <div className="flex-1 min-h-0 flex flex-col">
                <ScheduleLegacyCompactTable data={data} fillHeight={!embedded} />
              </div>
            </div>
          );
        })()}
        </div>
      )}
    </div>
  );
};

export default FertilizerTable;
