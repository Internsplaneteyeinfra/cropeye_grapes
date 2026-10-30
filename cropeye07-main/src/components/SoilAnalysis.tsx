import React, { useEffect, useState } from "react";
import { Download, Info, Satellite } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useFarmerProfile } from "../hooks/useFarmerProfile";
import { RefreshCw } from "lucide-react";

interface NutrientData {
  name: string;
  symbol: string;
  value: number | string | null;
  unit: string;
  optimalRange: string;
  level: "very-low" | "low" | "medium" | "optimal" | "very-high" | "unknown";
  percentage: number;
}

interface SoilAnalysisProps {
  plotName: string | null;
  phValue: number | null;
  phStatistics?: {
    phh2o_0_5cm_mean_mean: number;
  };
}

interface ApiSoilData {
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
  recommended_nitrogen?: number;
  recommended_phosphorus?: number;
  recommended_potassium?: number;
  fertilizer_nitrogen?: number;
  fertilizer_phosphorus?: number;
  fertilizer_potassium?: number;
  final_nitrogen?: number;
  final_phosphorus?: number;
  final_potassium?: number;
  area_acres?: number;
  ph?: number;
  pH?: number;
  cec?: number;
  cation_exchange_capacity?: number;
  organic_carbon?: number;
  soil_organic_carbon?: number;
  soil_density?: number;
  bulk_density?: number;
  ocd?: number;
  soc?: number;
  total_nitrogen?: number;
  organic_carbon_stock?: number;
  plot_name?: string;
  fe?: number;
  fe_ppm_estimated?: number;
  fe_index_primary?: number;
  fe_index_difference?: number;
  fe_index_normalized?: number;
  fe_image_date?: string;
  fe_polarizations?: number[];
  vv_backscatter_db?: number;
  vh_backscatter_db?: number;
  bdod_0_5cm_mean?: number;
  soc_0_5cm_mean?: number;
  nitrogen_0_5cm_mean?: number;
  cec_0_5cm_mean?: number;
  ocd_0_5cm_mean?: number;
  ocs_0_30cm_mean?: number;
  phh2o?: number;
  phh2o_0_5cm_mean?: number;
  // New fields for soil NPK
  soilN?: number;
  soilP?: number;
  soilK?: number;
}

const SoilAnalysis: React.FC<SoilAnalysisProps> = ({
  plotName,
  phValue,
  phStatistics,
}) => {
  const { appState, setAppState, setCached, selectedPlotName } = useAppContext();
  const { profile, loading: profileLoading } = useFarmerProfile();
  const soilData = appState.soilData || null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Use global selectedPlotName if available, otherwise fall back to prop
  const activePlotName = selectedPlotName || plotName;
  const [currentPlotName, setCurrentPlotName] = useState<string | null>(
    activePlotName
  );

  const getPlotDisplayName = (plotId: string | null) => {
    if (!plotId || !profile?.plots) return plotId;
    const plot = profile.plots.find((p) => p.fastapi_plot_id === plotId);
    if (plot) {
      return plot.gat_number || plot.plot_number || plot.fastapi_plot_id;
    }
    return plotId;
  };

  useEffect(() => {
    // Priority: global selectedPlotName > prop plotName > first plot from profile
    if (selectedPlotName) {
      setCurrentPlotName(selectedPlotName);
    } else if (plotName) {
      setCurrentPlotName(plotName);
    } else if (profile?.plots && profile.plots.length > 0) {
      const firstPlot = profile.plots[0];
      const firstPlotName =
        firstPlot.fastapi_plot_id ||
        `${firstPlot.gat_number}_${firstPlot.plot_number}`;
      setCurrentPlotName(firstPlotName);
    }
  }, [selectedPlotName, plotName, profile, profileLoading]);

  const plotDisplayName = getPlotDisplayName(currentPlotName);

  useEffect(() => {
    // Don't fetch if there's no plot name
    if (!currentPlotName || currentPlotName.trim() === "") {
      setAppState((prev: any) => ({
        ...prev,
        soilData: null,
      }));
      setLoading(false);
      return;
    }

    // Check cache
    const cacheKey = `soilData_${currentPlotName}`;
    // Comment out these lines to disable cache for testing
    // if (cached) {
    //   setAppState((prev: any) => ({
    //     ...prev,
    //     soilData: cached,
    //   }));
    //   setLoading(false);
    //   return;
    // }

    const fetchSoilData = async (retryCount = 0) => {
      if (!currentPlotName || currentPlotName.trim() === "") {
        setError("Plot name is required for soil analysis");
        setLoading(false);
        return;
      }

      if (retryCount > 3) {
        setError(
          "Failed to fetch soil data after multiple attempts. Please check your connection and try again later."
        );
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const currentDate = new Date().toISOString().split("T")[0];

        // First, fetch the NEW API with soil NPK data (with timeout protection)
        const soilNPKUrl = `https://main-cropeye.up.railway.app/required-n/${encodeURIComponent(
          currentPlotName
        )}?end_date=${currentDate}`;

        let soilNPKData = null;
        try {
          const npkController = new AbortController();
          const npkTimeoutId = setTimeout(() => npkController.abort(), 15000); // 15s timeout

          const soilNPKResponse = await fetch(soilNPKUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
            },
            signal: npkController.signal,
          });

          clearTimeout(npkTimeoutId);

          if (soilNPKResponse.ok) {
            soilNPKData = await soilNPKResponse.json();
          }
        } catch (soilNPKError: any) {
          // Ignore NPK timeout/network errors and proceed with main analysis API
        }

        // Then fetch the original NPK analysis API
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const apiUrl = `https://main-cropeye.up.railway.app/analyze-npk/${encodeURIComponent(
          currentPlotName
        )}?end_date=${currentDate}&days_back=7`;

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          mode: "cors",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `HTTP error! status: ${response.status} - ${errorText}`
          );
        }

        const data = await response.json();

        let soilDataToSet: ApiSoilData | null = null;

        if (data && data.npk_analysis) {
          const npkAnalysis = data.npk_analysis;
          const estimatedUptake = npkAnalysis.estimated_npk_uptake_perAcre;
          const recommendedDose = npkAnalysis.recommended_dose_perAcre;
          const fertilizerRequire = npkAnalysis.fertilizer_require_perAcre;
          const finalDisplayedDose = npkAnalysis.final_displayed_dose;

          soilDataToSet = {
            nitrogen: estimatedUptake?.N || 0,
            phosphorus: estimatedUptake?.P || 0,
            potassium: estimatedUptake?.K || 0,
            recommended_nitrogen: recommendedDose?.N || 0,
            recommended_phosphorus: recommendedDose?.P || 0,
            recommended_potassium: recommendedDose?.K || 0,
            fertilizer_nitrogen: fertilizerRequire?.N || 0,
            fertilizer_phosphorus: fertilizerRequire?.P || 0,
            fertilizer_potassium: fertilizerRequire?.K || 0,
            final_nitrogen: finalDisplayedDose?.N || 0,
            final_phosphorus: finalDisplayedDose?.P || 0,
            final_potassium: finalDisplayedDose?.K || 0,
            area_acres: npkAnalysis.area_acres || 0,
            ph: data.ph || data.pH || 0,
            cec: data.cec || data.cation_exchange_capacity || 0,
            organic_carbon: data.organic_carbon || data.soil_organic_carbon || 0,
            soil_density: data.soil_density || data.bulk_density || 0,
            total_nitrogen: data.total_nitrogen || 0,
            organic_carbon_stock: data.organic_carbon_stock || 0,
            plot_name: currentPlotName,
            fe: data.fe || data.fe_ppm_estimated || 0,
            fe_index_primary: data.fe_index_primary || 0,
            fe_index_difference: data.fe_index_difference || 0,
            fe_index_normalized: data.fe_index_normalized || 0,
            fe_image_date: data.fe_image_date || "",
            fe_polarizations: data.fe_polarizations || [],
            vv_backscatter_db: data.vv_backscatter_db || 0,
            vh_backscatter_db: data.vh_backscatter_db || 0,
          };
        }

        if (data && data.soil_statistics) {
          const soilStats = data.soil_statistics;
          const soilStatsData = {
            ph: soilStats.phh2o || 0,
            cec: soilStats.cation_exchange_capacity || 0,
            organic_carbon_stock: soilStats.organic_carbon_stock || 0,
            bulk_density: soilStats.bulk_density || 0,
            fe_ppm_estimated: soilStats.fe_ppm_estimated || 0,
            soil_organic_carbon: soilStats.soil_organic_carbon || 0,
            total_nitrogen: soilStats.total_nitrogen || 0,
            fe_index_primary: soilStats.fe_index_primary || 0,
            fe_index_difference: soilStats.fe_index_difference || 0,
            fe_index_normalized: soilStats.fe_index_normalized || 0,
            plot_name: currentPlotName,
          };

          soilDataToSet = {
            ...soilDataToSet,
            ...soilStatsData,
          };
        }

        if (!soilDataToSet) {
          soilDataToSet = {
            nitrogen: data?.nitrogen || 0,
            phosphorus: data?.phosphorus || 0,
            potassium: data?.potassium || 0,
            ph: data?.ph || data?.pH || 0,
            cec: data?.cec || data?.cation_exchange_capacity || 0,
            organic_carbon:
              data?.organic_carbon || data?.soil_organic_carbon || 0,
            soil_density: data?.soil_density || data?.bulk_density || 0,
            total_nitrogen: data?.total_nitrogen || 0,
            organic_carbon_stock: data?.organic_carbon_stock || 0,
            plot_name: currentPlotName,
            fe: data?.fe || data?.fe_ppm_estimated || 0,
            fe_index_primary: data?.fe_index_primary || 0,
            fe_index_difference: data?.fe_index_difference || 0,
            fe_index_normalized: data?.fe_index_normalized || 0,
            fe_image_date: data?.fe_image_date || "",
            fe_polarizations: data?.fe_polarizations || [],
            vv_backscatter_db: data?.vv_backscatter_db || 0,
            vh_backscatter_db: data?.vh_backscatter_db || 0,
          };
        }

        // 🔥 CRITICAL: Override nitrogen, phosphorus, potassium with soilN, soilP, soilK
        if (soilNPKData) {
          soilDataToSet = {
            ...soilDataToSet,
            // REPLACE old values with soilN, soilP, soilK from required-n endpoint
            nitrogen: soilNPKData.soilN || 0,
            phosphorus: soilNPKData.soilP || 0,
            potassium: soilNPKData.soilK || 0,
          };
        }

        if (soilDataToSet) {
          setAppState((prev: any) => ({
            ...prev,
            soilData: soilDataToSet,
          }));
          setCached(cacheKey, soilDataToSet);
        } else {
          throw new Error(
            "Unexpected API response structure. Could not find soil statistics."
          );
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          if (retryCount < 3) {
            setTimeout(() => fetchSoilData(retryCount + 1), 2000);
            return;
          } else {
            setError(
              "Request timed out after multiple attempts. The soil analysis service may be slow or unavailable."
            );
          }
        } else if (err.message.includes("Failed to fetch")) {
          if (retryCount < 3) {
            setTimeout(() => fetchSoilData(retryCount + 1), 2000);
            return;
          } else {
            setError(
              "Network error: Unable to connect to soil analysis service. Please check your internet connection."
            );
          }
        } else if (err.message.includes("HTTP error")) {
          setError(`Server error: ${err.message}`);
        } else {
          setError(`Failed to fetch soil data: ${err.message}`);
        }

        const fallbackData: ApiSoilData = {
          plot_name: currentPlotName,
          nitrogen: undefined,
          phosphorus: undefined,
          potassium: undefined,
          pH: undefined,
          cec: undefined,
          organic_carbon: undefined,
          soil_density: undefined,
          ocd: undefined,
          soc: undefined,
          bulk_density: undefined,
          soil_organic_carbon: undefined,
          total_nitrogen: undefined,
          cation_exchange_capacity: undefined,
          fe: undefined,
          organic_carbon_stock: undefined,
          phh2o: undefined,
          bdod_0_5cm_mean: undefined,
          soc_0_5cm_mean: undefined,
          nitrogen_0_5cm_mean: undefined,
          cec_0_5cm_mean: undefined,
          ocd_0_5cm_mean: undefined,
          ocs_0_30cm_mean: undefined,
          phh2o_0_5cm_mean: undefined,
        };

        setAppState((prev: any) => ({
          ...prev,
          soilData: fallbackData,
        }));

        if (err.message.includes("Failed to fetch") && retryCount < 2) {
          setTimeout(() => {
            fetchSoilData(retryCount + 1);
          }, 2000);
          return;
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSoilData();
  }, [currentPlotName]);

  function getPHLevel(
    pHValue: number | null
  ): "very-low" | "low" | "medium" | "optimal" | "very-high" | "unknown" {
    if (pHValue === null) return "unknown";
    if (pHValue < 5.0) return "very-low";
    if (pHValue < 6.0) return "low";
    if (pHValue < 6.2) return "medium";
    if (pHValue <= 7.5) return "optimal";
    return "very-high";
  }

  function calculatePHPercentage(pHValue: number | null): number {
    if (pHValue === null) return 0;
    const minPH = 4.0;
    const maxPH = 8.0;
    const optimalMin = 6.2;
    const optimalMax = 7.5;

    if (pHValue <= optimalMin) {
      return Math.max(0, ((pHValue - minPH) / (optimalMin - minPH)) * 50);
    } else if (pHValue >= optimalMax) {
      return Math.min(
        100,
        50 + ((pHValue - optimalMax) / (maxPH - optimalMax)) * 50
      );
    } else {
      return 50 + ((pHValue - optimalMin) / (optimalMax - optimalMin)) * 50;
    }
  }

  function getNitrogenLevel(
    value: number
  ): "very-low" | "low" | "medium" | "optimal" | "very-high" {
    if (value < 30) return "very-low";
    if (value < 50) return "low";
    if (value < 80) return "medium";
    if (value <= 150) return "optimal";
    return "very-high";
  }

  function getPhosphorusLevel(
    value: number | null
  ): "very-low" | "low" | "medium" | "optimal" | "very-high" | "unknown" {
    if (value === null) return "unknown";
    if (value < 15) return "very-low";
    if (value < 25) return "low";
    if (value < 40) return "medium";
    if (value <= 75) return "optimal";
    return "very-high";
  }

  function getPotassiumLevel(
    value: number | null
  ): "very-low" | "low" | "medium" | "optimal" | "very-high" | "unknown" {
    if (value === null) return "unknown";
    if (value < 10) return "very-low";
    if (value < 20) return "low";
    if (value < 50) return "medium";
    if (value <= 100) return "optimal";
    return "very-high";
  }

  function getCECLevel(
    value: number | null
  ): "very-low" | "low" | "medium" | "optimal" | "very-high" | "unknown" {
    if (value === null) return "unknown";
    if (value < 8) return "very-low";
    if (value < 15) return "low";
    if (value < 25) return "medium";
    if (value <= 40) return "optimal";
    return "very-high";
  }

  function getFeLevel(
    value: number | null
  ): "very-low" | "low" | "medium" | "optimal" | "very-high" | "unknown" {
    if (value === null) return "unknown";
    if (value < 2.0) return "very-low";
    if (value < 4.5) return "low";
    if (value < 6.0) return "medium";
    if (value <= 10.0) return "optimal";
    return "very-high";
  }

  function getOCLevel(
    value: number | null
  ): "very-low" | "low" | "medium" | "optimal" | "very-high" | "unknown" {
    if (value === null) return "unknown";
    if (value < 0.5) return "very-low";
    if (value < 1.0) return "low";
    if (value < 1.5) return "medium";
    if (value <= 3.5) return "optimal";
    return "very-high";
  }

  function getBulkDensityLevel(
    value: number | null
  ): "very-low" | "low" | "medium" | "optimal" | "very-high" | "unknown" {
    if (value === null) return "unknown";
    if (value < 0.2) return "very-low";
    if (value < 0.4) return "low";
    if (value < 0.5) return "medium";
    if (value <= 1.6) return "optimal";
    return "very-high";
  }

  function getOrganicCarbonStockLevel(
    value: number | null
  ): "very-low" | "low" | "medium" | "optimal" | "very-high" | "unknown" {
    if (value === null) return "unknown";
    if (value < 1) return "very-low";
    if (value < 2) return "low";
    if (value < 5) return "medium";
    if (value <= 15) return "optimal";
    return "very-high";
  }

  function calculatePercentage(
    value: number | null,
    minOptimal: number,
    maxOptimal: number,
    minRange: number,
    maxRange: number
  ): number {
    if (value === null) return 0;

    if (value <= minOptimal) {
      return Math.max(0, ((value - minRange) / (minOptimal - minRange)) * 50);
    } else if (value >= maxOptimal) {
      return Math.min(
        100,
        50 + ((value - maxOptimal) / (maxRange - maxOptimal)) * 50
      );
    } else {
      return 50 + ((value - minOptimal) / (maxOptimal - minOptimal)) * 50;
    }
  }

  const getSoilValue = (
    primary: number | undefined,
    fallback: number | undefined
  ): number | null => {
    if (primary !== undefined && primary !== null) return primary;
    if (fallback !== undefined && fallback !== null) return fallback;
    return null;
  };

  const currentPhValue =
    phValue !== null
      ? phValue
      : phStatistics?.phh2o_0_5cm_mean_mean
      ? phStatistics.phh2o_0_5cm_mean_mean
      : null;

  const metrics: NutrientData[] = [
    {
      name: "Nitrogen",
      symbol: "N",
      // PRIORITY: Use soilN from new API
      value:
        soilData?.soilN ??
        soilData?.nitrogen ??
        soilData?.total_nitrogen ??
        null,
      unit: "Kg/acre",
      optimalRange: "50 - 150",
      level: getNitrogenLevel(
        soilData?.soilN ?? soilData?.nitrogen ?? soilData?.total_nitrogen ?? 0
      ),
      percentage: calculatePercentage(
        soilData?.soilN ?? soilData?.nitrogen ?? soilData?.total_nitrogen,
        50,
        150,
        10,
        200
      ),
    },
    {
      name: "Phosphorus",
      symbol: "P",
      // PRIORITY: Use soilP from new API
      value: soilData?.soilP ?? soilData?.phosphorus ?? null,
      unit: "Kg/acre",
      optimalRange: "25 - 75",
      level: getPhosphorusLevel(soilData?.soilP ?? soilData?.phosphorus),
      percentage: calculatePercentage(
        soilData?.soilP ?? soilData?.phosphorus,
        25,
        75,
        5,
        100
      ),
    },
    {
      name: "Potassium",
      symbol: "K",
      // PRIORITY: Use soilK from new API
      value: soilData?.soilK ?? soilData?.potassium ?? null,
      unit: "Kg/acre",
      optimalRange: "20 - 100",
      level: getPotassiumLevel(soilData?.soilK ?? soilData?.potassium),
      percentage: calculatePercentage(
        soilData?.soilK ?? soilData?.potassium,
        20,
        100,
        5,
        150
      ),
    },
    {
      name: "Soil pH",
      symbol: "pH",
      value: getSoilValue(soilData?.ph, soilData?.phh2o) ?? currentPhValue,
      unit: "",
      optimalRange: "6.2 - 7.5",
      level: getPHLevel(
        getSoilValue(soilData?.ph, soilData?.phh2o) ?? currentPhValue
      ),
      percentage: calculatePHPercentage(
        getSoilValue(soilData?.ph, soilData?.phh2o) ?? currentPhValue
      ),
    },
    {
      name: "CEC",
      symbol: "CEC",
      value: getSoilValue(soilData?.cec, soilData?.cation_exchange_capacity),
      unit: "C mol/Kg",
      optimalRange: "15 - 40",
      level: getCECLevel(
        getSoilValue(soilData?.cec, soilData?.cation_exchange_capacity)
      ),
      percentage: calculatePercentage(
        getSoilValue(soilData?.cec, soilData?.cation_exchange_capacity),
        15,
        40,
        5,
        50
      ),
    },
    {
      name: "Organic Carbon",
      symbol: "OC",
      value: getSoilValue(
        soilData?.organic_carbon_stock,
        soilData?.ocs_0_30cm_mean
      ),
      unit: " T/acre",
      optimalRange: "2 - 15",
      level: getOrganicCarbonStockLevel(
        getSoilValue(soilData?.organic_carbon_stock, soilData?.ocs_0_30cm_mean)
      ),
      percentage: calculatePercentage(
        getSoilValue(soilData?.organic_carbon_stock, soilData?.ocs_0_30cm_mean),
        2,
        15,
        0.5,
        20
      ),
    },
    {
      name: "Bulk Density",
      symbol: "BD",
      value: getSoilValue(soilData?.bulk_density, soilData?.bdod_0_5cm_mean),
      unit: "Kg/m\u00B3",
      optimalRange: "0.50 - 1.60",
      level: getBulkDensityLevel(
        getSoilValue(soilData?.bulk_density, soilData?.bdod_0_5cm_mean)
      ),
      percentage: calculatePercentage(
        getSoilValue(soilData?.bulk_density, soilData?.bdod_0_5cm_mean),
        0.5,
        1.6,
        0.0,
        2.0
      ),
    },
    {
      name: "Fe",
      symbol: "Fe",
      value: getSoilValue(soilData?.fe_ppm_estimated, soilData?.fe),
      unit: "ppm",
      optimalRange: "4.5 - 10",
      level: getFeLevel(
        getSoilValue(soilData?.fe_ppm_estimated, soilData?.fe)
      ),
      percentage: calculatePercentage(
        getSoilValue(soilData?.fe_ppm_estimated, soilData?.fe),
        4.5,
        10,
        2.0,
        15.0
      ),
    },
    {
      name: "Soil Organic Carbon",
      symbol: "SOC",
      value: getSoilValue(
        soilData?.soil_organic_carbon,
        soilData?.soc_0_5cm_mean
      ),
      unit: "%",
      optimalRange: "1.5 - 3.5",
      level: getOCLevel(
        getSoilValue(soilData?.soil_organic_carbon, soilData?.soc_0_5cm_mean)
      ),
      percentage: calculatePercentage(
        getSoilValue(soilData?.soil_organic_carbon, soilData?.soc_0_5cm_mean),
        1.5,
        3.5,
        0.5,
        4.0
      ),
    },
  ];

  const getLevelColor = (level: string): string => {
    switch (level) {
      case "very-low":
        return "bg-red-500";
      case "low":
        return "bg-orange-400";
      case "medium":
        return "bg-yellow-400";
      case "optimal":
        return "bg-green-500";
      case "very-high":
        return "bg-green-700";
      default:
        return "bg-gray-400";
    }
  };

  const getLevelBorderColor = (level: string): string => {
    switch (level) {
      case "very-low":
        return "border-red-200";
      case "low":
        return "border-orange-200";
      case "medium":
        return "border-yellow-200";
      case "optimal":
        return "border-green-200";
      case "very-high":
        return "border-green-300";
      default:
        return "border-gray-200";
    }
  };

  return (
    <div className="w-full max-w-full sm:max-w-sm md:max-w-md p-0 sm:p-2 md:p-4 mt-12">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* <Info className="w-4 h-4 text-blue-500" /> */}
            <span className="text-gray-600 font-semibold">
              Soil Analysis Report
            </span>
            {plotDisplayName && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                Plot: {plotDisplayName}
              </span>
            )}
          </div>
          <button className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs">
            <Download className="w-3 h-3" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-4 text-gray-500 flex items-center justify-center">
          Loading soil data...
        </div>
      )}

      {error && <div className="text-center py-4 text-red-500">{error}</div>}

      {profileLoading && (
        <div className="text-center py-8 text-gray-500">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" />
          <p>Loading farmer profile...</p>
        </div>
      )}

      {!profileLoading && !currentPlotName && !loading && !error && (
        <div className="text-center py-8 text-gray-500">
          <Info className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p>No plot data available for soil analysis</p>
        </div>
      )}

      {currentPlotName && loading && (
        <div className="text-center py-8 text-gray-500">
          <Satellite className="w-8 h-8 mx-auto mb-2 text-gray-400 animate-spin" />
          <p>Loading soil analysis data for your plot...</p>
          <p className="text-xs mt-2 text-gray-400">
            This may take up to 30 seconds. Please wait...
          </p>
        </div>
      )}

      {currentPlotName && !loading && !error && (
        <>
          <div className="flex gap-2">
            <div className="flex flex-col justify-between text-xs text-gray-600 h-40 py-1">
              <span>Very High</span>
              <span>Optimal</span>
              <span>Medium</span>
              <span>Low</span>
              <span>Very Low</span>
            </div>
            <div className="flex-1 overflow-x-auto">
              <div className="flex items-end justify-between gap-2 h-40">
                {metrics.map((metric, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col items-center justify-end h-full w-20 border ${getLevelBorderColor(
                      metric.level
                    )} rounded`}
                  >
                    <div
                      className={`w-full ${getLevelColor(
                        metric.level
                      )} rounded-t`}
                      style={{
                        height: `${metric.percentage}%`,
                      }}
                    ></div>
                    <div className="text-center text-xs mt-1">
                      <strong>{metric.symbol}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1 mt-6 flex-wrap">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-500 rounded-sm mr-1"></div>
              <span className="text-xs text-gray-600 mr-4">Very Low</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-orange-400 rounded-sm mr-1"></div>
              <span className="text-xs text-gray-600 mr-4">Low</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-yellow-400 rounded-sm mr-1"></div>
              <span className="text-xs text-gray-600 mr-4">Medium</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-500 rounded-sm mr-1"></div>
              <span className="text-xs text-gray-600 mr-4">Optimal</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-700 rounded-sm mr-1"></div>
              <span className="text-xs text-gray-600">Very High</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 mt-6">
            {metrics.map((metric, index) => (
              <div
                key={index}
                className={`border ${getLevelBorderColor(
                  metric.level
                )} rounded p-2 sm:p-3 text-center shadow-sm`}
              >
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                  <div
                    className={`${getLevelColor(metric.level)} h-full`}
                    style={{
                      width: `${metric.percentage}%`,
                    }}
                  ></div>
                </div>
                <h3 className="text-sm font-semibold text-gray-800">
                  {metric.name}
                </h3>
                <p className="text-xs text-gray-500">({metric.symbol})</p>
                <div className="mt-1">
                  {metric.value === null ? (
                    <p className="text-lg font-bold text-gray-900">N/A</p>
                  ) : (
                    <div className="flex flex-col items-center leading-tight">
                      <span className="text-lg font-bold text-gray-900">
                        {typeof metric.value === "number"
                          ? metric.value.toFixed(2)
                          : metric.value}
                      </span>
                      {metric.unit && (
                        <span className="text-xs font-medium text-gray-500">
                          {metric.unit}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 bg-gray-100 rounded mt-1 px-2 py-1">
                  Range: {metric.optimalRange}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default SoilAnalysis;
