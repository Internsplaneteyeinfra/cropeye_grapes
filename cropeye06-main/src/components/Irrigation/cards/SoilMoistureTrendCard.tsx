import React, { useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppContext } from "../../../context/AppContext";
import { useFarmerProfile } from "../../../hooks/useFarmerProfile";
import { getGrapesSefBaseUrl } from "../../../utils/serviceUrls";
import { publicAsset } from "../../../utils/publicAsset";

interface MoistureData {
  date: string;
  value: number;
  day: string;
  x: number;
  isCurrentDate?: boolean;
}

interface ChartRow {
  label: string;
  date: string;
  day: string;
  moisture: number;
  rain: number;
  depletion: number;
  isToday: boolean;
}

interface SoilMoistureTrendCardProps {
  selectedPlotName?: string | null;
}

interface SoilMoistureStackItem {
  day: string;
  soil_moisture: number;
  rainfall_mm_yesterday: number;
  rainfall_provisional: boolean;
  et_mean_mm_yesterday: number;
  field_capacity?: number;
}

interface SoilMoistureStackResponse {
  plot_name: string;
  latitude: number;
  longitude: number;
  soil_moisture_stack: SoilMoistureStackItem[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ET_MM_TO_MOISTURE_PCT = 2.2;

function formatAxisLabel(iso: string, day: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  return `${day} ${d.getDate()}/${d.getMonth() + 1}`;
}

function buildDepletionLine(stack: SoilMoistureStackItem[]): number[] {
  const sorted = [...stack].sort((a, b) => a.day.localeCompare(b.day)).slice(-7);
  if (sorted.length === 0) return [];

  // Projected depletion without rain recharge — slopes down like sugarcane reference
  let simulated = Math.min(100, sorted[0].soil_moisture + 18);
  return sorted.map((item, index) => {
    if (index > 0) {
      simulated = Math.max(
        38,
        simulated - item.et_mean_mm_yesterday * ET_MM_TO_MOISTURE_PCT * 1.15
      );
    }
    return parseFloat(simulated.toFixed(2));
  });
}

const MoistureValueLabel: React.FC<{ x?: number; y?: number; value?: number }> = ({
  x = 0,
  y = 0,
  value,
}) => {
  if (value == null || !Number.isFinite(value)) return null;
  return (
    <text x={x} y={y - 12} textAnchor="middle" fill="#8B4513" fontSize={12} fontWeight={700}>
      {value.toFixed(2)}%
    </text>
  );
};

const MoistureDot: React.FC<{ cx?: number; cy?: number }> = ({ cx, cy }) => {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={5} fill="#8B4513" stroke="#F5E6D3" strokeWidth={2} />;
};

const SoilMoistureTrendCard: React.FC<SoilMoistureTrendCardProps> = ({
  selectedPlotName,
}) => {
  const { setAppState, setCached, getCached, selectedPlotName: contextPlot } =
    useAppContext();
  const { profile, loading: profileLoading } = useFarmerProfile();
  const [chartRows, setChartRows] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentDateMoisture, setCurrentDateMoisture] = useState<number | null>(null);
  const [plotName, setPlotName] = useState<string>(() => {
    if (selectedPlotName) return selectedPlotName;
    if (contextPlot) return contextPlot;
    try {
      return localStorage.getItem("selectedPlot") || "";
    } catch {
      return "";
    }
  });
  const optimalMin = 40;
  const optimalMax = 80;

  const applyChartPayload = (rows: ChartRow[], weekData: MoistureData[]) => {
    setChartRows(rows);
    setAppState((prev: Record<string, unknown>) => ({
      ...prev,
      soilMoistureTrendData: weekData,
    }));
    const todayStr = getCurrentDate();
    const today = rows.find((r) => r.date === todayStr || r.isToday);
    if (today) setCurrentDateMoisture(today.moisture);
  };

  useEffect(() => {
    const fromStorage = (() => {
      try {
        return localStorage.getItem("selectedPlot") || "";
      } catch {
        return "";
      }
    })();
    const immediate = selectedPlotName || contextPlot || fromStorage;
    if (immediate) {
      setPlotName(immediate);
      return;
    }
    if (profile && !profileLoading) {
      const plots = profile.plots || [];
      const fastapi = plots.find((p) => p.fastapi_plot_id)?.fastapi_plot_id;
      const gatCombo =
        !fastapi && plots.length ? `${plots[0].gat_number}_${plots[0].plot_number}` : null;
      const fallbackFarmUid =
        !fastapi && !gatCombo && plots[0]?.farms?.length
          ? plots[0].farms[0].farm_uid
          : null;
      setPlotName((fastapi || gatCombo || fallbackFarmUid || "").toString());
    }
  }, [profile, profileLoading, selectedPlotName, contextPlot]);

  const fetchSoilMoistureStack = async (plot: string): Promise<SoilMoistureStackResponse> => {
    const bases = [
      getGrapesSefBaseUrl().replace(/\/+$/, ""),
      "/api/field-analysis",
      "https://cropeye-grapes-sef-production.up.railway.app",
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    let lastErr: Error | null = null;

    for (const baseUrl of bases) {
      const url = `${baseUrl}/soil-moisture/${encodeURIComponent(plot)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000);

      try {
        const resp = await fetch(url, {
          method: "POST",
          mode: "cors",
          cache: "no-cache",
          credentials: "omit",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
          const errorText = await resp.text().catch(() => "");
          throw new Error(`HTTP ${resp.status}: ${errorText || resp.statusText}`);
        }

        const json = await resp.json();
        if (!json?.soil_moisture_stack || !Array.isArray(json.soil_moisture_stack)) {
          return {
            plot_name: json?.plot_name || plot,
            latitude: json?.latitude || 0,
            longitude: json?.longitude || 0,
            soil_moisture_stack: [],
          };
        }
        return json as SoilMoistureStackResponse;
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
          lastErr = new Error("Request timed out. Please try Refresh Data.");
        } else {
          lastErr = err instanceof Error ? err : new Error(String(err));
        }
      }
    }

    throw lastErr || new Error("Unable to load soil moisture data");
  };

  const getCurrentDate = (): string => new Date().toISOString().split("T")[0];

  const mapStackToChartData = (stack: SoilMoistureStackItem[]) => {
    const todayStr = getCurrentDate();
    const sorted = [...stack].sort((a, b) => a.day.localeCompare(b.day)).slice(-7);
    const depletion = buildDepletionLine(sorted);

    const weekData: MoistureData[] = [];
    const rows: ChartRow[] = sorted.map((item, idx) => {
      const d = new Date(item.day.includes("T") ? item.day : `${item.day}T12:00:00`);
      const day = DAY_NAMES[d.getDay()];
      const moisture = parseFloat(item.soil_moisture.toFixed(2));
      const isToday = item.day === todayStr;

      weekData.push({
        date: item.day,
        value: moisture,
        day,
        x: idx,
        isCurrentDate: isToday,
      });

      return {
        label: formatAxisLabel(item.day, day),
        date: item.day,
        day,
        moisture,
        rain: parseFloat((item.rainfall_mm_yesterday || 0).toFixed(2)),
        depletion: depletion[idx] ?? moisture,
        isToday,
      };
    });

    return { weekData, rows };
  };

  const fetchWeeklyTrend = async (plot: string, options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setLoading(true);
      setError(null);

      const apiResp = await fetchSoilMoistureStack(plot);
      if (!apiResp.soil_moisture_stack.length) {
        throw new Error("No soil moisture data available");
      }

      const { weekData, rows } = mapStackToChartData(apiResp.soil_moisture_stack);
      applyChartPayload(rows, weekData);
      setCached(`soilMoistureTrendChart_${plot}`, { rows, weekData });
      setCached(`soilMoistureTrend_${plot}`, weekData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!options?.silent || chartRows.length === 0) {
        setError(`Unable to load soil moisture trend: ${message}`);
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!plotName) {
      if (!profileLoading && profile && !profile.plots?.length) {
        setError("No plot found for soil moisture chart.");
      }
      return;
    }

    setError(null);
    const cacheKey = `soilMoistureTrendChart_${plotName}`;
    const cached = getCached(cacheKey, 30 * 60 * 1000) as
      | { rows?: ChartRow[]; weekData?: MoistureData[] }
      | null;

    if (cached?.rows?.length) {
      applyChartPayload(cached.rows, cached.weekData || []);
      void fetchWeeklyTrend(plotName, { silent: true });
      return;
    }

    void fetchWeeklyTrend(plotName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotName, profileLoading, profile]);

  useEffect(() => {
    const onRefresh = () => {
      if (plotName) void fetchWeeklyTrend(plotName);
    };
    window.addEventListener("irrigation-refresh-soil-moisture", onRefresh);
    return () => window.removeEventListener("irrigation-refresh-soil-moisture", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotName]);

  const rainMax = 15;
  const vineyardBg = publicAsset("Image/field_score.png");

  return (
    <div className="soil-moisture-trend-card flex flex-col min-h-0 bg-white rounded-xl shadow-lg border border-gray-200/80 overflow-hidden">
      <div className="trend-card-header px-4 pt-4 pb-2">
        <h3 className="text-[15px] font-bold text-gray-900 leading-tight m-0">
          Moisture % + Rain (mm)
        </h3>
        <div className="optimal-range text-xs text-gray-600 mt-0.5">
          Optimal: {optimalMin}-{optimalMax}%
        </div>
      </div>

      {profileLoading && !plotName && (
        <div className="irrigation-loading">
          <div className="loading-spinner-small" />
          <p>Loading plot information...</p>
        </div>
      )}

      {error && chartRows.length === 0 && (
        <div className="error-message-small mx-4 mb-4">{error}</div>
      )}

      {chartRows.length > 0 && (
        <div className="moisture-trend-chart-plot relative mx-3 mb-3 rounded-lg overflow-hidden border border-white/70 shadow-inner">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${vineyardBg}')` }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-white/50" aria-hidden />

          <div className="relative z-10 px-2 pt-2 pb-0">
            <p className="text-center text-[11px] text-gray-700 m-0">
              <span className="font-semibold">Soil Moisture Levels: </span>
              <span className="text-red-600 font-semibold">0-40%: Low</span>
              <span className="text-gray-500 mx-1">·</span>
              <span className="text-green-600 font-semibold">40-80%: Good</span>
              <span className="text-gray-500 mx-1">·</span>
              <span className="text-blue-600 font-semibold">80-100%: High</span>
            </p>
          </div>

          <div className="relative z-10 w-full" style={{ height: 380 }}>
            {loading && (
              <div className="absolute top-2 right-2 z-20">
                <div className="loading-spinner-small" />
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartRows}
                margin={{ top: 8, right: 14, left: 6, bottom: 10 }}
              >
                <defs>
                  <linearGradient id="rainBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={1} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.85} />
                  </linearGradient>
                </defs>

                <ReferenceArea
                  yAxisId="moisture"
                  y1={0}
                  y2={40}
                  fill="rgba(239, 68, 68, 0.22)"
                  ifOverflow="extendDomain"
                />
                <ReferenceArea
                  yAxisId="moisture"
                  y1={40}
                  y2={80}
                  fill="rgba(34, 197, 94, 0.18)"
                  ifOverflow="extendDomain"
                />
                <ReferenceArea
                  yAxisId="moisture"
                  y1={80}
                  y2={100}
                  fill="rgba(59, 130, 246, 0.18)"
                  ifOverflow="extendDomain"
                />

                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="rgba(156, 163, 175, 0.55)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#1f2937", fontWeight: 500 }}
                  axisLine={{ stroke: "#9ca3af" }}
                  tickLine={false}
                  dy={4}
                />
                <YAxis
                  yAxisId="moisture"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={{ fontSize: 11, fill: "#374151" }}
                  tickFormatter={(v) => `${v}%`}
                  axisLine={{ stroke: "#9ca3af" }}
                  tickLine={false}
                  width={44}
                />
                <YAxis
                  yAxisId="rain"
                  orientation="right"
                  domain={[0, rainMax]}
                  ticks={[0, 4, 8, 15]}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#1d4ed8", fontWeight: 500 }}
                  axisLine={{ stroke: "#93c5fd" }}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === "rain") return [`${value} mm`, "Rain"];
                    if (name === "depletion") return [`${value}%`, "Depletion (no rain)"];
                    return [`${value}%`, "Soil moisture"];
                  }}
                  labelFormatter={(label) => String(label)}
                />

                <Bar
                  yAxisId="rain"
                  dataKey="rain"
                  fill="url(#rainBarGradient)"
                  barSize={30}
                  radius={[2, 2, 0, 0]}
                  name="rain"
                  isAnimationActive={false}
                />

                <Line
                  yAxisId="moisture"
                  type="linear"
                  dataKey="depletion"
                  stroke="#9333ea"
                  strokeWidth={2}
                  strokeDasharray="7 5"
                  dot={false}
                  name="depletion"
                  isAnimationActive={false}
                />

                <Line
                  yAxisId="moisture"
                  type="linear"
                  dataKey="moisture"
                  stroke="#8B4513"
                  strokeWidth={2.5}
                  dot={<MoistureDot />}
                  activeDot={{ r: 6, fill: "#8B4513", stroke: "#F5E6D3", strokeWidth: 2 }}
                  name="moisture"
                  isAnimationActive={false}
                >
                  <LabelList dataKey="moisture" content={<MoistureValueLabel />} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {loading && chartRows.length === 0 && (
        <div className="irrigation-loading">
          <div className="loading-spinner-small" />
          <p>Loading soil moisture data...</p>
        </div>
      )}
    </div>
  );
};

export default SoilMoistureTrendCard;
