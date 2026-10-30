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
import { extractNumericValue, testParsing, fetchWeatherForecast } from "../services/weatherForecastService";
import { getFarmerMyProfile } from "../api";


interface WeatherForecastProps {
  lat?: number;
  lon?: number;
}

const WeatherForecast: React.FC<WeatherForecastProps> = ({
  lat: propLat,
  lon: propLon
}) => {
  const { appState, setAppState, setCached, selectedPlotName, getCached } = useAppContext();
  const chartData = appState.weatherChartData || [];
  const selectedDay = appState.weatherSelectedDay || null;
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [farmerCoordinates, setFarmerCoordinates] = useState<{lat: number, lon: number} | null>(null);
  const [loadingCoordinates, setLoadingCoordinates] = useState(true);
  const [hasFetchedWeather, setHasFetchedWeather] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const fetchingRef = useRef(false); // Prevent multiple simultaneous fetches

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isNarrow = viewportWidth <= 425; // includes 320, 375, 425
  const isMobile = viewportWidth <= 768; // includes all mobile views
  const chartMargin = isNarrow ? { top: 4, right: 6, left: 0, bottom: -5 } : isMobile ? { top: 6, right: 10, left: 5, bottom: -3 } : { top: 20, right: 30, left: 20, bottom: 5 };


  // Fetch farmer coordinates from profile - update when plot selection changes
  useEffect(() => {
    const fetchFarmerCoordinates = async () => {
      try {
        setLoadingCoordinates(true);

        let profileData = getCached("farmerProfile", 10 * 60 * 1000);
        if (!profileData?.plots?.length) {
          const response = await getFarmerMyProfile();
          profileData = response.data;
        }

        if (!profileData?.plots || profileData.plots.length === 0) {
          setFarmerCoordinates(null);
          setLoadingCoordinates(false);
          return;
        }

        // Get coordinates from the selected plot (or first plot if no selection)
        let selectedPlot = null;
        if (selectedPlotName) {
          selectedPlot = profileData.plots.find((p: any) =>
            p.fastapi_plot_id === selectedPlotName ||
            `${p.gat_number}_${p.plot_number}` === selectedPlotName
          );
        }

        // Fallback to first plot if selected plot not found
        if (!selectedPlot) {
          selectedPlot = profileData.plots[0];
        }

        if (selectedPlot?.coordinates?.location) {
          const coords = {
            lat: selectedPlot.coordinates.location.latitude,
            lon: selectedPlot.coordinates.location.longitude
          };
          setFarmerCoordinates(coords);
          // Reset fetch flag when plot changes so weather data is refetched
          setHasFetchedWeather(false);
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

    // Fetch coordinates when plot selection changes
    if (selectedPlotName || !farmerCoordinates) {
      fetchFarmerCoordinates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlotName]); // Update when selectedPlotName changes (farmerCoordinates intentionally excluded)

  // Determine which coordinates to use - memoize to prevent unnecessary recalculations
  const lat = useMemo(() => {
    return propLat || farmerCoordinates?.lat || 20.014040817830804;
  }, [propLat, farmerCoordinates?.lat]);
  const lon = useMemo(() => {
    return propLon || farmerCoordinates?.lon || 73.66620106848734;
  }, [propLon, farmerCoordinates?.lon]);

  useEffect(() => {
    // Only fetch weather data when coordinates are available and not loading
    if (loadingCoordinates) {
      return;
    }

    // Only fetch once or if already fetching
    if (hasFetchedWeather || fetchingRef.current) {
      return;
    }

    const cacheKey = `weatherChartData_${lat}_${lon}`; // Include coordinates in cache key

    // Test parsing function - only log once on initial load
    if (!hasFetchedWeather) {
      testParsing();
    }

    // Clear cache to force fresh data fetch
    localStorage.removeItem(cacheKey);

    // const cached = getCached(cacheKey);
    // if (cached) {
    //   setAppState((prev: any) => ({
    //     ...prev,
    //     weatherChartData: cached,
    //     weatherSelectedDay: cached[0],
    //   }));
    //   return;
    // }

        // Mark as fetching to prevent multiple calls
        fetchingRef.current = true;
        setHasFetchedWeather(true);

        fetchWeatherForecast(lat, lon)
      .then((data) => {
        // Support both legacy array and new { source, data: [...] } shape
        const rawList = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

        // Normalize keys and strip units using service function
        const parseNum = (v: any) => {
          if (v === null || v === undefined) return 0;
          if (typeof v === "number") return v;
          if (typeof v === "string") {
            return extractNumericValue(v);
          }
          return 0;
        };

        // Process API data directly - no need for date mapping

        // Generate next 7 days starting from tomorrow (exclude today)
        const days: any[] = [];

        // Create a map of API data by date for easy lookup
        const apiDataByDate = new Map<string, any>();
        rawList.forEach((d: any) => {
          const dateStr = d.date || d.Date;
          const iso = dateStr ? dateStr.split('T')[0] : new Date().toISOString().split("T")[0];
          apiDataByDate.set(iso, d);
        });

        // Generate next 7 days starting from tomorrow
        const today = new Date();
        for (let i = 1; i <= 7; i++) { // Start from i=1 (tomorrow) instead of i=0 (today)
          const futureDate = new Date(today);
          futureDate.setDate(today.getDate() + i);
          const iso = futureDate.toISOString().split("T")[0];

          // Get API data for this date, or use default values if not available
          const apiData = apiDataByDate.get(iso) || {};

          days.push({
            date: futureDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
            temperature: parseNum(apiData.temperature_max),
            humidity: parseNum(apiData.humidity_max),
            rainfall: parseNum(apiData.precipitation),
            wind: parseNum(apiData.wind_speed_max),
            fullDate: iso,
          });
        }

        setAppState((prev: any) => ({
          ...prev,
          weatherChartData: days,
          weatherSelectedDay: days[0],
        }));
        setCached(cacheKey, days);
        fetchingRef.current = false;
      })
        .catch((error) => {
          console.error("WeatherForecast: Fetch error:", error);
          fetchingRef.current = false;
          // Fallback: generate next 7 days with zero values
          const days: any[] = [];
          const today = new Date();

          for (let i = 1; i <= 7; i++) { // Start from i=1 (tomorrow)
            const futureDate = new Date(today);
            futureDate.setDate(today.getDate() + i);
            const iso = futureDate.toISOString().split("T")[0];

            days.push({
              date: futureDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
              temperature: 0,
              humidity: 0,
              rainfall: 0,
              wind: 0,
              fullDate: iso,
            });
          }

          setAppState((prev: any) => ({
            ...prev,
            weatherChartData: days,
            weatherSelectedDay: days[0],
          }));
        });
  }, [loadingCoordinates, hasFetchedWeather, lat, lon]); // Depend on coordinates so it refetches when plot changes

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
    if (data && data.activePayload) {
      setAppState((prev: any) => ({
        ...prev,
        weatherSelectedDay: data.activePayload[0].payload,
      }));
    }
  };

  if (!chartData.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading weather data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-0 sm:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-3 mb-0">
          <div
            className={`p-4 sm:p-8 min-h-[100px] sm:min-h-[120px] rounded-2xl cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl text-lg
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
            className={`p-4 sm:p-8 min-h-[100px] sm:min-h-[120px] rounded-2xl cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl text-lg
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

          <div className="w-full h-[300px] sm:h-[320px] md:h-[400px] relative">
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
                  tick={{ fill: "#6b7280", fontSize: isNarrow ? 10 : isMobile ? 12 : 14 }}
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherForecast;
