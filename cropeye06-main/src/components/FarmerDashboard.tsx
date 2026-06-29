import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  ReferenceArea,
  Scatter,
  ComposedChart,
  PieChart,
  Pie,
} from "recharts";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line as ChartLine } from 'react-chartjs-2';
import {
  Calendar,
  TrendingUp,
  Droplets,
  Thermometer,
  Activity,
  Target,
  Leaf,
  Sprout,
  LineChart as LineChartIcon,
  Users,
  MapPin,
  Beaker,
  CloudSun,
  Star,
} from "lucide-react";
import axios from "axios";
import { getCache, setCache } from "../utils/cache";
import { useFarmerProfile } from "../hooks/useFarmerProfile";
import { useAppContext } from "../context/AppContext";
import { getEventsBaseUrl, getGrapesAdminBaseUrl } from "../utils/serviceUrls";
import { publicAsset } from "../utils/publicAsset";
import {
  extractBrixTimeSeriesFromPayload,
  emptyGrapesDashboardMetrics,
  fetchGrapesEventsBundleForPlot,
  collectPlotApiIds,
  fetchDashboardSoilMetrics,
  getLocalDateIso,
  getPlotAreaAcresFromProfile,
  grapesBundleCacheKey,
  GRAPES_API_TIMEOUT_MS,
  isGrapesBundlePayload,
  metricsFromGrapesBundle,
  metricsFromFarmerProfile,
  mergeDashboardMetrics,
  grapesPlotFormBody,
  ripeningMilestonesFromPayload,
  type GrapesBundlePayload,
} from "../utils/grapesEventsBundle";
import {
  fetchRipeningStageMilestones,
  formatMilestoneDate,
} from "../utils/ripeningMilestones";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

/** Recovery Rate / canopy vigour distribution chart plot height (px) */
const RECOVERY_QUALITY_CHART_PLOT_H = 200;

type VigourPixelPct = {
  poor: number;
  moderate: number;
  good: number;
  excellent: number;
};

/** Fallback when API is unavailable (matches prior demo proportions). */
const FALLBACK_VIGOUR_PCT: VigourPixelPct = {
  poor: 12,
  moderate: 28,
  good: 40,
  excellent: 20,
};

function parseCanopyVigourPixelSummary(data: unknown): VigourPixelPct | null {
  if (!data || typeof data !== "object") return null;
  const ps = (data as { pixel_summary?: Record<string, unknown> })
    .pixel_summary;
  if (!ps || typeof ps !== "object") return null;
  const n = (v: unknown) =>
    typeof v === "number" && !Number.isNaN(v) ? v : null;
  const poor = n(ps.poor_vigour_percentage);
  const moderate = n(ps.moderate_vigour_percentage);
  const good = n(ps.good_vigour_percentage);
  const excellent = n(ps.excellent_vigour_percentage);
  if (
    poor === null ||
    moderate === null ||
    good === null ||
    excellent === null
  ) {
    return null;
  }
  return { poor, moderate, good, excellent };
}

function vigourToBarRows(v: VigourPixelPct): {
  pctLabel: string;
  color: string;
  label: string;
  heightPct: number;
}[] {
  const clamp = (x: number) => Math.min(100, Math.max(0, x));
  return [
    {
      label: "Poor",
      color: "#e74c3c",
      pctLabel: `${v.poor.toFixed(v.poor >= 10 ? 1 : 2)}%`,
      heightPct: clamp(v.poor),
    },
    {
      label: "Moderate",
      color: "#f39c12",
      pctLabel: `${v.moderate.toFixed(v.moderate >= 10 ? 1 : 2)}%`,
      heightPct: clamp(v.moderate),
    },
    {
      label: "Good",
      color: "#4a80e8",
      pctLabel: `${v.good.toFixed(v.good >= 10 ? 1 : 2)}%`,
      heightPct: clamp(v.good),
    },
    {
      label: "Excellent",
      color: "#57b86a",
      pctLabel: `${v.excellent.toFixed(v.excellent >= 10 ? 1 : 2)}%`,
      heightPct: clamp(v.excellent),
    },
  ];
}

function dominantVigourCategory(v: VigourPixelPct): {
  name: string;
  pct: number;
  color: string;
} {
  const items: { name: string; pct: number; color: string }[] = [
    { name: "Poor", pct: v.poor, color: "#e74c3c" },
    { name: "Moderate", pct: v.moderate, color: "#f39c12" },
    { name: "Good", pct: v.good, color: "#4a80e8" },
    { name: "Excellent", pct: v.excellent, color: "#57b86a" },
  ];
  return items.reduce((a, b) => (b.pct > a.pct ? b : a));
}

// Type definitions
interface PieChartWithNeedleProps {
  value: number;
  max: number;
  width?: number;
  height?: number;
  title?: string;
  unit?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

interface CustomStressDotProps {
  cx?: number;
  cy?: number;
  payload?: any;
}

interface LineChartData {
  date: string;
  growth: number;
  stress: number;
  water: number;
  moisture: number;
  stressLevel?: number | null;
  isStressEvent?: boolean;
  stressEventData?: any;
}

interface Metrics {
  brix: number | null;
  brixMin: number | null;
  brixMax: number | null;
  recovery: number | null;
  area: number | null;
  biomass: number | null;
  totalBiomass: number | null;
  stressCount: number | null;
  irrigationEvents: number | null;
  sugarYieldMean: number | null;
  daysToHarvest: number | null;
  growthStage: string | null;
  soilPH: number | null;
  organicCarbonDensity: number | null;
  actualYield: number | null;
  cnRatio: number | null;
  sugarYieldMax: number | null;
  sugarYieldMin: number | null;
}

interface VisibleLines {
  growth: boolean;
  stress: boolean;
  water: boolean;
  moisture: boolean;
}

interface LineStyles {
  [key: string]: {
    color: string;
    label: string;
  };
}

interface StressEvent {
  from_date: string;
  to_date: string;
  stress: number;
}

type TimePeriod = "daily" | "weekly" | "monthly" | "yearly";

// Enhanced PieChartWithNeedle component for gauge-style visualization
const PieChartWithNeedle: React.FC<PieChartWithNeedleProps> = ({
  value,
  max,
  width = 60,
  height = 100,
  title = "Gauge",
  unit = "",
}) => {
  const percent = Math.max(0, Math.min(1, value / max));
  const angle = 180 * percent;
  const cx = width / 2;
  const cy = height * 0.9;
  const r = width * 0.35;
  const needleLength = r * 0.9;
  const needleAngle = 180 - angle;
  const rad = (Math.PI * needleAngle) / 180;
  const x = cx + needleLength * Math.cos(rad);
  const y = cy - needleLength * Math.sin(rad);

  const getColor = (percent: number): string => {
    if (percent < 0.3) return "#ef4444";
    if (percent < 0.6) return "#f97316";
    if (percent < 0.8) return "#eab308";
    return "#800080";
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={width} height={height} className="overflow-visible">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="6"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(Math.PI - (angle * Math.PI) / 180)
            } ${cy - r * Math.sin(Math.PI - (angle * Math.PI) / 180)}`}
          fill="none"
          stroke={getColor(percent)}
          strokeWidth="6"
          strokeLinecap="round"
        />
        <line
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke="#374151"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="3" fill="#374151" />
        <text
          x={cx}
          y={cy - r - 8}
          textAnchor="middle"
          className="text-sm font-semibold fill-gray-700"
        >
          {value.toFixed(1)}
          {unit}
        </text>
      </svg>
      <p className="text-xs text-gray-600 mt-1 text-center">{title}</p>
    </div>
  );
};

const BASE_URL = getEventsBaseUrl();
const OPTIMAL_BIOMASS = 150;
const DASHBOARD_API_TIMEOUT_MS = GRAPES_API_TIMEOUT_MS;

type ProfilePlotLite = {
  fastapi_plot_id?: string;
  gat_number?: string;
  plot_number?: string;
  plot_name?: string;
};

/** If agroStats is a GeoJSON FeatureCollection, build a plot_id → row map (same fields as flat agroStats). */
function featureCollectionAgroStatsToPlotMap(fc: any): Record<string, any> {
  const map: Record<string, any> = {};
  const features = fc?.features;
  if (!Array.isArray(features)) return map;
  for (const f of features) {
    const p = f?.properties;
    if (!p || typeof p !== "object") continue;
    const id = p.plot_name ?? p.fastapi_plot_id ?? p.plot_id;
    if (id == null || String(id).trim() === "") continue;
    const key = String(id).trim();
    map[key] = { ...p, geometry: f?.geometry };
  }
  return map;
}

/** Resolve one plot's object from agroStats (keys may be fastapi id, gat_plot, quoted, or nested). */
function extractPlotDataFromAgroStats(
  allPlotsData: any,
  currentPlotId: string,
  profilePlots?: ProfilePlotLite[]
): any {
  if (allPlotsData == null) return null;

  if (
    allPlotsData.type === "FeatureCollection" &&
    Array.isArray(allPlotsData.features)
  ) {
    const mapped = featureCollectionAgroStatsToPlotMap(allPlotsData);
    if (Object.keys(mapped).length > 0) {
      allPlotsData = mapped;
    }
  }

  const looksLikePlotRow = (o: any) =>
    o &&
    typeof o === "object" &&
    !Array.isArray(o) &&
    (o.brix_sugar != null ||
      o.soil != null ||
      o.area_acres != null ||
      o.days_to_harvest != null);

  if (Array.isArray(allPlotsData)) {
    return (
      allPlotsData.find(
        (plot: any) =>
          plot.plot_id === currentPlotId ||
          plot.fastapi_plot_id === currentPlotId ||
          plot.id === currentPlotId ||
          plot.plot_name === currentPlotId
      ) || null
    );
  }

  if (typeof allPlotsData !== "object") return null;

  const reserved = new Set(["data", "plots", "results", "metadata"]);

  const tryMap = (obj: Record<string, any>): any => {
    const candidates = new Set<string>();
    candidates.add(currentPlotId);
    candidates.add(`"${currentPlotId}"`);

    const plotRow = profilePlots?.find((p) => p.fastapi_plot_id === currentPlotId);
    if (plotRow) {
      if (plotRow.gat_number && plotRow.plot_number) {
        const g = `${plotRow.gat_number}_${plotRow.plot_number}`;
        candidates.add(g);
        candidates.add(`"${g}"`);
      }
      if (plotRow.plot_name) {
        candidates.add(plotRow.plot_name);
        candidates.add(`"${plotRow.plot_name}"`);
      }
    }

    for (const k of candidates) {
      const v = obj[k];
      if (v != null && typeof v === "object" && !Array.isArray(v)) return v;
    }

    const keys = Object.keys(obj).filter((k) => !reserved.has(k));
    const norm = (s: string) => s.replace(/"/g, "").replace(/\s/g, "").toLowerCase();
    const target = norm(currentPlotId);
    for (const k of keys) {
      const v = obj[k];
      if (norm(k) === target && v != null && typeof v === "object" && !Array.isArray(v)) {
        return v;
      }
    }

    if (keys.length === 1) {
      const only = obj[keys[0]];
      if (looksLikePlotRow(only)) return only;
    }

    return null;
  };

  let found = tryMap(allPlotsData as Record<string, any>);
  if (found) return found;

  if (
    looksLikePlotRow(allPlotsData) &&
    allPlotsData[currentPlotId] == null &&
    allPlotsData[`"${currentPlotId}"`] == null
  ) {
    return allPlotsData;
  }

  const dataProperty =
    (allPlotsData as any).data ||
    (allPlotsData as any).plots ||
    (allPlotsData as any).results;
  if (dataProperty && typeof dataProperty === "object") {
    if (Array.isArray(dataProperty)) {
      return (
        dataProperty.find(
          (plot: any) =>
            plot.plot_id === currentPlotId ||
            plot.fastapi_plot_id === currentPlotId ||
            plot.id === currentPlotId ||
            plot.plot_name === currentPlotId
        ) || null
      );
    }
    found = tryMap(dataProperty as Record<string, any>);
    if (found) return found;
  }

  return null;
}

function soilMetricsToAgroRow(
  soil: { soilPH: number | null; organicCarbonDensity: number | null }
): { soil: { phh2o: number | null; organic_carbon_stock: number | null } } | null {
  if (soil.soilPH == null && soil.organicCarbonDensity == null) return null;
  return {
    soil: {
      phh2o: soil.soilPH,
      organic_carbon_stock: soil.organicCarbonDensity,
    },
  };
}

/** Loads soil pH + organic carbon (analyze-npk primary; agroStats fallback). */
async function loadDashboardSoilMetrics(
  endDate: string,
  plotId: string,
  profile: any,
  getApiData: (type: string, plotName: string) => unknown
): Promise<{ soilPH: number | null; organicCarbonDensity: number | null }> {
  return fetchDashboardSoilMetrics(
    plotId,
    profile,
    endDate,
    BASE_URL,
    { get: getCache, set: setCache },
    getApiData
  );
}

/** POST /grapes/brix-time-series — fallback only when grapes bundle has no series. */
async function getBrixTimeSeries(plotName: string) {
  const url = `${BASE_URL}/grapes/brix-time-series`;
  const res = await axios.post(url, grapesPlotFormBody(plotName), {
    timeout: 120000,
    headers: { Accept: "application/json" },
  });
  return res.data;
}

function resolveBrixTimeSeriesPayload(
  plotId: string,
  endDate: string,
  getApiData: (type: string, plotName: string) => unknown
): unknown {
  const brixCache = getCache(`brixTimeSeries_${plotId}`);
  if (brixCache) return brixCache;

  const ctxBrix = getApiData("brixTimeSeries", plotId);
  if (ctxBrix) return ctxBrix;

  const bundleCache = getCache(grapesBundleCacheKey(plotId, endDate));
  if (bundleCache) return bundleCache;

  const ctxAgro = getApiData("agroStats", plotId);
  if (isGrapesBundlePayload(ctxAgro)) return ctxAgro;

  return null;
}

function metricsFromLegacyAgroPlot(
  currentPlotData: any,
  stressData: any,
  irrigationData: any
): Metrics {
  const sugarYieldMeanValue = currentPlotData?.brix_sugar?.sugar_yield?.mean ?? null;
  let calculatedBiomass = null;
  let totalBiomassForMetric = null;
  if (sugarYieldMeanValue !== null) {
    const totalBiomass = sugarYieldMeanValue * 1.27;
    const underGroundBiomassInTons = totalBiomass * 0.12;
    calculatedBiomass = underGroundBiomassInTons;
    totalBiomassForMetric = totalBiomass;
  }
  return {
    brix: currentPlotData?.brix_sugar?.brix?.mean ?? null,
    brixMin: currentPlotData?.brix_sugar?.brix?.min ?? null,
    brixMax: currentPlotData?.brix_sugar?.brix?.max ?? null,
    recovery: currentPlotData?.brix_sugar?.recovery?.mean ?? null,
    area: currentPlotData?.area_acres ?? null,
    biomass: calculatedBiomass,
    totalBiomass: totalBiomassForMetric,
    daysToHarvest: currentPlotData?.days_to_harvest ?? null,
    growthStage:
      currentPlotData?.harvest_status ||
      currentPlotData?.Sugarcane_Status ||
      currentPlotData?.growth_stage ||
      currentPlotData?.crop_status ||
      null,
    soilPH: currentPlotData?.soil?.phh2o ?? null,
    organicCarbonDensity:
      currentPlotData?.soil?.organic_carbon_stock ??
      currentPlotData?.organic_carbon_stock ??
      null,
    actualYield: currentPlotData?.brix_sugar?.sugar_yield?.mean ?? null,
    stressCount:
      currentPlotData?.stress_events ?? currentPlotData?.stress_count ?? stressData?.total_events ?? 0,
    irrigationEvents:
      currentPlotData?.irrigation_events ??
      currentPlotData?.irrigation_count ??
      irrigationData?.total_events ??
      null,
    sugarYieldMean: sugarYieldMeanValue,
    cnRatio: null,
    sugarYieldMax: currentPlotData?.brix_sugar?.sugar_yield?.max ?? null,
    sugarYieldMin: currentPlotData?.brix_sugar?.sugar_yield?.min ?? null,
  };
}

// Overlay Component for chart states
interface OverlayProps {
  message: string;
}

const Overlay: React.FC<OverlayProps> = ({ message }) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(255,255,255,0.7)',
      fontWeight: '500',
      zIndex: 10,
      borderRadius: '0.5rem',
    }}
  >
    <p className="text-gray-700 font-semibold">{message}</p>
  </div>
);

// Fallback data for when API fails or no data
const fallbackLabels = ['Day 1', 'Day 2', 'Day 3'];
const fallbackDatasets = [
  {
    label: 'pH',
    data: [0, 0, 0],
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76,175,80,0.2)',
    tension: 0.4,
    fill: true,
  },
  {
    label: 'Brix',
    data: [0, 0, 0],
    borderColor: '#FF9800',
    backgroundColor: 'rgba(255,152,0,0.2)',
    tension: 0.4,
    fill: true,
  },
  {
    label: 'TA',
    data: [0, 0, 0],
    borderColor: '#2196F3',
    backgroundColor: 'rgba(33,150,243,0.2)',
    tension: 0.4,
    fill: true,
  },
];

// Brix Time Series Chart Component
interface BrixTimeSeriesChartProps {
  data: Array<{
    date: string;
    brix: number;
    ph: number;
    ta: number;
  }>;
  isLoading?: boolean;
  error?: string | null;
  /** If true, renders a floating pill with latest values inside the chart area. */
  showLatestValuesInChart?: boolean;
}

const BrixTimeSeriesChart: React.FC<BrixTimeSeriesChartProps> = ({
  data,
  isLoading,
  error,
  showLatestValuesInChart = false,
}) => {
  const latest = useMemo(() => {
    if (!data || data.length === 0) return null;
    // Latest point = last item (API is expected to be chronological)
    const last = data[data.length - 1];
    const toNum = (v: any) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      ph: toNum(last?.ph),
      brix: toNum(last?.brix),
      ta: toNum(last?.ta),
    };
  }, [data]);

  const chartData = useMemo(() => {
    // Use fallback data if no real data available
    if (!data || data.length === 0) {
      return {
        labels: fallbackLabels,
        datasets: fallbackDatasets,
      };
    }

    const labels = data.map(item => {
      const date = new Date(item.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const toNum = (v: any) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    return {
      labels,
      datasets: [
        {
          label: 'pH',
          data: data.map(item => toNum(item.ph)),
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76,175,80,0.2)',
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: 'Brix',
          data: data.map(item => toNum(item.brix)),
          borderColor: '#FF9800',
          backgroundColor: 'rgba(255,152,0,0.2)',
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: 'TA',
          data: data.map(item => toNum(item.ta)),
          borderColor: '#2196F3',
          backgroundColor: 'rgba(33,150,243,0.2)',
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    };
  }, [data]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animations: {
      y: {
        easing: 'easeInOutElastic' as const,
        from: (ctx: any) => {
          if (ctx.type === 'data') {
            if (ctx.mode === 'default' && !ctx.dropped) {
              ctx.dropped = true;
              return 0;
            }
          }
        },
      },
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Date',
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          autoSkip: true,
          // Approx 10-day interval (adaptive)
          callback: function (_value: any, index: number) {
            const labels = (this as any)?.chart?.data?.labels || [];
            const n = labels.length || 1;
            const step = Math.max(1, Math.round(n / 6)); // show ~6 ticks
            return index % step === 0 ? labels[index] : "";
          },
        },
      },
      y: {
        title: {
          display: true,
          text: 'Values (pH, Brix, TA)',
        },
        ticks: {
          padding: 6,
        },
      },
    },
  } as any), []);

  return (
    <div style={{ height: '320px', position: 'relative' }}>
      {/* Latest values (top-center) */}
      {showLatestValuesInChart && latest && !isLoading && !error && (
        <div
          style={{
            position: "absolute",
            // Keep clear of Chart.js legend (which sits at the very top)
            top: 34,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 6,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(15,23,42,0.10)",
            boxShadow: "0 4px 16px rgba(15,23,42,0.10)",
            fontSize: 12,
            fontWeight: 700,
            color: "#0f172a",
            alignItems: "center",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            maxWidth: "calc(100% - 24px)",
          }}
          aria-label="Latest pH, Brix and TA values"
        >
          {([
            { k: "pH", c: "#4CAF50", v: latest.ph, dp: 2 },
            { k: "Brix", c: "#FF9800", v: latest.brix, dp: 2 },
            { k: "TA", c: "#2196F3", v: latest.ta, dp: 2 },
          ] as const).map((m, idx) => (
            <React.Fragment key={m.k}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: m.c,
                    boxShadow: `0 0 0 3px ${m.c}22`,
                  }}
                />
                <span style={{ fontWeight: 800 }}>{m.k}:</span>{" "}
                <span style={{ fontWeight: 800 }}>
                  {m.v != null ? m.v.toFixed(m.dp) : "—"}
                </span>
              </span>
              {idx < 2 && (
                <span style={{ opacity: 0.25, fontWeight: 900 }} aria-hidden>
                  •
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      <ChartLine data={chartData} options={options} />

      {isLoading && <Overlay message="Loading data..." />}
      {error && !isLoading && <Overlay message={`Failed to load data: ${error}`} />}
      {!isLoading && !error && (!data || data.length === 0) && (
        <Overlay message="No data available" />
      )}
    </div>
  );
};

void [TrendingUp, Droplets, Thermometer, Target, Star, OPTIMAL_BIOMASS];

const FarmerDashboard: React.FC = () => {
  const {
    profile,
    loading: profileLoading,
    getFarmerFullName,
  } = useFarmerProfile();
  const { selectedPlotName, setSelectedPlotName, getApiData, setApiData, hasApiData } = useAppContext();

  // Refs avoid effect dependency loops: getApiData/hasApiData change whenever ANY cached API
  // data updates (AppContext), which retriggered fetchAllData + stress/brix in a tight loop.
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const getApiDataRef = useRef(getApiData);
  getApiDataRef.current = getApiData;
  const setApiDataRef = useRef(setApiData);
  setApiDataRef.current = setApiData;
  const hasApiDataRef = useRef(hasApiData);
  hasApiDataRef.current = hasApiData;
  const dashboardLoadInFlightRef = useRef<string | null>(null);
  const [dashboardDataLoading, setDashboardDataLoading] = useState(true);
  const [dashboardLoadError, setDashboardLoadError] = useState<string | null>(null);

  const [currentPlotId, setCurrentPlotId] = useState<string | null>(null);
  const [vigourPixelPct, setVigourPixelPct] = useState<VigourPixelPct | null>(
    null
  );
  const [vigourChartLoading, setVigourChartLoading] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  void [getFarmerFullName, setShowDebugInfo];
  const [lineChartData, setLineChartData] = useState<LineChartData[]>([]);
  // Track if data has already been loaded for current plot to prevent re-fetching
  const dataLoadedRef = useRef<{ [plotId: string]: boolean }>({});
  const prevPlotIdRef = useRef<string | null>(null);
  const [visibleLines, setVisibleLines] = useState<VisibleLines>({
    growth: true,
    stress: true,
    water: true,
    moisture: true,
  });

  const [metrics, setMetrics] = useState<Metrics>({
    brix: null,
    brixMin: null,
    brixMax: null,
    recovery: null,
    area: null,
    biomass: null,
    totalBiomass: null,
    stressCount: null,
    irrigationEvents: null,
    sugarYieldMean: null,
    daysToHarvest: null,
    growthStage: null,
    soilPH: null,
    organicCarbonDensity: null,
    actualYield: null,
    cnRatio: null,
    sugarYieldMax: null,
    sugarYieldMin: null,
  });

  // Mobile layout flag for charts
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const [stressEvents, setStressEvents] = useState<StressEvent[]>([]);
  const [showStressEvents] = useState<boolean>(false);
  const [ndreStressEvents, setNdreStressEvents] = useState<StressEvent[]>([]);
  const [showNDREEvents, setShowNDREEvents] = useState<boolean>(false);
  const [brixTimeSeriesData, setBrixTimeSeriesData] = useState<any[]>([]);
  const [brixTimeSeriesLoading, setBrixTimeSeriesLoading] = useState<boolean>(false);
  const [brixTimeSeriesError, setBrixTimeSeriesError] = useState<string | null>(null);
  /** Bumped when dashboard bundle fetch finishes so the chart can read cache without a duplicate API call. */
  const [brixChartTick, setBrixChartTick] = useState(0);

  const latestAciditySugar = useMemo(() => {
    if (!brixTimeSeriesData || brixTimeSeriesData.length === 0) return null;
    const last = brixTimeSeriesData[brixTimeSeriesData.length - 1];
    const toNum = (v: any) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      ph: toNum(last?.ph),
      brix: toNum(last?.brix),
      ta: toNum(last?.ta),
    };
  }, [brixTimeSeriesData]);
  /** Ripening / Harvest milestones card only (isolated from main dashboard bundle). */
  const [milestoneState, setMilestoneState] = useState<{
    ripeningStartDate: string | null;
    harvestReadyStartDate: string | null;
    loading: boolean;
    error: boolean;
  }>({
    ripeningStartDate: null,
    harvestReadyStartDate: null,
    loading: false,
    error: false,
  });
  const [combinedChartData, setCombinedChartData] = useState<LineChartData[]>(
    []
  );
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("yearly");
  const [aggregatedData, setAggregatedData] = useState<LineChartData[]>([]);

  const lineStyles: LineStyles = {
    growth: { color: "#22c55e", label: "Growth Index" },
    stress: { color: "#ef4444", label: "Stress Index" },
    water: { color: "#3b82f6", label: "Water Index" },
    moisture: { color: "#f59e0b", label: "Moisture Index" },
  };

  // Keep API/cache plot id aligned with global plot selection (dropdown + map + localStorage).
  useEffect(() => {
    if (!profile || profileLoading) return;

    const plotIdOptions: string[] = [];
    for (const p of profile.plots ?? []) {
      if (p.fastapi_plot_id) plotIdOptions.push(String(p.fastapi_plot_id));
      if (p.gat_number && p.plot_number) {
        plotIdOptions.push(`${p.gat_number}_${p.plot_number}`);
      }
    }

    if (plotIdOptions.length === 0) {
      setCurrentPlotId(null);
      return;
    }

    const effective =
      selectedPlotName && plotIdOptions.includes(selectedPlotName)
        ? selectedPlotName
        : plotIdOptions[0];

    setCurrentPlotId(effective);
    if (selectedPlotName !== effective) {
      setSelectedPlotName(effective);
    }
  }, [profile, profileLoading, selectedPlotName, setSelectedPlotName]);

  // Show my-profile data on cards immediately (field area, crop type, soil if present).
  useEffect(() => {
    if (!profile || profileLoading || !currentPlotId) return;
    const fromProfile = metricsFromFarmerProfile(profile, currentPlotId);
    setMetrics((prev) => mergeDashboardMetrics(prev, fromProfile));
  }, [profile, profileLoading, currentPlotId]);

  useEffect(() => {
    if (!currentPlotId) return;
    const profileArea = getPlotAreaAcresFromProfile(profileRef.current, currentPlotId);

    if (prevPlotIdRef.current !== null && prevPlotIdRef.current !== currentPlotId) {
      dataLoadedRef.current = {};
      dashboardLoadInFlightRef.current = null;
      setDashboardDataLoading(true);
      setDashboardLoadError(null);
      setLineChartData([]);
      setAggregatedData([]);
      setCombinedChartData([]);
      setMetrics({
        brix: null,
        brixMin: null,
        brixMax: null,
        recovery: null,
        area: profileArea,
        biomass: null,
        totalBiomass: null,
        stressCount: null,
        irrigationEvents: null,
        sugarYieldMean: null,
        daysToHarvest: null,
        growthStage: null,
        soilPH: null,
        organicCarbonDensity: null,
        actualYield: null,
        cnRatio: null,
        sugarYieldMax: null,
        sugarYieldMin: null,
      });
    } else if (profileArea != null) {
      setMetrics((prev) => (prev.area != null ? prev : { ...prev, area: profileArea }));
    }
    prevPlotIdRef.current = currentPlotId;
  }, [currentPlotId]);

  useEffect(() => {
    if (!currentPlotId) {
      setVigourPixelPct(null);
      setVigourChartLoading(false);
      return;
    }
    if (profileLoading) return;

    let cancelled = false;

    const cached = getApiDataRef.current("canopyVigour", currentPlotId);
    if (cached) {
      const parsed = parseCanopyVigourPixelSummary(cached);
      if (parsed) {
        setVigourPixelPct(parsed);
        setVigourChartLoading(false);
        return;
      }
    }

    setVigourPixelPct(null);
    setVigourChartLoading(true);
    (async () => {
      try {
        const base = getGrapesAdminBaseUrl().replace(/\/+$/, "");
        const url = `${base}/grapes/canopy-vigour1?plot_name=${encodeURIComponent(
          currentPlotId
        )}`;
        const res = await fetch(url, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: { Accept: "application/json" },
        });
        if (cancelled) return;
        if (!res.ok) {
          setVigourPixelPct(FALLBACK_VIGOUR_PCT);
          return;
        }
        const data = await res.json();
        setApiDataRef.current("canopyVigour", currentPlotId, data);
        const parsed = parseCanopyVigourPixelSummary(data);
        setVigourPixelPct(parsed ?? FALLBACK_VIGOUR_PCT);
      } catch {
        if (!cancelled) setVigourPixelPct(FALLBACK_VIGOUR_PCT);
      } finally {
        if (!cancelled) setVigourChartLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPlotId, profileLoading]);

  useEffect(() => {
    if (!currentPlotId || profileLoading) return;
    if (!profileRef.current?.plots?.length) return;

    if (dataLoadedRef.current[currentPlotId]) {
      setDashboardDataLoading(false);
      return;
    }

    if (dashboardLoadInFlightRef.current === currentPlotId) {
      return;
    }

    const preloadedAgroStats = getApiDataRef.current("agroStats", currentPlotId);
    const preloadedIndices = getApiDataRef.current("indices", currentPlotId);

    const tzOffsetMs = new Date().getTimezoneOffset() * 60000;
    const endDate = new Date(Date.now() - tzOffsetMs).toISOString().slice(0, 10);
    const indicesCacheKey = `indices_${currentPlotId}`;
    const cachedIndices = getCache(indicesCacheKey);
    const grapesBundleCacheKey = `farmerDashGrapes_v2_${currentPlotId}_${endDate}`;
    const agroStatsCacheKeyV3 = `agroStats_v3_${currentPlotId}_${endDate}`;
    const agroStatsCacheKey = `agroStats_${currentPlotId}_${endDate}`;
    const cachedGrapesBundle =
      getCache(grapesBundleCacheKey) ||
      (isGrapesBundlePayload(preloadedAgroStats) ? preloadedAgroStats : null);
    const cachedLegacyAgro =
      !cachedGrapesBundle && (getCache(agroStatsCacheKeyV3) || getCache(agroStatsCacheKey));

    const rawPlotPayload = cachedGrapesBundle || preloadedAgroStats || cachedLegacyAgro;
    const stressCacheKeyPre = `stress_${currentPlotId}_NDMI_0.15`;
    const irrigationCacheKeyPre = `irrigation_${currentPlotId}`;
    const indicesToUse = preloadedIndices || cachedIndices || [];

    if (rawPlotPayload) {
      const stressCached = getCache(stressCacheKeyPre);
      const irrigationCached = getCache(irrigationCacheKeyPre);
      const p = profileRef.current;

      if (indicesToUse.length > 0) {
        setLineChartData(indicesToUse);
      }

      if (isGrapesBundlePayload(rawPlotPayload)) {
        const bundleMetrics = metricsFromGrapesBundle(
          rawPlotPayload,
          p,
          currentPlotId,
          stressCached || { total_events: 0 },
          irrigationCached || {},
          null
        );
        setMetrics(bundleMetrics);
        const milestones = ripeningMilestonesFromPayload(rawPlotPayload.ripening);
        if (milestones.ripeningStartDate || milestones.harvestReadyStartDate) {
          setMilestoneState({
            ripeningStartDate: milestones.ripeningStartDate,
            harvestReadyStartDate: milestones.harvestReadyStartDate,
            loading: false,
            error: false,
          });
        }
        const cachedSeries = extractBrixTimeSeriesFromPayload(rawPlotPayload);
        if (cachedSeries.length > 0) {
          setBrixTimeSeriesData(cachedSeries);
          setBrixTimeSeriesLoading(false);
          setBrixTimeSeriesError(null);
        }
        dataLoadedRef.current[currentPlotId] = true;
        setDashboardDataLoading(false);
        void loadDashboardSoilMetrics(
          endDate,
          currentPlotId,
          p,
          getApiDataRef.current
        ).then((soil) => {
          const agroRow = soilMetricsToAgroRow(soil);
          if (!agroRow) return;
          setMetrics(
            metricsFromGrapesBundle(
              rawPlotPayload,
              p,
              currentPlotId,
              stressCached || { total_events: 0 },
              irrigationCached || {},
              agroRow
            )
          );
        });
        if (indicesToUse.length === 0) {
          dashboardLoadInFlightRef.current = currentPlotId;
          void fetchAllData()
            .catch(() => {})
            .finally(() => {
              if (dashboardLoadInFlightRef.current === currentPlotId) {
                dashboardLoadInFlightRef.current = null;
              }
              setDashboardDataLoading(false);
            });
        }
        return;
      }

      const currentPlotData = extractPlotDataFromAgroStats(
        rawPlotPayload,
        currentPlotId,
        p?.plots
      );
      if (currentPlotData) {
        setMetrics(metricsFromLegacyAgroPlot(currentPlotData, stressCached, irrigationCached));
      }
      dataLoadedRef.current[currentPlotId] = true;
      setDashboardDataLoading(false);
      if (indicesToUse.length === 0) {
        dashboardLoadInFlightRef.current = currentPlotId;
        void fetchAllData()
          .catch(() => {})
          .finally(() => {
            if (dashboardLoadInFlightRef.current === currentPlotId) {
              dashboardLoadInFlightRef.current = null;
            }
            setDashboardDataLoading(false);
          });
      }
      return;
    }

    const profileArea = getPlotAreaAcresFromProfile(profileRef.current, currentPlotId);
    if (profileArea != null) {
      setMetrics((prev) => ({ ...prev, area: profileArea }));
    }

    setDashboardDataLoading(true);
    setDashboardLoadError(null);
    dashboardLoadInFlightRef.current = currentPlotId;
    fetchAllData()
      .catch(() => { })
      .finally(() => {
        if (dashboardLoadInFlightRef.current === currentPlotId) {
          dashboardLoadInFlightRef.current = null;
        }
        setBrixChartTick((t) => t + 1);
        setDashboardDataLoading(false);
      });
    // Re-run when plot list appears (profile can hydrate after profileLoading is already false).
  }, [currentPlotId, profileLoading, profile?.plots?.length]);

  useEffect(() => {
    if (lineChartData.length > 0) {
      const aggregated = aggregateDataByPeriod(lineChartData, timePeriod);
      setAggregatedData(aggregated);
    }
  }, [lineChartData, timePeriod]);

  const aggregateDataByPeriod = (
    data: LineChartData[],
    period: TimePeriod
  ): LineChartData[] => {
    if (period === "daily") {
      // Filter to last 1 day for daily period
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Set to midnight for accurate date comparison
      const today = new Date(now);

      let filteredData = data.filter((item) => {
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0); // Set to midnight for accurate comparison
        return itemDate.getTime() === today.getTime();
      });

      if (filteredData.length === 0) {
        // If no data for today, get the most recent day
        const sorted = [...data].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        if (sorted.length > 0) {
          const mostRecentDate = new Date(sorted[0].date);
          mostRecentDate.setHours(0, 0, 0, 0);
          filteredData = data.filter((item) => {
            const itemDate = new Date(item.date);
            itemDate.setHours(0, 0, 0, 0);
            return itemDate.getTime() === mostRecentDate.getTime();
          });
        }
      }

      // If only one data point, duplicate it to create a line representation
      if (filteredData.length === 1) {
        const singlePoint = filteredData[0];
        // Create a second point with the same values to render as a horizontal line
        const secondPoint = {
          ...singlePoint,
          date: singlePoint.date, // Same date to create a horizontal line
        };
        return [singlePoint, secondPoint];
      }

      return filteredData;
    }

    // Weekly = show last 7 days trend (no week-bucketing; avoids collapsing into 1 point)
    if (period === "weekly") {
      // IMPORTANT: Weekly window should be based on the latest available data point
      // (not "today"), otherwise the range can be wrong when backend data is delayed.
      const sortedDesc = [...data].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const end = sortedDesc.length ? new Date(sortedDesc[0].date) : new Date();
      end.setHours(0, 0, 0, 0);

      const start = new Date(end);
      start.setDate(end.getDate() - 6); // include end day = 7 days total

      const weeklyData = data
        .filter((item) => {
          const itemDate = new Date(item.date);
          itemDate.setHours(0, 0, 0, 0);
          return itemDate >= start && itemDate <= end;
        })
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

      if (weeklyData.length === 1) {
        return [weeklyData[0], { ...weeklyData[0] }];
      }

      if (weeklyData.length === 0) {
        const sorted = [...data].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const recent = sorted.slice(0, 7).reverse();
        if (recent.length === 1) return [recent[0], { ...recent[0] }];
        return recent;
      }

      return weeklyData;
    }

    let filteredData = data;

    const groupedData: { [key: string]: LineChartData[] } = {};

    filteredData.forEach((item) => {
      const date = new Date(item.date);
      let key: string;

      switch (period) {
        case "monthly":
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
            2,
            "0"
          )}`;
          break;
        case "yearly":
          return;
        default:
          key = item.date;
      }

      if (!groupedData[key]) {
        groupedData[key] = [];
      }
      groupedData[key].push(item);
    });

    if (period === "yearly") {
      return [...data].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    }

    const result = Object.entries(groupedData)
      .map(([key, items]) => {
        const avgGrowth =
          items.reduce((sum, item) => sum + item.growth, 0) / items.length;
        const avgStress =
          items.reduce((sum, item) => sum + item.stress, 0) / items.length;
        const avgWater =
          items.reduce((sum, item) => sum + item.water, 0) / items.length;
        const avgMoisture =
          items.reduce((sum, item) => sum + item.moisture, 0) / items.length;

        let displayDate: string;
        if (period === "monthly") {
          const [year, month] = key.split("-");
          displayDate = new Date(
            parseInt(year),
            parseInt(month) - 1
          ).toLocaleDateString("en-US", { month: "short", year: "numeric" });
        } else {
          displayDate = key;
        }

        return {
          date: key,
          displayDate,
          growth: avgGrowth,
          stress: avgStress,
          water: avgWater,
          moisture: avgMoisture,
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return result;
  };

  const fetchAllData = async (): Promise<void> => {
    console.log(`🚀 fetchAllData called with currentPlotId: ${currentPlotId}`);

    if (!currentPlotId) {
      console.warn("⚠️ FarmerDashboard: No plot ID available");
      return;
    }

    // Check if data already exists in cache before fetching
    const tzOffsetMs = new Date().getTimezoneOffset() * 60000;
    const endDate = new Date(Date.now() - tzOffsetMs)
      .toISOString()
      .slice(0, 10);
    const indicesCacheKey = `indices_${currentPlotId}`;
    const grapesBundleCacheKey = `farmerDashGrapes_v2_${currentPlotId}_${endDate}`;
    const legacyAgroKeyV3 = `agroStats_v3_${currentPlotId}_${endDate}`;
    const legacyAgroKey = `agroStats_${currentPlotId}_${endDate}`;

    const hasIndices = hasApiDataRef.current("indices", currentPlotId);
    const cachedIndices = getCache(indicesCacheKey);
    const preloadedPlotPayload =
      getApiDataRef.current("agroStats", currentPlotId) ||
      getCache(grapesBundleCacheKey) ||
      getCache(legacyAgroKeyV3) ||
      getCache(legacyAgroKey);
    const stressCacheKeyFast = `stress_${currentPlotId}_NDMI_0.15`;
    const irrigationCacheKeyFast = `irrigation_${currentPlotId}`;

    // If both plot metrics + indices exist in cache, skip fetching
    if (preloadedPlotPayload && (hasIndices || cachedIndices)) {
      console.log('✅ FarmerDashboard: Data already exists in cache, loading from cache');
      const indicesToUse = getApiDataRef.current("indices", currentPlotId) || cachedIndices || [];
      setLineChartData(indicesToUse);

      const stressCached = getCache(stressCacheKeyFast);
      const irrigationCached = getCache(irrigationCacheKeyFast);
      const p = profileRef.current;

      if (isGrapesBundlePayload(preloadedPlotPayload)) {
        setMetrics(
          metricsFromGrapesBundle(
            preloadedPlotPayload,
            p,
            currentPlotId,
            stressCached || { total_events: 0 },
            irrigationCached || {},
            null
          )
        );
        void loadDashboardSoilMetrics(
          endDate,
          currentPlotId,
          p,
          getApiDataRef.current
        ).then((soil) => {
          const agroRow = soilMetricsToAgroRow(soil);
          if (!agroRow) return;
          setMetrics(
            metricsFromGrapesBundle(
              preloadedPlotPayload,
              p,
              currentPlotId,
              stressCached || { total_events: 0 },
              irrigationCached || {},
              agroRow
            )
          );
        });
      } else {
        const currentPlotData = extractPlotDataFromAgroStats(
          preloadedPlotPayload,
          currentPlotId,
          p?.plots
        );
        if (currentPlotData) {
          setMetrics(metricsFromLegacyAgroPlot(currentPlotData, stressCached, irrigationCached));
        }
      }
      dataLoadedRef.current[currentPlotId] = true;
      return; // Exit early, don't fetch
    }

    const plotIds = collectPlotApiIds(profileRef.current, currentPlotId);
    setDashboardLoadError(null);

    const profileArea = getPlotAreaAcresFromProfile(profileRef.current, currentPlotId);
    if (profileArea != null) {
      setMetrics((prev) => ({ ...prev, area: profileArea }));
    }

    try {
      const endDate = getLocalDateIso();
      const stressCacheKey = `stress_${currentPlotId}_NDMI_0.15`;
      const irrigationCacheKey = `irrigation_${currentPlotId}`;
      const grapesBundleCacheKey = `farmerDashGrapes_v2_${currentPlotId}_${endDate}`;

      const fetchIndices = async (): Promise<any[] | null> => {
        const indicesCacheKey = `indices_${currentPlotId}`;
        const cached = getCache(indicesCacheKey);
        if (cached) return cached;
        for (const id of plotIds) {
          try {
            const res = await axios.get(
              `${BASE_URL}/plots/${encodeURIComponent(id)}/indices`,
              { timeout: DASHBOARD_API_TIMEOUT_MS }
            );
            const mapped = res.data.map((item: any) => ({
              date: new Date(item.date).toISOString().split("T")[0],
              growth: item.NDVI,
              stress: item.NDMI,
              water: item.NDWI,
              moisture: item.NDRE,
            }));
            setCache(indicesCacheKey, mapped);
            return mapped;
          } catch (err) {
            console.warn(`⚠️ indices failed for plot "${id}":`, err);
          }
        }
        return null;
      };

      const fetchStress = async (): Promise<any> => {
        const cached = getCache(stressCacheKey);
        if (cached) return cached;
        for (const id of plotIds) {
          try {
            const res = await axios.get(
              `${BASE_URL}/plots/${encodeURIComponent(id)}/stress?index_type=NDRE&threshold=0.15`,
              { timeout: DASHBOARD_API_TIMEOUT_MS }
            );
            setCache(stressCacheKey, res.data);
            return res.data;
          } catch (err) {
            console.warn(`⚠️ stress failed for plot "${id}":`, err);
          }
        }
        return { total_events: 0, events: [] };
      };

      const fetchIrrigation = async (): Promise<any> => {
        const cached = getCache(irrigationCacheKey);
        if (cached) return cached;
        for (const id of plotIds) {
          try {
            const res = await axios.get(
              `${BASE_URL}/plots/${encodeURIComponent(id)}/irrigation?threshold_ndmi=0.05&threshold_ndwi=0.05&min_days_between_events=10`,
              { timeout: DASHBOARD_API_TIMEOUT_MS }
            );
            setCache(irrigationCacheKey, res.data);
            return res.data;
          } catch (err) {
            console.warn(`⚠️ irrigation failed for plot "${id}":`, err);
          }
        }
        return { total_events: null };
      };

      const fetchGrapesBundle = async (): Promise<GrapesBundlePayload | null> => {
        const cached = getCache(grapesBundleCacheKey);
        if (cached && isGrapesBundlePayload(cached)) return cached;
        try {
          const { bundle } = await fetchGrapesEventsBundleForPlot(BASE_URL, plotIds);
          setCache(grapesBundleCacheKey, bundle);
          setApiDataRef.current("agroStats", currentPlotId, bundle);
          return bundle;
        } catch (err) {
          console.error("❌ Error fetching grapes events bundle:", err);
          return null;
        }
      };

      const soilMetricsPromise = loadDashboardSoilMetrics(
        endDate,
        currentPlotId,
        profileRef.current,
        getApiDataRef.current
      );

      const [rawIndices, stressData, irrigationData, grapesBundle, soilOnly] =
        await Promise.all([
          fetchIndices(),
          fetchStress(),
          fetchIrrigation(),
          fetchGrapesBundle(),
          soilMetricsPromise,
        ]);

      if (rawIndices?.length) {
        setLineChartData(rawIndices);
        setApiDataRef.current("indices", currentPlotId, rawIndices);
      }

      setStressEvents(stressData?.events ?? []);

      const agroPlotRowForSoil = soilMetricsToAgroRow(soilOnly);

      const profilePartial = metricsFromFarmerProfile(
        profileRef.current,
        currentPlotId
      );

      const newMetrics = grapesBundle
        ? mergeDashboardMetrics(
            metricsFromGrapesBundle(
              grapesBundle,
              profileRef.current,
              currentPlotId,
              stressData,
              irrigationData,
              agroPlotRowForSoil
            ) as Metrics,
            profilePartial
          )
        : mergeDashboardMetrics(
            {
              ...emptyGrapesDashboardMetrics(),
              stressCount: stressData?.total_events ?? 0,
              irrigationEvents: irrigationData?.total_events ?? null,
            },
            profilePartial,
            {
              soilPH: soilOnly.soilPH,
              organicCarbonDensity: soilOnly.organicCarbonDensity,
            }
          );

      if (!grapesBundle && !rawIndices?.length) {
        setDashboardLoadError(
          ""
        );
      } else if (!grapesBundle) {
        // setDashboardLoadError(
          // "Some metrics are unavailable (grapes API timed out). Field indices chart may still load below."
        // );
      }

      console.log(`📊 Metrics from grapes bundle:`, {
        plotId: currentPlotId,
        hasBundle: !!grapesBundle,
        hasIndices: !!rawIndices?.length,
        metrics: newMetrics,
      });

      if (grapesBundle) {
        const aciditySeries = extractBrixTimeSeriesFromPayload(grapesBundle);
        if (aciditySeries.length > 0) {
          setBrixTimeSeriesData(aciditySeries);
          setBrixTimeSeriesLoading(false);
          setBrixTimeSeriesError(null);
          const brixPayload = grapesBundle.brix ?? { time_series: aciditySeries };
          setCache(`brixTimeSeries_${currentPlotId}`, brixPayload);
          setApiDataRef.current("brixTimeSeries", currentPlotId, brixPayload);
        }

        const milestones = ripeningMilestonesFromPayload(grapesBundle.ripening);
        if (milestones.ripeningStartDate || milestones.harvestReadyStartDate) {
          setMilestoneState({
            ripeningStartDate: milestones.ripeningStartDate,
            harvestReadyStartDate: milestones.harvestReadyStartDate,
            loading: false,
            error: false,
          });
        }
      }

      setMetrics(newMetrics);
      setApiDataRef.current("farmerDashboard", currentPlotId, {
        growthStage: newMetrics.growthStage,
      });

      dataLoadedRef.current[currentPlotId] = true;
    } catch (err) {
      console.error("Error fetching data:", err);
      setDashboardLoadError(
        "Failed to load dashboard data. Please refresh or try again in a moment."
      );
    }
  };

  const fetchNDREStressEvents = async (): Promise<void> => {
    if (!currentPlotId) {
      console.warn(
        "⚠️ FarmerDashboard: No plot ID available for NDRE stress events"
      );
      return;
    }

    try {
      const res = await axios.get(
        `${BASE_URL}/plots/${currentPlotId}/stress?index_type=NDRE&threshold=0.15`,
        { timeout: 300000 } // 5 minutes timeout
      );
      const data = res.data;
      setNdreStressEvents(data.events ?? []);
      setShowNDREEvents(true);
    } catch (err) {
      console.error("Error fetching NDRE stress events:", err);
    }
  };
  void fetchNDREStressEvents;

  useEffect(() => {
    if (aggregatedData.length > 0) {
      const combined = aggregatedData.map((point) => {
        const stressEvent = showNDREEvents
          ? ndreStressEvents.find((event) => {
            const eventStart = new Date(event.from_date);
            const eventEnd = new Date(event.to_date);
            const pointDate = new Date(point.date);
            return pointDate >= eventStart && pointDate <= eventEnd;
          })
          : null;

        return {
          ...point,
          stressLevel: stressEvent ? stressEvent.stress : null,
          isStressEvent: !!stressEvent,
          stressEventData: stressEvent,
        };
      });

      setCombinedChartData(combined);
    }
  }, [aggregatedData, ndreStressEvents, showNDREEvents]);

  // Acidity & sugar chart — reuse grapes bundle (same POST as metrics); avoid duplicate 5min call.
  useEffect(() => {
    let cancelled = false;

    const applySeries = (series: ReturnType<typeof extractBrixTimeSeriesFromPayload>) => {
      if (cancelled) return;
      setBrixTimeSeriesData(series);
      setBrixTimeSeriesLoading(false);
      setBrixTimeSeriesError(series.length > 0 ? null : "No acidity or sugar history for this plot yet.");
    };

    const cacheBrixPayload = (payload: unknown) => {
      const brixPayload =
        isGrapesBundlePayload(payload) ? (payload as { brix?: unknown }).brix : payload;
      if (brixPayload) {
        setCache(`brixTimeSeries_${currentPlotId}`, brixPayload);
        setApiDataRef.current("brixTimeSeries", currentPlotId!, brixPayload);
      }
    };

    const loadBrixTimeSeries = async () => {
      if (!currentPlotId || profileLoading) {
        setBrixTimeSeriesLoading(false);
        return;
      }

      const endDate = getLocalDateIso();
      const cachedPayload = resolveBrixTimeSeriesPayload(
        currentPlotId,
        endDate,
        getApiDataRef.current
      );
      const cachedSeries = extractBrixTimeSeriesFromPayload(cachedPayload);
      if (cachedSeries.length > 0) {
        console.log("✅ Acidity & sugar chart: using cached grapes/brix data");
        applySeries(cachedSeries);
        return;
      }

      // Dashboard bundle fetch already includes /grapes/brix-time-series — wait, don't duplicate.
      if (dashboardLoadInFlightRef.current === currentPlotId) {
        setBrixTimeSeriesLoading(true);
        setBrixTimeSeriesError(null);
        return;
      }

      setBrixTimeSeriesLoading(true);
      setBrixTimeSeriesError(null);

      try {
        console.log("🌱 Acidity & sugar chart: fallback brix-time-series for plot:", currentPlotId);
        const data = await getBrixTimeSeries(currentPlotId);
        if (cancelled) return;

        const series = extractBrixTimeSeriesFromPayload(data);
        applySeries(series);
        if (data) cacheBrixPayload(data);
      } catch (error: any) {
        if (cancelled) return;
        console.error("❌ Error fetching brix time series:", error);
        const msg = error?.message || "Failed to load data";
        setBrixTimeSeriesError(
          msg.includes("timeout")
            ? "Chart data is taking too long. Metrics may still load from the dashboard bundle."
            : msg
        );
        setBrixTimeSeriesData([]);
        setBrixTimeSeriesLoading(false);
      }
    };

    loadBrixTimeSeries();
    return () => {
      cancelled = true;
    };
  }, [currentPlotId, profileLoading, brixChartTick]);

  // Ripening / Harvest milestones (this card only; GET /grapes/ripening-stage?plot_name=…)
  useEffect(() => {
    if (!currentPlotId || profileLoading) {
      setMilestoneState({
        ripeningStartDate: null,
        harvestReadyStartDate: null,
        loading: false,
        error: false,
      });
      return;
    }

    let cancelled = false;
    setMilestoneState((s) => ({
      ...s,
      loading: true,
      error: false,
    }));

    (async () => {
      const plotIds = collectPlotApiIds(profileRef.current, currentPlotId);
      let lastError: unknown = null;

      for (const plotId of plotIds) {
        try {
          const data = await fetchRipeningStageMilestones(
            getEventsBaseUrl(),
            plotId
          );
          if (cancelled) return;
          const milestones = ripeningMilestonesFromPayload(data);
          setMilestoneState({
            ripeningStartDate: milestones.ripeningStartDate,
            harvestReadyStartDate: milestones.harvestReadyStartDate,
            loading: false,
            error: false,
          });
          if (milestones.cropStatus) {
            setMetrics((prev) =>
              mergeDashboardMetrics(prev, { growthStage: milestones.cropStatus })
            );
          }
          return;
        } catch (e) {
          lastError = e;
        }
      }

      console.error("Ripening milestones fetch failed:", lastError);
      if (!cancelled) {
        setMilestoneState((s) => ({
          ripeningStartDate: s.ripeningStartDate,
          harvestReadyStartDate: s.harvestReadyStartDate,
          loading: false,
          error: !(s.ripeningStartDate || s.harvestReadyStartDate),
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPlotId, profileLoading]);

  const toggleLine = (key: string): void => {
    const isOnlyThis = Object.keys(visibleLines).every((k) =>
      k === key
        ? visibleLines[k as keyof VisibleLines]
        : !visibleLines[k as keyof VisibleLines]
    );

    if (isOnlyThis) {
      setVisibleLines({
        growth: true,
        stress: true,
        water: true,
        moisture: true,
      });
    } else {
      setVisibleLines({
        growth: key === "growth",
        stress: key === "stress",
        water: key === "water",
        moisture: key === "moisture",
      });
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStressColor = (stress: number): string => {
    if (stress < 0.1) return "#dc2626";
    if (stress < 0.15) return "#f97316";
    return "#eab308";
  };

  const getStressSeverityLabel = (stress: number): string => {
    if (stress < 0.1) return "High";
    if (stress < 0.15) return "Medium";
    return "Low";
  };

  const CustomStressDot: React.FC<CustomStressDotProps> = (props) => {
    const { cx, cy, payload } = props;

    if (!payload || !payload.isStressEvent) return null;

    const color = getStressColor(payload.stressLevel);
    const radius =
      payload.stressLevel < 0.1 ? 10 : payload.stressLevel < 0.15 ? 8 : 6;

    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={radius + 1}
          fill="white"
          stroke={color}
          strokeWidth={2}
          fillOpacity={0.9}
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill={color}
          fillOpacity={0.8}
          stroke={color}
          strokeWidth={1}
        />
      </g>
    );
  };

  const CustomTooltip: React.FC<CustomTooltipProps> = ({
    active,
    payload,
    label,
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border border-gray-200 rounded-lg shadow-lg backdrop-blur-sm">
          <p className="text-xs font-semibold text-gray-800 mb-1">
            {timePeriod === "monthly" ? label : formatDate(label || "")}
          </p>
          {payload.map((entry, index) => {
            let displayValue = "";
            let displayLabel = "";

            if (
              entry.dataKey === "stressLevel" &&
              entry.payload?.isStressEvent
            ) {
              displayValue = `${Number(entry.value).toFixed(
                4
              )} (${getStressSeverityLabel(entry.value)})`;
              displayLabel = "NDRE Stress Level";
            } else if (lineStyles[entry.dataKey as keyof LineStyles]) {
              const value = entry.value;
              const numericValue =
                typeof value === "number" ? value : parseFloat(value);
              displayValue = !isNaN(numericValue)
                ? numericValue.toFixed(4)
                : "N/A";
              displayLabel =
                lineStyles[entry.dataKey as keyof LineStyles]?.label ||
                entry.dataKey;
            } else {
              return null;
            }

            return (
              <div key={index} className="flex items-center gap-1 mb-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-gray-600">
                  {displayLabel}: {displayValue}
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  const TimePeriodToggle: React.FC = () => (
    <div className="flex flex-wrap gap-1 mb-3">
      {(["daily", "weekly", "monthly", "yearly"] as TimePeriod[]).map(
        (period) => (
          <button
            key={period}
            onClick={() => setTimePeriod(period)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 ${timePeriod === period
              ? "bg-blue-500 text-white shadow-md transform scale-105"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm"
              }`}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </button>
        )
      )}
    </div>
  );

  const ChartLegend: React.FC = () => (
    <div className="flex flex-wrap gap-1 text-xs font-medium mb-2">
      {Object.entries(lineStyles).map(([key, { color, label }]) => (
        <button
          key={key}
          onClick={() => toggleLine(key)}
          className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all duration-200 ${visibleLines[key as keyof VisibleLines]
            ? "bg-white shadow-sm transform scale-105"
            : "bg-gray-100 opacity-50 hover:opacity-75"
            }`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-gray-700 text-xs">{label}</span>
        </button>
      ))}
      {showNDREEvents && (
        <div className="flex items-center gap-1 ml-1 px-2 py-1 bg-orange-100 rounded-md border border-orange-300">
          <div className="w-2 h-2 rounded-full bg-orange-500 border border-orange-600"></div>
          <span className="text-orange-800 font-semibold text-xs">Stress</span>
        </div>
      )}
    </div>
  );

  const currentBiomass = metrics.biomass || 0;
  const totalBiomass = metrics.totalBiomass || 0;

  const biomassData = [
    {
      name: "Total Biomass",
      value: totalBiomass,
      fill: "#3b82f6",
    },
    {
      name: "Underground Biomass",
      value: currentBiomass,
      fill: "#10b981",
    },
  ];

  const recoveryQualityBarRows = useMemo(
    () => vigourToBarRows(vigourPixelPct ?? FALLBACK_VIGOUR_PCT),
    [vigourPixelPct]
  );
  const dominantRecoveryQuality = useMemo(
    () => dominantVigourCategory(vigourPixelPct ?? FALLBACK_VIGOUR_PCT),
    [vigourPixelPct]
  );

  const retryDashboardLoad = () => {
    if (!currentPlotId) return;
    dataLoadedRef.current = {};
    dashboardLoadInFlightRef.current = null;
    setDashboardLoadError(null);
    setDashboardDataLoading(true);
    void fetchAllData()
      .catch(() => {})
      .finally(() => setDashboardDataLoading(false));
  };

  const showLoadingDataBanner = profileLoading;
  const showApiLoadingHint = dashboardDataLoading && !profileLoading;

  if (!currentPlotId && !profileLoading) {
    return (
      <div className="min-h-screen dashboard-bg p-3 flex items-center justify-center">
        <div className="text-center bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-8 max-w-md">
          <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            No Plots Found
          </h3>
          <p className="text-gray-600">
            No farm plots are registered to your account. Please contact your
            field officer to register your farm plot.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen dashboard-bg p-3" style={{
      width: '100%',
      maxWidth: '100vw',
      overflowX: 'hidden',
      boxSizing: 'border-box',
      margin: '0 auto',
      display: 'flex',
      justifyContent: 'center'
    }}>
      <div className="max-w-7xl space-y-4" style={{
        width: '100%',
        maxWidth: '1280px',
        minWidth: 0,
        boxSizing: 'border-box',
        margin: '0 auto',
        padding: '0'
      }}>
        {showLoadingDataBanner && (
          <div
            className="loading-indicator"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#059669",
              fontWeight: 500,
              padding: "8px 12px",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            Loading farmer profile...
          </div>
        )}

            {/* <span>Fetching plot metrics from server (up to 30s)…</span> */}
      

        {dashboardLoadError && !profileLoading && (
          <div
            role="alert"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              color: "#b45309",
              fontWeight: 500,
              padding: "8px 12px",
              background: "#fffbeb",
              border: "1px solid #fcd34d",
              borderRadius: 6,
              marginBottom: 16,
              fontSize: "0.875rem",
            }}
          >
            <span>{dashboardLoadError}</span>
            <button
              type="button"
              onClick={retryDashboardLoad}
              disabled={dashboardDataLoading}
              className="px-3 py-1 rounded-md text-sm font-semibold bg-amber-100 hover:bg-amber-200 border border-amber-300 disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}

        {/* Plot Selector */}
        {profile && !profileLoading && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <label className="font-semibold text-gray-700 whitespace-nowrap">Select Plot:</label>
              <select
                value={selectedPlotName || ""}
                onChange={(e) => {
                  setSelectedPlotName(e.target.value);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto min-w-0 sm:min-w-[200px] max-w-full sm:max-w-xs"
              >
                {profile.plots?.map(plot => {
                  let displayName = '';

                  if (plot.gat_number && plot.plot_number &&
                    plot.gat_number.trim() !== "" && plot.plot_number.trim() !== "" &&
                    !plot.gat_number.startsWith('GAT_') && !plot.plot_number.startsWith('PLOT_')) {
                    displayName = `${plot.gat_number}_${plot.plot_number}`;
                  } else if (plot.gat_number && plot.gat_number.trim() !== "" && !plot.gat_number.startsWith('GAT_')) {
                    displayName = plot.gat_number;
                  } else if (plot.plot_number && plot.plot_number.trim() !== "" && !plot.plot_number.startsWith('PLOT_')) {
                    displayName = plot.plot_number;
                  } else {
                    const village = plot.address?.village;
                    const taluka = plot.address?.taluka;

                    if (village) {
                      displayName = `Plot in ${village}`;
                      if (taluka) displayName += `, ${taluka}`;
                    } else {
                      displayName = 'Plot (No GAT/Plot Number)';
                    }
                  }

                  return (
                    <option key={plot.fastapi_plot_id} value={plot.fastapi_plot_id}>
                      {displayName}
                    </option>
                  );
                }) || []}
              </select>
            </div>
          </div>
        )}

        {/* Debug Info Panel */}
        {showDebugInfo && (
          <div className="bg-gray-900 rounded-xl shadow-lg p-4 border border-gray-700">
            <h3 className="text-sm font-bold text-green-400 mb-2 flex items-center gap-2">
              <Activity className="w-6 h-6 sm:w-7 sm:h-7" />
              Debug Information - API Response
            </h3>
            <div className="bg-black rounded-lg p-3 overflow-auto max-h-96">
              <pre className="text-xs text-green-300 font-mono">
                {JSON.stringify(
                  {
                    farmerProfile: profile,
                    extractedPlotId: currentPlotId,
                    plotIdType: typeof currentPlotId,
                    availablePlots:
                      profile?.plots?.map((p) => p.fastapi_plot_id) || [],
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2
                )}
              </pre>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              💡 Check the browser console for detailed extraction logs
            </p>
          </div>
        )}

        {/* Top Priority Metrics - 4 Key Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <div className="rounded-xl p-5 hover:shadow-md transition-all duration-300 flex flex-col h-full relative overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)', width: '100%', maxWidth: '100%', boxSizing: 'border-box', backgroundColor: '#eff2e7' }}>
            <img
              src="/Image/crop images/Fields.png"
              alt=""
              aria-hidden
              className="absolute left-2 top-2 w-20 h-20 sm:w-24 sm:h-24 object-contain opacity-100 z-0 pointer-events-none select-none"
              style={{ backgroundColor: 'transparent', mixBlendMode: 'normal' }}
            />
            <div className="flex items-center justify-end mb-2 pt-2 relative z-10">
              <div className="text-right">
                <div className="text-3xl font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {metrics.area?.toFixed(2) || "-"}
                </div>
                <div className="text-base font-semibold" style={{ color: '#6bb043' }}>
                  acre
                </div>
              </div>
            </div>
            <p className="text-sm font-medium mt-auto pt-3 relative z-10" style={{ color: '#616161', lineHeight: '1.2' }}>Field Area</p>
          </div>

          <div className="rounded-xl p-4 hover:shadow-md transition-all duration-300 flex flex-col h-full relative overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)', width: '100%', maxWidth: '100%', boxSizing: 'border-box', backgroundColor: '#f5f1e1' }}>
            <img
              src="/Image/crop images/Crop Status.png"
              alt=""
              aria-hidden
              className="absolute left-1 top-5 w-24 h-24 sm:w-28 sm:h-28 object-contain opacity-100 z-0 pointer-events-none select-none"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
            <div className="flex items-center justify-end mb-2 pt-3 relative z-10">
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {metrics.growthStage || "-"}
                </div>
                <div className="text-sm font-semibold" style={{ color: '#6bb043', visibility: 'hidden' }}>
                  &nbsp;
                </div>
              </div>
            </div>
            <p className="text-sm font-medium mt-auto pt-3 relative z-10" style={{ color: '#616161', lineHeight: '1.2' }}>Crop Status</p>
          </div>

          <div className="rounded-xl p-4 hover:shadow-md transition-all duration-300 flex flex-col h-full relative overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)', width: '100%', maxWidth: '100%', boxSizing: 'border-box', backgroundColor: '#f3f5e9' }}>
            <Calendar className="absolute left-7 top-7 w-12 h-12 opacity-100 z-0 pointer-events-none select-none" strokeWidth={2} style={{ color: '#5a7c3a' }} aria-hidden />

            <div className="flex flex-col flex-1 min-h-0 relative z-10 pl-16" aria-busy={milestoneState.loading}>
              {([
                { label: "Ripening Start", iso: milestoneState.ripeningStartDate },
                { label: "Harvest Ready", iso: milestoneState.harvestReadyStartDate },
              ] as const).map((row) => {
                const showDash = milestoneState.loading || milestoneState.error;
                const dateText = showDash ? "—" : formatMilestoneDate(row.iso);
                const subtleValue = showDash || dateText === "Not available";
                return (
                  <div key={row.label} className="flex flex-col items-end gap-0.5 py-1">
                    <div
                      className="text-sm font-bold tabular-nums"
                      style={{ color: subtleValue ? '#94a3b8' : '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}
                      title={subtleValue ? undefined : dateText}
                    >
                      {dateText}
                    </div>
                    {/* Match Field Area card label color */}
                    <div className="text-base font-semibold" style={{ color: '#6bb043' }}>
                      {row.label}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-sm font-medium mt-auto pt-0 -mt-2 relative z-10" style={{ color: '#616161', lineHeight: '1.2' }}>Ripening/Harvest</p>
          </div>

          <div
            className="relative flex-1 h-full min-h-[160px] bg-[#f8f9f1] rounded-[1rem] p-6 shadow-sm border border-white/50 overflow-hidden hover:shadow-md transition-all"
          >
            <img
              src="/Image/crop images/yield.png"
              alt=""
              aria-hidden
              className="absolute left-7 top-5 w-12 h-16 sm:w-20 sm:h-20 object-contain opacity-100 z-0 pointer-events-none select-none"
            />
            <div className="flex items-center justify-end mb-2 pt-2 relative z-10">
              <div className="text-right">
                <div className="text-3xl font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {(metrics.growthStage || "").toLowerCase().includes("harvested")
                    ? "0"
                    : (metrics.brix !== null && metrics.brix !== undefined ? (metrics.brix === 0 ? "0" : metrics.brix) : "-")}
                </div>
                <div className="text-base font-semibold" style={{ color: '#6bb043' }}>
                  °Brix
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-200 relative z-10">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium" style={{ color: '#616161' }}>Sugar Content</span>
                {!(metrics.growthStage || "").toLowerCase().includes("harvested") &&
                  metrics.daysToHarvest != null && (
                    <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>
                      {metrics.daysToHarvest} days
                    </span>
                  )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold" style={{ color: '#ef4444' }}>Min:</span>
                  <span className="text-xs font-bold" style={{ color: '#212121' }}>
                    {(metrics.growthStage || "").toLowerCase().includes("harvested")
                      ? "0"
                      : (metrics.brixMin !== null && metrics.brixMin !== undefined ? (metrics.brixMin === 0 ? "0" : metrics.brixMin) : "-")}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>Max:</span>
                  <span className="text-xs font-bold" style={{ color: '#212121' }}>
                    {(metrics.growthStage || "").toLowerCase().includes("harvested")
                      ? "0"
                      : (metrics.brixMax !== null && metrics.brixMax !== undefined ? (metrics.brixMax === 0 ? "0" : metrics.brixMax) : "-")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Field Indices Analysis Chart */}
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-2 sm:p-4" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-3">
            <div className="flex items-center gap-2 mb-2 lg:mb-0">
              <LineChartIcon className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-800">
                Field Indices Analysis
              </h3>
            </div>
            <TimePeriodToggle />
          </div>

          <ChartLegend />

          <div className="h-64 sm:h-72 md:h-80 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg px-0 sm:px-3 -mx-2 sm:mx-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={combinedChartData}
                margin={{ top: 10, right: 6, left: 9, bottom: 10 }}
                layout={isMobile ? "vertical" : "horizontal"}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                {isMobile ? (
                  <>
                    <XAxis
                      type="number"
                      domain={[-0.75, 0.8]}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey={
                        timePeriod === "monthly" ? "displayDate" : "date"
                      }
                      tickFormatter={(tick: string) => {
                        if (timePeriod === "monthly") return tick;
                        if (timePeriod === "daily" || timePeriod === "weekly") {
                          const d = new Date(tick);
                          return d.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        }
                        const d = new Date(tick);
                        const yy = d.getFullYear().toString().slice(-2);
                        return `${d.toLocaleString("default", {
                          month: "short",
                        })}-${yy}`;
                      }}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey={
                        timePeriod === "monthly" ? "displayDate" : "date"
                      }
                      tickFormatter={(tick: string) => {
                        if (timePeriod === "monthly") return tick;
                        if (timePeriod === "daily" || timePeriod === "weekly") {
                          const d = new Date(tick);
                          return d.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        }
                        const d = new Date(tick);
                        const yy = d.getFullYear().toString().slice(-2);
                        return `${d.toLocaleString("default", {
                          month: "short",
                        })}-${yy}`;
                      }}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      domain={[-0.75, 0.8]}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                  </>
                )}
                <Tooltip content={<CustomTooltip />} />

                {(() => {
                  const indexRanges = {
                    water: { good: [0.4, 0.8], bad: [-0.3, -0.75] },
                    moisture: { good: [-0.25, 0.8], bad: [-0.6, -0.75] },
                    growth: { good: [0.2, 0.8], bad: [0.15, -0.75] },
                    stress: { good: [0.35, 0.8], bad: [0.2, -0.75] },
                  };

                  const visibleCount = Object.values(visibleLines).filter(
                    (v) => v
                  ).length;

                  let goodRange: [number, number] = [0.3, 0.6];
                  let badRange: [number, number] = [-0.1, 0.1];
                  let labelText = "Average";

                  if (visibleCount === 1) {
                    const selectedIndex = Object.keys(visibleLines).find(
                      (key) => visibleLines[key as keyof VisibleLines]
                    );

                    if (
                      selectedIndex &&
                      indexRanges[selectedIndex as keyof typeof indexRanges]
                    ) {
                      const range =
                        indexRanges[selectedIndex as keyof typeof indexRanges];
                      goodRange = range.good as [number, number];
                      badRange = range.bad as [number, number];
                      labelText =
                        selectedIndex.charAt(0).toUpperCase() +
                        selectedIndex.slice(1);
                    }
                  } else {
                    const allGoodRanges = Object.values(indexRanges).map(
                      (r) => r.good
                    );
                    const allBadRanges = Object.values(indexRanges).map(
                      (r) => r.bad
                    );

                    const avgGoodMin =
                      allGoodRanges.reduce((sum, [min]) => sum + min, 0) /
                      allGoodRanges.length;
                    const avgGoodMax =
                      allGoodRanges.reduce((sum, [, max]) => sum + max, 0) /
                      allGoodRanges.length;
                    const avgBadMin =
                      allBadRanges.reduce((sum, [min]) => sum + min, 0) /
                      allBadRanges.length;
                    const avgBadMax =
                      allBadRanges.reduce((sum, [, max]) => sum + max, 0) /
                      allBadRanges.length;

                    goodRange = [avgGoodMin, avgGoodMax] as [number, number];
                    badRange = [avgBadMin, avgBadMax] as [number, number];
                    labelText = "Average";
                  }

                  return (
                    <>
                      {isMobile ? (
                        <>
                          <ReferenceArea
                            x1={goodRange[0]}
                            x2={goodRange[1]}
                            fill="#1ad3e8"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                          <ReferenceArea
                            x1={badRange[0]}
                            x2={badRange[1]}
                            fill="#dae81a"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                        </>
                      ) : (
                        <>
                          <ReferenceArea
                            y1={goodRange[0]}
                            y2={goodRange[1]}
                            fill="#1ad3e8"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                          <ReferenceArea
                            y1={badRange[0]}
                            y2={badRange[1]}
                            fill="#dae81a"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                        </>
                      )}
                      {isMobile ? (
                        <>
                          {/* Mobile: two-line labels using tspans */}
                          <text
                            x="79%"
                            y="25%"
                            textAnchor="middle"
                            className="text-xs fill-green-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Good</tspan>
                            <tspan>
                              {" "}({goodRange[0].toFixed(2)} - {goodRange[1].toFixed(2)})
                            </tspan>
                          </text>
                          <text
                            x="35%"
                            y="35%"
                            textAnchor="middle"
                            className="text-xs fill-red-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Bad</tspan>
                            <tspan>
                              {" "}({badRange[0].toFixed(2)} - {badRange[1].toFixed(2)})
                            </tspan>
                          </text>
                        </>
                      ) : (
                        <>
                          <text
                            x="95%"
                            y="25%"
                            textAnchor="end"
                            className="text-xs fill-green-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Good</tspan>
                            <tspan>
                              {" "}({goodRange[0].toFixed(2)} - {goodRange[1].toFixed(2)})
                            </tspan>
                          </text>
                          <text
                            x="95%"
                            y="75%"
                            textAnchor="end"
                            className="text-xs fill-red-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Bad</tspan>
                            <tspan>
                              {" "}({badRange[0].toFixed(2)} - {badRange[1].toFixed(2)})
                            </tspan>
                          </text>
                        </>
                      )}
                    </>
                  );
                })()}

                {showStressEvents &&
                  stressEvents.map((event, index) => (
                    <React.Fragment key={index}>
                      <ReferenceLine
                        {...(isMobile
                          ? { y: event.from_date }
                          : { x: event.from_date })}
                        stroke="#dc2626"
                        strokeDasharray="5 5"
                        strokeWidth={1}
                        label={{
                          value: `Start: ${formatDate(event.from_date)}`,
                          position: "top",
                          fontSize: 8,
                          fill: "#dc2626",
                        }}
                      />
                      <ReferenceLine
                        {...(isMobile
                          ? { y: event.to_date }
                          : { x: event.to_date })}
                        stroke="#dc2626"
                        strokeDasharray="5 5"
                        strokeWidth={1}
                        label={{
                          value: `End: ${formatDate(event.to_date)}`,
                          position: "top",
                          fontSize: 8,
                          fill: "#dc2626",
                        }}
                      />
                      {isMobile ? (
                        <ReferenceArea
                          y1={event.from_date}
                          y2={event.to_date}
                          fill="#dc2626"
                          fillOpacity={0.1}
                        />
                      ) : (
                        <ReferenceArea
                          x1={event.from_date}
                          x2={event.to_date}
                          fill="#dc2626"
                          fillOpacity={0.1}
                        />
                      )}
                    </React.Fragment>
                  ))}

                {visibleLines.growth && (
                  <Line
                    type="monotone"
                    dataKey="growth"
                    stroke={lineStyles.growth.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.growth.color }}
                    activeDot={{ r: 4, fill: lineStyles.growth.color }}
                  />
                )}
                {visibleLines.stress && (
                  <Line
                    type="monotone"
                    dataKey="stress"
                    stroke={lineStyles.stress.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.stress.color }}
                    activeDot={{ r: 4, fill: lineStyles.stress.color }}
                  />
                )}
                {visibleLines.water && (
                  <Line
                    type="monotone"
                    dataKey="water"
                    stroke={lineStyles.water.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.water.color }}
                    activeDot={{ r: 4, fill: lineStyles.water.color }}
                  />
                )}
                {visibleLines.moisture && (
                  <Line
                    type="monotone"
                    dataKey="moisture"
                    stroke={lineStyles.moisture.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.moisture.color }}
                    activeDot={{ r: 4, fill: lineStyles.moisture.color }}
                  />
                )}

                {showNDREEvents && (
                  <Scatter
                    dataKey="stressLevel"
                    fill="#f97316"
                    shape={<CustomStressDot />}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Acidity & Sugar Analysis Chart */}
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-2 sm:p-4 mt-4 relative" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {/* Latest values pinned to the top-center of this container */}
          {latestAciditySugar && !brixTimeSeriesLoading && !brixTimeSeriesError && (
            <div
              style={{
                position: "absolute",
                top: 18,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 10,
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(15,23,42,0.10)",
                boxShadow: "0 4px 16px rgba(15,23,42,0.10)",
                fontSize: 12,
                fontWeight: 700,
                color: "#0f172a",
                alignItems: "center",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                maxWidth: "calc(100% - 24px)",
              }}
              aria-label="Latest pH, Brix and TA values"
            >
              {([
                { k: "pH", c: "#4CAF50", v: latestAciditySugar.ph, dp: 2 },
                { k: "Brix", c: "#FF9800", v: latestAciditySugar.brix, dp: 2 },
                { k: "TA", c: "#2196F3", v: latestAciditySugar.ta, dp: 2 },
              ] as const).map((m, idx) => (
                <React.Fragment key={m.k}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: m.c,
                        boxShadow: `0 0 0 3px ${m.c}22`,
                      }}
                    />
                    <span style={{ fontWeight: 800 }}>{m.k}:</span>{" "}
                    <span style={{ fontWeight: 800 }}>
                      {m.v != null ? m.v.toFixed(m.dp) : "—"}
                    </span>
                  </span>
                  {idx < 2 && (
                    <span style={{ opacity: 0.25, fontWeight: 900 }} aria-hidden>
                      •
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mb-3 pt-8">
            <Beaker className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-800">
              Acidity & Sugar Analysis
            </h3>
          </div>

          {/* Chart always renders with fallback data and overlay messages */}
          <BrixTimeSeriesChart
            data={brixTimeSeriesData}
            isLoading={brixTimeSeriesLoading}
            error={brixTimeSeriesError}
            showLatestValuesInChart={false}
          />
        </div>

        {/* Secondary Metrics Grid — shared icon slot keeps illustrations aligned */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg px-4 pt-0.5 pb-3 sm:px-5 sm:pt-1 sm:pb-4 border border-emerald-200 hover:shadow-xl transition-all duration-300 flex flex-col h-[140px] overflow-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            <div className="flex flex-1 items-center justify-between gap-3 min-h-0">
              <div className="-ml-1 mt-1 sm:-ml-1.5 sm:mt-1.5 flex h-[6.75rem] w-[6.75rem] shrink-0 items-center justify-start sm:h-[7.75rem] sm:w-[7.75rem]">
                <img
                  src={publicAsset("Image/crop images/Organic Carbon.png")}
                  alt=""
                  aria-hidden
                  className="max-h-full max-w-full object-contain object-left pointer-events-none select-none"
                />
              </div>
              <div className="flex w-[88px] sm:w-[96px] shrink-0 flex-col items-end justify-center text-right">
                <div className="text-[30px] font-bold tabular-nums leading-none text-gray-800 sm:text-[34px]">
                  {metrics.organicCarbonDensity != null &&
                    Number.isFinite(Number(metrics.organicCarbonDensity))
                    ? Number(metrics.organicCarbonDensity).toFixed(2)
                    : "-"}
                </div>
                <div className="mt-1 text-base font-semibold leading-none text-emerald-600 sm:text-lg">
                  g/kg
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-auto pt-1">Organic Carbon Density</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg px-4 pt-0.5 pb-3 sm:px-5 sm:pt-1 sm:pb-4 border border-purple-200 hover:shadow-xl transition-all duration-300 flex flex-col h-[140px] overflow-hidden relative" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            <div className="flex flex-1 items-center justify-between gap-3 min-h-0">
              <div className="-ml-1 mt-0.5 sm:-ml-1.5 sm:mt-1 flex h-full w-[6.75rem] shrink-0 items-stretch justify-start sm:w-[7.75rem] absolute left-3 top-0 z-0">
                <img src="/Image/crop images/Biomass.png" alt="" aria-hidden className="h-full w-auto object-fill object-left pointer-events-none select-none" />
              </div>
              <div className="flex w-[88px] sm:w-[96px] shrink-0 flex-col items-end justify-center text-right relative z-10 ml-auto">
                <div className="text-[30px] font-bold tabular-nums leading-none text-gray-800 sm:text-[34px]">
                  {totalBiomass?.toFixed(1) || "-"}
                </div>
                <div className="mt-1 text-base font-semibold leading-none text-purple-600 sm:text-lg">
                  T/acre
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-auto pt-1">Total Biomass</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg px-4 pt-0.5 pb-3 sm:px-5 sm:pt-1 sm:pb-4 border border-yellow-200 hover:shadow-xl transition-all duration-300 flex flex-col h-[140px] overflow-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            <div className="flex flex-1 items-center justify-between gap-3 min-h-0">
              <div className="-ml-1 mt-1 sm:-ml-1.5 sm:mt-1.5 flex h-[6.75rem] w-[6.75rem] shrink-0 items-center justify-center sm:h-[7.75rem] sm:w-[7.75rem]">
                <Beaker
                  className="h-16 w-16 text-amber-500 sm:h-[4.5rem] sm:w-[4.5rem]"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </div>
              <div className="flex w-[88px] sm:w-[96px] shrink-0 flex-col items-end justify-center text-right">
                <div className="text-[30px] font-bold tabular-nums leading-none text-gray-800 sm:text-[34px]">
                  {metrics.soilPH != null && Number.isFinite(Number(metrics.soilPH))
                    ? Number(metrics.soilPH).toFixed(2)
                    : "-"}
                </div>
                <div className="mt-1 text-base font-semibold leading-none text-yellow-600 sm:text-lg">pH</div>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-auto pt-1">Soil pH Level</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg px-4 pt-0.5 pb-3 sm:px-5 sm:pt-1 sm:pb-4 border border-green-200 hover:shadow-xl transition-all duration-300 flex flex-col h-[140px] overflow-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            <div className="flex flex-1 items-center justify-center gap-5 min-h-0">
              <div className="-ml-1 mt-1 sm:-ml-1.5 sm:mt-1.5 flex h-[5.75rem] w-[5.75rem] shrink-0 items-center justify-start sm:h-[7.75rem] sm:w-[7.75rem]">
                <img src="/Image/crop images/yield.png" alt="" aria-hidden className="max-h-20 max-w-20 object-contain object-center pointer-events-none select-none" />
              </div>
              <div className="flex w-[80px] sm:w-[90px] shrink-0 flex-col items-end justify-center text-right">
                <div className="text-[30px] font-bold tabular-nums leading-none text-gray-800 sm:text-[34px]">
                  {metrics.recovery?.toFixed(1) || "-"}
                </div>
                <div className="mt-1 text-base font-semibold leading-none text-green-600 sm:text-lg">%</div>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-auto pt-1">Stress Events</p>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {/* Expected Yield Comparison */}
          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-5 sm:p-6 flex flex-col" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden', minHeight: '300px' }}>
            <div className="flex items-center gap-2 mb-4">
              <img src="/Image/crop images/yield.png" alt="Yield Projection" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                Grapes Yield Projection
              </h3>
            </div>
            <div className="flex flex-col items-center mt-auto">
              <div className="w-full max-w-full overflow-hidden">
                <PieChartWithNeedle
                  value={metrics.sugarYieldMean || 0}
                  max={metrics.sugarYieldMax || 400}
                  title="Grapes Yield Forecast"
                  unit=" T/acre"
                  width={Math.min(300, typeof window !== 'undefined' ? window.innerWidth * 0.8 : 300)}
                  height={200}
                />
              </div>
              <div className="mt-2 text-center">
                <div className="flex items-center justify-center gap-2 text-sm sm:text-base flex-wrap">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded bg-red-500"></div>
                    <span className="text-red-700 font-semibold">
                      min: {(metrics.sugarYieldMin || 0).toFixed(1)} T/acre
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded bg-purple-500"></div>
                    <span className="text-purple-700 font-semibold">
                      mean: {(metrics.sugarYieldMean || 0).toFixed(1)}{" "}
                      T/acre
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded bg-green-500"></div>
                    <span className="text-green-700 font-semibold">
                      max: {(metrics.sugarYieldMax || 0).toFixed(1)} T/acre
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-sm sm:text-base text-gray-500">
                  Performance:{" "}
                  {metrics.sugarYieldMax
                    ? (((metrics.sugarYieldMean || 0) / metrics.sugarYieldMax) * 100).toFixed(1)
                    : "0.0"}
                  % of optimal yield
                </div>
              </div>
            </div>
          </div>

          {/* Biomass Performance */}
          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-5 sm:p-6" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-6 h-6 sm:w-7 sm:h-7 text-green-600" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                Biomass Performance
              </h3>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="h-40 sm:h-48 md:h-52 flex flex-col items-center justify-center relative w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={biomassData}
                      cx="50%"
                      cy="80%"
                      startAngle={180}
                      endAngle={0}
                      outerRadius={110}
                      innerRadius={70}
                      dataKey="value"
                      labelLine={false}
                    >
                      {biomassData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      wrapperStyle={{ zIndex: 50 }}
                      contentStyle={{ fontSize: "12px" }}
                      formatter={(value: number, name: string) => [
                        `${value.toFixed(1)} T/acre`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Total Biomass Value Display Below Chart */}
              <div className="-mt-4 mb-1">
                <p className="text-base sm:text-lg font-semibold text-blue-600 text-center">
                  {totalBiomass.toFixed(1)} T/acre
                </p>
              </div>
              <p className="text-sm sm:text-base text-gray-700 font-medium text-center mb-3">
                Biomass Distribution Chart
              </p>
              <div className="text-center">
                <div className="flex items-center justify-center gap-3 text-sm sm:text-base flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-blue-500"></div>
                    <span className="text-blue-700 font-semibold">
                      Total: {totalBiomass.toFixed(1)} T/acre
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-green-500"></div>
                    <span className="text-green-700 font-semibold">
                      Underground: {currentBiomass.toFixed(1)} T/acre
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recovery Rate Comparison — custom chart matches Quality Distribution reference */}
          <div
            className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-5 sm:p-6 flex flex-col overflow-visible"
            style={{
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
              minHeight: "min-content",
            }}
          >
            <div className="flex items-center gap-2 mb-3 sm:mb-4 shrink-0">
              <Users className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 shrink-0" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                Canopy vigour
              </h3>
            </div>

            <div className="mt-1 flex w-full min-w-0 flex-col gap-4">
              {/* Plotting area + Y axis */}
              <div className="flex w-full min-w-0 gap-2 sm:gap-3">
                <div
                  className="flex shrink-0 flex-col justify-between pt-0.5 text-[10px] font-medium leading-none text-gray-700 sm:text-xs text-right"
                  style={{
                    height: RECOVERY_QUALITY_CHART_PLOT_H,
                    width: "2.25rem",
                  }}
                  aria-hidden
                >
                  <span>100%</span>
                  <span>70%</span>
                  <span>30%</span>
                  <span>0%</span>
                </div>

                <div className="min-w-0 flex-1 flex flex-col">
                  {/* Headroom so tallest bar can extend above 100% grid */}
                  <div
                    className="relative w-full overflow-visible pl-0.5"
                    style={{
                      paddingTop: "1.25rem",
                      minHeight: RECOVERY_QUALITY_CHART_PLOT_H + 20,
                    }}
                  >
                    {vigourChartLoading && vigourPixelPct === null && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded border border-gray-200 bg-white/80 backdrop-blur-[1px]">
                        <span className="text-sm text-gray-600">
                          Loading canopy vigour…
                        </span>
                      </div>
                    )}
                    <div
                      className="relative box-border w-full overflow-visible border-b-2 border-l-2 border-gray-600"
                      style={{
                        height: RECOVERY_QUALITY_CHART_PLOT_H,
                        marginTop: 0,
                        opacity:
                          vigourChartLoading && vigourPixelPct === null
                            ? 0.45
                            : 1,
                      }}
                    >
                      {/* Dashed guides + right border — plot interior */}
                      <div
                        className="pointer-events-none absolute inset-0 border-r border-dashed border-gray-300"
                        aria-hidden
                      >
                        <div className="absolute left-0 right-0 top-0 border-t border-dashed border-gray-300" />
                        <div
                          className="absolute left-0 right-0 border-t border-dashed border-gray-300"
                          style={{ bottom: "70%" }}
                        />
                        <div
                          className="absolute left-0 right-0 border-t border-dashed border-gray-300"
                          style={{ bottom: "30%" }}
                        />
                      </div>

                      {/* Bars — heights from API pixel_summary vigour percentages */}
                      <div
                        className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-2 sm:gap-3 px-1.5 sm:px-2"
                        style={{ height: RECOVERY_QUALITY_CHART_PLOT_H }}
                      >
                        {recoveryQualityBarRows.map((b) => {
                          const rawH =
                            (b.heightPct / 100) *
                            RECOVERY_QUALITY_CHART_PLOT_H;
                          const barHeightPx =
                            b.heightPct > 0 && rawH < 2 ? 2 : rawH;
                          return (
                            <div
                              key={b.label}
                              className="flex min-h-0 min-w-0 flex-1 flex-col justify-end"
                            >
                              <div
                                className="flex w-full items-start justify-center rounded-t-md pt-1.5 shadow-sm"
                                style={{
                                  height: barHeightPx,
                                  minHeight: 0,
                                  backgroundColor: b.color,
                                }}
                              >
                                <span className="text-center text-[11px] font-bold leading-tight text-white sm:text-xs">
                                  {b.pctLabel}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Icons + category labels — same 4 columns as bars */}
                  <div className="mt-3 grid w-full grid-cols-4 gap-2 px-1.5 sm:gap-3 sm:px-2">
                    <div className="flex min-h-[3.25rem] flex-col items-center justify-end gap-1.5">
                      <Leaf
                        className="h-5 w-5 shrink-0 text-[#e74c3c] sm:h-6 sm:w-6"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span className="w-full text-center text-[11px] font-semibold leading-tight text-[#e74c3c] sm:text-xs">
                        Poor
                      </span>
                    </div>
                    <div className="flex min-h-[3.25rem] flex-col items-center justify-end gap-1.5">
                      <CloudSun
                        className="h-5 w-5 shrink-0 text-[#f39c12] sm:h-6 sm:w-6"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span className="w-full text-center text-[11px] font-semibold leading-tight text-[#f39c12] sm:text-xs">
                        Moderate
                      </span>
                    </div>
                    <div className="flex min-h-[3.25rem] flex-col items-center justify-end gap-1.5">
                      <div className="flex shrink-0 items-center justify-center gap-0.5" aria-hidden>
                        <Leaf
                          className="h-4 w-4 text-[#4a80e8] sm:h-5 sm:w-5"
                          strokeWidth={2}
                        />
                        <Leaf
                          className="h-4 w-4 text-[#57b86a] sm:h-5 sm:w-5"
                          strokeWidth={2}
                        />
                      </div>
                      <span className="w-full text-center text-[11px] font-semibold leading-tight text-[#4a80e8] sm:text-xs">
                        Good
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-between gap-1.5 h-full">
                      <div className="flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7">
                        <Sprout
                          className="h-5 w-5 shrink-0 text-[#16dc9f] sm:h-6 sm:w-6"
                          strokeWidth={2}
                          aria-hidden
                        />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#57b86a] sm:text-xs text-center">
                        Excellent
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-1 text-center text-sm text-gray-600 sm:text-base">
                Your Farm Quality:{" "}
                <span
                  className="font-bold"
                  style={{ color: dominantRecoveryQuality.color }}
                >
                  {dominantRecoveryQuality.name} (
                  {dominantRecoveryQuality.pct.toFixed(
                    dominantRecoveryQuality.pct >= 10 ? 1 : 2
                  )}
                  %)
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FarmerDashboard;
