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
  getOrFetchWeatherChartDays,
  resolveForecastLatLon,
  normalizeForecastChartDays,
} from "../services/weatherForecastService";
import "./WeatherForecast.css";
import { HoverInfoTooltip } from "./HoverInfoTooltip";

/** X-axis date labels only (wind direction shown in HTML bar below chart). */
function ForecastXAxisTick({
  x = 0,
  y = 0,
  payload,
  fontSize,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  fontSize: number;
}) {
  const label = payload?.value ?? "";

  return (
    <g transform={`translate(${x},${y})`}>
      <text y={0} dy={12} textAnchor="middle" fill="#6b7280" fontSize={fontSize}>
        {label}
      </text>
    </g>
  );
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
  const [hoveredDay, setHoveredDay] = useState<ForecastChartDay | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isNarrow = viewportWidth <= 425; // includes 320, 375, 425
  const isMobile = viewportWidth <= 768; // includes all mobile views
  const chartMargin = isNarrow
    ? { top: 4, right: 6, left: 0, bottom: 8 }
    : isMobile
      ? { top: 6, right: 10, left: 5, bottom: 10 }
      : { top: 20, right: 30, left: 20, bottom: 12 };
  const xTickFontSize = isNarrow ? 10 : isMobile ? 12 : 14;
  const arrowDay = hoveredDay ?? selectedDay ?? chartData[0] ?? null;
  const windDeg =
    arrowDay && typeof arrowDay.windDirectionDeg === "number"
      ? Math.round(arrowDay.windDirectionDeg)
      : null;
  const windLabel = arrowDay?.windDirectionLabel ?? null;


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
    const shared = normalizeForecastChartDays(
      (appState.weatherChartData as ForecastChartDay[]) || []
    );
    if (!shared.length) return;
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
      const windDeg =
        typeof data.windDirectionDeg === "number"
          ? Math.round(data.windDirectionDeg)
          : null;
      const windLabel = data.windDirectionLabel ?? null;

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
            {windDeg != null ? (
              <p className="text-sm">
                <span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                Wind direction: {windLabel ?? "—"} ({windDeg}°)
              </p>
            ) : null}
            <p className="text-sm">
              <span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-2"></span>
              Speed: {(Number(data.wind) || 0).toFixed(2)} km/h
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

  const handleChartClick = (data: any) => {
    if (data?.activePayload?.[0]?.payload) {
      setAppState((prev: any) => ({
        ...prev,
        weatherSelectedDay: data.activePayload[0].payload,
      }));
    }
  };

  const handleChartMouseMove = (state: any) => {
    if (state?.activePayload?.[0]?.payload) {
      setHoveredDay(state.activePayload[0].payload);
    }
  };

  const handleChartMouseLeave = () => {
    setHoveredDay(null);
  };

  if (loadingForecast && !chartData.length) {
    return (
      <div className="weather-forecast-state bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading weather data...</p>
        </div>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="weather-forecast-state bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
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
    <div className="w-full min-w-0 p-0">
      <div className="weather-forecast-container" style={{ width: '100%', maxWidth: '1920px', margin: '0 auto', padding: '0 1rem', boxSizing: 'border-box' }}>
        <section className="dashboard-weather-panel" aria-label="Local weather">
          <div className="dashboard-weather-heading">
            <div>
              <p>WEATHER AT YOUR PLOT</p>
              <h2>Local conditions</h2>
            </div>
            <span>Selected plot</span>
          </div>
          {/* Metric Cards */}
          <div className="weather-forecast-metric-cards grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 sm:mb-6">
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
                <div className="text-sm opacity-75">Wind Speed</div>
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
        </section>

        {/* Interactive Chart */}
        <div className="weather-forecast-chart-panel bg-white rounded-2xl shadow-xl p-2 sm:p-6 border border-gray-100 -mt-3 sm:mt-0 overflow-visible">
          <div className="flex items-center justify-between mb-1 sm:mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-gray-800">7-Day Forecast</h3>
            <div className="text-xs sm:text-sm text-gray-500 hidden sm:block">
              Click on any day to view details
            </div>
          </div>

          <div
            className="w-full h-[300px] sm:h-[320px] md:h-[400px] relative"
            onMouseLeave={handleChartMouseLeave}
          >
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
                onMouseMove={handleChartMouseMove}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  height={isNarrow ? 28 : isMobile ? 32 : 36}
                  tick={(tickProps) => (
                    <ForecastXAxisTick
                      {...tickProps}
                      fontSize={xTickFontSize}
                    />
                  )}
                  tickMargin={isNarrow ? 2 : isMobile ? 4 : 8}
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
                {/* Wind speed trend — direction shown under selected day on X-axis */}
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
          </div>

          {arrowDay && windDeg != null ? (
            <div className="weather-wind-direction flex flex-wrap items-center justify-center gap-2 border-t border-gray-100 pt-2 mt-1 text-xs text-gray-600">
              <span
                className="inline-flex h-5 w-5 items-center justify-center text-green-600"
                style={{ transform: `rotate(${windDeg}deg)` }}
                aria-hidden
              >
                <svg width="14" height="14" viewBox="-7 -12 14 18" fill="none">
                  <path
                    d="M0 -10 L0 4 M0 -10 L-4 -3 M0 -10 L4 -3"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="font-medium text-gray-700">
                {arrowDay.date} — Wind direction {windLabel ?? "—"} ({windDeg}°)
              </span>
              <HoverInfoTooltip
                text={`Speed: ${(Number(arrowDay.wind) || 0).toFixed(2)} km/h. The arrow shows the direction the wind is coming from.`}
                iconClassName="w-4 h-4 text-green-600 hover:text-green-700 cursor-help shrink-0"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default WeatherForecast;
