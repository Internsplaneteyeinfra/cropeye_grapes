import React, { useState, useEffect, useRef } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ReferenceArea,
  ReferenceLine,
  Scatter,
  ComposedChart,
  BarChart,
  Bar,
} from "recharts";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Tooltip as LeafletTooltip,
  useMap,
} from "react-leaflet";
import {
  Loader2,
  AlertTriangle,
  Calendar,
  Droplets,
  Thermometer,
  Activity,
  Target,
  Leaf,
  BarChart3,
  // PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  Users,
  MapPin,
  Beaker,
  // Crop,
  // Zap,
  // Clock,
  // Gauge,
  // Filter,
  // RefreshCw,
  Maximize2,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import axios from "axios";
import { getCache, setCache } from "../utils/cache";
import { getBackendApiBaseUrl, getEventsBaseUrl } from "../utils/serviceUrls";
import api from "../api"; // Import the authenticated api instance
import CommonSpinner from "./CommanSpinner";

// Constants (same as FarmerDashboard)
const BASE_URL = getEventsBaseUrl();
const OPTIMAL_BIOMASS = 150;
const SOIL_API_URL = "https://cropeye-grapes-events-production.up.railway.app";
const SOIL_DATE = "2025-10-03";

const OTHER_FARMERS_RECOVERY = {
  regional_average: 7.85,
  top_quartile: 8.52,
  bottom_quartile: 6.58,
  similar_farms: 7.63,
};

// Type definitions (keeping the same as original)
interface LineChartData {
  date: string;
  growth: number;
  stress: number;
  water: number;
  moisture: number;
  stressLevel?: number | null;
  isStressEvent?: boolean;
  stressEventData?: any;
}

interface VisibleLines {
  growth: boolean;
  stress: boolean;
  water: boolean;
  moisture: boolean;
}

interface LineStyles {
  [key: string]: {
    color: string;
    label: string;
  };
}

interface StressEvent {
  from_date: string;
  to_date: string;
  stress: number;
}

interface CustomStressDotProps {
  cx?: number;
  cy?: number;
  payload?: any;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

interface Metrics {
  brix: number | null;
  brixMin: number | null;
  brixMax: number | null;
  recovery: number | null;
  area: number | null;
  biomass: number | null;
  totalBiomass: number | null;
  stressCount: number | null;
  irrigationEvents: number | null;
  expectedYield: number | null;
  daysToHarvest: number | null;
  growthStage: string | null;
  soilPH: number | null;
  organicCarbonDensity: number | null;
  actualYield: number | null;
  cnRatio: number | null;
  sugarYieldMax: number | null;
  sugarYieldMin: number | null;
  sugarYieldMean: number | null;
}

interface PieChartWithNeedleProps {
  value: number;
  max: number;
  width?: number;
  height?: number;
  title?: string;
  unit?: string;
}

type TimePeriod = "daily" | "weekly" | "monthly" | "yearly";

const ManagerFarmDash: React.FC = () => {
  // const center: [number, number] = [17.5789, 75.053]; // Unused - using mapCenter state instead
  const mapWrapperRef = useRef<HTMLDivElement>(null);

  // Farmer and Plot selection state
  const [selectedFieldOfficerId, setSelectedFieldOfficerId] =
    useState<string>("");
  const [selectedFarmerId, setSelectedFarmerId] = useState<string>("");
  const [selectedPlotId, setSelectedPlotId] = useState<string>(""); // Start empty, will be set based on farmer selection
  const [fieldOfficers, setFieldOfficers] = useState<any[]>([]);
  const [farmersForSelectedOfficer, setFarmersForSelectedOfficer] = useState<
    any[]
  >([]);
  const [plots, setPlots] = useState<string[]>([]);
  const [loadingFarmers, setLoadingFarmers] = useState<boolean>(false);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  const lineStyles: LineStyles = {
    growth: { color: "#16a34a", label: "Growth Index" },
    stress: { color: "#dc2626", label: "Crop Stress Index" },
    water: { color: "#3b82f6", label: "Water Uptake Index" },
    moisture: { color: "#92400e", label: "Soil Moisture Index" },
  };

  const [lineChartData, setLineChartData] = useState<LineChartData[]>([]);
  const [plotCoordinates, setPlotCoordinates] = useState<[number, number][]>(
    [],
  );
  const [visibleLines, setVisibleLines] = useState<VisibleLines>({
    growth: true,
    stress: true,
    water: true,
    moisture: true,
  });

  const [metrics, setMetrics] = useState<Metrics>({
    brix: null,
    brixMin: null,
    brixMax: null,
    recovery: null,
    area: null,
    biomass: null,
    totalBiomass: null,
    stressCount: null,
    irrigationEvents: null,
    expectedYield: null,
    daysToHarvest: null,
    growthStage: null,
    soilPH: null,
    organicCarbonDensity: null,
    actualYield: null,
    cnRatio: null,
    sugarYieldMean: null,
    sugarYieldMax: null,
    sugarYieldMin: null,
  });

  const [stressEvents, setStressEvents] = useState<StressEvent[]>([]);
  const [showStressEvents] = useState<boolean>(false);
  const [ndreStressEvents] = useState<StressEvent[]>([]);
  const [showNDREEvents] = useState<boolean>(false);
  const [combinedChartData, setCombinedChartData] = useState<LineChartData[]>(
    [],
  );
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("yearly");
  const [aggregatedData, setAggregatedData] = useState<LineChartData[]>([]);
  const [mapKey, setMapKey] = useState<number>(0);
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    17.5789, 75.053,
  ]);
  const [plotCoordinatesCache, setPlotCoordinatesCache] = useState<
    Map<string, [number, number][]>
  >(new Map());

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Fetch farmers list on component mount
  useEffect(() => {
    fetchManagerData();
  }, []);

  // NEW: Function to set plot coordinates from existing state
  const setPlotCoordinatesFromState = (plotId: string): void => {
    // Find the selected farmer and their plot
    const farmer = farmersForSelectedOfficer.find(
      (f) => String(f.id) === selectedFarmerId,
    );
    const plot = farmer?.plots?.find((p: any) => p.fastapi_plot_id === plotId);

    if (plot && plot.boundary?.coordinates) {
      const geom = plot.boundary.coordinates[0];
      if (geom) {
        // The API gives [lng, lat], Leaflet needs [lat, lng]
        const coords = geom.map(([lng, lat]: [number, number]) => [lat, lng]);
        setPlotCoordinates(coords);

        // Calculate and set map center
        const center = calculateCenter(coords);
        setMapCenter(center);
        setMapKey((prev) => prev + 1); // Force map re-render
      } else {
        setPlotCoordinates([]);
      }
    } else {
      setPlotCoordinates([]);
    }
  };

  // Update farmers dropdown when field officer changes
  useEffect(() => {
    if (selectedFieldOfficerId) {
      const officer = fieldOfficers.find(
        (fo) => String(fo.id) === selectedFieldOfficerId,
      );
      const farmersList = officer ? officer.farmers : [];
      setFarmersForSelectedOfficer(farmersList);
      if (farmersList.length > 0) {
        setSelectedFarmerId(String(farmersList[0].id));
      } else {
        setSelectedFarmerId("");
      }
    }
  }, [selectedFieldOfficerId, fieldOfficers]);

  // Fetch plots when farmer is selected
  useEffect(() => {
    if (selectedFarmerId) {
      const selectedFarmer = farmersForSelectedOfficer.find(
        (f) =>
          String(f.id || f.farmer_id || f.farmerId) ===
          String(selectedFarmerId),
      );

      if (selectedFarmer) {
        // Extract fastapi_plot_id from plots array
        const farmerPlots = selectedFarmer.plots || [];
        const plotIds = farmerPlots.map((plot: any) => plot.fastapi_plot_id);

        setPlots(plotIds);

        // Auto-select first plot if available
        if (plotIds.length > 0) {
          const firstPlotId = plotIds[0];
          setSelectedPlotId(firstPlotId);
        } else {
          setSelectedPlotId("");
        }
      } else {
        setPlots([]);
        setSelectedPlotId("");
      }
    } else {
      setPlots([]);
      setSelectedPlotId("");
    }
  }, [selectedFarmerId, farmersForSelectedOfficer]);

  useEffect(() => {
    if (selectedPlotId) {
      fetchAllData();
      setPlotCoordinatesFromState(selectedPlotId); // This will now work
    }
  }, [selectedPlotId]);

  useEffect(() => {
    if (lineChartData.length > 0) {
      const aggregated = aggregateDataByPeriod(lineChartData, timePeriod);
      setAggregatedData(aggregated);
    }
  }, [lineChartData, timePeriod]);

  useEffect(() => {
    if (aggregatedData.length > 0) {
      const combined = aggregatedData.map((point) => {
        const stressEvent = showNDREEvents
          ? ndreStressEvents.find((event) => {
            const eventStart = new Date(event.from_date);
            const eventEnd = new Date(event.to_date);
            const pointDate = new Date(point.date);
            return pointDate >= eventStart && pointDate <= eventEnd;
          })
          : null;

        return {
          ...point,
          stressLevel: stressEvent ? stressEvent.stress : null,
          isStressEvent: !!stressEvent,
          stressEventData: stressEvent,
        };
      });
      setCombinedChartData(combined);
    } else {
      setCombinedChartData([]);
    }
  }, [aggregatedData, ndreStressEvents, showNDREEvents]);

  // Helper function to make axios requests with timeout and retry logic
  // Optimized with shorter timeout for faster retrieval
  const makeRequestWithRetry = async (
    url: string,
    retries = 1,
    timeout = 15000,
  ): Promise<any> => {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeout);

    try {
      const response = await axios.get(url, {
        signal: abortController.signal,
        timeout: timeout,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      clearTimeout(timeoutId);
      return response.data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Handle CORS errors
      if (
        error.message?.includes("CORS") ||
        error.message?.includes("Access-Control-Allow-Origin")
      ) {
        throw new Error(
          `CORS error: The server at ${new URL(url).origin
          } is not configured to allow requests from this origin. Please contact the API administrator.`,
        );
      }

      // Handle timeout errors (including AbortError from AbortController)
      if (
        error.name === "AbortError" ||
        error.code === "ECONNABORTED" ||
        error.message?.includes("timeout") ||
        error.message?.includes("canceled")
      ) {
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retry
          return makeRequestWithRetry(url, retries - 1, timeout);
        }
        throw new Error(
          `Request timeout: The server took too long to respond. Please try again later.`,
        );
      }

      // Handle network errors
      if (
        error.code === "ERR_NETWORK" ||
        error.message?.includes("ERR_FAILED")
      ) {
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          return makeRequestWithRetry(url, retries - 1, timeout);
        }
        throw new Error(
          `Network error: Unable to connect to the server. Please check your internet connection.`,
        );
      }

      // Handle 504 Gateway Timeout
      if (error.response?.status === 504) {
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return makeRequestWithRetry(url, retries - 1, timeout);
        }
        throw new Error(
          `Gateway timeout: The server is taking too long to process your request. Please try again later.`,
        );
      }

      // Re-throw other errors
      throw error;
    }
  };

  // Fetch all data for selected plot - Optimized for faster retrieval
  const fetchAllData = async (): Promise<void> => {
    if (!selectedPlotId) return;

    setLoadingData(true);
    try {
      // Use timezone offset for consistent date calculation
      const tzOffsetMs = new Date().getTimezoneOffset() * 60000;
      const endDate = new Date(Date.now() - tzOffsetMs)
        .toISOString()
        .slice(0, 10);
      const today = endDate;

      // Step 1: Fetch harvest status first to determine correct date for yield data
      const harvestCacheKey = `harvest_${selectedPlotId}_${today}`;
      let harvestStatus = null;
      let harvestDate = null;
      let harvestData = getCache(harvestCacheKey);

      if (!harvestData) {
        try {
          const harvestRes = await axios.post(
            `${BASE_URL}/grapes-harvest?plot_name=${selectedPlotId}&end_date=${today}`,
            {},
            { timeout: 10000 },
          );
          harvestData = harvestRes.data;
          setCache(harvestCacheKey, harvestData);
        } catch (err) {
          console.warn("Harvest status fetch failed, continuing...", err);
        }
      }

      if (harvestData) {
        harvestStatus =
          harvestData.harvest_status ||
          harvestData.harvest_summary?.harvest_status ||
          harvestData.features?.[0]?.properties?.harvest_status;
        harvestDate =
          harvestData.harvest_date || harvestData.harvest_summary?.harvest_date;
      }

      // Determine date for yield data
      let yieldDataDate = today;
      // User requested to always use current date for agroStats
      // const isHarvested =
      //   harvestStatus?.toLowerCase().includes("harvested") &&
      //   !harvestStatus?.toLowerCase().includes("partially");

      // if (isHarvested && harvestDate) {
      //   yieldDataDate = harvestDate;
      // }

      // Helper to fetch agroStats with fallback dates
      const fetchAgroStatsWithFallback = async (dates: string[]) => {
        for (const date of dates) {
          try {
            console.log(`Fetching AgroStats for date: ${date}`);
            const res = await axios.get(
              `https://cropeye-grapes-events-production.up.railway.app/plots/agroStats?end_date=${date}`
            );
            if (res.data) {
              return { data: res.data, successfulDate: date };
            }
          } catch (err: any) {
            console.warn(`Failed to fetch AgroStats for ${date}:`, err.message);
            // Continue to next date if available
          }
        }
        return null;
      };

      // Step 2: Fetch agroStats with fallback logic
      // Try today, then yesterday, then 2 days ago
      const yesterday = new Date(new Date(today).setDate(new Date(today).getDate() - 1)).toISOString().slice(0, 10);
      const twoDaysAgo = new Date(new Date(today).setDate(new Date(today).getDate() - 2)).toISOString().slice(0, 10);

      const datesToTry = [today, yesterday, twoDaysAgo];
      let successfulDate = yieldDataDate; // Default to today/yieldDataDate

      // Check cache first for today (primary target)
      const agroStatsCacheKey = `agroStats_v3_${yieldDataDate}`;
      let allPlotsData = getCache(agroStatsCacheKey);

      // Also check plot-specific cache for faster retrieval
      const plotSpecificCacheKey = `plot_v3_${selectedPlotId}_${yieldDataDate}`;
      let currentPlotData = getCache(plotSpecificCacheKey);

      if (!allPlotsData || !currentPlotData) {
        const result = await fetchAgroStatsWithFallback(datesToTry);

        if (result) {
          allPlotsData = result.data;
          successfulDate = result.successfulDate;

          // Cache the result using the date that actually worked
          const successfulCacheKey = `agroStats_v3_${successfulDate}`;
          setCache(successfulCacheKey, allPlotsData);

          // Extract and cache plot-specific data
          const cleanId = selectedPlotId.replace(/"/g, "");
          const quotedId = `"${cleanId}"`;

          currentPlotData =
            allPlotsData[cleanId] || allPlotsData[quotedId] || null;

          if (currentPlotData) {
            const successfulPlotKey = `plot_v3_${selectedPlotId}_${successfulDate}`;
            setCache(successfulPlotKey, currentPlotData);
          } else {
            console.warn(`Plot data not found for ID: ${selectedPlotId} in AgroStats response (${successfulDate})`);
          }
        } else {
          console.error("All AgroStats fetch attempts failed.");
          allPlotsData = null;
        }
      } else {
        // Use cached plot data if available
        const cleanId = selectedPlotId.replace(/"/g, "");
        const quotedId = `"${cleanId}"`;

        if (!currentPlotData && allPlotsData) {
          currentPlotData =
            allPlotsData[cleanId] ||
            allPlotsData[quotedId] ||
            null;
        }
      }

      // Step 3: Calculate biomass from expectedYield (matching FarmerDashboard)
      const expectedYieldValue =
        currentPlotData?.brix_sugar?.sugar_yield?.mean ??
        currentPlotData?.brix_sugar?.sugar_yield?.min ??
        null;

      let calculatedBiomass = null;
      let totalBiomassForMetric = null;

      if (expectedYieldValue !== null) {
        const totalBiomass = expectedYieldValue * 1.27;
        const underGroundBiomassInTons = totalBiomass * 0.12;
        calculatedBiomass = underGroundBiomassInTons;
        totalBiomassForMetric = totalBiomass;
      } else if (currentPlotData?.biomass?.mean) {
        // Fallback to API biomass if calculated value is not available
        const totalBiomass = currentPlotData.biomass.mean;
        const underGroundBiomassInTons = totalBiomass * 0.12;
        calculatedBiomass = underGroundBiomassInTons;
        totalBiomassForMetric = totalBiomass;
      }

      // Step 3: Update metrics immediately with available data for faster UI response
      if (currentPlotData) {
        const brixStats = currentPlotData?.brix_sugar?.brix ?? null;
        const recoveryStats = currentPlotData?.brix_sugar?.recovery ?? null;

        setMetrics((prev) => ({
          ...prev,
          brix: brixStats?.mean ?? brixStats?.min ?? null,
          brixMin: brixStats?.min ?? null,
          brixMax: brixStats?.max ?? null,
          recovery: recoveryStats?.mean ?? recoveryStats?.min ?? null,
          area: currentPlotData?.area_acres ?? null,
          biomass: calculatedBiomass,
          totalBiomass: totalBiomassForMetric,
          expectedYield: expectedYieldValue,
          daysToHarvest: currentPlotData?.days_to_harvest ?? null,
          growthStage:
            harvestStatus || currentPlotData?.Sugarcane_Status || null,
          soilPH: currentPlotData?.soil?.phh2o ?? null,
          organicCarbonDensity:
            currentPlotData?.soil?.organic_carbon_stock != null
              ? parseFloat(currentPlotData.soil.organic_carbon_stock.toFixed(2))
              : null,
          actualYield:
            currentPlotData?.brix_sugar?.sugar_yield?.mean ??
            currentPlotData?.brix_sugar?.sugar_yield?.min ??
            null,
          sugarYieldMean: expectedYieldValue,
          sugarYieldMax: currentPlotData?.brix_sugar?.sugar_yield?.max ?? null,
          sugarYieldMin: currentPlotData?.brix_sugar?.sugar_yield?.min ?? null,
        }));
      }

      // Step 4: Fetch additional data in parallel with shorter timeouts
      // Check cache first for each endpoint
      const indicesCacheKey = `indices_${selectedPlotId}`;
      const stressCacheKey = `stress_${selectedPlotId}_NDRE_0.15`;
      const irrigationCacheKey = `irrigation_${selectedPlotId}`;

      let cachedIndices = getCache(indicesCacheKey);
      let cachedStress = getCache(stressCacheKey);
      let cachedIrrigation = getCache(irrigationCacheKey);

      // Only fetch what's not cached, with shorter timeouts
      const fetchPromises = [];

      if (!cachedIndices) {
        fetchPromises.push(
          makeRequestWithRetry(
            `${BASE_URL}/plots/${selectedPlotId}/indices`,
            1,
            10000, // Shorter timeout for indices
          )
            .then((data) => {
              const processed = data.map((item: any) => ({
                date: new Date(item.date).toISOString().split("T")[0],
                growth: item.NDVI,
                stress: item.NDMI,
                water: item.NDWI,
                moisture: item.NDRE,
              }));
              setCache(indicesCacheKey, processed);
              return { type: "indices", data: processed };
            })
            .catch(() => ({ type: "indices", data: null })),
        );
      } else {
        fetchPromises.push(
          Promise.resolve({ type: "indices", data: cachedIndices }),
        );
      }

      if (!cachedStress) {
        fetchPromises.push(
          makeRequestWithRetry(
            `${BASE_URL}/plots/${selectedPlotId}/stress?index_type=NDRE&threshold=0.15`,
            1,
            10000,
          )
            .then((data) => {
              setCache(stressCacheKey, data);
              return { type: "stress", data };
            })
            .catch(() => ({
              type: "stress",
              data: { events: [], total_events: 0 },
            })),
        );
      } else {
        fetchPromises.push(
          Promise.resolve({ type: "stress", data: cachedStress }),
        );
      }

      if (!cachedIrrigation) {
        fetchPromises.push(
          makeRequestWithRetry(
            `${BASE_URL}/plots/${selectedPlotId}/irrigation?threshold_ndmi=0.05&threshold_ndwi=0.05&min_days_between_events=10`,
            1,
            10000,
          )
            .then((data) => {
              setCache(irrigationCacheKey, data);
              return { type: "irrigation", data };
            })
            .catch(() => ({
              type: "irrigation",
              data: { total_events: null },
            })),
        );
      } else {
        fetchPromises.push(
          Promise.resolve({ type: "irrigation", data: cachedIrrigation }),
        );
      }

      // Execute all fetches in parallel
      const results = await Promise.allSettled(fetchPromises);

      let rawIndices: LineChartData[] = [];
      let stressData: any = { events: [], total_events: 0 };
      let irrigationData: any = { total_events: null };

      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          const { type, data } = result.value;
          if (type === "indices") rawIndices = data || [];
          if (type === "stress")
            stressData = data || { events: [], total_events: 0 };
          if (type === "irrigation")
            irrigationData = data || { total_events: null };
        }
      });

      // Update state with fetched data
      setLineChartData(rawIndices);
      setStressEvents(stressData?.events ?? []);

      // Update metrics with complete data
      setMetrics((prev) => ({
        ...prev,
        stressCount: stressData?.total_events ?? 0,
        irrigationEvents: irrigationData?.total_events ?? null,
        cnRatio: null,
      }));
    } catch (err: any) {
      // You could add a toast notification here to inform the user
      // For now, we'll just log the error and continue with partial data
    } finally {
      setLoadingData(false);
    }
  };

  // Fetch farmers from API - using authenticated endpoint
  const fetchManagerData = async (): Promise<void> => {
    setLoadingFarmers(true);
    try {
      // Use authenticated API call from api.ts
      const response = await api.get(
        `${getBackendApiBaseUrl()}/users/my-field-officers/`,
      );
      const responseData = response.data;
      // Extract the array of field officers from the response object
      const officersData = responseData.field_officers || [];

      setFieldOfficers(officersData);

      // Auto-select first field officer if available
      if (officersData.length > 0) {
        setSelectedFieldOfficerId(String(officersData[0].id));
      }
    } catch (error: any) {
      // Show user-friendly error message
      if (error.response?.status === 401) {
      } else if (error.response?.status === 403) {
      }
    } finally {
      setLoadingFarmers(false);
    }
  };

  // Fetch plots from API - No longer needed, plots come from farmers data
  // const fetchPlots = async (): Promise<void> => {
  //   setLoadingPlots(true);
  //   try {
  //     const response = await axios.get(`${BASE_URL}/plots`);
  //     setPlots(response.data);
  //   } catch (error) {
  //     console.error("Error fetching plots:", error);
  //   } finally {
  //     setLoadingPlots(false);
  //   }
  // };

  // Fetch plot coordinates immediately when plot is selected
  const fetchPlotCoordinates = async (plotId: string): Promise<void> => {
    // Check cache first
    if (plotCoordinatesCache.has(plotId)) {
      const cachedCoords = plotCoordinatesCache.get(plotId);
      if (cachedCoords && cachedCoords.length > 0) {
        setPlotCoordinates(cachedCoords);
        // Calculate center from coordinates
        const center = calculateCenter(cachedCoords);
        setMapCenter(center);
        setMapKey((prev) => prev + 1);
        return;
      }
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const response = await axios.post(
        `${BASE_URL}/analyze?plot_name=${plotId}&date=${today}`,
      );

      const geom = response.data?.features?.[0]?.geometry?.coordinates?.[0];
      if (geom) {
        const coords = geom.map(([lng, lat]: [number, number]) => [lat, lng]);
        setPlotCoordinates(coords);

        // Cache the coordinates
        setPlotCoordinatesCache((prev) => new Map(prev.set(plotId, coords)));

        // Calculate and set map center
        const center = calculateCenter(coords);
        setMapCenter(center);
        setMapKey((prev) => prev + 1);
      }
    } catch (error) { }
  };

  // Calculate center point from coordinates
  const calculateCenter = (coords: [number, number][]): [number, number] => {
    if (coords.length === 0) return [17.5789, 75.053];

    const sumLat = coords.reduce((sum, [lat]) => sum + lat, 0);
    const sumLng = coords.reduce((sum, [, lng]) => sum + lng, 0);

    return [sumLat / coords.length, sumLng / coords.length];
  };

  // Aggregation logic (same as FarmerDashboard)
  const aggregateDataByPeriod = (
    data: LineChartData[],
    period: TimePeriod,
  ): LineChartData[] => {
    if (period === "daily") {
      // Filter to last 1 day for daily period
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Set to midnight for accurate date comparison
      const today = new Date(now);

      let filteredData = data.filter((item) => {
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0); // Set to midnight for accurate comparison
        return itemDate.getTime() === today.getTime();
      });

      if (filteredData.length === 0) {
        // If no data for today, get the most recent day
        const sorted = [...data].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        if (sorted.length > 0) {
          const mostRecentDate = new Date(sorted[0].date);
          mostRecentDate.setHours(0, 0, 0, 0);
          filteredData = data.filter((item) => {
            const itemDate = new Date(item.date);
            itemDate.setHours(0, 0, 0, 0);
            return itemDate.getTime() === mostRecentDate.getTime();
          });
        }
      }

      // If only one data point, duplicate it to create a line representation
      if (filteredData.length === 1) {
        const singlePoint = filteredData[0];
        // Create a second point with the same values to render as a horizontal line
        const secondPoint = {
          ...singlePoint,
          date: singlePoint.date, // Same date to create a horizontal line
        };
        return [singlePoint, secondPoint];
      }

      return filteredData;
    }

    // Weekly = show last 7 days trend (no week-bucketing; avoids collapsing into 1 point)
    if (period === "weekly") {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 6); // include today = 7 days total

      const weeklyData = data
        .filter((item) => {
          const itemDate = new Date(item.date);
          itemDate.setHours(0, 0, 0, 0);
          return itemDate >= sevenDaysAgo && itemDate <= now;
        })
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

      // If only one data point, duplicate it to create a line representation
      if (weeklyData.length === 1) {
        return [weeklyData[0], { ...weeklyData[0] }];
      }

      // If nothing in last 7 days, fall back to most recent 7 points
      if (weeklyData.length === 0) {
        const sorted = [...data].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        const recent = sorted.slice(0, 7).reverse();
        if (recent.length === 1) return [recent[0], { ...recent[0] }];
        return recent;
      }

      return weeklyData;
    }

    let filteredData = data;

    const groupedData: { [key: string]: LineChartData[] } = {};
    filteredData.forEach((item) => {
      const date = new Date(item.date);
      let key: string;
      switch (period) {
        case "weekly":
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          // Use local date parts (avoid `toISOString()` UTC shifting by timezone)
          key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(
            2,
            "0",
          )}-${String(weekStart.getDate()).padStart(2, "0")}`;
          break;
        case "monthly":
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
            2,
            "0",
          )}`;
          break;
        case "yearly":
          return;
        default:
          key = item.date;
      }
      if (!groupedData[key]) {
        groupedData[key] = [];
      }
      groupedData[key].push(item);
    });
    if (period === "yearly") {
      return [...data].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
    }
    const result = Object.entries(groupedData)
      .map(([key, items]) => {
        const avgGrowth =
          items.reduce((sum, item) => sum + item.growth, 0) / items.length;
        const avgStress =
          items.reduce((sum, item) => sum + item.stress, 0) / items.length;
        const avgWater =
          items.reduce((sum, item) => sum + item.water, 0) / items.length;
        const avgMoisture =
          items.reduce((sum, item) => sum + item.moisture, 0) / items.length;
        let displayDate: string;
        if (period === "monthly") {
          const [year, month] = key.split("-");
          displayDate = new Date(
            parseInt(year),
            parseInt(month) - 1,
          ).toLocaleDateString("en-US", { month: "short", year: "numeric" });
        } else {
          displayDate = key;
        }
        return {
          date: key,
          displayDate,
          growth: avgGrowth,
          stress: avgStress,
          water: avgWater,
          moisture: avgMoisture,
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return result;
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Utility functions
  const toggleLine = (key: string): void => {
    const isOnlyThis = Object.keys(visibleLines).every((k) =>
      k === key
        ? visibleLines[k as keyof VisibleLines]
        : !visibleLines[k as keyof VisibleLines],
    );

    if (isOnlyThis) {
      setVisibleLines({
        growth: true,
        stress: true,
        water: true,
        moisture: true,
      });
    } else {
      setVisibleLines({
        growth: key === "growth",
        stress: key === "stress",
        water: key === "water",
        moisture: key === "moisture",
      });
    }
  };

  // Map auto-center component (from Harvest Dashboard)
  function MapAutoCenter({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
      map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
  }

  const getPlotBorderStyle = () => ({
    color: "#ffffff",
    fillColor: "#10b981",
    weight: 3,
    opacity: 1,
    fillOpacity: 0.3,
  });

  // Biomass data setup (same as FarmerDashboard)
  const currentBiomass = metrics.biomass || 0;
  const totalBiomass = metrics.totalBiomass || 0;

  const biomassData = [
    {
      name: "Total Biomass",
      value: totalBiomass,
      fill: "#3b82f6",
    },
    {
      name: "Underground Biomass",
      value: currentBiomass,
      fill: "#10b981",
    },
  ];

  const managerRecovery = metrics.recovery ?? 0;

  const recoveryComparisonData = [
    {
      name: "Managed Farms",
      value: managerRecovery,
      fill: "#10b981",
      label: "Managed Recovery",
    },
    {
      name: "Regional Avg",
      value: OTHER_FARMERS_RECOVERY.regional_average,
      fill: "#3b82f6",
      label: "Regional Average",
    },
    {
      name: "Top 25%",
      value: OTHER_FARMERS_RECOVERY.top_quartile,
      fill: "#22c55e",
      label: "Top Quartile",
    },
    {
      name: "Similar Farms",
      value: OTHER_FARMERS_RECOVERY.similar_farms,
      fill: "#f59e0b",
      label: "Similar Farms",
    },
  ];

  const chartDataToUse =
    combinedChartData.length > 0 ? combinedChartData : aggregatedData;
  const chartXAxisKey = timePeriod === "monthly" ? "displayDate" : "date";

  // Time period toggle component
  const TimePeriodToggle: React.FC = () => (
    <div className="flex flex-wrap gap-1 mb-3">
      {(["daily", "weekly", "monthly", "yearly"] as TimePeriod[]).map(
        (period) => (
          <button
            key={period}
            onClick={() => setTimePeriod(period)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 ${timePeriod === period
              ? "bg-blue-500 text-white shadow-md transform scale-105"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm"
              }`}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </button>
        ),
      )}
    </div>
  );

  // Enhanced chart legend
  const ChartLegend: React.FC = () => (
    <div className="flex flex-wrap gap-1 text-xs font-medium mb-2">
      {Object.entries(lineStyles).map(([key, { color, label }]) => (
        <button
          key={key}
          onClick={() => toggleLine(key)}
          className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all duration-200 ${visibleLines[key as keyof VisibleLines]
            ? "bg-white shadow-sm transform scale-105"
            : "bg-gray-100 opacity-50 hover:opacity-75"
            }`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-gray-700 text-xs">{label}</span>
        </button>
      ))}
    </div>
  );

  // Custom tooltip component
  const CustomTooltip: React.FC<CustomTooltipProps> = ({
    active,
    payload,
    label,
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg backdrop-blur-sm">
          <p className="text-sm font-semibold text-gray-800 mb-2">
            {formatDate(label || "")}
          </p>
          {payload.map((entry, index) => {
            const lineStyle = lineStyles[entry.dataKey as keyof LineStyles];
            if (!lineStyle) return null;

            return (
              <div key={index} className="flex items-center gap-2 mb-1">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm text-gray-600">
                  {lineStyle.label}: {Number(entry.value).toFixed(4)}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  // Gauge component
  const PieChartWithNeedle: React.FC<PieChartWithNeedleProps> = ({
    value,
    max,
    width = 200,
    height = 120,
    title = "Gauge",
    unit = "",
  }) => {
    const percent = Math.max(0, Math.min(1, value / max));
    const angle = 180 * percent;
    const cx = width / 2;
    const cy = height * 0.8;
    const r = width * 0.35;
    const needleLength = r * 0.9;
    const needleAngle = 180 - angle;
    const rad = (Math.PI * needleAngle) / 180;
    const x = cx + needleLength * Math.cos(rad);
    const y = cy - needleLength * Math.sin(rad);

    const getColor = (percent: number): string => {
      if (percent < 0.3) return "#ef4444";
      if (percent < 0.6) return "#f97316";
      if (percent < 0.8) return "#eab308";
      return "#10b981";
    };

    return (
      <div className="flex flex-col items-center">
        <svg width={width} height={height} className="overflow-visible">
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(Math.PI - (angle * Math.PI) / 180)
              } ${cy - r * Math.sin(Math.PI - (angle * Math.PI) / 180)}`}
            fill="none"
            stroke={getColor(percent)}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <line
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="#374151"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r="4" fill="#374151" />
          <text
            x={cx}
            y={cy - r - 15}
            textAnchor="middle"
            className="text-lg font-bold fill-gray-700"
          >
            {value.toFixed(1)} {unit}
          </text>
        </svg>
        <p className="text-sm text-gray-600 mt-2 font-medium">{title}</p>
      </div>
    );
  };

  // Show loading spinner while fetching initial farmers data
  if (loadingFarmers && fieldOfficers.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CommonSpinner />
      </div>
    );
  }

  const totalFarmers = fieldOfficers.reduce(
    (acc, officer) => acc + (officer.farmers?.length || 0),
    0,
  );

  return (
    <div className="min-h-screen dashboard-bg">
      {/* Enhanced Header */}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ">
        {/* Debug Info Panel */}
        {showDebugInfo && (
          <div className="mb-6 bg-gray-900 rounded-xl shadow-lg p-4 border border-gray-700">
            <h3 className="text-sm font-bold text-green-400 mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Debug Information - API Request Details
            </h3>
            <div className="bg-black rounded-lg p-3 overflow-auto max-h-96">
              <pre className="text-xs text-green-300 font-mono">
                {JSON.stringify(
                  {
                    endpoint: `${getBackendApiBaseUrl()}/farms/recent-farmers/`,
                    method: "GET",
                    bearerToken: localStorage.getItem("access_token") || localStorage.getItem("token")
                      ? "✅ Present"
                      : "❌ Missing",
                    tokenPreview:
                      (localStorage.getItem("access_token") || localStorage.getItem("token"))?.substring(0, 30) + "...",
                    totalFarmers: farmersForSelectedOfficer.length,
                    selectedFarmer: selectedFarmerId,
                    selectedPlot: selectedPlotId,
                    farmersList: farmersForSelectedOfficer.map((f: any) => ({
                      id: f.id || f.farmer_id,
                      name:
                        `${f.first_name || ""} ${f.last_name || ""}`.trim() ||
                        f.name,
                      email: f.email,
                      plots: f.plots?.length || f.plot_ids?.length || 0,
                    })),
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              💡 Check the browser console for detailed API request/response
              logs
            </p>
          </div>
        )}

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center w-full lg:w-auto">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <div className="flex flex-col flex-1 sm:flex-none">
                  <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Field Officer ({fieldOfficers.length})
                  </label>
                  <select
                    className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm w-full sm:w-64"
                    value={selectedFieldOfficerId}
                    onChange={(e) => setSelectedFieldOfficerId(e.target.value)}
                    disabled={loadingFarmers}
                  >
                    {loadingFarmers ? (
                      <option>Loading...</option>
                    ) : fieldOfficers.length === 0 ? (
                      <option>No officers found</option>
                    ) : (
                      <>
                        <option value="">Select an officer</option>
                        {fieldOfficers.map((officer) => (
                          <option
                            key={`officer-${officer.id}`}
                            value={officer.id}
                          >
                            {officer.first_name} {officer.last_name} (
                            {officer.farmers.length} farmers)
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="flex flex-col flex-1 sm:flex-none">
                  <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Farmers (
                    {farmersForSelectedOfficer.length})
                  </label>
                  <select
                    className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm w-full sm:w-64"
                    value={selectedFarmerId}
                    onChange={(e) => {
                      setSelectedFarmerId(e.target.value);
                    }}
                    disabled={
                      !selectedFieldOfficerId ||
                      farmersForSelectedOfficer.length === 0
                    }
                  >
                    {loadingFarmers ? (
                      <option>Loading farmers...</option>
                    ) : farmersForSelectedOfficer.length === 0 ? (
                      <option>No farmers found</option>
                    ) : (
                      <>
                        <option value="">Select a farmer</option>
                        {farmersForSelectedOfficer.map((farmer, index) => {
                          const farmerId = String(farmer.id);
                          const farmerName =
                            `${farmer.first_name} ${farmer.last_name}`.trim();
                          const plotsCount = farmer.plots?.length || 0;

                          return (
                            <option key={`farmer-${farmerId}`} value={farmerId}>
                              {farmerName} ({plotsCount} plot
                              {plotsCount !== 1 ? "s" : ""})
                            </option>
                          );
                        })}
                      </>
                    )}
                  </select>
                </div>

                <div className="flex flex-col flex-1 sm:flex-none">
                  <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Plots ({plots.length})
                  </label>
                  <select
                    className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm w-full sm:w-64"
                    value={selectedPlotId}
                    onChange={(e) => {
                      const newPlotId = e.target.value;
                      setSelectedPlotId(newPlotId);
                      if (newPlotId) {
                        // Immediately fetch coordinates and update map
                        fetchPlotCoordinates(newPlotId);
                      }
                    }}
                    disabled={!selectedFarmerId || plots.length === 0}
                  >
                    {!selectedFarmerId ? (
                      <option value="">Select farmer first</option>
                    ) : plots.length === 0 ? (
                      <option value="">No plots available</option>
                    ) : (
                      <>
                        <option value="">Select a plot</option>
                        {plots.map((plotId, index) => {
                          return (
                            <option
                              key={`plot-${plotId}-${index}`}
                              value={plotId}
                            >
                              Plot: {plotId}
                            </option>
                          );
                        })}
                      </>
                    )}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gradient-to-r from-gray-100 to-blue-50 px-4 py-3 rounded-lg ">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="font-medium">
              {new Date().toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Top Priority Metrics - 4 Key Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-5 hover:shadow-lg transition-all duration-300 flex flex-col h-full relative overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <img
              src="/Image/crop images/Fields.png"
              alt=""
              aria-hidden
              className="absolute left-4 top-5 w-20 h-20 object-contain opacity-100 z-0 pointer-events-none select-none"
            />
            <div className="flex items-center justify-end mb-2 pt-2 relative z-10">
              <div className="text-right">
                <div className="text-3xl font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.area?.toFixed(2) || "-"
                  )}
                </div>
                <div className="text-base font-semibold" style={{ color: '#6bb043' }}>acre</div>
              </div>
            </div>
            <p className="text-sm font-medium mt-auto pt-3 relative z-10" style={{ color: '#616161' }}>Field Area</p>
          </div>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300 flex flex-col h-full relative overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <img
              src="/Image/crop images/Crop Status.png"
              alt=""
              aria-hidden
              className="absolute left-4 top-5 w-20 h-20 object-contain opacity-100 z-0 pointer-events-none select-none"
            />
            <div className="flex items-center justify-end mb-2 relative z-10">
              <div className="text-right">
                <div className="text-lg font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.growthStage || "-"
                  )}
                </div>
              </div>
            </div>
            <p className="text-sm font-medium mt-auto pt-3 relative z-10" style={{ color: '#616161' }}>
              Crop Status
            </p>
          </div>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300 flex flex-col h-full relative overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <img
              src="/Image/crop images/Time.png"
              alt=""
              aria-hidden
              className="absolute left-4 top-5 w-20 h-20 object-contain opacity-100 z-0 pointer-events-none select-none"
            />
            <div className="flex items-center justify-end mb-2 relative z-10">
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : metrics.daysToHarvest !== null ? (
                    metrics.daysToHarvest
                  ) : (
                    "-"
                  )}
                </div>
                <div className="text-sm font-semibold" style={{ color: '#6bb043' }}>
                  Days
                </div>
              </div>
            </div>
            <p className="text-sm font-medium mt-auto pt-3 relative z-10" style={{ color: '#616161' }}>Time to Harvest</p>
          </div>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-4 hover:shadow-lg transition-all duration-300 flex flex-col h-full relative overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <img
              src="/Image/crop images/yield.png"
              alt=""
              aria-hidden
              className="absolute left-4 top-5 w-20 h-20 object-contain opacity-100 z-0 pointer-events-none select-none"
            />
            <div className="flex items-center justify-end mb-2 relative z-10">
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : metrics.brix !== null ? (
                    metrics.brix.toFixed(2)
                  ) : (
                    "-"
                  )}
                </div>
                <div className="text-sm font-semibold" style={{ color: '#6bb043' }}>
                  °Brix
                </div>
              </div>
            </div>
            <p className="text-sm font-medium mt-auto pt-3 relative z-10" style={{ color: '#616161' }}>Sugar Content</p>
          </div>
        </div>

        {/* Additional Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-5 hover:shadow-lg transition-all duration-300" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-2">
              <img src="/Image/crop images/yield.png" alt="Expected Yield" className="w-14 h-14 object-contain rounded-lg" />
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.expectedYield?.toFixed(2) || "-"
                  )}
                </div>
                <div className="text-sm font-semibold" style={{ color: '#6bb043' }}>
                  T/acre
                </div>
              </div>
            </div>
            <p className="text-xs font-medium mt-3" style={{ color: '#616161' }}>Expected Yield</p>
          </div>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-5 hover:shadow-lg transition-all duration-300" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-2">
              <img src="/Image/crop images/Organic Carbon.png" alt="Organic Carbon" className="w-14 h-14 object-contain rounded-lg" />
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.organicCarbonDensity?.toFixed(1) || "-"
                  )}
                </div>
                <div className="text-sm font-semibold" style={{ color: '#6bb043' }}>g/kg</div>
              </div>
            </div>
            <p className="text-xs font-medium mt-3" style={{ color: '#616161' }}>Organic Carbon</p>
          </div>

          <div className="bg-[#f8f9fa] rounded-xl shadow-md p-5 hover:shadow-lg transition-all duration-300" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-2">
              <img src="/Image/crop images/Biomass.png" alt="Avg Biomass" className="w-14 h-14 object-contain rounded-lg" />
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: '#212121', fontFamily: 'Inter, Poppins, sans-serif' }}>
                  {loadingData ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    metrics.biomass?.toFixed(1) || "-"
                  )}
                </div>
                <div className="text-sm font-semibold" style={{ color: '#6bb043' }}>kg/acre</div>
              </div>
            </div>
            <p className="text-xs font-medium mt-3" style={{ color: '#616161' }}>Avg Biomass</p>
          </div>
        </div>

        {/* Map and Status Section */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-lg overflow-hidden">
            <div
              ref={mapWrapperRef}
              className="relative w-full h-[400px] sm:h-[400px] md:h-[450px] lg:h-[500px] xl:h-full min-h-[300px]"
            >
              {/* Fullscreen Toggle */}
              <div
                className="absolute top-4 right-4 z-20 bg-white text-gray-700 border border-gray-200 shadow-md p-2 rounded cursor-pointer hover:bg-gray-100 transition"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    mapWrapperRef.current?.requestFullscreen();
                  } else {
                    document.exitFullscreen();
                  }
                }}
              >
                <Maximize2 className="w-4 h-4" />
              </div>

              {/* Centered Growth Stage Indicator */}
              <div className="absolute top-10 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                <div className="bg-black/20 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/30 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" />
                    <div className="text-center">
                      <div className="text-white font-bold text-lg drop-shadow-lg">
                        {metrics.growthStage ?? "Loading..."}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <MapContainer
                key={mapKey}
                center={mapCenter}
                zoom={16}
                minZoom={10}
                maxZoom={20}
                className="w-full h-full z-0"
                style={{
                  height: "100%",
                  width: "100%",
                  borderRadius: "inherit",
                  position: "relative",
                }}
              >
                <MapAutoCenter center={mapCenter} />
                <TileLayer
                  url="http://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                  attribution="© Google"
                  maxZoom={20}
                  maxNativeZoom={18}
                  minZoom={10}
                  tileSize={256}
                  zoomOffset={0}
                  updateWhenZooming={false}
                  updateWhenIdle={true}
                />
                {plotCoordinates.length > 0 && (
                  <Polygon
                    positions={plotCoordinates}
                    pathOptions={getPlotBorderStyle()}
                  >
                    <LeafletTooltip
                      direction="top"
                      offset={[0, -10]}
                      opacity={0.9}
                      sticky
                    >
                      <div className="text-sm">
                        <p>
                          <strong>Plot:</strong> {selectedPlotId}
                        </p>
                        <p>
                          <strong>Farmer:</strong> Ramesh Patil
                        </p>
                        <p>
                          <strong>Representative:</strong> Sunil Joshi
                        </p>
                        <p>
                          <strong>Status:</strong>{" "}
                          {metrics.growthStage ?? "Loading..."}
                        </p>
                        <p>
                          <strong>Area:</strong> {metrics.area ?? "Loading..."}{" "}
                          Ha
                        </p>
                      </div>
                    </LeafletTooltip>
                  </Polygon>
                )}
              </MapContainer>
            </div>
          </div>

          {/* Performance Gauges */}
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4">
                <div className="flex items-center gap-3 mb-6">
                  <Target className="w-5 h-7 text-purple-600" />
                  <h3 className="text-sm font-semibold text-gray-800">
                    Grapes Yield Projection
                  </h3>
                </div>
                <div className="flex flex-col items-center">
                  <PieChartWithNeedle
                    value={metrics.sugarYieldMean || 0}
                    max={metrics.sugarYieldMax || 400}
                    title="Grapes Yield Forecast"
                    unit=" T/acre"
                    width={260}
                    height={130}
                  />
                  <div className="mt-2 text-center">
                    <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded bg-red-500"></div>
                        <span className="text-red-700 font-semibold">
                          min: {(metrics.sugarYieldMin || 0).toFixed(1)} T/acre
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded bg-purple-500"></div>
                        <span className="text-purple-700 font-semibold">
                          mean: {(metrics.sugarYieldMean || 0).toFixed(1)}{" "}
                          T/acre
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded bg-green-500"></div>
                        <span className="text-green-700 font-semibold">
                          max: {(metrics.sugarYieldMax || 0).toFixed(1)} T/acre
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Performance:{" "}
                      {metrics.sugarYieldMax
                        ? (((metrics.sugarYieldMean || 0) / metrics.sugarYieldMax) * 100).toFixed(1)
                        : "0.0"}% of optimal yield
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Biomass Performance */}
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-6 h-6 sm:w-7 sm:h-7 text-green-600" />
                <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                  Biomass Performance
                </h3>
              </div>
              <div className="h-48 sm:h-56 md:h-64 flex flex-col items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={biomassData}
                      cx="50%"
                      cy="80%"
                      startAngle={180}
                      endAngle={0}
                      outerRadius={110}
                      innerRadius={70}
                      dataKey="value"
                      labelLine={false}
                    >
                      {biomassData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <text
                      x="50%"
                      y="70%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-base sm:text-lg font-semibold fill-blue-600"
                    >
                      {totalBiomass.toFixed(1)} T/acre
                    </text>
                    <Tooltip
                      wrapperStyle={{ zIndex: 50 }}
                      contentStyle={{ fontSize: "12px" }}
                      formatter={(value: number, name: string) => [
                        `${value.toFixed(1)} T/acre`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm sm:text-base text-gray-700 font-medium text-center mb-3">
                Biomass Distribution Chart
              </p>
              <div className="text-center">
                <div className="flex items-center justify-center gap-3 text-sm sm:text-base flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-blue-500"></div>
                    <span className="text-blue-700 font-semibold">
                      Total: {totalBiomass.toFixed(1)} T/acre
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-green-500"></div>
                    <span className="text-green-700 font-semibold">
                      Underground: {currentBiomass.toFixed(1)} T/acre
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recovery Rate Comparison */}
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Recovery Rate Comparison
                </h3>
              </div>

              <div className="h-40 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={recoveryComparisonData}
                    margin={{ top: 10, right: 10, left: -10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      height={30}
                    />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 10]} />
                    <Tooltip
                      formatter={(value: number) => [
                        `${value.toFixed(1)}%`,
                        "Recovery Rate",
                      ]}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {recoveryComparisonData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 text-center text-sm text-gray-600">
                <span className="font-semibold text-green-700">
                  Managed Farms: {managerRecovery.toFixed(1)}%
                </span>{" "}
                vs{" "}
                <span className="font-semibold text-blue-700">
                  Regional Avg:{" "}
                  {OTHER_FARMERS_RECOVERY.regional_average.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Field Indices Analysis Chart */}
        <section className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-2 sm:p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-3">
            <div className="flex items-center gap-2 mb-2 lg:mb-0">
              <LineChartIcon className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-800">
                Field Indices Analysis
              </h3>
            </div>
            <TimePeriodToggle />
          </div>

          <ChartLegend />

          <div className="h-80 sm:h-96 md:h-[28rem] bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg px-0 sm:px-3 -mx-2 sm:mx-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartDataToUse}
                margin={{ top: 10, right: 6, left: 9, bottom: 10 }}
                layout={isMobile ? "vertical" : "horizontal"}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                {isMobile ? (
                  <>
                    <XAxis
                      type="number"
                      domain={[-0.75, 0.8]}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey={chartXAxisKey}
                      tickFormatter={(tick: string) => {
                        if (timePeriod === "monthly") return tick;
                        if (timePeriod === "daily") {
                          const d = new Date(tick);
                          return d.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        }
                        const d = new Date(tick);
                        const yy = d.getFullYear().toString().slice(-2);
                        return `${d.toLocaleString("default", {
                          month: "short",
                        })}-${yy}`;
                      }}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey={chartXAxisKey}
                      tickFormatter={(tick: string) => {
                        if (timePeriod === "monthly") return tick;
                        if (timePeriod === "daily") {
                          const d = new Date(tick);
                          return d.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        }
                        const d = new Date(tick);
                        const yy = d.getFullYear().toString().slice(-2);
                        return `${d.toLocaleString("default", {
                          month: "short",
                        })}-${yy}`;
                      }}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      domain={[-0.75, 0.8]}
                      stroke="#6b7280"
                      tick={{ fontSize: 12 }}
                    />
                  </>
                )}
                <Tooltip content={<CustomTooltip />} />

                {(() => {
                  const indexRanges = {
                    water: { good: [0.4, 0.8], bad: [-0.3, -0.75] },
                    moisture: { good: [-0.25, 0.8], bad: [-0.6, -0.75] },
                    growth: { good: [0.2, 0.8], bad: [0.15, -0.75] },
                    stress: { good: [0.35, 0.8], bad: [0.2, -0.75] },
                  };

                  const visibleCount = Object.values(visibleLines).filter(
                    (v) => v,
                  ).length;

                  let goodRange: [number, number] = [0.3, 0.6];
                  let badRange: [number, number] = [-0.1, 0.1];
                  let labelText = "Average";

                  if (visibleCount === 1) {
                    const selectedIndex = Object.keys(visibleLines).find(
                      (key) => visibleLines[key as keyof VisibleLines],
                    );
                    if (
                      selectedIndex &&
                      indexRanges[selectedIndex as keyof typeof indexRanges]
                    ) {
                      const range =
                        indexRanges[selectedIndex as keyof typeof indexRanges];
                      goodRange = range.good as [number, number];
                      badRange = range.bad as [number, number];
                      labelText =
                        selectedIndex.charAt(0).toUpperCase() +
                        selectedIndex.slice(1);
                    }
                  } else if (visibleCount > 1) {
                    const allGoodRanges = Object.values(indexRanges).map(
                      (r) => r.good,
                    );
                    const allBadRanges = Object.values(indexRanges).map(
                      (r) => r.bad,
                    );

                    const avgGoodMin =
                      allGoodRanges.reduce((sum, [min]) => sum + min, 0) /
                      allGoodRanges.length;
                    const avgGoodMax =
                      allGoodRanges.reduce((sum, [, max]) => sum + max, 0) /
                      allGoodRanges.length;
                    const avgBadMin =
                      allBadRanges.reduce((sum, [min]) => sum + min, 0) /
                      allBadRanges.length;
                    const avgBadMax =
                      allBadRanges.reduce((sum, [, max]) => sum + max, 0) /
                      allBadRanges.length;

                    goodRange = [avgGoodMin, avgGoodMax] as [number, number];
                    badRange = [avgBadMin, avgBadMax] as [number, number];
                  }

                  return (
                    <>
                      {isMobile ? (
                        <>
                          <ReferenceArea
                            x1={goodRange[0]}
                            x2={goodRange[1]}
                            fill="#1ad3e8"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                          <ReferenceArea
                            x1={badRange[0]}
                            x2={badRange[1]}
                            fill="#dae81a"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                        </>
                      ) : (
                        <>
                          <ReferenceArea
                            y1={goodRange[0]}
                            y2={goodRange[1]}
                            fill="#1ad3e8"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                          <ReferenceArea
                            y1={badRange[0]}
                            y2={badRange[1]}
                            fill="#dae81a"
                            fillOpacity={0.7}
                            stroke="none"
                          />
                        </>
                      )}
                      {isMobile ? (
                        <>
                          <text
                            x="79%"
                            y="25%"
                            textAnchor="middle"
                            className="text-xs fill-green-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Good</tspan>
                            <tspan>
                              {" "}({goodRange[0].toFixed(2)} - {goodRange[1].toFixed(2)})
                            </tspan>
                          </text>
                          <text
                            x="35%"
                            y="35%"
                            textAnchor="middle"
                            className="text-xs fill-red-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Bad</tspan>
                            <tspan>
                              {" "}({badRange[0].toFixed(2)} - {badRange[1].toFixed(2)})
                            </tspan>
                          </text>
                        </>
                      ) : (
                        <>
                          <text
                            x="95%"
                            y="25%"
                            textAnchor="end"
                            className="text-xs fill-green-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Good</tspan>
                            <tspan>
                              {" "}({goodRange[0].toFixed(2)} - {goodRange[1].toFixed(2)})
                            </tspan>
                          </text>
                          <text
                            x="95%"
                            y="75%"
                            textAnchor="end"
                            className="text-xs fill-red-600"
                            style={{ fontSize: "10px" }}
                          >
                            <tspan fontWeight="600">Bad</tspan>
                            <tspan>
                              {" "}({badRange[0].toFixed(2)} - {badRange[1].toFixed(2)})
                            </tspan>
                          </text>
                        </>
                      )}
                    </>
                  );
                })()}

                {showStressEvents &&
                  stressEvents.map((event, index) => (
                    <React.Fragment key={index}>
                      <ReferenceLine
                        {...(isMobile
                          ? { y: event.from_date }
                          : { x: event.from_date })}
                        stroke="#dc2626"
                        strokeDasharray="5 5"
                        strokeWidth={1}
                        label={{
                          value: `Start: ${formatDate(event.from_date)}`,
                          position: "top",
                          fontSize: 8,
                          fill: "#dc2626",
                        }}
                      />
                      <ReferenceLine
                        {...(isMobile
                          ? { y: event.to_date }
                          : { x: event.to_date })}
                        stroke="#dc2626"
                        strokeDasharray="5 5"
                        strokeWidth={1}
                        label={{
                          value: `End: ${formatDate(event.to_date)}`,
                          position: "top",
                          fontSize: 8,
                          fill: "#dc2626",
                        }}
                      />
                      {isMobile ? (
                        <ReferenceArea
                          y1={event.from_date}
                          y2={event.to_date}
                          fill="#dc2626"
                          fillOpacity={0.1}
                        />
                      ) : (
                        <ReferenceArea
                          x1={event.from_date}
                          x2={event.to_date}
                          fill="#dc2626"
                          fillOpacity={0.1}
                        />
                      )}
                    </React.Fragment>
                  ))}

                {visibleLines.growth && (
                  <Line
                    type="monotone"
                    dataKey="growth"
                    stroke={lineStyles.growth.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.growth.color }}
                    activeDot={{ r: 4, fill: lineStyles.growth.color }}
                  />
                )}
                {visibleLines.stress && (
                  <Line
                    type="monotone"
                    dataKey="stress"
                    stroke={lineStyles.stress.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.stress.color }}
                    activeDot={{ r: 4, fill: lineStyles.stress.color }}
                  />
                )}
                {visibleLines.water && (
                  <Line
                    type="monotone"
                    dataKey="water"
                    stroke={lineStyles.water.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.water.color }}
                    activeDot={{ r: 4, fill: lineStyles.water.color }}
                  />
                )}
                {visibleLines.moisture && (
                  <Line
                    type="monotone"
                    dataKey="moisture"
                    stroke={lineStyles.moisture.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: lineStyles.moisture.color }}
                    activeDot={{ r: 4, fill: lineStyles.moisture.color }}
                  />
                )}

                {showNDREEvents && (
                  <Scatter
                    dataKey="stressLevel"
                    fill="#f97316"
                    isAnimationActive={false}
                    shape={<CustomStressDot />}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
};

const CustomStressDot: React.FC<CustomStressDotProps> = ({ cx, cy }) => {
  if (cx == null || cy == null) {
    return null;
  }

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={5} fill="#f97316" opacity={0.4} />
      <circle r={2} fill="#f97316" />
    </g>
  );
};

export default ManagerFarmDash;
