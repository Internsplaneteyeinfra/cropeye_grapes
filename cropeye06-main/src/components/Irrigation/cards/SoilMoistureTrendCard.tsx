import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AreaChart } from "lucide-react";
import { useAppContext } from "../../../context/AppContext";
import { useFarmerProfile } from "../../../hooks/useFarmerProfile";
import {
  fetchSoilMoistureForPlot,
  moistureBandForCrop,
  type SoilMoistureDay,
} from "../../../utils/soilMoistureApi";

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
  /** Wait until card is near viewport before fetching (smoother Map). */
  deferUntilVisible?: boolean;
}

const ET_PCT_PER_MM = 7;
const RAIN_PCT_PER_MM = 4;

function computeTrendLine(stack: SoilMoistureDay[]): number[] {
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
  selectedPlotName: propSelectedPlotName,
  deferUntilVisible = false,
}) => {
  const {
    setAppState,
    setCached,
    getCached,
    getApiData,
    setApiData,
    selectedPlotName: contextPlotName,
  } = useAppContext();
  const { profile, loading: profileLoading } = useFarmerProfile();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(!deferUntilVisible);
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plotName, setPlotName] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentDateMoisture, setCurrentDateMoisture] = useState<number | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);

  const band = moistureBandForCrop("grapes");
  const optimalMin = band.minOptimal;
  const optimalMax = band.maxOptimal;
  const activePlotProp = propSelectedPlotName || contextPlotName;

  useEffect(() => {
    if (!deferUntilVisible || isVisible) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [deferUntilVisible, isVisible]);

  useEffect(() => {
    const updateZoom = () => {
      const w = window.innerWidth;
      if (w < 360) setZoom(2.2);
      else if (w < 420) setZoom(2.0);
      else if (w < 480) setZoom(1.8);
      else if (w < 640) setZoom(1.5);
      else setZoom(1);
    };
    updateZoom();
    window.addEventListener("resize", updateZoom);
    return () => window.removeEventListener("resize", updateZoom);
  }, []);

  useEffect(() => {
    if (activePlotProp) {
      setPlotName(activePlotProp);
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
  }, [profile, profileLoading, activePlotProp]);

  const mapStackToChartData = (stack: SoilMoistureDay[]): ChartPoint[] => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const todayStr = new Date().toISOString().split("T")[0];
    const sorted = [...stack]
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-7);
    const trends = computeTrendLine(sorted);

    return sorted.map((item, idx) => {
      const d = new Date(`${item.day}T12:00:00`);
      return {
        date: item.day,
        value: parseFloat(Number(item.soil_moisture).toFixed(2)),
        rain: parseFloat((item.rainfall_mm_yesterday || 0).toFixed(2)),
        trend: trends[idx],
        day: dayNames[d.getDay()],
        isCurrentDate: item.day === todayStr,
      };
    });
  };

  const applyPoints = useCallback(
    (points: ChartPoint[], sourcePlot: string) => {
      if (!points.length) return false;
      setChartPoints(points);
      const todayIdx = points.findIndex((p) => p.isCurrentDate);
      setSelectedIndex(todayIdx >= 0 ? todayIdx : points.length - 1);
      setLastUpdated(new Date());
      const todayPoint =
        points.find((p) => p.isCurrentDate) ?? points[points.length - 1];
      setCurrentDateMoisture(todayPoint?.value ?? null);
      setError(null);
      setAppState((prev: any) => ({
        ...prev,
        currentSoilMoisture: todayPoint?.value ?? prev.currentSoilMoisture,
      }));
      setApiData("soilMoistureTrend", sourcePlot, points);
      setCached(`soilMoistureTrend_${sourcePlot}`, points);
      return true;
    },
    [setApiData, setAppState, setCached],
  );

  const stackFromUnknown = (raw: any): SoilMoistureDay[] => {
    if (!raw) return [];
    if (Array.isArray(raw?.soil_moisture_stack)) {
      return raw.soil_moisture_stack
        .map((item: any) => ({
          day: String(item.day ?? item.date ?? "").slice(0, 10),
          soil_moisture: Number(item.soil_moisture ?? item.value ?? 0),
          rainfall_mm_yesterday: Number(item.rainfall_mm_yesterday || 0),
          et_mean_mm_yesterday: Number(item.et_mean_mm_yesterday || 0),
        }))
        .filter((r: SoilMoistureDay) => r.day && Number.isFinite(r.soil_moisture));
    }
    if (Array.isArray(raw) && raw.length && (raw[0].date || raw[0].day)) {
      return raw
        .map((item: any) => ({
          day: String(item.day ?? item.date ?? "").slice(0, 10),
          soil_moisture: Number(item.soil_moisture ?? item.value ?? 0),
          rainfall_mm_yesterday: Number(
            item.rain ?? item.rainfall_mm_yesterday ?? 0,
          ),
          et_mean_mm_yesterday: Number(item.et_mean_mm_yesterday ?? 0),
        }))
        .filter((r: SoilMoistureDay) => r.day && Number.isFinite(r.soil_moisture));
    }
    return [];
  };

  const fetchWeeklyTrend = useCallback(async () => {
    if (!plotName) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      // 1) Cached / preloaded trend (from dataPreloader or earlier visit)
      const cachedPoints =
        getCached(`soilMoistureTrend_${plotName}`) ||
        getApiData("soilMoistureTrend", plotName);
      if (Array.isArray(cachedPoints) && cachedPoints.length > 0) {
        const asStack = stackFromUnknown(cachedPoints);
        if (asStack.length) {
          applyPoints(mapStackToChartData(asStack), plotName);
          setLoading(false);
          // Refresh in background; keep showing cache if refresh fails
        } else if (cachedPoints[0]?.value != null && cachedPoints[0]?.date) {
          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const todayStr = new Date().toISOString().split("T")[0];
          const points: ChartPoint[] = cachedPoints.map((p: any) => {
            const date = String(p.date ?? p.day).slice(0, 10);
            const d = new Date(`${date}T12:00:00`);
            return {
              date,
              value: Number(p.value),
              rain: Number(p.rain || 0),
              trend: Number(p.trend ?? p.value),
              day: p.day || dayNames[d.getDay()],
              isCurrentDate: date === todayStr,
            };
          });
          applyPoints(points, plotName);
          setLoading(false);
        }
      }

      const cachedStack = getCached(`soilMoistureStack_${plotName}`);
      if (cachedStack) {
        const stack = stackFromUnknown(cachedStack);
        if (stack.length && applyPoints(mapStackToChartData(stack), plotName)) {
          setLoading(false);
        }
      }

      // 2) Shared soilMoistureApi (GET preferred + legacy + POST)
      try {
        const parsed = await fetchSoilMoistureForPlot(plotName, profile?.plots);
        if (parsed?.stack?.length) {
          applyPoints(mapStackToChartData(parsed.stack), plotName);
          setCached(`soilMoistureStack_${plotName}`, {
            soil_moisture_stack: parsed.stack,
          });
          return;
        }
      } catch (apiErr) {
        console.warn("SoilMoistureTrend: fetchSoilMoistureForPlot failed", apiErr);
      }

      // 3) Direct POST path (same as dataPreloader — often works when GET 405s)
      try {
        const { getGrapesSefBaseUrl } = await import("../../../utils/serviceUrls");
        const base = getGrapesSefBaseUrl().replace(/\/+$/, "");
        const url = `${base}/soil-moisture/${encodeURIComponent(plotName)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45_000);
        const resp = await fetch(url, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (resp.ok) {
          const data = await resp.json();
          setCached(`soilMoistureStack_${plotName}`, data);
          const stack = stackFromUnknown(data);
          if (stack.length) {
            applyPoints(mapStackToChartData(stack), plotName);
            return;
          }
        }
      } catch (postErr) {
        console.warn("SoilMoistureTrend: POST /soil-moisture failed", postErr);
      }

      // Keep showing cached chart if we already applied it
      setChartPoints((prev) => {
        if (prev.length > 0) return prev;
        setError(
          "Unable to load soil moisture trend. The SEF API timed out or returned no stack for this plot.",
        );
        return prev;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setChartPoints((prev) => {
        if (prev.length > 0) return prev;
        setError(`Unable to load soil moisture trend: ${message}`);
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, [
    plotName,
    profile?.plots,
    getCached,
    getApiData,
    setCached,
    applyPoints,
  ]);

  useEffect(() => {
    if (!isVisible) {
      setLoading(false);
      return;
    }
    fetchWeeklyTrend();
  }, [fetchWeeklyTrend, isVisible]);

  const chartWidth = 1200;
  const chartHeight = Math.round(300 * Math.min(zoom, 1.35));
  const leftPadding = 56;
  const rightPadding = 56;
  const topPadding = 36;
  const bottomPadding = 56;
  const plotWidth = chartWidth - leftPadding - rightPadding;
  const plotHeight = chartHeight - topPadding - bottomPadding;

  const maxRain = useMemo(
    () => Math.max(13, ...chartPoints.map((p) => p.rain), 1),
    [chartPoints],
  );

  const getX = (index: number) =>
    leftPadding + (plotWidth / Math.max(chartPoints.length - 1, 1)) * index;

  const getMoistureY = (value: number) =>
    topPadding + plotHeight * (1 - value / 100);

  const getRainY = (mm: number) => topPadding + plotHeight * (1 - mm / maxRain);

  const moisturePath = chartPoints
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${getX(i)} ${getMoistureY(p.value)}`,
    )
    .join(" ");

  const areaPath =
    chartPoints.length > 0
      ? [
          moisturePath,
          `L ${getX(chartPoints.length - 1)} ${getMoistureY(0)}`,
          `L ${getX(0)} ${getMoistureY(0)}`,
          "Z",
        ].join(" ")
      : "";

  const trendPath = chartPoints
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${getX(i)} ${getMoistureY(p.trend)}`,
    )
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
    <div
      ref={rootRef}
      className="soil-moisture-trend-card flex flex-col min-h-0 sm:min-h-[420px] md:min-h-[460px]"
    >
      {!isVisible ? (
        <div className="irrigation-loading py-10">
          <p className="text-sm text-gray-500">
            Scroll to load soil moisture trend…
          </p>
        </div>
      ) : (
        <>
          <div className="trend-card-header pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <AreaChart className="w-5 h-5 shrink-0" color="#8B4513" />
              <h3 className="text-base sm:text-lg font-bold text-gray-800">
                Soil Moisture Trend (weekly)
              </h3>
              <div className="optimal-range text-xs sm:text-sm">
                Optimal: {optimalMin}–{optimalMax}%
              </div>
            </div>

            {currentDateMoisture !== null && (
              <div
                className="current-moisture-indicator text-xs sm:text-sm mt-1 font-bold"
                style={{ color: "#8B4513" }}
              >
                Today&apos;s Soil Moisture: {currentDateMoisture.toFixed(1)}%
              </div>
            )}

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
                    {selectedPoint.isCurrentDate ? " (Today)" : ""}
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
                  <linearGradient
                    id="moistureAreaGradient"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#8B4513" stopOpacity="0.4" />
                    <stop offset="30%" stopColor="#A0522D" stopOpacity="0.25" />
                    <stop offset="70%" stopColor="#CD853F" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#D2B48C" stopOpacity="0.05" />
                  </linearGradient>
                </defs>

                <rect
                  x={leftPadding}
                  y={getMoistureY(100)}
                  width={plotWidth}
                  height={getMoistureY(80) - getMoistureY(100)}
                  fill="rgba(148, 163, 184, 0.22)"
                />
                <rect
                  x={leftPadding}
                  y={getMoistureY(optimalMax)}
                  width={plotWidth}
                  height={getMoistureY(optimalMin) - getMoistureY(optimalMax)}
                  fill="rgba(107, 142, 35, 0.28)"
                />
                <rect
                  x={leftPadding}
                  y={getMoistureY(60)}
                  width={plotWidth}
                  height={getMoistureY(40) - getMoistureY(60)}
                  fill="rgba(253, 230, 138, 0.35)"
                />
                <rect
                  x={leftPadding}
                  y={getMoistureY(40)}
                  width={plotWidth}
                  height={getMoistureY(0) - getMoistureY(40)}
                  fill="rgba(252, 165, 165, 0.3)"
                />

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

                {areaPath && (
                  <path d={areaPath} fill="url(#moistureAreaGradient)" />
                )}

                <path
                  d={trendPath}
                  fill="none"
                  stroke="#9333ea"
                  strokeWidth="2.5"
                  strokeDasharray="8,6"
                  strokeLinecap="round"
                />

                <path
                  d={moisturePath}
                  fill="none"
                  stroke="#8B4513"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {chartPoints.map((point, i) => {
                  const isSelected = selectedIndex === i;
                  const isToday = !!point.isCurrentDate;
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
                      {isToday && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r="12"
                          fill="none"
                          stroke="#22C55E"
                          strokeWidth="2"
                          strokeDasharray="4,4"
                          opacity="0.85"
                          pointerEvents="none"
                        />
                      )}
                      {isSelected && !isToday && (
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
                        r={isToday || isSelected ? 7 : 5}
                        fill={
                          isToday
                            ? "#22C55E"
                            : isSelected
                              ? "#fde68a"
                              : "#F5DEB3"
                        }
                        stroke={isToday ? "#16A34A" : "#8B4513"}
                        strokeWidth={isSelected || isToday ? 3 : 2.5}
                        pointerEvents="none"
                      />
                      <text
                        x={cx}
                        y={cy - (isSelected || isToday ? 16 : 12)}
                        textAnchor="middle"
                        fontSize={isSelected || isToday ? "14" : "13"}
                        fill={isToday ? "#16A34A" : "#c2410c"}
                        fontWeight="700"
                        pointerEvents="none"
                      >
                        {point.value}%
                      </text>
                    </g>
                  );
                })}

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
                        point.isCurrentDate
                          ? "#16A34A"
                          : selectedIndex === i
                            ? "#1d4ed8"
                            : "#64748b"
                      }
                      fontWeight={
                        point.isCurrentDate || selectedIndex === i
                          ? "800"
                          : "700"
                      }
                      pointerEvents="none"
                    >
                      {point.day}
                      {point.isCurrentDate ? " (Today)" : ""}
                    </text>
                    <text
                      x={getX(i)}
                      y={chartHeight + 34}
                      textAnchor="middle"
                      fontSize="13"
                      fill={
                        point.isCurrentDate
                          ? "#16A34A"
                          : selectedIndex === i
                            ? "#1d4ed8"
                            : "#94a3b8"
                      }
                      fontWeight="500"
                      pointerEvents="none"
                    >
                      {new Date(`${point.date}T12:00:00`).getDate()}/
                      {new Date(`${point.date}T12:00:00`).getMonth() + 1}
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
        </>
      )}
    </div>
  );
};

export default SoilMoistureTrendCard;
