import React, { useEffect, useState } from "react";
import { Droplets } from "lucide-react";
import "../Irrigation.css";
import { useAppContext } from "../../../context/AppContext";
import { useFarmerProfile } from "../../../hooks/useFarmerProfile";

interface SoilMoistureCardProps {
  optimalRange: [number, number]; // [min%, max%]
  moistGroundPercent?: number | null;
  targetDate?: string; // Optional date input (format: YYYY-MM-DD)
  className?: string;
}

// New 9006 endpoint types
interface SoilMoistureStackItem {
  day: string;
  soil_moisture: number;
}

interface SoilMoistureStackResponse {
  plot_name: string;
  latitude: number;
  longitude: number;
  soil_moisture_stack: SoilMoistureStackItem[];
}

const SoilMoistureCard: React.FC<SoilMoistureCardProps> = ({
  optimalRange,
  targetDate,
  className = "",
}) => {
  // Use current date if no target date provided
  const currentDate = targetDate || new Date().toISOString().split('T')[0];
  const { appState, setAppState, getCached, setCached, selectedPlotName } = useAppContext();
  const { profile, loading: profileLoading } = useFarmerProfile();
  const moisturePercent = appState.moisturePercent ?? 0;
  const currentSoilMoisture = appState.currentSoilMoisture ?? moisturePercent; // may be set by trend card
  const status = appState.moistureStatus ?? "Loading...";
  
  // Prioritize shared value from SoilMoistureTrendCard
  const [yesterdayMoisture, setYesterdayMoisture] = useState<number | null>(null);
  const [yesterdayDate, setYesterdayDate] = useState<string | null>(null);
  const displayMoisture =
    (yesterdayMoisture ?? 0) > 0
      ? (yesterdayMoisture as number)
      : currentSoilMoisture > 0
      ? currentSoilMoisture
      : moisturePercent;
  
  // Debug: Log the values being used
  console.log('SoilMoistureCard Debug:', {
    currentSoilMoisture: currentSoilMoisture,
    moisturePercent: moisturePercent,
    displayMoisture: displayMoisture,
    appState: appState,
    selectedPlotName: selectedPlotName
  });
  
  const [loading, setLoading] = useState<boolean>(!displayMoisture);
  const [error, setError] = useState<string | null>(null);
  const [plotName, setPlotName] = useState<string>("");

  // Set plot name from global selectedPlotName or fallback to first plot
  useEffect(() => {
    if (profile && !profileLoading) {
      let plotToUse = "";
      
      // Use global selectedPlotName if available
      if (selectedPlotName) {
        // Find the plot by fastapi_plot_id or constructed ID
        const foundPlot = profile.plots?.find((plot: any) => 
          plot.fastapi_plot_id === selectedPlotName ||
          `${plot.gat_number}_${plot.plot_number}` === selectedPlotName
        );
        
        if (foundPlot && foundPlot.fastapi_plot_id) {
          plotToUse = foundPlot.fastapi_plot_id;
        } else {
          plotToUse = selectedPlotName || ""; // Use as-is if not found (might be a different format)
        }
      } else {
        // Fallback to first plot
        const plotNames = profile.plots?.map((plot: any) => plot.fastapi_plot_id) || [];
        plotToUse = plotNames.length > 0 ? plotNames[0] : "";
      }
      
      if (plotToUse && plotToUse !== plotName) {
        setPlotName(plotToUse);
        console.log('SoilMoistureCard: Setting plot name to:', plotToUse);
      }
    }
  }, [profile, profileLoading, selectedPlotName]);

  // Monitor when value changes
  useEffect(() => {
    if (displayMoisture > 0) setLoading(false);
  }, [displayMoisture]);

  // Fetch yesterday moisture from 9006 endpoint
  useEffect(() => {
    if (!plotName) return;
    fetchYesterdayFromStack();
  }, [plotName]);

  const fetchSoilMoistureStack = async (plot: string): Promise<SoilMoistureStackResponse> => {
    // API: https://cropeye-grapes-sef-production.up.railway.app/docs#/default/soil_moisture_soil_moisture__plot_name__post
    // Response URL: https://cropeye-grapes-sef-production.up.railway.app/soil-moisture/14D_14
    const baseUrl = 'https://cropeye-grapes-sef-production.up.railway.app';
    const url = `${baseUrl}/soil-moisture/${encodeURIComponent(plot)}`;
    
    console.log(`💧 SoilMoistureCard: Fetching soil moisture data from: ${url}`);
    
    // Create AbortController with 5 minute timeout to prevent session timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout
    
    try {
      const resp = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'omit',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        // Empty body as per API specification
      });
      
      clearTimeout(timeoutId);
      
        if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unable to read error response');
        throw new Error(`HTTP ${resp.status}: ${errorText || resp.statusText}`);
      }
      
      const data = await resp.json();
      console.log(`✅ SoilMoistureCard: Soil moisture data received:`, data);
      
      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response: Expected JSON object');
      }
      
      // Check if soil_moisture_stack exists and is an array
      if (!data.soil_moisture_stack || !Array.isArray(data.soil_moisture_stack)) {
        console.warn('⚠️ SoilMoistureCard: Response missing or invalid soil_moisture_stack:', data);
        // Return empty array if structure is invalid but don't throw error
        return {
          plot_name: data.plot_name || plot,
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          soil_moisture_stack: []
        };
      }
      
      return data as SoilMoistureStackResponse;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Handle timeout errors gracefully
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        console.warn('⚠️ Soil moisture request timed out after 5 minutes');
        throw new Error('Request timed out. The server is taking longer than expected to respond.');
      } else {
        // Handle network/CORS errors
        if (error.message?.includes('Failed to fetch') || error.message?.includes('CORS') || error.message?.includes('NetworkError')) {
          console.error('❌ SoilMoistureCard: Network/CORS error:', error);
          throw new Error('Network error: Unable to connect to the server. Please check your connection.');
        } else {
          console.error('❌ SoilMoistureCard: Error fetching soil moisture data:', error);
          throw error;
        }
      }
    }
  };

  const fetchYesterdayFromStack = async () => {
    try {
      setLoading(true);
      setError(null);
      const rawCacheKey = `soilMoistureStack_${plotName}`;
      const cachedStack = getCached(rawCacheKey);
      const stack = cachedStack || await fetchSoilMoistureStack(plotName);
      if (!cachedStack) {
        setCached(rawCacheKey, stack);
      }
      console.log(`✅ SoilMoistureCard: Received stack data:`, stack);
      
      const arr = Array.isArray(stack.soil_moisture_stack) ? stack.soil_moisture_stack : [];
      
      if (!arr.length) {
        console.warn('⚠️ SoilMoistureCard: Empty soil_moisture_stack array');
        throw new Error('No soil moisture data available in response');
      }
      
      // Sort by day and get the latest entry (API returns daily ascending)
      const sorted = [...arr].sort((a, b) => {
        const dateA = new Date(a.day).getTime();
        const dateB = new Date(b.day).getTime();
        return dateA - dateB;
      });
      
      const last = sorted[sorted.length - 1];
      console.log(`✅ SoilMoistureCard: Latest soil moisture entry:`, last);
      
      if (!last || last.soil_moisture === undefined) {
        throw new Error('Invalid soil moisture data structure');
      }
      
      const moistureValue = parseFloat((last.soil_moisture || 0).toFixed(2));
      setYesterdayMoisture(moistureValue);
      setYesterdayDate(last.day);
      
      // Set status based on optimalRange
      let st = "Loading...";
      if (moistureValue >= optimalRange[0] && moistureValue <= optimalRange[1]) {
        st = "Moderated";
      } else if (moistureValue < optimalRange[0]) {
        st = "Low";
      } else {
        st = "High";
      }
      
      setAppState((prev:any)=>({ 
        ...prev, 
        moisturePercent: moistureValue, 
        moistureStatus: st,
        currentSoilMoisture: moistureValue
      }));
      
      console.log(`✅ SoilMoistureCard: Updated state - Moisture: ${moistureValue}%, Status: ${st}`);
    } catch (err:any) {
      // Fallback: use trend data from context if available
      const trend = Array.isArray(appState.soilMoistureTrendData) ? appState.soilMoistureTrendData : [];
      if (trend.length) {
        const last = [...trend].sort((a:any,b:any)=> (a.date||a.day).localeCompare((b.date||b.day))).slice(-1)[0];
        const val = typeof last?.value === 'number' ? last.value : (last?.soil_moisture || 0);
        const dt = last?.date || last?.day || null;
        setYesterdayMoisture(parseFloat((val || 0).toFixed(2)));
        if (dt) setYesterdayDate(dt);
        let st = "Loading...";
        if (val >= optimalRange[0] && val <= optimalRange[1]) st = "Moderated"; else if (val < optimalRange[0]) st = "Low"; else st = "High";
        setAppState((prev:any)=>({ ...prev, moisturePercent: val, moistureStatus: st }));
        setError(null);
      } else {
        setError(`Failed to fetch soil moisture data: ${err.message || err}`);
      }
    } finally {
      setLoading(false);
    }
  };



  const statusColor =
    status === "Moderated"
      ? "text-green-500"
      : status === "Low"
      ? "text-yellow-500"
      : status === "High"
      ? "text-red-500"
      : "text-gray-500";

  return (
    <div className={`irrigation-card h-full ${className}`.trim()}>
      <div className="card-header">
        <Droplets className="card-icon" size={24} />
        <h3 className="font-semibold">Soil Moisture</h3>
      </div>
      <div className="card-content soil-moisture flex-1">
        <div className="moisture-beaker-container">
          <div className="moisture-beaker">
            {loading && (!displayMoisture || displayMoisture === 0) ? (
              <div className="moisture-loading-overlay">
                <p>Loading...</p>
              </div>
            ) : null}
            <div
              className="moisture-liquid"
              style={{
                height: `${Math.min(Math.max(displayMoisture || 0, 0), 100)}%`,
                backgroundColor: (displayMoisture || 0) > 0 ? "#3b82f6" : "transparent",
              }}
            >
              {!loading && (displayMoisture || 0) > 0 && (
                <span className="moisture-percentage-text">
                  {displayMoisture.toFixed(2)}%
            </span>
              )}
              {!loading && (displayMoisture || 0) === 0 && (
                <span className="moisture-percentage-text-empty">0.00%</span>
              )}
            </div>
          </div>
        </div>

        <div className="moisture-info-section">
          <p className="moisture-label">Soil Moisture Level</p>
        <div className="moisture-status">
          {error ? (
            <span className="text-red-500">{error}</span>
            ) : loading ? (
              <span className="text-gray-500">Loading...</span>
          ) : (
            <span className={statusColor}>{status}</span>
          )}
        </div>
        <div className="moisture-range">
          Range: {optimalRange[0]}–{optimalRange[1]}%
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoilMoistureCard;
