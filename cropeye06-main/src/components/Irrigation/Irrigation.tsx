import React, { useEffect, useState } from "react";
import { Satellite } from "lucide-react";

import RainfallCard from "./cards/RainfallCard";
import SoilMoistureCard from "./cards/SoilMoistureCard";
import WaterUptakeCard from "./cards/WaterUptakeCard";
import EvapotranspirationCard from "./cards/EvapotranspirationCard";
import EvapotranspirationGraph from "./cards/EvapotranspirationGraph";
import TemperatureCard from "./cards/TemperatureCard";
import HumidityCard from "./cards/HumidityCard";
import SoilMoistureTrendCard from "./cards/SoilMoistureTrendCard";

import "./Irrigation.css";
import { useAppContext } from "../../context/AppContext";
import { useFarmerProfile } from "../../hooks/useFarmerProfile";
import { fetchCurrentWeather } from "../../services/weatherService";

interface IrrigationProps {
  selectedPlotName?: string | null;
  moistGroundPercent?: number | null; // NEW
}

const Irrigation: React.FC<IrrigationProps> = ({
  selectedPlotName: propSelectedPlotName,
  moistGroundPercent,
}) => {
  const { appState, setAppState, getCached, setCached, selectedPlotName, setSelectedPlotName } = useAppContext();
  const { profile, loading: profileLoading } = useFarmerProfile();
  // Use global selectedPlotName if available, otherwise fall back to prop
  const activePlotName = selectedPlotName || propSelectedPlotName;
  const weatherData = appState.weatherData || null;
  const [loading, setLoading] = useState<boolean>(!weatherData);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    // Wait for farmer profile to load
    if (profileLoading || !profile) {
      console.log('🌤️ Irrigation: Waiting for farmer profile to load...');
      return;
    }

    // Get farmer's location from selected plot (or first plot if no selection)
    if (!profile.plots || profile.plots.length === 0) {
      console.warn('🌤️ Irrigation: No plots found in farmer profile');
      setError("No location data available for weather");
      setLoading(false);
      return;
    }

    // Find selected plot or use first plot
    let selectedPlot = null;
    if (activePlotName) {
      selectedPlot = profile.plots.find((p: any) =>
        p.fastapi_plot_id === activePlotName ||
        `${p.gat_number}_${p.plot_number}` === activePlotName
      );
    }

    if (!selectedPlot) {
      selectedPlot = profile.plots[0];
    }

    const coordinates = selectedPlot.coordinates?.location?.coordinates;

    if (!coordinates || coordinates.length !== 2) {
      console.warn('🌤️ Irrigation: Invalid coordinates in farmer profile:', coordinates);
      setError("Invalid location data for weather");
      setLoading(false);
      return;
    }

    const [longitude, latitude] = coordinates;
    const cacheKey = `weather_${latitude}_${longitude}`;

    const cached = getCached(cacheKey);
    if (cached) {
      setAppState((prev: any) => ({ ...prev, weatherData: cached.data }));
      setLastUpdated(new Date(cached.timestamp));
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchWeatherData(latitude, longitude);
    // eslint-disable-next-line
  }, [profile, profileLoading, activePlotName]);

  const fetchWeatherData = async (lat: number, lon: number) => {
    try {
      setLoading(true);
      console.log('🌤️ Irrigation: Fetching weather for coordinates:', { lat, lon });

      // Validate coordinates
      if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        console.warn('🌤️ Irrigation: Invalid coordinates, skipping weather fetch', { lat, lon });
        setError(null); // Don't show error, just skip
        setLoading(false);
        return;
      }

      // Use the same weather service as Header component with fallback enabled
      const data = await fetchCurrentWeather(lat, lon, true); // Use fallback to prevent crashes
      console.log('🌤️ Irrigation: Weather data received:', {
        location: data.location,
        temperature: data.temperature_c,
        humidity: data.humidity,
      });

      setAppState((prev: any) => ({ ...prev, weatherData: data }));
      setLastUpdated(new Date());
      setError(null); // Clear any previous errors

      // Save to context cache and localStorage with location-specific key
      const cacheKey = `weather_${lat}_${lon}`;
      const payload = { data, timestamp: Date.now() };
      setCached(cacheKey, payload);
    } catch (err) {
      // Use fallback message that doesn't crash the dashboard
      console.warn("🌤️ Irrigation: Weather fetch failed, continuing without weather data", err);
      setError(null); // Don't show error message, dashboard continues to work
      // Optionally set fallback weather data
      const { DEFAULT_WEATHER_DATA } = await import("../../services/weatherService");
      setAppState((prev: any) => ({ ...prev, weatherData: DEFAULT_WEATHER_DATA }));
    } finally {
      setLoading(false);
    }
  };

  const formattedDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });


  if (profileLoading || (loading && !weatherData)) {
    return (
      <div className="irrigation-loading">
        <div className="loading-spinner">
          <Satellite className="w-8 h-8 animate-spin text-blue-500" />
        </div>
        <p>{profileLoading ? 'Loading farmer profile...' : 'Loading irrigation data...'}</p>
      </div>
    );
  }

  if (error) {
    return <div className="irrigation-error">{error}</div>;
  }

  return (
    <div className="irrigation-container">
      {/* Plot Selector */}
      {profile && !profileLoading && (
        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="font-semibold text-gray-700">Select Plot:</label>
            <select
              value={selectedPlotName || ""}
              onChange={(e) => {
                setSelectedPlotName(e.target.value);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-auto max-w-xs"
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

      <div className="irrigation-header">
        <h1>Irrigation Status</h1>
        <span className="date">{formattedDate}</span>
      </div>

      <div className="card-row">
        <RainfallCard
          value={weatherData?.precip_mm || 0}
          lastUpdated={lastUpdated}
        />
        <TemperatureCard
          value={weatherData?.temperature_c || 0}
          lastUpdated={lastUpdated}
        />
        <HumidityCard
          value={weatherData?.humidity || 0}
          lastUpdated={lastUpdated}
        />
      </div>

      <div className="card-row">
        <EvapotranspirationCard />
        <SoilMoistureCard
          optimalRange={[50, 60]}
          moistGroundPercent={moistGroundPercent}
        />
        <WaterUptakeCard />
      </div>

      <div style={{ marginTop: "20px", marginBottom: "20px" }}>
        <EvapotranspirationGraph />
      </div>

      <div className="trend-card-row">
        <SoilMoistureTrendCard selectedPlotName={activePlotName} />
      </div>

      <div className="refresh-section">
        <button
          onClick={() => {
            let selectedPlot = null;
            if (activePlotName) {
              selectedPlot = profile?.plots?.find(
                (p: { fastapi_plot_id?: string; gat_number?: string; plot_number?: string }) =>
                  p.fastapi_plot_id === activePlotName ||
                  `${p.gat_number}_${p.plot_number}` === activePlotName
              );
            }

            if (!selectedPlot && profile?.plots && profile.plots.length > 0) {
              selectedPlot = profile.plots[0];
            }

            if (selectedPlot?.coordinates?.location?.coordinates) {
              const [longitude, latitude] = selectedPlot.coordinates.location.coordinates;
              fetchWeatherData(latitude, longitude);
            }

            window.dispatchEvent(new CustomEvent("irrigation-refresh-soil-moisture"));
          }}
          className="refresh-button"
        >
          Refresh Data
        </button>
        <span className="last-updated">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};

export default Irrigation;
