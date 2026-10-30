import React, { useEffect, useState } from "react";
import { Waves } from "lucide-react";
import "../Irrigation.css";
import { useAppContext } from "../../../context/AppContext";
import { useFarmerProfile } from "../../../hooks/useFarmerProfile";
import { toBackendPlotName } from "../../../utils/plotName";

interface HourlyETRecord {
  time: string;
  et0_fao_evapotranspiration: number;
}

interface ETResponse {
  plot_name: string;
  start_date: string;
  end_date: string;
  area_hectares: number;
  ET_mean_mm_per_day: number;
  hourly_records_et?: HourlyETRecord[];
}

const EvapotranspirationCard: React.FC = () => {
  const { appState, setAppState, getCached, setCached, selectedPlotName } = useAppContext();
  const { profile, loading: profileLoading } = useFarmerProfile();

  const [plotName, setPlotName] = useState<string>("");
  const etValue: number | null =
    typeof appState?.etValue === "number" && Number.isFinite(appState.etValue) ? appState.etValue : null;
  const trendData = Array.isArray(appState?.etTrendData) ? appState.etTrendData : [];
  const [hourlyData, setHourlyData] = useState<Array<{time: string, value: number}>>([]);
  const [loading, setLoading] = useState<boolean>(etValue == null);
  const [error, setError] = useState<string | null>(null);

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
        console.log('EvapotranspirationCard: Setting plot name to:', plotToUse);
      }
    }
  }, [profile, profileLoading, selectedPlotName]);

  // Fetch ET data when plot name is available
  useEffect(() => {
    if (!plotName) return;

    const cacheKey = `etData_${plotName}`;
    const cached = getCached(cacheKey);

    if (cached && cached.etValue && cached.trendData) {
      setAppState((prev: any) => ({
        ...prev,
        etValue: cached.etValue,
        etTrendData: cached.trendData,
      }));
      // Restore hourly data with time if available
      if (cached.hourlyData && Array.isArray(cached.hourlyData)) {
        setHourlyData(cached.hourlyData);
      }
      setLoading(false);
      return;
    }

    fetchETData();
  }, [plotName]);

  const fetchETData = async () => {
    if (!plotName) {
      setError("No plot selected");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use POST request - API: https://cropeye-grapes-sef-production.up.railway.app/docs#/default/compute_et_for_plot_plots__plot_name__compute_et__post
      // Response URL: https://cropeye-grapes-sef-production.up.railway.app/plots/14D_14/compute-et/
      const baseUrl = 'https://cropeye-grapes-sef-production.up.railway.app';
      const url = `${baseUrl}/plots/${encodeURIComponent(toBackendPlotName(plotName))}/compute-et/`;

      console.log(`💧 EvapotranspirationCard: Fetching ET data from: ${url}`);

      // Create AbortController with 5 minute timeout to prevent session timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

      try {
      const response = await fetch(url, {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        credentials: "omit",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
          signal: controller.signal,
          // Empty body as per API specification
      });

        clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        throw new Error(`HTTP ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: ETResponse = await response.json();

      // Extract ET value from ET_mean_mm_per_day (primary field from API response)
      const etRaw = Number(data.ET_mean_mm_per_day);
      if (!Number.isFinite(etRaw)) {
        throw new Error('ET API returned no ET_mean_mm_per_day for this plot');
      }
      const etValueExtracted = etRaw;

      // Only real hourly records — no padding or generated values.
      const hourlyDataWithTime: Array<{ time: string; value: number }> = (
        Array.isArray(data.hourly_records_et) ? data.hourly_records_et : []
      )
        .map((record: HourlyETRecord) => ({
          time: record.time || '',
          value: Number(record.et0_fao_evapotranspiration),
        }))
        .filter((r) => Number.isFinite(r.value))
        .slice(0, 24);
      const trendDataExtracted = hourlyDataWithTime.map((item) => item.value);

      // Store hourly data with time for tooltips
      setHourlyData(hourlyDataWithTime);


      // Update AppContext
      setAppState((prev: any) => ({
        ...prev,
        etValue: etValueExtracted,
        etTrendData: trendDataExtracted,
      }));

      // Cache the data
      const cacheKey = `etData_${plotName}`;
      setCached(cacheKey, {
        etValue: etValueExtracted,
        trendData: trendDataExtracted,
        hourlyData: hourlyDataWithTime, // Store hourly data with time
      });

    } catch (err: any) {
        clearTimeout(timeoutId);

        // Handle timeout errors gracefully
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
          console.warn('⚠️ Evapotranspiration request timed out after 5 minutes');
          setError('Request timed out. The server is taking longer than expected to respond.');
        } else {
          // Handle network/CORS errors
          if (err.message?.includes('Failed to fetch') || err.message?.includes('CORS') || err.message?.includes('NetworkError')) {
            console.error('❌ EvapotranspirationCard: Network/CORS error:', err);
            setError('Network error: Unable to connect to the server. Please check your connection.');
          } else {
      const errorMessage = err.message || 'Unknown error';
      setError(`Failed to fetch ET data: ${errorMessage}`);

      // Log detailed error for debugging
      console.error('ET API fetch error:', {
        error: err,
        message: err?.message,
        name: err?.name,
              url: `https://cropeye-grapes-sef-production.up.railway.app/plots/${plotName}/compute-et/`,
        plotName: plotName
      });
          }
        }

        setAppState((prev: any) => ({
          ...prev,
          etValue: null,
          etTrendData: [],
        }));
      }
    } catch (outerErr: any) {
      // Handle any errors from the outer try block
      console.error('Outer error in fetchETData:', outerErr);
      setError('Failed to fetch ET data');
      setAppState((prev: any) => ({
        ...prev,
        etValue: null,
        etTrendData: [],
      }));
    } finally {
      setLoading(false);
    }
  };

  const maxTrendValue =
    Array.isArray(trendData) && trendData.length > 0
      ? Math.max(...trendData.map((v: any) => Number(v) || 0))
      : 1;

  return (
    <div className="irrigation-card">
      <div className="card-header">
        <Waves className="card-icon" size={20} />
        <h3>Evapotranspiration</h3>
      </div>

      <div className="card-content evapotranspiration">
        <div className="evap-icon">
          <Waves size={40} color="#4287f5" />
        </div>

        <div className="metric-value">
          {loading ? (
            <div className="loading-spinner-small"></div>
          ) : (
            <>
              <span className="value">{etValue != null ? etValue.toFixed(2) : "—"}</span>
              <span className="unit">mm</span>
            </>
          )}
        </div>

        {error && <div className="error-message-small">{error}</div>}

        <div className="evap-trend">
          <div className="trend-label">24h Trend</div>
          <div className="trend-chart">
            {Array.isArray(trendData) && trendData.length > 0 ? (
              trendData.map((val: number, i: number) => {
                const numVal = Number(val) || 0;
                // Get time from hourlyData if available, otherwise use index
                const timeData = hourlyData[i] || null;
                const displayTime = timeData?.time
                  ? new Date(timeData.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                  : `${i.toString().padStart(2, '0')}:00`;

                return (
                  <div
                    key={i}
                    className="trend-bar"
                    title={`${displayTime} - ${numVal.toFixed(2)} mm`}
                    style={{
                      height: `${(numVal / maxTrendValue) * 100}%`,
                      minHeight: "2px",
                    }}
                  />
                );
              })
            ) : (
              <div style={{ width: "100%", textAlign: "center", color: "#999" }}>
                No trend data available
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize: "12px", color: "#999", marginTop: "8px" }}>
        </div>
      </div>
    </div>
  );
};

export default EvapotranspirationCard;
