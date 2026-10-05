import React, { useState, useRef, useEffect, useMemo } from "react";
import { getTeamConnectGrapes, loadOwnerFieldOfficers } from "../api";
import CommonSpinner from "./CommanSpinner";
import axios from "axios";
import { getCache, setCache } from "../utils/cache";
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

import { getStoredUserIndustry } from "../utils/userIndustry";
import { getEventsBaseUrl } from "../utils/serviceUrls";
import { extractAgroStatsPlotRow } from "../utils/grapesEventsBundle";
import {
  fetchPlotHarvestInfo,
  harvestInfoFromAgroStatsBatch,
} from "../utils/harvestStatusService";
import { normalizeTeamConnectGrapesOfficers } from "../utils/teamConnectGrapes";

// Chart Types
const CHART_TYPES = {
  BRIX: "brix",
  HARVEST: "harvest",
  PLANTATION: "plantation",
} as const;

type ChartType = (typeof CHART_TYPES)[keyof typeof CHART_TYPES];

interface Filters {
  manager: string;
  region: string;
  representative: string;
  grapesType: string;
  variety: string;
}

interface DateRange {
  start: string;
  end: string;
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
  areaAcres: number;
  representative?: string;
  representativeUrl?: string;
  boundaryCoordinates?: [number, number][];
  managerName?: string;
  plotId?: string;
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

const STATUS_COLOR_PALETTE = [
  "#3B82F6",
  "#60A5FA",
  "#FB923C",
  "#10B981",
  "#6366F1",
  "#eab308",
  "#888",
];

const HECTARES_TO_ACRES = 2.47105;

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
      if (obj.id != null || obj.farmer_id != null || obj.farmerId != null) {
        return [c];
      }
    }
  }
  return fallback ?? [];
}

function resolveFarmAreaAcres(farm: any, plot?: any): number {
  const acres = parseFloat(
    String(
      farm?.area_acres ??
        farm?.area_in_acres ??
        farm?.plot_area ??
        plot?.area_acres ??
        plot?.area_in_acres ??
        plot?.plot_area ??
        ""
    )
  );
  if (Number.isFinite(acres) && acres > 0) return acres;

  const size = parseFloat(
    String(
      farm?.area_size ??
        farm?.area_size_numeric ??
        plot?.area_size ??
        plot?.area_size_numeric ??
        "0"
    )
  );
  if (!Number.isFinite(size) || size <= 0) return 0;
  return size * HECTARES_TO_ACRES;
}

/** Prefer API distance fields (meters → km). Never use Math.random. */
function resolveDistanceKm(plot: any, farm?: any): number {
  const candidates = [
    plot?.distance_km,
    plot?.distance,
    farm?.distance_km,
    farm?.distance,
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

function extractOfficers(manager: any): any[] {
  return pickArray(
    manager?.field_officers,
    manager?.fieldOfficers,
    manager?.fo_list,
    manager?.field_officer_list,
    manager?.officers,
  );
}

function extractFarmers(officer: any): any[] {
  return pickArray(
    officer?.farmers,
    officer?.farmer_list,
    officer?.farmer,
    officer?.assigned_farmers,
    officer?.farmer_details,
    officer?.farmer_profiles,
    officer?.my_farmers,
    officer?.all_farmers,
  );
}

function extractPlots(farmer: any): any[] {
  const direct = pickArray(
    farmer?.plots,
    farmer?.plot_list,
    farmer?.plot,
  );
  if (direct.length > 0) return direct;
  // Grapes: farmer.farms may be the plot rows (no nested plots[])
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

function buildHarvestPoint(
  managerName: string,
  representativeName: string,
  plot: any,
  farm: any,
): HarvestData {
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

  let days = 0;
  if (farm.plantation_date || plot.plantation_date) {
    const plantationDate = new Date(
      farm.plantation_date || plot.plantation_date,
    );
    if (!isNaN(plantationDate.getTime())) {
      const today = new Date();
      days = Math.floor(
        (today.getTime() - plantationDate.getTime()) / (1000 * 60 * 60 * 24),
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

  // Yield / brix filled from agroStats after hierarchy load
  const brix = 0;
  const recovery = 0;
  const yieldPerAcre = 0;
  const distanceKm = resolveDistanceKm(plot, farm);

  const areaAcres = resolveFarmAreaAcres(farm, plot);
  const areaHect = areaAcres > 0 ? areaAcres / HECTARES_TO_ACRES : 0;

  const boundaryCoords: [number, number][] | undefined =
    coordinates.length > 0
      ? coordinates.map(
          (coord: number[]) => [coord[1], coord[0]] as [number, number],
        )
      : undefined;

  const plotId =
    plot.fastapi_plot_id || farm.fastapi_plot_id || plot.id || farm.id || "";

  return {
    id: `${plot.id ?? plot.fastapi_plot_id ?? "plot"}-${farm.id ?? farm.farm_id ?? "farm"}`,
    "Plot No": plot.plot_number || plot.fastapi_plot_id || String(plotId),
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
    Region: plot.region || plot.district || plot.taluka || "Unknown",
    "Grapes Type":
      farm.plantation_type || plot.plantation_type || "Unknown",
    Variety:
      farm?.grafted_variety ||
      farm?.variety ||
      plot?.grafted_variety ||
      plot?.variety ||
      "Phule 265",
    representative: representativeName,
    representativeUrl: "",
    boundaryCoordinates: boundaryCoords,
    managerName,
    plotId: String(plotId),
  };
}

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
    { id: CHART_TYPES.PLANTATION, label: "Plot wise Sugarcane Plantation" },
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
              max="200"
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
    manager: "All",
    region: "All",
    representative: "All",
    grapesType: "All",
    variety: "All",
  });
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date().toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  });
  const [harvestRange, setHarvestRange] = useState<[number, number]>([
    -50, 100,
  ]);
  const [loading, setLoading] = useState<boolean>(true);
  const [rawData, setRawData] = useState<HarvestData[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Dynamic filter options
  const [managerOptions, setManagerOptions] = useState<string[]>(["All"]);
  const [regionOptions, setRegionOptions] = useState<string[]>(["All"]);
  const [representativeOptions, setRepresentativeOptions] = useState<string[]>([
    "All",
  ]);
  const [grapesTypeOptions, setGrapesTypeOptions] = useState<string[]>([
    "All",
  ]);
  const [varietyOptions, setVarietyOptions] = useState<string[]>([
    "All",
    "Phule 265",
  ]);

  // Debounce non-representative filters
  const debouncedRegion = useDebouncedValue(filters.region, 300);
  const debouncedGrapesType = useDebouncedValue(filters.grapesType, 300);
  const debouncedVariety = useDebouncedValue(filters.variety, 300);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setLoadError(null);
      try {
        const industry = getStoredUserIndustry();
        let fieldOfficers: any[] = [];
        let source = "none";

        // Primary: grapes harvest team-connect endpoint
        try {
          const grapesRes = await getTeamConnectGrapes();
          const parsed = normalizeTeamConnectGrapesOfficers(grapesRes.data);
          if (
            parsed.fieldOfficers.length > 0 ||
            parsed.counts.farmers > 0
          ) {
            fieldOfficers = parsed.fieldOfficers;
            source = "team-connect/grapes";
            if (parsed.filterOptions.regions.length > 0) {
              setRegionOptions(["All", ...parsed.filterOptions.regions]);
            }
            if (parsed.filterOptions.representatives.length > 0) {
              setRepresentativeOptions([
                "All",
                ...parsed.filterOptions.representatives.map((r) => r.label),
              ]);
            }
            if (parsed.filterOptions.varieties.length > 0) {
              setVarietyOptions([
                "All",
                ...parsed.filterOptions.varieties.map((v) => v.label || v.value),
              ]);
            }
          }
        } catch (err) {
          console.warn(
            "OwnerHarvestDash: team-connect/grapes failed, falling back",
            err,
          );
        }

        // Fallback: existing owner FO loaders
        if (fieldOfficers.length === 0) {
          const loaded = await loadOwnerFieldOfficers({
            industryId: industry.id,
          });
          fieldOfficers = loaded.fieldOfficers;
          source = loaded.source;
        }

        if (fieldOfficers.length === 0) {
          setRawData([]);
          setLoadError(
            "No field officers found for your grapes industry. Tried team-connect/grapes, my-field-officers, owner-team-connect, and owner-hierarchy — all returned empty.",
          );
          return;
        }

        console.info(
          `OwnerHarvestDash: loaded ${fieldOfficers.length} FOs via ${source}`,
        );

        let allData: HarvestData[] = [];
        const managerSet = new Set<string>();
        const talukaSet = new Set<string>();
        const representativeSet = new Set<string>();
        const plantationTypeSet = new Set<string>();
        const varietySet = new Set<string>();

        fieldOfficers.forEach((officer: any) => {
          const managerName =
            `${officer.manager?.first_name || ""} ${officer.manager?.last_name || ""}`.trim() ||
            officer.manager_name ||
            officer.manager?.username ||
            "Owner scope";
          managerSet.add(managerName);

          const representativeName =
            `${officer.first_name || ""} ${officer.last_name || ""}`.trim() ||
            officer?.username ||
            "Field Officer";
          representativeSet.add(representativeName);

          extractFarmers(officer).forEach((farmer: any) => {
            extractPlots(farmer).forEach((plot: any) => {
              const regionLabel =
                plot.taluka ||
                plot.district ||
                plot.region ||
                farmer.region ||
                farmer.district;
              if (regionLabel) talukaSet.add(String(regionLabel));

              extractFarms(plot).forEach((farm: any) => {
                const plantationType =
                  farm.plantation_type || plot.plantation_type;
                if (plantationType) plantationTypeSet.add(plantationType);
                const variety =
                  farm?.grafted_variety ||
                  farm?.variety ||
                  plot?.grafted_variety ||
                  plot?.variety;
                if (variety) varietySet.add(String(variety));

                allData.push(
                  buildHarvestPoint(
                    managerName,
                    representativeName,
                    plot,
                    farm,
                  ),
                );
              });
            });
          });
        });

        setManagerOptions(["All", ...Array.from(managerSet).sort()]);
        setRegionOptions((prev) =>
          prev.length > 1
            ? prev
            : ["All", ...Array.from(talukaSet).sort()],
        );
        setRepresentativeOptions((prev) =>
          prev.length > 1
            ? prev
            : ["All", ...Array.from(representativeSet).sort()],
        );
        setGrapesTypeOptions([
          "All",
          ...Array.from(plantationTypeSet).sort(),
        ]);
        if (varietySet.size > 0) {
          setVarietyOptions((prev) =>
            prev.length > 1
              ? prev
              : ["All", ...Array.from(varietySet).sort()],
          );
        }

        // Enrich yield / brix / harvest status from events agroStats
        const today = new Date().toISOString().slice(0, 10);
        const uniquePlotIds = Array.from(
          new Set(
            allData
              .map((d) => d.plotId)
              .filter((id): id is string => !!id && id !== "undefined"),
          ),
        );
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
            console.warn("OwnerHarvestDash: agroStats fetch failed", err);
            allPlotsYieldData = null;
          }
        }

        const harvestStatusMap = new Map<string, string>();
        if (allPlotsYieldData && uniquePlotIds.length > 0) {
          uniquePlotIds.forEach((plotId) => {
            const plotData = extractAgroStatsPlotRow(
              allPlotsYieldData,
              plotId,
              null,
            );
            const metrics = readAgroYieldBrix(plotData);
            allData.forEach((dp) => {
              if (dp.plotId !== plotId) return;
              if (metrics.yieldTPerAcre != null) {
                dp["Prediction Yield (T/acre)"] = metrics.yieldTPerAcre;
              }
              if (metrics.brix != null) {
                dp["Brix (Degree)"] = metrics.brix;
              }
              if (metrics.recovery != null) {
                dp["Recovery (Degree)"] = metrics.recovery;
              }
            });
          });

          const batchHarvest = harvestInfoFromAgroStatsBatch(
            allPlotsYieldData,
            uniquePlotIds,
          );
          batchHarvest.forEach((info, plotId) => {
            if (info.harvestStatus) {
              harvestStatusMap.set(plotId, info.harvestStatus);
            }
          });

          const missing = uniquePlotIds.filter(
            (id) => !harvestStatusMap.has(id),
          );
          await Promise.allSettled(
            missing.map(async (plotId) => {
              try {
                const info = await fetchPlotHarvestInfo(plotId, today);
                if (info.harvestStatus) {
                  harvestStatusMap.set(plotId, info.harvestStatus);
                }
              } catch {
                // keep default Growing
              }
            }),
          );

          allData.forEach((dp) => {
            const apiStatus = dp.plotId
              ? harvestStatusMap.get(dp.plotId)
              : undefined;
            if (!apiStatus) return;
            const normalized = apiStatus
              .toLowerCase()
              .replace(/_/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (
              normalized.includes("partially") &&
              normalized.includes("harvested")
            ) {
              dp["Grapes Status"] = "Harvested";
            } else if (
              normalized.includes("harvested") &&
              !normalized.includes("partially")
            ) {
              dp["Grapes Status"] = "Harvested";
            } else if (normalized.includes("ready")) {
              dp["Grapes Status"] = "Ready to Harvest";
            } else if (normalized.includes("growing")) {
              dp["Grapes Status"] = "Growing";
            }
          });
        }

        setRawData(allData);
        if (allData.length === 0) {
          setLoadError(
            "Field officers loaded, but no farms/plots were found. Check that farmers have plots nested in my-field-officers response.",
          );
        }
      } catch (err: any) {
        console.error("OwnerHarvestDash fetch failed:", err);
        setRawData([]);
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setLoadError(
            "Not authorized to load field officers (login may have expired). Please log in again.",
          );
        } else if (!err?.response) {
          setLoadError(
            "Network/timeout while loading field officers. The backend may be slow — try refresh.",
          );
        } else {
          setLoadError(
            `Failed to load field officers (${status || "error"}).`,
          );
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredData = useMemo(
    () =>
      rawData.filter((item) => {
          const managerMatch =
            filters.manager === "All" ||
            item.managerName === filters.manager;
          const regionMatch =
            debouncedRegion === "All" || item.Region === debouncedRegion;
          const repMatch =
            filters.representative === "All" ||
            item.representative === filters.representative;
          const typeMatch =
            debouncedGrapesType === "All" ||
            item["Grapes Type"] === debouncedGrapesType;
          const varietyMatch =
            debouncedVariety === "All" || item.Variety === debouncedVariety;
          return (
            managerMatch &&
            regionMatch &&
            repMatch &&
            typeMatch &&
            varietyMatch
          );
        }),
    [
      rawData,
      filters.manager,
      debouncedRegion,
      filters.representative,
      debouncedGrapesType,
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
        if (typeof item.Days === "number") {
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
      area: `${item["Area (Hect)"]} Ha`,
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
      if (typeof item.Days === "number") {
        return item.Days >= harvestRange[0] && item.Days <= harvestRange[1];
      }
      return false;
    });

    const dayGroups = rangeFilteredData.reduce(
      (acc: { [key: number]: number[] }, item) => {
        if (
          typeof item.Days === "number" &&
          typeof item["Prediction Yield (T/acre)"] === "number"
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

    return Object.entries(dayGroups)
      .map(([day, yieldValues]) => ({
        day: Number(day),
        area:
          yieldValues.reduce((sum, val) => sum + val, 0) / yieldValues.length,
        count: yieldValues.length,
        totalYield: yieldValues.reduce((sum, val) => sum + val, 0),
      }))
      .sort((a, b) => a.day - b.day);
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
          item.Latitude !== 19.765 &&
          item.Longitude !== 74.475,
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
          Loading owner hierarchy… this can take up to a minute when many
          managers and plots are linked.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen dashboard-bg p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">
        {rawData.length === 0 && (
          <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-3">
            {loadError ||
              "No harvest planning plots found yet. Select managers with linked field officers, farmers, and plots."}
          </div>
        )}
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
                label="Manager"
                value={filters.manager}
                options={managerOptions}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, manager: value }))
                }
              />
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
                label="Grapes Type"
                value={filters.grapesType}
                options={grapesTypeOptions}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, grapesType: value }))
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
