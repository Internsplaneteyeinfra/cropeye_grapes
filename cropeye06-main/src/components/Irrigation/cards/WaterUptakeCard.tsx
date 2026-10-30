import React, { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import "../Irrigation.css";
import { useAppContext } from "../../../context/AppContext";
import { useFarmerProfile } from "../../../hooks/useFarmerProfile";
import { toBackendPlotName } from "../../../utils/plotName";
import {
  collectPlotApiIds,
  findPlotInFarmerProfile,
  getPlotAreaAcresFromProfile,
} from "../../../utils/grapesEventsBundle";

const WaterUptakeCard: React.FC = () => {
  const { appState, getCached, setCached } = useAppContext();

  const irrigationSchedule = appState.irrigationScheduleData || [];
  const todayData = irrigationSchedule.find((day: any) => day.isToday);
  const waterReqLiters = Number(
    todayData?.waterRequired ??
      (todayData?.irrigationNeedKl != null ? Number(todayData.irrigationNeedKl) * 1000 : 0),
  ) || 0;
  const { profile, loading: profileLoading } = useFarmerProfile();
  const storedPlot = typeof window !== 'undefined' ? localStorage.getItem('selectedPlot') : null;
  const plotName = (appState.plotName && appState.plotName.trim())
    || (storedPlot && storedPlot.trim())
    || (profile?.plots?.[0]?.fastapi_plot_id || "");

  const currentPlot = plotName ? findPlotInFarmerProfile(profile, plotName) : null;
  const currentFarm = currentPlot?.farms?.[0];
  const spacingA = Number(currentFarm?.spacing_a);
  const spacingB = Number(currentFarm?.spacing_b);
  const plantsInField = Number(currentFarm?.plants_in_field);
  const areaAcres = plotName ? getPlotAreaAcresFromProfile(profile, plotName) : null;

  // waterRequired is litres per acre; spacing is in feet (43,560 sq ft per acre).
  const plantsPerAcre =
    spacingA > 0 && spacingB > 0
      ? 43560 / (spacingA * spacingB)
      : plantsInField > 0 && areaAcres
        ? plantsInField / areaAcres
        : null;

  const waterPerPlantPerHour =
    todayData && plantsPerAcre ? waterReqLiters / plantsPerAcre / 24 : null;
  const missingReason = !todayData
    ? "Today's water requirement is not available yet."
    : !plantsPerAcre
      ? "Add row and plant spacing for this farm to calculate per-plant uptake."
      : null;

  const [efficiency, setEfficiency] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEfficiency = async () => {
      if (!plotName) {
        setLoading(false);
        return;
      }

      try {
        // Check cache first (prefetch + Map store waterUptakeData_${plotName})
        const cacheKey = `waterUptakeData_${plotName}`;
        const cached = getCached(cacheKey, 10 * 60 * 1000); // 10 min TTL
        if (cached?.pixel_summary) {
          const adequate = cached.pixel_summary?.adequat_pixel_percentage ?? 0;
          const excellent = cached.pixel_summary?.excellent_pixel_percentage ?? 0;
          setEfficiency(Math.round(adequate + excellent));
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);

        const currentEndDate = new Date().toISOString().split('T')[0];
        const baseUrl = 'https://admin-cropeye.up.railway.app';
        const candidates = [
          ...new Set(collectPlotApiIds(profile, plotName).map(toBackendPlotName).filter(Boolean)),
        ];

        let data: any = null;
        let lastStatus: number | null = null;
        for (const id of candidates) {
          const url = `${baseUrl}/wateruptake?plot_name=${encodeURIComponent(id)}&end_date=${currentEndDate}&days_back=7`;
          const response = await fetch(url, {
            method: "POST",
            mode: "cors",
            cache: "no-cache",
            credentials: "omit",
            headers: { "Accept": "application/json" },
          });
          if (response.ok) {
            data = await response.json();
            break;
          }
          lastStatus = response.status;
        }

        if (!data) {
          throw new Error(
            lastStatus === 404
              ? `No satellite water-uptake data for plot ${toBackendPlotName(plotName)}`
              : `Water-uptake service error${lastStatus ? ` (${lastStatus})` : ""}`,
          );
        }
        setCached(cacheKey, data); // Cache for Map and future visits

        const pixelSummary = data.pixel_summary;

        if (!pixelSummary) {
          console.warn('WaterUptakeCard: No pixel_summary in API response', data);
          setEfficiency(null);
          setLoading(false);
          return;
        }

        // Use the correct field names: adequat_pixel_percentage and excellent_pixel_percentage
        const adequate = pixelSummary?.adequat_pixel_percentage ?? 0;
        const excellent = pixelSummary?.excellent_pixel_percentage ?? 0;

        // Calculate total efficiency by adding adequate and excellent percentages
        const totalEfficiency = Math.round(adequate + excellent);

        console.log('WaterUptakeCard: Efficiency calculation', {
          adequate,
          excellent,
          totalEfficiency,
          pixelSummary
        });

        setEfficiency(totalEfficiency);
        setError(null);
        setLoading(false);
      } catch (err: any) {
        console.error('WaterUptakeCard: Error fetching efficiency data', {
          error: err,
          message: err?.message,
          plotName
        });
        setError(err?.message || "Failed to fetch efficiency data");
        setEfficiency(null);
        setLoading(false);
      }
    };

    fetchEfficiency();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotName, profile]);

  // Circle visuals
  const minRadius = 70;
  const maxRadius = 100;
  const maxValue = 100; // Efficiency percentage scale (0-100%)
  const efficiencyValue = efficiency ?? 0;
  const radius = Math.min(
    maxRadius,
    minRadius + (efficiencyValue / maxValue) * (maxRadius - minRadius)
  );
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - efficiencyValue / maxValue);

  // If still no plot name and profile is loading, show loading
  if (!plotName && profileLoading) {
    return (
      <div className="irrigation-card">
        <div className="card-header">
          <Activity className="card-icon" size={28} />
          <h3 className="font-semibold">Plant Water Uptake</h3>
        </div>
        <div className="card-content card-content-water">
          <div className="text-gray-600 font-semibold">Loading farmer plots...</div>
        </div>
      </div>
    );
  }

  // If no plot name even after profile loaded, then show message
  if (!plotName) {
    return (
      <div className="irrigation-card">
        <div className="card-header">
          <Activity className="card-icon" size={28} />
          <h3 className="font-semibold">Plant Water Uptake</h3>
        </div>
        <div className="card-content card-content-water">
          <div className="text-red-600 font-semibold">WaterUptakeCard: No plot name available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="irrigation-card">
      <div className="card-header">
        <Activity className="card-icon" size={28} />
        <h3 className="font-semibold">Plant Water Uptake</h3>
      </div>

      <div className="card-content card-content-water">
        <div className="ring-wrapper">
          <svg
            className="progress-ring"
            width={radius * 2 + 20}
            height={radius * 2 + 20}
          >
            <circle
              className="progress-ring-circle-bg"
              stroke="#e2e8f0"
              strokeWidth="17"
              fill="transparent"
              r={radius}
              cx={(radius * 2 + 20) / 2}
              cy={(radius * 2 + 20) / 2}
            />
            <circle
              className="progress-ring-circle"
              stroke="#3b82f6"
              strokeWidth="17"
              strokeLinecap="round"
              fill="transparent"
              r={radius}
              cx={(radius * 2 + 20) / 2}
              cy={(radius * 2 + 20) / 2}
              style={{
                strokeDasharray: `${circumference} ${circumference}`,
                strokeDashoffset,
                transform: "rotate(-90deg)",
                transformOrigin: "center",
              }}
            />
            <text
              x="50%"
              y="47%"
              textAnchor="middle"
              className="progress-text value"
            >
              {loading ? "..." : waterPerPlantPerHour != null ? waterPerPlantPerHour.toFixed(2) : "—"}
            </text>
            <text
              x="50%"
              y="60%"
              textAnchor="middle"
              className="progress-text unit"
            >
              L/h
            </text>
          </svg>
        </div>

        {/* Efficiency Section */}
        <div className="uptake-efficiency" style={{ color: "#16a34a", paddingBottom: "10px" }}>
          Efficiency: {loading ? "..." : efficiency !== null ? `${efficiency}%` : "--"}
        </div>

        <div className="uptake-average">
          {/* Average: {average} L/Day */}
        </div>

        {!loading && missingReason && (
          <div className="text-xs text-gray-500 text-center px-3">{missingReason}</div>
        )}
        {!loading && efficiency === 0 && (
          <div className="text-xs text-amber-700 text-center px-3 mt-1">
            Satellite shows no plot area with adequate water uptake this week — the crop is under water stress.
          </div>
        )}
        {error && <div className="text-red-500 mt-1">{error}</div>}
      </div>
    </div>
  );
};

export default WaterUptakeCard;
