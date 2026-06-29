import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  CloudRain,
  Wind,
  ThermometerSun,
  Cloud,
  RefreshCw,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useFarmerProfile } from "../hooks/useFarmerProfile";
import {
  ForecastChartDay,
  forecastChartHasValues,
  formatWindDirectionLabel,
  getOrFetchWeatherChartDays,
  resolveForecastLatLon,
  weatherChartCacheKey,
} from "../services/weatherForecastService";
import "./WeatherForecast.css";

type WindArrowTip = {
  row: ForecastChartDay;
  x: number;
  y: number;
};

type DateWindTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string };
  chartData: ForecastChartDay[];
  fontSize: number;
  showPerDayArrows: boolean;
  onWindArrowHover?: (tip: WindArrowTip | null) => void;
};

const WindArrowSvg: React.FC<{ degrees: number; size?: number }> = ({ degrees, size = 18 }) => {
  const rotation = (degrees + 180) % 360;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ transform: `rotate(${rotation}deg)`, display: "block" }}
    >
      <path
        d="M12 3 L12 21 M12 3 L7 11 M12 3 L17 11"
        stroke="#10b981"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const DateWithWindTick: React.FC<DateWindTickProps> = ({
  x = 0,
  y = 0,
  payload,
  chartData,
  fontSize,
  showPerDayArrows,
  onWindArrowHover,
}) => {
  const label = payload?.value ?? "";
  const row = chartData.find((d) => d.date === label);
  const dir = row?.windDirectionDeg;
  const arrowRotation = dir != null ? (dir + 180) % 360 : 0;
  const directionLabel =
    row?.windDirectionLabel ??
    (dir != null && Number.isFinite(dir) ? formatWindDirectionLabel(dir) : null);

  const handleArrowEnter = (event: React.MouseEvent<SVGGElement>) => {
    if (!row || dir == null || !onWindArrowHover) return;
    onWindArrowHover({ row, x: event.clientX, y: event.clientY });
  };

  const handleArrowMove = (event: React.MouseEvent<SVGGElement>) => {
    if (!row || dir == null || !onWindArrowHover) return;
    onWindArrowHover({ row, x: event.clientX, y: event.clientY });
  };

  const showArrow = showPerDayArrows && dir != null && Number.isFinite(dir);

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#6b7280" fontSize={fontSize} dy={14}>
        {label}
      </text>
      {showArrow && (
        <g
          transform="translate(0, 26)"
          style={{ cursor: "pointer" }}
          onMouseEnter={handleArrowEnter}
          onMouseMove={handleArrowMove}
          onMouseLeave={() => onWindArrowHover?.(null)}
        >
          <rect x={-14} y={-14} width={28} height={28} fill="transparent" />
          <title>
            {directionLabel
              ? `Wind direction: ${directionLabel}`
              : `Wind direction: ${Math.round(dir)}°`}
          </title>
          <g transform={`rotate(${arrowRotation})`}>
            <path
              d="M0 -7 L0 7 M0 -7 L-4 -1 M0 -7 L4 -1"
              stroke="#10b981"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      )}
    </g>
  );
};

function getWindDirectionMode(chartData: ForecastChartDay[]): {
  mode: "none" | "shared" | "perDay";
  sharedDay?: ForecastChartDay;
} {
  const withDir = chartData.filter(
    (d) => d.windDirectionDeg != null && Number.isFinite(d.windDirectionDeg)
  );
  if (withDir.length === 0) return { mode: "none" };
  const unique = new Set(withDir.map((d) => Math.round(d.windDirectionDeg!)));
  if (unique.size === 1) {
    return { mode: "shared", sharedDay: withDir[0] };
  }
  return { mode: "perDay" };
}


interface WeatherForecastProps {
  lat?: number;
  lon?: number;
}

const WeatherForecast: React.FC<WeatherForecastProps> = ({ 
  lat: propLat, 
  lon: propLon 
}) => {
  const { appState, setAppState, getCached, setCached, selectedPlotName } = useAppContext();
  const { profile } = useFarmerProfile();
  const [chartData, setChartData] = useState<ForecastChartDay[]>(
    () => (appState.weatherChartData as ForecastChartDay[]) || []
  );
  const selectedDay = appState.weatherSelectedDay || chartData[0] || null;
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [farmerCoordinates, setFarmerCoordinates] = useState<{lat: number, lon: number} | null>(null);
  const [loadingCoordinates, setLoadingCoordinates] = useState(true);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [windArrowTip, setWindArrowTip] = useState<WindArrowTip | null>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isNarrow = viewportWidth <= 425; // includes 320, 375, 425
  const isMobile = viewportWidth <= 768; // includes all mobile views

  const windDirectionMode = useMemo(() => getWindDirectionMode(chartData), [chartData]);
  const showPerDayArrows = windDirectionMode.mode === "perDay";
  const sharedWindDay = windDirectionMode.mode === "shared" ? windDirectionMode.sharedDay : null;

  const chartMargin = isNarrow
    ? { top: 4, right: 6, left: 0, bottom: showPerDayArrows ? 28 : 8 }
    : isMobile
      ? { top: 6, right: 10, left: 5, bottom: showPerDayArrows ? 32 : 10 }
      : { top: 20, right: 30, left: 20, bottom: showPerDayArrows ? 36 : 12 };
  const xAxisHeight = showPerDayArrows
    ? isNarrow
      ? 52
      : isMobile
        ? 56
        : 60
    : isNarrow
      ? 28
      : isMobile
        ? 32
        : 36;


  // Fetch farmer coordinates from profile - update when plot selection changes
  useEffect(() => {
    const updateFarmerCoordinates = () => {
      if (propLat && propLon) {
        setFarmerCoordinates({ lat: propLat, lon: propLon });
        setLoadingCoordinates(false);
        return;
      }

      try {
        setLoadingCoordinates(true);

        if (!profile?.plots || profile.plots.length === 0) {
          setFarmerCoordinates(null);
          setLoadingCoordinates(false);
          return;
        }

        // Get coordinates from the selected plot (or first plot if no selection)
        let selectedPlot = null;
        if (selectedPlotName) {
          selectedPlot = profile.plots.find((p: any) => 
            p.fastapi_plot_id === selectedPlotName ||
            `${p.gat_number}_${p.plot_number}` === selectedPlotName
          );
        }
        
        // Fallback to first plot if selected plot not found
        if (!selectedPlot) {
          selectedPlot = profile.plots[0];
        }
        
        if (selectedPlot?.coordinates?.location) {
          const loc = selectedPlot.coordinates.location;
          const plotLat = Number(loc.latitude);
          const plotLon = Number(loc.longitude);
          if (!Number.isFinite(plotLat) || !Number.isFinite(plotLon)) {
            setFarmerCoordinates(null);
          } else {
            setFarmerCoordinates({ lat: plotLat, lon: plotLon });
          }
        } else {
          setFarmerCoordinates(null);
        }
      } catch (error) {
        console.error("WeatherForecast: Error fetching farmer coordinates:", error);
        setFarmerCoordinates(null);
      } finally {
        setLoadingCoordinates(false);
      }
    };

    updateFarmerCoordinates();
  }, [profile, propLat, propLon, selectedPlotName]);

  const selectedPlot = useMemo(() => {
    if (!profile?.plots?.length) return null;
    if (selectedPlotName) {
      const match = profile.plots.find(
        (p: any) =>
          p.fastapi_plot_id === selectedPlotName ||
          `${p.gat_number}_${p.plot_number}` === selectedPlotName
      );
      if (match) return match;
    }
    return profile.plots[0];
  }, [profile, selectedPlotName]);

  const { lat, lon } = useMemo(
    () =>
      resolveForecastLatLon(
        selectedPlot,
        propLat || farmerCoordinates?.lat,
        propLon || farmerCoordinates?.lon
      ),
    [selectedPlot, propLat, propLon, farmerCoordinates?.lat, farmerCoordinates?.lon]
  );

  useEffect(() => {
    if (loadingCoordinates) return;

    const cacheKey = weatherChartCacheKey(lat, lon);
    const cached = getCached(cacheKey);
    if (
      cached &&
      Array.isArray(cached) &&
      cached.length > 0 &&
      forecastChartHasValues(cached as ForecastChartDay[])
    ) {
      const days = cached as ForecastChartDay[];
      setChartData(days);
      setForecastError(null);
      setAppState((prev: any) => ({
        ...prev,
        weatherChartData: days,
        weatherSelectedDay: prev?.weatherSelectedDay ?? days[0],
      }));
      return;
    }

    const gen = ++fetchGenRef.current;
    setLoadingForecast(true);
    setForecastError(null);

    getOrFetchWeatherChartDays(lat, lon, getCached, setCached)
      .then(({ chartDays }) => {
        if (gen !== fetchGenRef.current) return;
        setChartData(chartDays);
        setAppState((prev: any) => ({
          ...prev,
          weatherChartData: chartDays,
          weatherSelectedDay: chartDays[0],
        }));
      })
      .catch((error) => {
        if (gen !== fetchGenRef.current) return;
        console.error("WeatherForecast: Fetch error:", error);
        setForecastError(
          error instanceof Error ? error.message : "Failed to load weather forecast"
        );
      })
      .finally(() => {
        if (gen === fetchGenRef.current) {
          setLoadingForecast(false);
        }
      });
  }, [loadingCoordinates, lat, lon, getCached, setCached, setAppState]);

  useEffect(() => {
    const shared = appState.weatherChartData as ForecastChartDay[] | undefined;
    if (!Array.isArray(shared) || shared.length === 0) return;
    setChartData(shared);
    setForecastError(null);
  }, [appState.weatherChartData]);

  const currentWeather = selectedDay || chartData[0];

  // Show loading state while fetching coordinates
  if (loadingCoordinates) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-gray-600">Loading farmer location...</span>
          </div>
        </div>
      </div>
    );
  }



  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-800 mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-sm">
              <span className="inline-block w-3 h-3 bg-amber-500 rounded-full mr-2"></span>
              Temperature: {(Number(data.temperature) || 0).toFixed(2)}°C
            </p>
            <p className="text-sm">
              <span className="inline-block w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
              Rainfall: {(Number(data.rainfall) || 0).toFixed(1)} mm
            </p>
            <p className="text-sm">
              <span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-2"></span>
              Wind: {(Number(data.wind) || 0).toFixed(2)} km/h
              {data.windDirectionLabel ? (
                <span className="text-gray-600"> · {data.windDirectionLabel}</span>
              ) : null}
            </p>
            <p className="text-sm">
              <span className="inline-block w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
              Humidity: {(Number(data.humidity) || 0).toFixed(2)}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const handleWindArrowHover = (tip: WindArrowTip | null) => {
    if (!tip || !chartWrapRef.current) {
      setWindArrowTip(null);
      return;
    }
    const rect = chartWrapRef.current.getBoundingClientRect();
    setWindArrowTip({
      row: tip.row,
      x: tip.x - rect.left,
      y: tip.y - rect.top,
    });
  };

  const handleChartClick = (data: any) => {
    if (data && data.activePayload) {
      setAppState((prev: any) => ({
        ...prev,
        weatherSelectedDay: data.activePayload[0].payload,
      }));
    }
  };

  if (loadingForecast && !chartData.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading weather data...</p>
        </div>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-gray-700 mb-2">Could not load weather forecast.</p>
          {forecastError ? (
            <p className="text-sm text-gray-500 mb-4">{forecastError}</p>
          ) : null}
          <button
            type="button"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            onClick={() => {
              fetchGenRef.current += 1;
              setLoadingForecast(true);
              setForecastError(null);
              getOrFetchWeatherChartDays(lat, lon, getCached, setCached)
                .then(({ chartDays }) => {
                  setChartData(chartDays);
                  setAppState((prev: any) => ({
                    ...prev,
                    weatherChartData: chartDays,
                    weatherSelectedDay: chartDays[0],
                  }));
                })
                .catch((error) => {
                  setForecastError(
                    error instanceof Error ? error.message : "Failed to load weather forecast"
                  );
                })
                .finally(() => setLoadingForecast(false));
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-0">
      <div className="weather-forecast-container" style={{ width: '100%', maxWidth: '1920px', margin: '0 auto', padding: '0 1rem', boxSizing: 'border-box' }}>
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 sm:mb-6">
          <div
            className={`p-4 sm:p-8 min-h-[100px] sm:min-h-[120px] rounded-2xl cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl text-lg weather-temp-card
              ${
                selectedMetric === "temperature"
                  ? "bg-amber-600 ring-2 ring-amber-400 text-white"
                  : "bg-white text-gray-700 hover:bg-amber-50"
              }`}
            onClick={() =>
              setSelectedMetric(
                selectedMetric === "temperature" ? null : "temperature"
              )
            }
          >
            <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:space-x-3 space-x-0">
            <ThermometerSun className="w-6 h-6" />
              <div className="mt-1 sm:mt-0">
                <div
                  className={`font-bold text-2xl ${
                    selectedMetric === "temperature" ? "text-white" : ""
                  }`}
                >
                  {(Number(currentWeather.temperature) || 0).toFixed(2)}°C
                </div>
                <div className="text-sm opacity-75">Temperature</div>
              </div>
            </div>
          </div>
          <div
            className={`p-4 sm:p-8 min-h-[100px] sm:min-h-[120px] rounded-2xl cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl text-lg 
              ${
                selectedMetric === "rainfall"
                  ? "bg-blue-700 ring-2 ring-blue-400 text-white"
                  : "bg-white text-gray-700 hover:bg-blue-50"
              }`}
            onClick={() =>
              setSelectedMetric(
                selectedMetric === "rainfall" ? null : "rainfall"
              )
            }
          >
            <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:space-x-3 space-x-0">
              <CloudRain className="w-6 h-6" />
              <div className="mt-1 sm:mt-0">
                <div
                  className={`font-bold text-2xl ${
                    selectedMetric === "rainfall" ? "text-white" : ""
                  }`}
                >
                  {(Number(currentWeather.rainfall) || 0).toFixed(1)} mm
                </div>
                <div className="text-sm opacity-75">Rainfall</div>
              </div>
            </div>
          </div>
          <div
            className={`p-4 sm:p-8 min-h-[100px] sm:min-h-[120px] rounded-2xl cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl text-lg 
              ${
                selectedMetric === "wind"
                  ? "bg-green-700 ring-2 ring-green-400 text-white"
                  : "bg-white text-gray-700 hover:bg-green-50"
              }`}
            onClick={() =>
              setSelectedMetric(selectedMetric === "wind" ? null : "wind")
            }
          >
            <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:space-x-3 space-x-0">
              <Wind className="w-6 h-6" />
              <div className="mt-1 sm:mt-0">
                <div
                  className={`font-bold text-2xl ${
                    selectedMetric === "wind" ? "text-white" : ""
                  }`}
                >
                  {(Number(currentWeather.wind) || 0).toFixed(2)} km/h
                </div>
                <div className="text-sm opacity-75">
                  Wind Speed
                  {currentWeather.windDirectionLabel ? (
                    <span className="block text-xs mt-0.5 font-semibold">
                      {currentWeather.windDirectionLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <div
            className={`p-4 sm:p-8 min-h-[100px] sm:min-h-[120px] rounded-2xl cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl text-lg weather-humidity-card
              ${
                selectedMetric === "humidity"
                  ? "bg-purple-800 ring-2 ring-purple-400 text-white"
                  : "bg-white text-gray-700 hover:bg-purple-50"
              }`}
            onClick={() =>
              setSelectedMetric(
                selectedMetric === "humidity" ? null : "humidity"
              )
            }
          >
            <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:space-x-3 space-x-0">
              <Cloud className="w-6 h-6" />
              <div className="mt-1 sm:mt-0">
                <div
                  className={`font-bold text-2xl ${
                    selectedMetric === "humidity" ? "text-white" : ""
                  }`}
                >
                  {(Number(currentWeather.humidity) || 0).toFixed(2)}%
                </div>
                <div className="text-sm opacity-75">Humidity</div>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Chart */}
        <div className="bg-white rounded-2xl shadow-xl p-2 sm:p-6 border border-gray-100 -mt-3 sm:mt-0">
          <div className="flex items-center justify-between mb-1 sm:mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-gray-800">7-Day Forecast</h3>
            <div className="text-xs sm:text-sm text-gray-500 hidden sm:block">
              Click on any day to view details
            </div>
          </div>

          <div ref={chartWrapRef} className="w-full h-[300px] sm:h-[340px] md:h-[420px] relative">
            {/* Refresh Icon */}
            <button
              className="absolute top-1 right-1 sm:top-2 sm:right-2 z-10 bg-white rounded-full p-2 shadow hover:bg-gray-100 transition w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center"
              aria-label="Show all metrics"
              onClick={() => setSelectedMetric(null)}
              title="Show all metrics"
              style={{ width: "40px", height: "40px" }}
            >
              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
            </button>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={chartMargin as any}
                onClick={handleChartClick}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  height={xAxisHeight}
                  interval={0}
                  tick={(props) => (
                    <DateWithWindTick
                      {...props}
                      chartData={chartData}
                      fontSize={isNarrow ? 10 : isMobile ? 12 : 14}
                      showPerDayArrows={showPerDayArrows}
                      onWindArrowHover={handleWindArrowHover}
                    />
                  )}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={isNarrow ? 20 : isMobile ? 30 : 60}
                  tick={{ fill: "#25282c", fontSize: isNarrow ? 8 : isMobile ? 10 : 12 }}
                  tickMargin={isNarrow ? 2 : isMobile ? 4 : 8}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: isNarrow ? 8 : isMobile ? 10 : 12, paddingTop: isNarrow ? 0 : isMobile ? 2 : 8, marginBottom: isNarrow ? -5 : isMobile ? -3 : 0 }} />

                {/* Temperature Bars */}
                <Bar
                  dataKey="temperature"
                  fill="#f59e0b"
                  name="Temperature (°C)"
                  barSize={isNarrow ? 20 : 40}
                  radius={[4, 4, 0, 0]}
                  className="cursor-pointer hover:opacity-80 transition-all duration-300"
                  opacity={
                    selectedMetric && selectedMetric !== "temperature" ? 0.2 : 1
                  }
                />
                {/* Rainfall Bars */}
                <Bar
                  dataKey="rainfall"
                  fill="#3b82f6"
                  name="Rainfall (mm)"
                  barSize={isNarrow ? 14 : 25}
                  radius={[4, 4, 0, 0]}
                  className="cursor-pointer hover:opacity-80 transition-all duration-300"
                  opacity={
                    selectedMetric && selectedMetric !== "rainfall" ? 0.2 : 1
                  }
                />
                {/* Wind Line */}
                <Line
                  type="monotone"
                  dataKey="wind"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  name="Wind (km/h)"
                  opacity={
                    selectedMetric && selectedMetric !== "wind" ? 0.2 : 1
                  }
                />
                {/* Humidity Line */}
                <Line
                  type="monotone"
                  dataKey="humidity"
                  stroke="#6366f1"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  name="Humidity (%)"
                  opacity={
                    selectedMetric && selectedMetric !== "humidity" ? 0.2 : 1
                  }
                />
              </ComposedChart>
            </ResponsiveContainer>
            {sharedWindDay?.windDirectionDeg != null && (
              <div
                className="wind-direction-shared"
                onMouseEnter={(e) =>
                  handleWindArrowHover({
                    row: sharedWindDay,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }
                onMouseMove={(e) =>
                  handleWindArrowHover({
                    row: sharedWindDay,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }
                onMouseLeave={() => handleWindArrowHover(null)}
                title={
                  sharedWindDay.windDirectionLabel
                    ? `Wind direction: ${sharedWindDay.windDirectionLabel}`
                    : undefined
                }
              >
                <WindArrowSvg degrees={sharedWindDay.windDirectionDeg} size={22} />
                <span className="wind-direction-shared-label">Wind direction</span>
              </div>
            )}
            {windArrowTip && (
              <div
                className="wind-arrow-hover-tip"
                style={{
                  left: windArrowTip.x,
                  top: windArrowTip.y,
                }}
              >
                <p className="wind-arrow-hover-tip-title">{windArrowTip.row.date}</p>
                <p className="wind-arrow-hover-tip-line">
                  <span className="inline-block w-2.5 h-2.5 bg-green-500 rounded-full mr-1.5" />
                  Wind direction:{" "}
                  {windArrowTip.row.windDirectionLabel ??
                    (windArrowTip.row.windDirectionDeg != null
                      ? formatWindDirectionLabel(windArrowTip.row.windDirectionDeg)
                      : "—")}
                </p>
                <p className="wind-arrow-hover-tip-line text-gray-500">
                  Speed: {(Number(windArrowTip.row.wind) || 0).toFixed(2)} km/h
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherForecast;
