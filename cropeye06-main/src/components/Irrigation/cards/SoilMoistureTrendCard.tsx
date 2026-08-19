import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Droplets } from "lucide-react";
import { useAppContext } from "../../../context/AppContext";
import { useFarmerProfile } from "../../../hooks/useFarmerProfile";
import { getGrapesSefBaseUrl } from "../../../utils/serviceUrls";

interface ChartPoint {
  date: string;
  day: string;
  value: number;
  rain: number;
  trend: number;
  isCurrentDate?: boolean;
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
}

interface SoilMoistureStackResponse {
  plot_name: string;
  latitude: number;
  longitude: number;
  soil_moisture_stack: SoilMoistureStackItem[];
}

const ET_PCT_PER_MM = 7;
const RAIN_PCT_PER_MM = 4;

function computeTrendLine(stack: SoilMoistureStackItem[]): number[] {
  let line = 100;
  return stack.map((item) => {
    line =
      line -
      (item.et_mean_mm_yesterday || 0) * ET_PCT_PER_MM +
      (item.rainfall_mm_yesterday || 0) * RAIN_PCT_PER_MM;
    line = Math.max(38, Math.min(100, line));
    return parseFloat(line.toFixed(2));
  });
}

function formatTooltipDate(dateIso: string, day: string): string {
  const d = new Date(dateIso.includes("T") ? dateIso : `${dateIso}T12:00:00`);
  const dayNum = d.getDate();
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${day} • ${dayNum} ${month}`;
}

const SoilMoistureTrendCard: React.FC<SoilMoistureTrendCardProps> = ({
  selectedPlotName,
}) => {
  const { setAppState, setCached } = useAppContext();
  const { profile, loading: profileLoading } = useFarmerProfile();
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plotName, setPlotName] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (selectedPlotName) {
      setPlotName(selectedPlotName);
      return;
    }
    if (profile && !profileLoading) {
      const plots = profile.plots || [];
      const fastapi = plots.find((p) => p.fastapi_plot_id)?.fastapi_plot_id;
      const gatCombo =
        !fastapi && plots.length
          ? `${plots[0].gat_number}_${plots[0].plot_number}`
          : null;
      const fallbackFarmUid =
        !fastapi && !gatCombo && plots[0]?.farms?.length
          ? plots[0].farms[0].farm_uid
          : null;
      setPlotName((fastapi || gatCombo || fallbackFarmUid || "").toString());
    }
  }, [profile, profileLoading, selectedPlotName]);

  const fetchSoilMoistureStack = async (
    plot: string
  ): Promise<SoilMoistureStackResponse> => {
    const baseUrl = getGrapesSefBaseUrl().replace(/\/+$/, "");
    const url = `${baseUrl}/soil-moisture/${encodeURIComponent(plot)}`;
    const resp = await fetch(url, {
      method: "POST",
      mode: "cors",
      cache: "no-cache",
      credentials: "omit",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
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
  };

  const mapStackToChartData = (stack: SoilMoistureStackItem[]): ChartPoint[] => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const todayStr = new Date().toISOString().split("T")[0];
    const sorted = [...stack].sort((a, b) => a.day.localeCompare(b.day)).slice(-7);
    const trends = computeTrendLine(sorted);

    return sorted.map((item, idx) => {
      const d = new Date(item.day);
      return {
        date: item.day,
        value: parseFloat(item.soil_moisture.toFixed(2)),
        rain: parseFloat((item.rainfall_mm_yesterday || 0).toFixed(2)),
        trend: trends[idx],
        day: dayNames[d.getDay()],
        isCurrentDate: item.day === todayStr,
      };
    });
  };

  const fetchWeeklyTrend = useCallback(async () => {
    if (!plotName) return;
    try {
      setLoading(true);
      setError(null);
      const apiResp = await fetchSoilMoistureStack(plotName);
      if (!apiResp.soil_moisture_stack.length) {
        throw new Error("No soil moisture data available");
      }
      const points = mapStackToChartData(apiResp.soil_moisture_stack);
      setChartPoints(points);
      const todayIdx = points.findIndex((p) => p.isCurrentDate);
      setSelectedIndex(todayIdx >= 0 ? todayIdx : points.length - 1);
      setLastUpdated(new Date());
      const todayStr = new Date().toISOString().split("T")[0];
      const todayPoint = points.find((p) => p.date === todayStr) ?? points[points.length - 1];
      setAppState((prev: any) => ({
        ...prev,
        soilMoistureTrendData: points,
        currentSoilMoisture: todayPoint?.value ?? prev.currentSoilMoisture,
      }));
      setCached(`soilMoistureTrend_${plotName}`, points);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Unable to load soil moisture trend: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [plotName, setAppState, setCached]);

  useEffect(() => {
    fetchWeeklyTrend();
  }, [fetchWeeklyTrend]);

  const chartWidth = 1200;
  const chartHeight = 300;
  const leftPadding = 56;
  const rightPadding = 56;
  const topPadding = 36;
  const bottomPadding = 56;
  const plotWidth = chartWidth - leftPadding - rightPadding;
  const plotHeight = chartHeight - topPadding - bottomPadding;

  const maxRain = useMemo(
    () => Math.max(13, ...chartPoints.map((p) => p.rain), 1),
    [chartPoints]
  );

  const getX = (index: number) =>
    leftPadding + (plotWidth / Math.max(chartPoints.length - 1, 1)) * index;

  const getMoistureY = (value: number) =>
    topPadding + plotHeight * (1 - value / 100);

  const getRainY = (mm: number) =>
    topPadding + plotHeight * (1 - mm / maxRain);

  const moisturePath = chartPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getMoistureY(p.value)}`)
    .join(" ");

  const trendPath = chartPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getMoistureY(p.trend)}`)
    .join(" ");

  const rainTicks = useMemo(() => {
    const step = maxRain <= 13 ? 3 : Math.ceil(maxRain / 4);
    const ticks: number[] = [];
    for (let v = 0; v <= maxRain; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== maxRain) ticks.push(Math.ceil(maxRain));
    return ticks;
  }, [maxRain]);

  const selectedPoint =
    selectedIndex !== null && chartPoints[selectedIndex]
      ? chartPoints[selectedIndex]
      : null;

  return (
    <div className="soil-moisture-trend-card flex flex-col min-h-0 sm:min-h-[420px] md:min-h-[460px]">
      <div className="trend-card-header pb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Droplets className="w-5 h-5 text-blue-600 shrink-0" />
          <h3 className="text-base sm:text-lg font-bold text-gray-800">
            Moisture % + Rain (mm)
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm font-semibold mt-1">
          <span className="text-red-600">0–40%: Low</span>
          <span className="text-amber-600">40–60%: Moderate</span>
          <span className="text-green-700">60–80%: Good</span>
          <span className="text-blue-600">80–100%: High</span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs mt-1 text-gray-600">
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-0.5 bg-[#8B4513] inline-block" /> Moisture %
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-purple-600 inline-block" />{" "}
            ET trend
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 bg-gradient-to-t from-blue-500 to-blue-200 inline-block rounded-sm" />{" "}
            Rain (mm)
          </span>
        </div>
      </div>

      {loading && (
        <div className="irrigation-loading">
          <div className="loading-spinner-small" />
          <p>Loading soil moisture data...</p>
        </div>
      )}

      {error && <div className="error-message-small">{error}</div>}

      {!loading && !error && chartPoints.length > 0 && (
        <div className="flex-1 w-full relative aspect-square sm:aspect-[2/1] md:aspect-[5/2] pt-2">
          {selectedPoint && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 moisture-select-tooltip">
              <div className="moisture-select-tooltip__title">
                {formatTooltipDate(selectedPoint.date, selectedPoint.day)}
              </div>
              <div className="moisture-select-tooltip__pills">
                <span className="moisture-pill">
                  Moisture <strong>{selectedPoint.value.toFixed(1)}%</strong>
                </span>
                <span className="rain-pill">
                  Rain <strong>{selectedPoint.rain.toFixed(1)}mm</strong>
                </span>
              </div>
            </div>
          )}

          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${chartWidth} ${chartHeight + 44}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="rainBarGradient" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.55" />
              </linearGradient>
            </defs>

            {/* Zone bands — same 4-band logic as sugarcane chart */}
            <rect x={leftPadding} y={getMoistureY(100)} width={plotWidth} height={getMoistureY(80) - getMoistureY(100)} fill="rgba(148, 163, 184, 0.22)" />
            <rect x={leftPadding} y={getMoistureY(80)} width={plotWidth} height={getMoistureY(60) - getMoistureY(80)} fill="rgba(134, 239, 172, 0.28)" />
            <rect x={leftPadding} y={getMoistureY(60)} width={plotWidth} height={getMoistureY(40) - getMoistureY(60)} fill="rgba(253, 230, 138, 0.35)" />
            <rect x={leftPadding} y={getMoistureY(40)} width={plotWidth} height={getMoistureY(0) - getMoistureY(40)} fill="rgba(252, 165, 165, 0.3)" />

            {/* Grid + left axis (moisture %) */}
            {[0, 20, 40, 60, 80, 100].map((value) => (
              <g key={`grid-${value}`}>
                <line
                  x1={leftPadding}
                  y1={getMoistureY(value)}
                  x2={chartWidth - rightPadding}
                  y2={getMoistureY(value)}
                  stroke="rgba(255,255,255,0.65)"
                  strokeWidth="1"
                />
                <text
                  x={leftPadding - 8}
                  y={getMoistureY(value) + 4}
                  textAnchor="end"
                  fontSize="13"
                  fill="#475569"
                  fontWeight="600"
                >
                  {value}%
                </text>
              </g>
            ))}

            {/* Right axis (rain mm) */}
            {rainTicks.map((mm) => (
              <text
                key={`rain-axis-${mm}`}
                x={chartWidth - rightPadding + 10}
                y={getRainY(mm) + 4}
                textAnchor="start"
                fontSize="12"
                fill="#2563eb"
                fontWeight="600"
              >
                {mm}
              </text>
            ))}
            <text
              x={chartWidth - rightPadding + 10}
              y={topPadding - 10}
              fontSize="11"
              fill="#2563eb"
              fontWeight="700"
            >
              mm
            </text>

            {/* Selected day — vertical guide line */}
            {selectedIndex !== null && (
              <line
                x1={getX(selectedIndex)}
                y1={topPadding}
                x2={getX(selectedIndex)}
                y2={chartHeight}
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeDasharray="5,5"
                pointerEvents="none"
              />
            )}

            {/* Rain bars */}
            {chartPoints.map((point, i) => {
              const barW = Math.min(36, plotWidth / chartPoints.length / 1.8);
              const x = getX(i) - barW / 2;
              const yTop = getRainY(point.rain);
              const yBase = getRainY(0);
              return (
                <rect
                  key={`rain-${i}`}
                  x={x}
                  y={yTop}
                  width={barW}
                  height={Math.max(0, yBase - yTop)}
                  fill="url(#rainBarGradient)"
                  rx="3"
                  opacity={0.9}
                />
              );
            })}

            {/* ET depletion trend — dashed purple */}
            <path
              d={trendPath}
              fill="none"
              stroke="#9333ea"
              strokeWidth="2.5"
              strokeDasharray="8,6"
              strokeLinecap="round"
            />

            {/* Soil moisture — solid brown line */}
            <path
              d={moisturePath}
              fill="none"
              stroke="#8B4513"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Markers + value labels + click targets */}
            {chartPoints.map((point, i) => {
              const isSelected = selectedIndex === i;
              const cx = getX(i);
              const cy = getMoistureY(point.value);
              return (
                <g key={`point-${i}`}>
                  <circle
                    className="moisture-chart-hit"
                    cx={cx}
                    cy={cy}
                    r="28"
                    fill="transparent"
                    onClick={() => setSelectedIndex(i)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedIndex(i);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${point.day} moisture ${point.value}% rain ${point.rain}mm`}
                  />
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="11"
                      fill="none"
                      stroke="#8B4513"
                      strokeWidth="2"
                      opacity="0.35"
                      pointerEvents="none"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 7 : 5}
                    fill={isSelected ? "#fde68a" : "#F5DEB3"}
                    stroke="#8B4513"
                    strokeWidth={isSelected ? 3 : 2.5}
                    pointerEvents="none"
                  />
                  <text
                    x={cx}
                    y={cy - (isSelected ? 16 : 12)}
                    textAnchor="middle"
                    fontSize={isSelected ? "14" : "13"}
                    fill="#c2410c"
                    fontWeight="700"
                    pointerEvents="none"
                  >
                    {point.value}%
                  </text>
                </g>
              );
            })}

            {/* X-axis labels — tap day to select */}
            {chartPoints.map((point, i) => (
              <g
                key={`x-${i}`}
                className="moisture-chart-hit"
                onClick={() => setSelectedIndex(i)}
                style={{ cursor: "pointer" }}
              >
                <text
                  x={getX(i)}
                  y={chartHeight + 18}
                  textAnchor="middle"
                  fontSize="14"
                  fill={
                    selectedIndex === i
                      ? "#1d4ed8"
                      : point.isCurrentDate
                        ? "#2563eb"
                        : "#64748b"
                  }
                  fontWeight={selectedIndex === i ? "800" : "700"}
                  pointerEvents="none"
                >
                  {point.day}
                </text>
                <text
                  x={getX(i)}
                  y={chartHeight + 34}
                  textAnchor="middle"
                  fontSize="13"
                  fill={
                    selectedIndex === i
                      ? "#1d4ed8"
                      : point.isCurrentDate
                        ? "#2563eb"
                        : "#94a3b8"
                  }
                  fontWeight="500"
                  pointerEvents="none"
                >
                  {new Date(point.date).getDate()}/
                  {new Date(point.date).getMonth() + 1}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}

      <div className="refresh-section mt-2 px-1">
        <button
          type="button"
          className="refresh-button"
          onClick={fetchWeeklyTrend}
          disabled={loading || !plotName}
        >
          Refresh Data
        </button>
        {lastUpdated && (
          <span className="last-updated">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
};

export default SoilMoistureTrendCard;
