import api from "../api";
import React, { useState, useRef, useEffect, useMemo } from "react";
import CommonSpinner from "./CommanSpinner";
import axios from "axios";
import { getCache, setCache } from "../utils/cache";
import { getEventsBaseUrl } from "../utils/serviceUrls";
import {
  fetchPlotHarvestInfo,
  harvestInfoFromAgroStatsBatch,
} from "../utils/harvestStatusService";
import { extractAgroStatsPlotRow } from "../utils/grapesEventsBundle";
import {
  MapPin,
  ChevronDown,
  Calendar,
  TrendingUp,
  BarChart3,
  LayoutGrid,
  Maximize2,
} from "lucide-react";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  LabelList,
  ComposedChart,
  Area,
} from "recharts";
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useMap } from "react-leaflet";

const API_BASE_URL = `/users/my-field-officers/`;

// Chart Types
const CHART_TYPES = {
  BRIX: "brix",
  HARVEST: "harvest",
  PLANTATION: "plantation",
} as const;

type ChartType = (typeof CHART_TYPES)[keyof typeof CHART_TYPES];

// Type definitions
interface Filters {
  region: string;
  representative: string;
  plotArea: string;
  variety: string;
}

interface DateRange {
  start: string;
  end: string;
}

const PLOT_AREA_OPTIONS = [
  "All",
  "1-3 acre",
  "4-5 acre",
  "5-7 acre",
  "8-10 acre",
] as const;

const HECTARES_TO_ACRES = 2.47105;

/** Match plot area (acres) to Manager Harvest Planning filter buckets. */
function matchesPlotAreaFilter(areaAcres: number, filter: string): boolean {
  if (filter === "All") return true;
  if (!Number.isFinite(areaAcres) || areaAcres <= 0) return false;
  switch (filter) {
    case "1-3 acre":
      return areaAcres >= 1 && areaAcres <= 3;
    case "4-5 acre":
      return areaAcres >= 4 && areaAcres <= 5;
    case "5-7 acre":
      return areaAcres > 5 && areaAcres <= 7;
    case "8-10 acre":
      return areaAcres >= 8 && areaAcres <= 10;
    default:
      return true;
  }
}

function resolveFarmAreaAcres(farm: any, plot?: any): number {
  const acres = parseFloat(
    String(
      farm?.area_acres ??
        farm?.area_in_acres ??
        plot?.area_acres ??
        plot?.area_in_acres ??
        ""
    )
  );
  if (Number.isFinite(acres) && acres > 0) return acres;

  const size = parseFloat(String(farm?.area_size ?? farm?.area_size_numeric ?? "0"));
  if (!Number.isFinite(size) || size <= 0) return 0;
  // Backend often stores hectares in area_size — convert to acres for filter labels
  return size * HECTARES_TO_ACRES;
}

function resolveVariety(farm: any): string {
  const v =
    farm?.grafted_variety ||
    farm?.variety ||
    farm?.crop_variety ||
    farm?.crop_type?.variety ||
    farm?.crop_type?.crop_variety;
  return typeof v === "string" && v.trim() ? v.trim() : "Unknown";
}

/** Prefer API distance fields (meters → km). Never use Math.random. */
function resolveDistanceKm(plot: any, farm?: any): number {
  const candidates = [
    plot?.distance_km,
    plot?.distance,
    farm?.distance_km,
    farm?.distance,
    plot?.Distance,
    farm?.Distance,
  ];
  for (const c of candidates) {
    const n = parseFloat(String(c ?? ""));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const meters = [
    plot?.distance_motor_to_plot_m,
    farm?.distance_motor_to_plot_m,
    plot?.distance_From_Motor,
    farm?.distance_From_Motor,
    plot?.irrigation_details?.distance_motor_to_plot_m,
    farm?.irrigation_details?.distance_motor_to_plot_m,
  ];
  for (const m of meters) {
    const n = parseFloat(String(m ?? ""));
    if (Number.isFinite(n) && n >= 0) return n / 1000;
  }
  return 0;
}

function readAgroYieldBrix(plotRow: any): {
  yieldTPerAcre: number | null;
  brix: number | null;
  recovery: number | null;
} {
  if (!plotRow || typeof plotRow !== "object") {
    return { yieldTPerAcre: null, brix: null, recovery: null };
  }
  const row =
    plotRow.brix_sugar != null
      ? plotRow
      : plotRow.properties && typeof plotRow.properties === "object"
        ? plotRow.properties
        : plotRow;
  const bs = row.brix_sugar ?? row.brixSugar ?? {};
  const sugarYield = bs.sugar_yield ?? bs.yield ?? bs.predicted_yield;
  const yieldTPerAcre =
    typeof sugarYield?.mean === "number"
      ? sugarYield.mean
      : typeof sugarYield?.min === "number"
        ? sugarYield.min
        : typeof sugarYield === "number"
          ? sugarYield
          : null;
  const brixRaw = bs.brix ?? bs.tss ?? bs.brix_mean ?? row.brix;
  const brix =
    typeof brixRaw?.mean === "number"
      ? brixRaw.mean
      : typeof brixRaw === "number"
        ? brixRaw
        : typeof brixRaw?.min === "number"
          ? brixRaw.min
          : null;
  const recoveryRaw = bs.recovery ?? bs.ta ?? row.recovery;
  const recovery =
    typeof recoveryRaw?.mean === "number"
      ? recoveryRaw.mean
      : typeof recoveryRaw === "number"
        ? recoveryRaw
        : null;
  return { yieldTPerAcre, brix, recovery };
}

function pickArray(...candidates: unknown[]): any[] {
  let fallback: any[] | null = null;
  for (const c of candidates) {
    if (Array.isArray(c)) {
      if (c.length > 0) return c;
      if (fallback == null) fallback = c;
      continue;
    }
    if (c && typeof c === "object") {
      const obj = c as Record<string, unknown>;
      for (const key of [
        "results",
        "data",
        "farmers",
        "farmer_list",
        "plots",
        "plot_list",
        "farms",
        "items",
      ]) {
        const nested = obj[key];
        if (Array.isArray(nested) && nested.length > 0) return nested;
        if (Array.isArray(nested) && fallback == null) fallback = nested;
      }
    }
  }
  return fallback ?? [];
}

function extractFarmers(officer: any): any[] {
  return pickArray(
    officer?.farmers,
    officer?.farmer_list,
    officer?.farmer,
    officer?.assigned_farmers,
    officer?.farmer_details,
    officer?.my_farmers,
  );
}

function extractPlots(farmer: any): any[] {
  const direct = pickArray(
    farmer?.plots,
    farmer?.plot_list,
    farmer?.plot,
  );
  if (direct.length > 0) return direct;
  // Grapes: farmer.farms may be plot rows (no nested plots[])
  const farms = pickArray(farmer?.farms, farmer?.farm_list);
  if (farms.length === 0) return [];
  const nestedPlots = farms.flatMap((f: any) =>
    pickArray(f?.plots, f?.plot_list),
  );
  return nestedPlots.length > 0 ? nestedPlots : farms;
}

/** Prefer plot.farms; if missing, treat the plot itself as one farm row. */
function extractFarms(plot: any): any[] {
  const farms = pickArray(plot?.farms, plot?.farm_list, plot?.farm);
  if (farms.length > 0) return farms;
  return [plot];
}

interface HarvestData {
  id?: string;
  "Plot No"?: string;
  "plot in no."?: string;
  Latitude: number;
  Longitude: number;
  "Grapes Status": string;
  "Area (Hect)": number;
  Days: number;
  "Prediction Yield (T/acre)": number;
  "Brix (Degree)": number;
  "Recovery (Degree)": number;
  "Distance (km)": number;
  Stage: string;
  Region: string;
  "Grapes Type": string;
  Variety: string;
  /** Area in acres — used by Plot Area filter */
  areaAcres: number;
  representative?: string;
  representativeUrl?: string;
  boundaryCoordinates?: [number, number][];
}

interface BrixData {
  day: number;
  value: number;
}

interface HarvestChartData {
  day: number;
  area: number;
}

interface StageDistribution {
  stage: string;
  plots: number;
  color: string;
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

interface BrixTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

interface HarvestTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

interface MapAutoCenterProps {
  center: [number, number] | null;
}

interface CombinedChartProps {
  brixData: BrixData[];
  harvestData: HarvestChartData[];
  stageDistribution: StageDistribution[];
  filteredData: HarvestData[];
  harvestRange: [number, number];
  setHarvestRange: (range: [number, number]) => void;
  activeChart: ChartType;
  setActiveChart: (chart: ChartType) => void;
}

// Pie chart color palette (used for both pie and map points)
const STATUS_COLOR_PALETTE = [
  "#3B82F6",
  "#60A5FA",
  "#FB923C",
  "#10B981",
  "#6366F1",
  "#eab308",
  "#888",
];

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}

// Combined Chart Component
const CombinedChart: React.FC<CombinedChartProps> = ({
  brixData,
  harvestData,
  stageDistribution,
  filteredData,
  harvestRange,
  setHarvestRange,
  activeChart,
  setActiveChart,
}) => {
  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .slider-thumb::-webkit-slider-thumb {
        appearance: none;
        height: 12px;
        width: 12px;
        border-radius: 50%;
        background: #10B981;
        cursor: pointer;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      .slider-thumb::-moz-range-thumb {
        height: 12px;
        width: 12px;
        border-radius: 50%;
        background: #10B981;
        cursor: pointer;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  const BrixTooltip: React.FC<BrixTooltipProps> = ({
    active,
    payload,
  }) => {
    if (active && payload && payload.length) {
      const entry = payload[0].payload;
      const day = entry.day;
      const brixValues = filteredData
        .filter(
          (item) =>
            item.Days === day && typeof item["Brix (Degree)"] === "number",
        )
        .map((item) => item["Brix (Degree)"]);
      const avgBrix = brixValues.length
        ? (brixValues.reduce((a, b) => a + b, 0) / brixValues.length).toFixed(2)
        : "-";
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <div className="text-sm">
            <strong>Days:</strong> {day}
          </div>
          <div className="text-sm">
            <strong>Avg. Brix Value:</strong> {avgBrix}
          </div>
        </div>
      );
    }
    return null;
  };

  const HarvestTooltip: React.FC<HarvestTooltipProps> = ({
    active,
    payload,
  }) => {
    if (active && payload && payload.length) {
      const entry = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <div className="text-sm">
            <strong>Days:</strong> {entry.day}
          </div>
          <div className="text-sm">
            <strong>Avg Yield (T/acre):</strong> {entry.area?.toFixed(2)}
          </div>
          <div className="text-sm">
            <strong>Plot Count:</strong> {entry.count}
          </div>
          <div className="text-sm">
            <strong>Total Yield:</strong> {entry.totalYield?.toFixed(2)}
          </div>
        </div>
      );
    }
    return null;
  };

  const chartButtons = [
    { id: CHART_TYPES.BRIX, label: "Brix Value Prediction" },
    { id: CHART_TYPES.PLANTATION, label: "Plot wise Grapes Plantation" },
    { id: CHART_TYPES.HARVEST, label: "Ready To Harvest" },
  ];

  const renderChart = () => {
    switch (activeChart) {
      case CHART_TYPES.BRIX:
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={brixData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: "#e5e7eb" }}
                label={{
                  value: "Days",
                  position: "insideBottom",
                  offset: -1,
                }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: "#e5e7eb" }}
                label={{
                  value: "Total Area",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                }}
              />
              <Tooltip content={<BrixTooltip />} />
              <Bar dataKey="value" fill="#3B82F6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      case CHART_TYPES.HARVEST:
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={harvestData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: "#e5e7eb" }}
                label={{
                  value: "Days",
                  position: "insideBottom",
                  offset: -1,
                }}
                scale="linear"
                type="number"
                domain={["dataMin", "dataMax"]}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: "#e5e7eb" }}
                label={{
                  value: "Yield (T/acre)",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                }}
                yAxisId="left"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                axisLine={{ stroke: "#e5e7eb" }}
                label={{
                  value: "Count",
                  angle: 90,
                  position: "insideRight",
                  offset: 10,
                }}
                yAxisId="right"
                orientation="right"
              />
              <Tooltip content={<HarvestTooltip />} />
              <Area
                type="monotone"
                dataKey="area"
                fill="#10B981"
                fillOpacity={0.3}
                stroke="#10B981"
                strokeWidth={2}
                yAxisId="left"
              />
              <Line
                type="monotone"
                dataKey="area"
                stroke="#10B981"
                strokeWidth={3}
                dot={{ fill: "#10B981", strokeWidth: 2, r: 3 }}
                activeDot={{ r: 5 }}
                yAxisId="left"
              />
              <Bar
                dataKey="count"
                fill="#3B82F6"
                fillOpacity={0.6}
                yAxisId="right"
                radius={[2, 2, 0, 0]}
              />
            </ComposedChart>
          </ResponsiveContainer>
        );
      case CHART_TYPES.PLANTATION:
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stageDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="stage"
                tick={{ fontSize: 10 }}
                axisLine={{ stroke: "#e5e7eb" }}
              />
              <YAxis
                tick={{ fontSize: 14 }}
                axisLine={{ stroke: "#e5e7eb" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="plots" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="plots" position="top" />
                {stageDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 h-[500px] flex flex-col">
      <div className="flex justify-between items-center border-b border-gray-200 p-4">
        <div className="flex bg-gray-100 rounded-lg p-1">
          {chartButtons.map((button) => (
            <button
              key={button.id}
              onClick={() => setActiveChart(button.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${activeChart === button.id
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
                }`}
            >
              {button.label}
            </button>
          ))}
        </div>
        {activeChart === CHART_TYPES.HARVEST && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-gray-600">
                Days Range
              </span>
              <span className="text-xs text-gray-500">
                ({harvestRange[0]} - {harvestRange[1]})
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="500"
              value={harvestRange[1]}
              onChange={(e) =>
                setHarvestRange([harvestRange[0], parseInt(e.target.value)])
              }
              className="w-32 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
            />
          </div>
        )}
      </div>
      <div className="flex-1 p-4">{renderChart()}</div>
    </div>
  );
};

const HarvestDashboard: React.FC = () => {
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const [activeChart, setActiveChart] = useState<ChartType>(CHART_TYPES.BRIX);
  const [filters, setFilters] = useState<Filters>({
    region: "All",
    representative: "All",
    plotArea: "All",
    variety: "All",
  });
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date().toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  });
  const [harvestRange, setHarvestRange] = useState<[number, number]>([
    -50, 500,
  ]);
  const [loading, setLoading] = useState<boolean>(true);
  const [rawData, setRawData] = useState<HarvestData[]>([]);

  // Dynamic filter options
  const [regionOptions, setRegionOptions] = useState<string[]>(["All"]);
  const [representativeOptions, setRepresentativeOptions] = useState<string[]>([
    "All",
  ]);
  const plotAreaOptions = [...PLOT_AREA_OPTIONS];
  const [varietyOptions, setVarietyOptions] = useState<string[]>(["All"]);

  // Debounce non-representative filters
  const debouncedRegion = useDebouncedValue(filters.region, 300);
  const debouncedPlotArea = useDebouncedValue(filters.plotArea, 300);
  const debouncedVariety = useDebouncedValue(filters.variety, 300);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const response = await api.get(API_BASE_URL);

        const apiData = response.data ?? {};
        const fieldOfficers = pickArray(
          apiData.field_officers,
          apiData.fieldOfficers,
          apiData.results,
          apiData.data?.field_officers,
          Array.isArray(apiData) ? apiData : null,
        );

        if (fieldOfficers.length > 0) {
          let allData: HarvestData[] = [];

          const talukaSet = new Set<string>();
          const representativeSet = new Set<string>();
          const varietySet = new Set<string>();

          // Collect all plot IDs for harvest status API calls
          // Map: dataPointId -> plotId (fastapi_plot_id)
          const dataPointToPlotIdMap = new Map<string, string>();

          fieldOfficers.forEach((officer: any) => {
            const representativeName =
              `${officer.first_name || ""} ${officer.last_name || ""}`.trim() ||
              "Field Officer";
            representativeSet.add(representativeName);

            extractFarmers(officer).forEach((farmer: any) => {
              extractPlots(farmer).forEach((plot: any) => {
                if (plot.taluka) {
                  talukaSet.add(plot.taluka);
                } else if (plot.district) {
                  talukaSet.add(plot.district);
                }

                // Grapes often has no plot.farms[] — treat plot as the farm
                extractFarms(plot).forEach((farm: any) => {
                  const varietyFromFarm = resolveVariety(farm);
                  const variety =
                    varietyFromFarm !== "Unknown"
                      ? varietyFromFarm
                      : resolveVariety(plot);
                  if (variety !== "Unknown") varietySet.add(variety);

                  const coordinates = plot.boundary?.coordinates?.[0] || [];
                  let centerLat = 0;
                  let centerLng = 0;

                  if (coordinates.length > 0) {
                    coordinates.forEach((coord: number[]) => {
                      centerLng += coord[0];
                      centerLat += coord[1];
                    });
                    centerLat /= coordinates.length;
                    centerLng /= coordinates.length;
                  }

                  // Calculate days since plantation
                  let days = 0;
                  const plantationDateRaw =
                    farm.plantation_date || plot.plantation_date;
                  if (plantationDateRaw) {
                    const plantationDate = new Date(plantationDateRaw);
                    const today = new Date();
                    if (!isNaN(plantationDate.getTime())) {
                      days = Math.floor(
                        (today.getTime() - plantationDate.getTime()) /
                        (1000 * 60 * 60 * 24),
                      );
                    }
                  }

                  const stage =
                    farm.growth_stage ||
                    farm.stage ||
                    plot.growth_stage ||
                    plot.stage ||
                    "";
                  const status =
                    farm.harvest_status ||
                    plot.harvest_status ||
                    farm.status ||
                    plot.status ||
                    "";

                  // Defaults — overwritten from GET /plots/agroStats below
                  const brix = 0;
                  const recovery = 0;
                  const yieldPerAcre = 0;
                  const distanceKm = resolveDistanceKm(plot, farm);

                  const areaAcres = resolveFarmAreaAcres(farm, plot);
                  // Keep legacy hect field for charts (approx ha from acres)
                  const areaHect =
                    areaAcres > 0 ? areaAcres / HECTARES_TO_ACRES : 0;

                  // Convert boundary coordinates from [lng, lat] to [lat, lng] for Leaflet
                  const boundaryCoords: [number, number][] | undefined =
                    coordinates.length > 0
                      ? coordinates.map(
                          (coord: number[]) =>
                            [coord[1], coord[0]] as [number, number],
                        )
                      : undefined;

                  // Use fastapi_plot_id if available, otherwise use plot.id
                  const plotId =
                    plot.fastapi_plot_id ||
                    farm.fastapi_plot_id ||
                    plot.id ||
                    farm.id ||
                    String(plot.id ?? farm.id ?? "");
                  const dataPointId = `${plot.id ?? plot.fastapi_plot_id ?? "plot"}-${farm.id ?? farm.farm_id ?? "farm"}`;

                  // Store mapping for harvest status API call
                  dataPointToPlotIdMap.set(dataPointId, String(plotId));

                  const dataPoint: HarvestData = {
                    id: dataPointId,
                    "Plot No":
                      plot.plot_number ||
                      plot.fastapi_plot_id ||
                      String(plotId),
                    Latitude: centerLat,
                    Longitude: centerLng,
                    "Grapes Status": status,
                    "Area (Hect)": areaHect,
                    areaAcres,
                    Days: days,
                    "Prediction Yield (T/acre)": yieldPerAcre,
                    "Brix (Degree)": brix,
                    "Recovery (Degree)": recovery,
                    "Distance (km)": distanceKm,
                    Stage: stage,
                    Region: plot.taluka || plot.district || "Unknown",
                    "Grapes Type":
                      farm.plantation_type ||
                      plot.plantation_type ||
                      "Unknown",
                    Variety: variety,
                    representative: representativeName,
                    representativeUrl: "",
                    boundaryCoordinates: boundaryCoords,
                  };

                  allData.push(dataPoint);
                });
              });
            });
          });

          // Get unique plot IDs
          const uniquePlotIds = Array.from(
            new Set(dataPointToPlotIdMap.values()),
          );

          // Fetch yield / brix / harvest status from events agroStats API
          const today = new Date().toISOString().slice(0, 10);
          const harvestStatusMap = new Map<string, string>();
          const yieldDataMap = new Map<string, number>();
          const brixDataMap = new Map<string, number>();
          const recoveryDataMap = new Map<string, number>();

          const eventsBase = getEventsBaseUrl().replace(/\/+$/, "");
          const agroStatsCacheKey = `agroStats_${today}`;
          let allPlotsYieldData = getCache(agroStatsCacheKey);

          if (!allPlotsYieldData) {
            try {
              const agroStatsRes = await axios.get(
                `${eventsBase}/plots/agroStats`,
                {
                  params: { end_date: today },
                  timeout: 60_000,
                  headers: { Accept: "application/json" },
                },
              );
              allPlotsYieldData = agroStatsRes.data;
              setCache(agroStatsCacheKey, allPlotsYieldData);
            } catch (err) {
              console.warn("HarvestDashboard: agroStats fetch failed", err);
              allPlotsYieldData = null;
            }
          }

          if (allPlotsYieldData && uniquePlotIds.length > 0) {
            uniquePlotIds.forEach((plotId) => {
              const plotData = extractAgroStatsPlotRow(
                allPlotsYieldData,
                plotId,
                null,
              );
              const metrics = readAgroYieldBrix(plotData);
              if (metrics.yieldTPerAcre != null) {
                yieldDataMap.set(plotId, metrics.yieldTPerAcre);
              }
              if (metrics.brix != null) {
                brixDataMap.set(plotId, metrics.brix);
              }
              if (metrics.recovery != null) {
                recoveryDataMap.set(plotId, metrics.recovery);
              }
            });
          }

          if (uniquePlotIds.length > 0) {
            const batchHarvest = harvestInfoFromAgroStatsBatch(
              allPlotsYieldData,
              uniquePlotIds
            );
            batchHarvest.forEach((info, plotId) => {
              if (info.harvestStatus) {
                harvestStatusMap.set(plotId, info.harvestStatus);
                setCache(`harvest_status_${plotId}_${today}`, info.harvestStatus);
              }
            });

            const missingPlotIds = uniquePlotIds.filter(
              (plotId) => !harvestStatusMap.has(plotId)
            );

            const harvestPromises = missingPlotIds.map(async (plotId) => {
              const cacheKey = `harvest_status_${plotId}_${today}`;
              const cachedStatus = getCache(cacheKey);
              if (cachedStatus) {
                harvestStatusMap.set(plotId, cachedStatus);
                return;
              }

              try {
                const info = await fetchPlotHarvestInfo(plotId, today);
                if (info.harvestStatus) {
                  harvestStatusMap.set(plotId, info.harvestStatus);
                  setCache(cacheKey, info.harvestStatus);
                }
              } catch {
                // Keep default status if API call fails
              }
            });

            await Promise.allSettled(harvestPromises);
          }

          // Update status and yield in allData with API response
          const statusMappingCounts: { [key: string]: number } = {
            Harvested: 0,
            "Ready to Harvest": 0,
            Growing: 0,
            Unknown: 0,
          };

          allData.forEach((dataPoint) => {
            const plotId = dataPointToPlotIdMap.get(dataPoint.id || "");

            // Update yield / brix / recovery from agroStats
            if (plotId && yieldDataMap.has(plotId)) {
              const apiYield = yieldDataMap.get(plotId);
              if (apiYield !== undefined && apiYield !== null) {
                dataPoint["Prediction Yield (T/acre)"] = apiYield;
              }
            }
            if (plotId && brixDataMap.has(plotId)) {
              const apiBrix = brixDataMap.get(plotId);
              if (apiBrix !== undefined && apiBrix !== null) {
                dataPoint["Brix (Degree)"] = apiBrix;
              }
            }
            if (plotId && recoveryDataMap.has(plotId)) {
              const apiRecovery = recoveryDataMap.get(plotId);
              if (apiRecovery !== undefined && apiRecovery !== null) {
                dataPoint["Recovery (Degree)"] = apiRecovery;
              }
            }

            // Update status from API
            if (plotId && harvestStatusMap.has(plotId)) {
              const apiStatus = harvestStatusMap.get(plotId);
              // Normalize status values to match expected labels
              if (apiStatus) {
                // Convert to lowercase for case-insensitive matching
                const statusLower = (apiStatus || "").toLowerCase().trim();

                // Replace underscores and normalize spacing
                const normalizedStatus = statusLower
                  .replace(/_/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();

                // Map API status to expected status labels (case-insensitive)
                // "Partially Harvested" is removed from UI — treat as Harvested
                if (
                  normalizedStatus.includes("partially") &&
                  normalizedStatus.includes("harvested")
                ) {
                  dataPoint["Grapes Status"] = "Harvested";
                  statusMappingCounts["Harvested"]++;
                } else if (
                  normalizedStatus.includes("harvested") &&
                  !normalizedStatus.includes("partially")
                ) {
                  dataPoint["Grapes Status"] = "Harvested";
                  statusMappingCounts["Harvested"]++;
                } else if (normalizedStatus.includes("ready")) {
                  dataPoint["Grapes Status"] = "Ready to Harvest";
                  statusMappingCounts["Ready to Harvest"]++;
                } else if (normalizedStatus.includes("growing")) {
                  dataPoint["Grapes Status"] = "Growing";
                  statusMappingCounts["Growing"]++;
                } else {
                  // Fallback: capitalize first letter of each word
                  const fallbackStatus = normalizedStatus
                    .split(" ")
                    .map(
                      (word: string) =>
                        word.charAt(0).toUpperCase() + word.slice(1),
                    )
                    .join(" ");
                  dataPoint["Grapes Status"] = fallbackStatus;
                  statusMappingCounts["Unknown"]++;
                }
              }
            } else {
              // Plot doesn't have API status, keep default or count as unknown
              if (!plotId) {
              } else if (!harvestStatusMap.has(plotId)) {
              }
            }
          });

          setRegionOptions(["All", ...Array.from(talukaSet).sort()]);
          setRepresentativeOptions([
            "All",
            ...Array.from(representativeSet).sort(),
          ]);
          setVarietyOptions(["All", ...Array.from(varietySet).sort()]);

          setRawData(allData);
        } else {
          setRawData([]);
        }
      } catch (err) {
        setRawData([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredData = useMemo(
    () =>
      rawData.filter((item) => {
        const regionMatch =
          debouncedRegion === "All" || item.Region === debouncedRegion;
        const repMatch =
          filters.representative === "All" ||
          item.representative === filters.representative;
        const areaMatch = matchesPlotAreaFilter(
          item.areaAcres,
          debouncedPlotArea
        );
        const varietyMatch =
          debouncedVariety === "All" || item.Variety === debouncedVariety;
        return regionMatch && repMatch && areaMatch && varietyMatch;
      }),
    [
      rawData,
      debouncedRegion,
      filters.representative,
      debouncedPlotArea,
      debouncedVariety,
    ],
  );

  const FIXED_STATUS_LABELS = [
    "Harvested",
    "Growing",
    "Ready to Harvest",
  ];

  const statusCounts = useMemo(
    () =>
      filteredData.reduce((acc: { [key: string]: number }, item) => {
        const status = item["Grapes Status"];
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {}),
    [filteredData],
  );

  const statusColorMap = useMemo(() => {
    const map: { [key: string]: string } = {};
    FIXED_STATUS_LABELS.forEach((label, i) => {
      map[label] = STATUS_COLOR_PALETTE[i % STATUS_COLOR_PALETTE.length];
    });
    return map;
  }, []);

  const plotStatusData = useMemo(
    () =>
      FIXED_STATUS_LABELS.map((label) => ({
        name: label,
        value: statusCounts[label] || 0,
        color: statusColorMap[label],
      })),
    [statusCounts, statusColorMap],
  );

  const plotPoints = useMemo(() => {
    let dataToUse = filteredData;
    if (activeChart === CHART_TYPES.HARVEST) {
      dataToUse = filteredData.filter((item) => {
        if (typeof item.Days === "number" && !isNaN(item.Days)) {
          return item.Days >= harvestRange[0] && item.Days <= harvestRange[1];
        }
        return false;
      });
    }
    return dataToUse.map((item, idx) => ({
      id: item.id || idx,
      position: [item.Latitude, item.Longitude] as [number, number],
      status: item["Grapes Status"],
      plotNo: item["Plot No"] || item["plot in no."] || `P${idx + 1}`,
      area: `${Number(item.areaAcres || 0).toFixed(2)} acre`,
      raw: item,
      boundaryCoordinates: item.boundaryCoordinates,
    }));
  }, [filteredData, activeChart, harvestRange]);

  const brixData = useMemo(() => {
    const brixAreaByDay: { [key: number]: number } = {};
    filteredData.forEach((item) => {
      if (
        typeof item.Days === "number" &&
        typeof item["Area (Hect)"] === "number"
      ) {
        brixAreaByDay[item.Days] =
          (brixAreaByDay[item.Days] || 0) + item["Area (Hect)"];
      }
    });
    return Object.entries(brixAreaByDay)
      .map(([day, area]) => ({ day: Number(day), value: area }))
      .sort((a, b) => a.day - b.day);
  }, [filteredData]);

  const harvestData = useMemo(() => {
    const rangeFilteredData = filteredData.filter((item) => {
      if (typeof item.Days === "number" && !isNaN(item.Days)) {
        return item.Days >= harvestRange[0] && item.Days <= harvestRange[1];
      }
      return false;
    });

    const dayGroups = rangeFilteredData.reduce(
      (acc: { [key: number]: number[] }, item) => {
        if (
          typeof item.Days === "number" &&
          !isNaN(item.Days) &&
          typeof item["Prediction Yield (T/acre)"] === "number" &&
          !isNaN(item["Prediction Yield (T/acre)"])
        ) {
          if (!acc[item.Days]) {
            acc[item.Days] = [];
          }
          acc[item.Days].push(item["Prediction Yield (T/acre)"]);
        }
        return acc;
      },
      {},
    );

    const result = Object.entries(dayGroups)
      .map(([day, yieldValues]) => ({
        day: Number(day),
        area:
          yieldValues.reduce((sum, val) => sum + val, 0) / yieldValues.length,
        count: yieldValues.length,
        totalYield: yieldValues.reduce((sum, val) => sum + val, 0),
      }))
      .sort((a, b) => a.day - b.day);

    return result;
  }, [filteredData, harvestRange]);

  const stageDistribution = useMemo(() => {
    const stageCounts = filteredData.reduce(
      (acc: { [key: string]: number }, item) => {
        const stage = String(item.Stage || "").trim();
        if (!stage) return acc;
        acc[stage] = (acc[stage] || 0) + 1;
        return acc;
      },
      {},
    );

    return Object.entries(stageCounts).map(([stage, plots], i) => ({
      stage,
      plots,
      color: STATUS_COLOR_PALETTE[i % STATUS_COLOR_PALETTE.length],
    }));
  }, [filteredData]);

  const keyMetrics = useMemo(() => {
    const totalArea = filteredData.reduce(
      (sum, item) => sum + (item.areaAcres || 0),
      0,
    );
    const totalPlots = filteredData.length;
    const avgDistance = (() => {
      const withDistance = filteredData.filter(
        (item) => (item["Distance (km)"] || 0) > 0,
      );
      if (withDistance.length === 0) return "-";
      return (
        withDistance.reduce(
          (sum, item) => sum + (item["Distance (km)"] || 0),
          0,
        ) / withDistance.length
      ).toFixed(2);
    })();
    const avgYield = (() => {
      const withYield = filteredData.filter(
        (item) => (item["Prediction Yield (T/acre)"] || 0) > 0,
      );
      if (withYield.length === 0) return "-";
      return (
        withYield.reduce(
          (sum, item) => sum + (item["Prediction Yield (T/acre)"] || 0),
          0,
        ) / withYield.length
      ).toFixed(2);
    })();

    return [
      {
        label: "Total Area (acre)",
        value: totalArea ? totalArea.toFixed(2) : "-",
        icon: BarChart3,
      },
      {
        label: "Total plots",
        value: totalPlots ? `${totalPlots} plots` : "-",
        icon: LayoutGrid,
      },
      {
        label: "Avg. Distance (KM)",
        value: avgDistance,
        icon: MapPin,
      },
      {
        label: "Expected Yield (T/acre)",
        value: avgYield,
        icon: TrendingUp,
      },
    ];
  }, [filteredData]);

  const mapCenter = useMemo((): [number, number] | null => {
    if (filteredData.length > 0) {
      const validData = filteredData.filter(
        (item) =>
          item.Latitude &&
          item.Longitude &&
          item.Latitude !== 0 &&
          item.Longitude !== 0,
      );
      if (validData.length > 0) {
        const avgLat =
          validData.reduce((sum, item) => sum + (item.Latitude || 0), 0) /
          validData.length;
        const avgLng =
          validData.reduce((sum, item) => sum + (item.Longitude || 0), 0) /
          validData.length;
        return [avgLat, avgLng];
      }
    }
    return null;
  }, [filteredData]);

  const getPlotColor = useMemo(
    () =>
      (item: HarvestData): string => {
        const status = item["Grapes Status"];
        return statusColorMap[status] || STATUS_COLOR_PALETTE[0];
      },
    [statusColorMap],
  );

  function MapAutoCenter({ center }: MapAutoCenterProps) {
    const map = useMap();
    useEffect(() => {
      if (
        center &&
        Array.isArray(center) &&
        center.length === 2 &&
        !center.some(isNaN)
      ) {
        map.setView(center, map.getZoom());
      }
    }, [center, map]);
    return null;
  }

  const FilterDropdown: React.FC<FilterDropdownProps> = ({
    label,
    value,
    options,
    onChange,
  }) => (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div className="relative box-border">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen dashboard-bg flex flex-col items-center justify-center gap-3 px-4">
        <CommonSpinner />
        <p className="text-sm text-gray-600 text-center max-w-md">
          Loading harvest planning data… this can take a few minutes while plot
          harvest status is fetched.
        </p>
      </div>
    );
  }

  if (rawData.length === 0) {
    return (
      <div className="min-h-screen dashboard-bg flex items-center justify-center px-4">
        <p className="text-sm text-gray-600 text-center">
          No harvest planning data available. Check field officer / plot
          hierarchy from the API, then refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen dashboard-bg p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border shadow-sm">
              <Calendar className="w-4 h-4 text-blue-500" />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) =>
                  setDateRange((prev) => ({ ...prev, start: e.target.value }))
                }
                className="border-none outline-none text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
            {keyMetrics.map((metric, index) => {
              const IconComponent = metric.icon;
              return (
                <div
                  key={index}
                  className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-2">
                    <IconComponent className="w-8 h-8 text-blue-500" />
                  </div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    {metric.value}
                  </div>
                  <div className="text-sm text-gray-600">{metric.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3 space-y-2">
            <div className="bg-white rounded-xl p-2 border-gray-100">
              <FilterDropdown
                label="Region"
                value={filters.region}
                options={regionOptions}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, region: value }))
                }
              />
              <FilterDropdown
                label="Representative"
                value={filters.representative}
                options={representativeOptions}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, representative: value }))
                }
              />
              <FilterDropdown
                label="Plot Area"
                value={filters.plotArea}
                options={plotAreaOptions}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, plotArea: value }))
                }
              />
              <FilterDropdown
                label="Variety"
                value={filters.variety}
                options={varietyOptions}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, variety: value }))
                }
              />
            </div>
          </div>

          <div className="lg:col-span-9 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="relative w-full h-[400px]">
                  <div
                    className="absolute top-4 right-4 z-20 bg-white text-gray-700 border border-gray-200 shadow-md p-2 rounded cursor-pointer hover:bg-gray-100 transition"
                    onClick={() => {
                      if (!document.fullscreenElement) {
                        mapWrapperRef.current?.requestFullscreen();
                      } else {
                        document.exitFullscreen();
                      }
                    }}
                  >
                    <Maximize2 className="w-4 h-4" />
                  </div>
                  <div ref={mapWrapperRef} className="w-full h-full">
                    {mapCenter ? (
                      <MapContainer
                        center={mapCenter}
                        zoom={7.5}
                        minZoom={1}
                        maxZoom={25}
                        className="w-full h-full"
                        style={{
                          height: "100%",
                          width: "100%",
                          borderRadius: "inherit",
                        }}
                      >
                        <MapAutoCenter center={mapCenter} />
                        <TileLayer
                          url="http://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                          attribution="© Google"
                          maxZoom={25}
                          maxNativeZoom={21}
                          minZoom={1}
                          tileSize={256}
                          zoomOffset={0}
                        />
                        {plotPoints.map((plot) => (
                          <React.Fragment key={plot.id}>
                            {/* Plot Boundary Polygon */}
                            {plot.boundaryCoordinates &&
                              plot.boundaryCoordinates.length > 0 && (
                                <Polygon
                                  positions={plot.boundaryCoordinates}
                                  pathOptions={{
                                    color: getPlotColor(plot.raw),
                                    fillColor: getPlotColor(plot.raw),
                                    fillOpacity: 0.2,
                                    weight: 2,
                                  }}
                                />
                              )}
                            {/* Plot Center Point */}
                            <CircleMarker
                              center={plot.position}
                              radius={8}
                              pathOptions={{
                                color: getPlotColor(plot.raw),
                                fillColor: getPlotColor(plot.raw),
                                fillOpacity: 0.8,
                                weight: 2,
                              }}
                            >
                              <Popup>
                                <div className="text-sm">
                                  <div className="font-semibold text-gray-900 mb-1">
                                    Plot {plot.plotNo}
                                  </div>
                                  <div className="text-gray-600 mb-1">
                                    Status:{" "}
                                    <span className="font-medium">
                                      {plot.status}
                                    </span>
                                  </div>
                                  <div className="text-gray-600">
                                    Area:{" "}
                                    <span className="font-medium">
                                      {plot.area}
                                    </span>
                                  </div>
                                </div>
                              </Popup>
                            </CircleMarker>
                          </React.Fragment>
                        ))}
                      </MapContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <div className="text-gray-500">
                          No plot data available
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1 bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-[400px] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Grapes Status
                  </h3>
                </div>
                <div className="flex-1 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={plotStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius="40%"
                        outerRadius="70%"
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {plotStatusData.map((_entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              STATUS_COLOR_PALETTE[
                              index % STATUS_COLOR_PALETTE.length
                              ]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mb-4">
                  {plotStatusData.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: STATUS_COLOR_PALETTE[index],
                          }}
                        ></div>
                        <span className="text-sm text-gray-700">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <CombinedChart
            harvestData={harvestData}
            brixData={brixData}
            stageDistribution={stageDistribution}
            filteredData={filteredData}
            harvestRange={harvestRange}
            setHarvestRange={setHarvestRange}
            activeChart={activeChart}
            setActiveChart={setActiveChart}
          />
        </div>
      </div>
    </div>
  );
};

export default HarvestDashboard;
