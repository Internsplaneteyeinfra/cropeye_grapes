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
  // New fields for soil NPK from required-n API
  soilN?: number;
  soilP?: number;
  soilK?: number;
  plantanalysis_n?: number;
  plantanalysis_p?: number;
  plantanalysis_k?: number;
  required_n_per_acre?: number;
  crop?: string;
  plantation_date?: string;
  days_since_plantation?: number;
  soil_analysis_value?: number;
  max_yield?: number;
  gndvi?: number;
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
        const BASE_URL = "https://cropeye-grapes-main-production.up.railway.app";

        // Get plantation_date from profile
        let plantationDate = "2025-01-01"; // Default fallback
        let crop = "sugarcane"; // Default fallback
        if (profile?.plots && profile.plots.length > 0) {
          const selectedPlot = profile.plots.find(
            (p) =>
              p.fastapi_plot_id === currentPlotName ||
              `${p.gat_number}_${p.plot_number}` === currentPlotName
          ) || profile.plots[0];

          if (selectedPlot?.farms && selectedPlot.farms.length > 0) {
            const firstFarm = selectedPlot.farms[0];
            if (firstFarm.plantation_date) {
              plantationDate = firstFarm.plantation_date.split("T")[0]; // Extract date part if ISO format
            }
            if (firstFarm.crop_type?.crop_type) {
              crop = firstFarm.crop_type.crop_type.toLowerCase();
            }
          }
        }

        // First, fetch the required-n API endpoint (note: hyphen, not underscore)
        const requiredNUrl = `${BASE_URL}/required-n/${encodeURIComponent(currentPlotName)}?end_date=${currentDate}`;

        let soilNPKData = null;
        try {
          const npkController = new AbortController();
          const npkTimeoutId = setTimeout(() => npkController.abort(), 30000); // 30s timeout

          console.log(`🌱 SoilAnalysis: Fetching required-n data from: ${requiredNUrl}`);

          const soilNPKResponse = await fetch(requiredNUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            mode: "cors",
            signal: npkController.signal,
            body: JSON.stringify({
              plot_id: currentPlotName,
              end_date: currentDate,
              crop_type: crop
            }),
          });

          clearTimeout(npkTimeoutId);

          if (soilNPKResponse.ok) {
            soilNPKData = await soilNPKResponse.json();
            console.log(`✅ SoilAnalysis: Required-n data received:`, soilNPKData);
          } else {
            const errorText = await soilNPKResponse.text();
            console.warn(`⚠️ SoilAnalysis: Required-n API error (${soilNPKResponse.status}):`, errorText);
          }
        } catch (soilNPKError: any) {
          console.warn("⚠️ SoilAnalysis: Error fetching required-n data:", soilNPKError);
          // Continue with analyze-npk API even if required-n fails
        }

        // Then fetch the analyze-npk API endpoint (note: hyphen, not underscore)
        const feDaysBack = 30; // Default value
        const analyzeNPKUrl = `${BASE_URL}/analyze-npk/${encodeURIComponent(currentPlotName)}?plantation_date=${plantationDate}&date=${currentDate}&fe_days_back=${feDaysBack}`;

        let data = null;
        try {
        const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

          console.log(`🌱 SoilAnalysis: Fetching analyze-npk data from: ${analyzeNPKUrl}`);
          console.log(`📅 Using plantation_date: ${plantationDate}, date: ${currentDate}, fe_days_back: ${feDaysBack}`);

          const response = await fetch(analyzeNPKUrl, {
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
            console.error(`❌ SoilAnalysis: Analyze-npk API error (${response.status}):`, errorText);
          throw new Error(
            `HTTP error! status: ${response.status} - ${errorText}`
          );
        }

          data = await response.json();
          console.log(`✅ SoilAnalysis: Analyze NPK data received:`, data);
        } catch (analyzeError: any) {
          console.error("❌ SoilAnalysis: Error fetching analyze-npk data:", analyzeError);
          // If analyze-npk fails, try to use data from required_n if available
          if (soilNPKData) {
            console.log("⚠️ SoilAnalysis: Using required_n data as fallback");
            data = soilNPKData;
          } else {
            throw analyzeError;
          }
        }

        let soilDataToSet: ApiSoilData | null = null;

        // Process data from analyze-npk API
        if (data) {
          // Extract NPK analysis data
          const npkAnalysis = data.npk_analysis || {};
          const estimatedUptake = npkAnalysis.estimated_npk_uptake_perAcre || {};
          const recommendedDose = npkAnalysis.recommended_dose_perAcre || {};
          const fertilizerRequire = npkAnalysis.fertilizer_require_perAcre || {};
          const finalDisplayedDose = npkAnalysis.final_displayed_dose || {};

          // Extract soil_statistics data
          const soilStats: any = data.soil_statistics || {};

          // Normalize hyphenated soil grid keys into underscore versions (if present)
          // e.g. `bdod_0-5cm_mean` / `soc_0-5cm_mean` from some soil datasets
          const normalizedExtra: Partial<ApiSoilData> = {
            bdod_0_5cm_mean:
              (data as any)?.bdod_0_5cm_mean ??
              (data as any)?.["bdod_0-5cm_mean"] ??
              soilStats?.bdod_0_5cm_mean ??
              soilStats?.["bdod_0-5cm_mean"],
            soc_0_5cm_mean:
              (data as any)?.soc_0_5cm_mean ??
              (data as any)?.["soc_0-5cm_mean"] ??
              soilStats?.soc_0_5cm_mean ??
              soilStats?.["soc_0-5cm_mean"],
          };

          // Build soilDataToSet with proper field mapping
          soilDataToSet = {
            // Nitrogen: Use estimated uptake N, or total_nitrogen from soil_statistics
            nitrogen: estimatedUptake?.N || soilStats.total_nitrogen || 0,
            // Phosphorus: Use from soil_statistics (primary source), or estimated uptake P
            phosphorus: soilStats.phosphorus || estimatedUptake?.P || 0,
            // Potassium: Use from soil_statistics (primary source), or estimated uptake K
            potassium: soilStats.potassium || estimatedUptake?.K || 0,
            // Recommended doses
            recommended_nitrogen: recommendedDose?.N || 0,
            recommended_phosphorus: recommendedDose?.P || 0,
            recommended_potassium: recommendedDose?.K || 0,
            // Fertilizer requirements
            fertilizer_nitrogen: fertilizerRequire?.N || 0,
            fertilizer_phosphorus: fertilizerRequire?.P || 0,
            fertilizer_potassium: fertilizerRequire?.K || 0,
            // Final displayed doses
            final_nitrogen: finalDisplayedDose?.N || 0,
            final_phosphorus: finalDisplayedDose?.P || 0,
            final_potassium: finalDisplayedDose?.K || 0,
            // Area
            area_acres: npkAnalysis.area_acres || data.area_acres || 0,
            // pH from soil_statistics
            ph: soilStats.phh2o || data.ph || data.pH || 0,
            // CEC from soil_statistics
            cec: soilStats.cation_exchange_capacity || data.cec || 0,
            // Organic carbon from soil_statistics
            organic_carbon: soilStats.soil_organic_carbon || data.organic_carbon || 0,
            // Bulk density from soil_statistics
            soil_density: soilStats.bulk_density || data.soil_density || data.bulk_density || 0,
            // IMPORTANT: Cards use these exact keys
            bulk_density: soilStats.bulk_density || data.bulk_density || data.soil_density || 0,
            soil_organic_carbon:
              soilStats.soil_organic_carbon ||
              data.soil_organic_carbon ||
              data.organic_carbon ||
              0,
            // Total nitrogen from soil_statistics
            total_nitrogen: soilStats.total_nitrogen || data.total_nitrogen || 0,
            // Organic carbon stock from soil_statistics
            organic_carbon_stock: soilStats.organic_carbon_stock || data.organic_carbon_stock || 0,
            plot_name: currentPlotName || data.plot_name,
            // Fe (Iron) data from soil_statistics
            fe: soilStats.fe_ppm_estimated || data.fe || data.fe_ppm_estimated || 0,
            fe_index_primary: soilStats.fe_index_primary || data.fe_index_primary || 0,
            fe_index_difference: soilStats.fe_index_difference || data.fe_index_difference || 0,
            fe_index_normalized: soilStats.fe_index_normalized || data.fe_index_normalized || 0,
            fe_image_date: soilStats.fe_image_date || data.fe_image_date || "",
            fe_polarizations: soilStats.fe_polarizations || data.fe_polarizations || [],
            vv_backscatter_db: soilStats.vv_backscatter_db || data.vv_backscatter_db || 0,
            vh_backscatter_db: soilStats.vh_backscatter_db || data.vh_backscatter_db || 0,
          };

          soilDataToSet = { ...soilDataToSet, ...normalizedExtra };
        }

        // 🔥 CRITICAL: Merge data from required-n API (this takes priority for soil NPK values)
        if (soilNPKData && soilDataToSet) {
          // Extract values from required-n API response
          const soilN = soilNPKData.soilN;
          const soilP = soilNPKData.soilP;
          const soilK = soilNPKData.soilK;
          const plantAnalysisN = soilNPKData.plantanalysis_n;
          const plantAnalysisP = soilNPKData.plantanalysis_p;
          const plantAnalysisK = soilNPKData.plantanalysis_k;
          const requiredNPerAcre = soilNPKData.required_n_per_acre;

          soilDataToSet = {
            ...soilDataToSet,
            // Store soilN, soilP, soilK for display (these take priority in the UI)
            soilN: soilN !== undefined && soilN !== null ? soilN : soilDataToSet.nitrogen,
            soilP: soilP !== undefined && soilP !== null ? soilP : soilDataToSet.phosphorus,
            soilK: soilK !== undefined && soilK !== null ? soilK : soilDataToSet.potassium,
            // Also update nitrogen, phosphorus, potassium if soilN/P/K are available
            nitrogen: soilN !== undefined && soilN !== null ? soilN : soilDataToSet.nitrogen,
            phosphorus: soilP !== undefined && soilP !== null ? soilP : soilDataToSet.phosphorus,
            potassium: soilK !== undefined && soilK !== null ? soilK : soilDataToSet.potassium,
            // Store plant analysis values (these are fertilizer requirements)
            plantanalysis_n: plantAnalysisN !== undefined && plantAnalysisN !== null ? plantAnalysisN : soilDataToSet.fertilizer_nitrogen,
            plantanalysis_p: plantAnalysisP !== undefined && plantAnalysisP !== null ? plantAnalysisP : soilDataToSet.fertilizer_phosphorus,
            plantanalysis_k: plantAnalysisK !== undefined && plantAnalysisK !== null ? plantAnalysisK : soilDataToSet.fertilizer_potassium,
            // Update fertilizer requirements with plant analysis values if available
            fertilizer_nitrogen: plantAnalysisN !== undefined && plantAnalysisN !== null ? plantAnalysisN : soilDataToSet.fertilizer_nitrogen,
            fertilizer_phosphorus: plantAnalysisP !== undefined && plantAnalysisP !== null ? plantAnalysisP : soilDataToSet.fertilizer_phosphorus,
            fertilizer_potassium: plantAnalysisK !== undefined && plantAnalysisK !== null ? plantAnalysisK : soilDataToSet.fertilizer_potassium,
            // Store required_n_per_acre
            required_n_per_acre: requiredNPerAcre !== undefined && requiredNPerAcre !== null ? requiredNPerAcre : soilDataToSet.recommended_nitrogen,
            // Merge other fields from required-n API (only if not already set)
            ...(soilNPKData.area_acres && !soilDataToSet.area_acres && { area_acres: soilNPKData.area_acres }),
            ...(soilNPKData.crop && { crop: soilNPKData.crop }),
            ...(soilNPKData.plantation_date && { plantation_date: soilNPKData.plantation_date }),
            ...(soilNPKData.days_since_plantation !== undefined && { days_since_plantation: soilNPKData.days_since_plantation }),
            ...(soilNPKData.soil_analysis_value !== undefined && { soil_analysis_value: soilNPKData.soil_analysis_value }),
            ...(soilNPKData.max_yield !== undefined && { max_yield: soilNPKData.max_yield }),
            ...(soilNPKData.gndvi !== undefined && { gndvi: soilNPKData.gndvi }),
          };
        }

        // Ensure we have at least a basic structure
        if (!soilDataToSet) {
          soilDataToSet = {
            nitrogen: 0,
            phosphorus: 0,
            potassium: 0,
            ph: 0,
            cec: 0,
            organic_carbon: 0,
            soil_density: 0,
            total_nitrogen: 0,
            organic_carbon_stock: 0,
            plot_name: currentPlotName,
            fe: 0,
            fe_index_primary: 0,
            fe_index_difference: 0,
            fe_index_normalized: 0,
            fe_image_date: "",
            fe_polarizations: [],
            vv_backscatter_db: 0,
            vh_backscatter_db: 0,
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
    <div className="w-full p-0" style={{ marginTop: '0', marginLeft: '0', marginRight: '0' }}>
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
          <div className="w-full">
            <div className="overflow-x-auto min-w-0">
              <div className="flex items-end justify-between gap-2 h-40 w-full">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 mt-6 w-full">
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